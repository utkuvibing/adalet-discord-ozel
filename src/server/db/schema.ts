import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  username: text().notNull().unique(),
  displayName: text().notNull(),
  avatarUrl: text(),
  profilePhotoUrl: text(),
  profileBannerGifUrl: text(),
  bio: text().notNull().default(''),
  sessionToken: text().unique(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const rooms = sqliteTable('rooms', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  isDefault: integer({ mode: 'boolean' }).notNull().default(false),
  sortOrder: integer().notNull().default(0),
});

export const messages = sqliteTable('messages', {
  id: integer().primaryKey({ autoIncrement: true }),
  roomId: integer().notNull().references(() => rooms.id),
  userId: integer().notNull().references(() => users.id),
  content: text().notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  fileUrl: text(),
  fileName: text(),
  fileSize: integer(),
  fileMimeType: text(),
});

export const reactions = sqliteTable('reactions', {
  id: integer().primaryKey({ autoIncrement: true }),
  messageId: integer().notNull().references(() => messages.id),
  userId: integer().notNull().references(() => users.id),
  emoji: text().notNull(),
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

export const friendRequests = sqliteTable('friend_requests', {
  id: integer().primaryKey({ autoIncrement: true }),
  fromUserId: integer().notNull().references(() => users.id),
  toUserId: integer().notNull().references(() => users.id),
  status: text().notNull().default('pending'), // pending | accepted | rejected
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  actedAt: integer({ mode: 'timestamp' }),
});

export const friendships = sqliteTable('friendships', {
  id: integer().primaryKey({ autoIncrement: true }),
  userAId: integer().notNull().references(() => users.id),
  userBId: integer().notNull().references(() => users.id),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const dmMessages = sqliteTable('dm_messages', {
  id: integer().primaryKey({ autoIncrement: true }),
  fromUserId: integer().notNull().references(() => users.id),
  toUserId: integer().notNull().references(() => users.id),
  content: text().notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  editedAt: integer({ mode: 'timestamp' }),
  fileUrl: text(),
  fileName: text(),
  fileSize: integer(),
  fileMimeType: text(),
});

export const dmReactions = sqliteTable('dm_reactions', {
  id: integer().primaryKey({ autoIncrement: true }),
  dmMessageId: integer().notNull().references(() => dmMessages.id),
  userId: integer().notNull().references(() => users.id),
  emoji: text().notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
