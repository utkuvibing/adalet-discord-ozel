import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db/client';
import { users } from './db/schema';

/** Generate a cryptographically secure session token. */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Create a new user with a generated session token. Returns id and sessionToken. */
export function createUser(
  displayName: string,
  avatarId: string
): { id: number; sessionToken: string } {
  const sessionToken = generateSessionToken();
  // username is required unique but not user-facing — generate from random bytes
  const username = `user_${crypto.randomBytes(8).toString('hex')}`;

  const result = db
    .insert(users)
    .values({
      username,
      displayName,
      avatarUrl: avatarId, // repurpose avatarUrl column to store avatar preset ID
      sessionToken,
    })
    .run();

  return {
    id: Number(result.lastInsertRowid),
    sessionToken,
  };
}

/** Look up a user by session token. Returns null if not found. */
export function findUserBySession(
  sessionToken: string
): { id: number; displayName: string; avatarId: string } | null {
  const rows = db
    .select()
    .from(users)
    .where(eq(users.sessionToken, sessionToken))
    .all();

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    displayName: row.displayName,
    avatarId: row.avatarUrl ?? 'skull', // fallback if null
  };
}

/** Update display name and avatar for an existing user. */
export function updateUserIdentity(
  userId: number,
  displayName: string,
  avatarId: string
): void {
  db.update(users)
    .set({ displayName, avatarUrl: avatarId })
    .where(eq(users.id, userId))
    .run();
}
