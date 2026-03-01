import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from './db/client';
import { inviteTokens } from './db/schema';
import type { InviteToken } from '../shared/types';

/**
 * Generate a cryptographically secure invite token and insert it into the DB.
 * Returns the raw token string for sharing.
 */
export function createInviteToken(options: {
  expiresInMs: number | null;
  maxUses: number | null;
}): string {
  const token = crypto.randomBytes(24).toString('base64url'); // 32 chars, 192 bits entropy

  const expiresAt =
    options.expiresInMs != null
      ? new Date(Date.now() + options.expiresInMs)
      : null;

  db.insert(inviteTokens)
    .values({
      token,
      maxUses: options.maxUses,
      useCount: 0,
      expiresAt,
      isRevoked: false,
    })
    .run();

  return token;
}

/**
 * Look up a token and return it if it is still valid.
 * Returns null if not found, revoked, expired, or max uses reached.
 */
export function findValidInviteToken(token: string): InviteToken | null {
  const rows = db
    .select()
    .from(inviteTokens)
    .where(eq(inviteTokens.token, token))
    .all();

  if (rows.length === 0) return null;

  const row = rows[0];

  // Revoked
  if (row.isRevoked) return null;

  // Expired (server-side check — per research Pitfall 6)
  if (row.expiresAt != null && row.expiresAt < new Date()) return null;

  // Max uses reached
  if (row.maxUses != null && row.useCount >= row.maxUses) return null;

  return {
    id: row.id,
    token: row.token,
    maxUses: row.maxUses,
    useCount: row.useCount,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    isRevoked: row.isRevoked,
  };
}

/**
 * Increment the use count for a given token ID.
 */
export function incrementTokenUseCount(tokenId: number): void {
  db.update(inviteTokens)
    .set({ useCount: sql`${inviteTokens.useCount} + 1` })
    .where(eq(inviteTokens.id, tokenId))
    .run();
}
