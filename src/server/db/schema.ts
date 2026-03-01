import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  username: text().notNull().unique(),
  displayName: text().notNull(),
  avatarUrl: text(),
  sessionToken: text().unique(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const rooms = sqliteTable('rooms', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  isDefault: integer({ mode: 'boolean' }).notNull().default(false),
});

export const messages = sqliteTable('messages', {
  id: integer().primaryKey({ autoIncrement: true }),
  roomId: integer().notNull().references(() => rooms.id),
  userId: integer().notNull().references(() => users.id),
  content: text().notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const inviteTokens = sqliteTable('invite_tokens', {
  id: integer().primaryKey({ autoIncrement: true }),
  token: text().notNull().unique(),
  usedBy: integer().references(() => users.id), // Deprecated: replaced by maxUses/useCount pattern
  maxUses: integer(), // null = unlimited uses
  useCount: integer().notNull().default(0),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  expiresAt: integer({ mode: 'timestamp' }), // null = never expires
  isRevoked: integer({ mode: 'boolean' }).notNull().default(false),
});
