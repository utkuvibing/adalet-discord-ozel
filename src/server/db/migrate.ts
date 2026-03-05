import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';
import { app } from 'electron';
import path from 'node:path';
import { getDb } from './client';

export function runMigrations(): void {
  // In development: drizzle/ is at project root
  // In packaged app: drizzle/ is bundled via extraResources into process.resourcesPath
  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.join(app.getAppPath(), 'drizzle');

  const db = getDb();
  migrate(db, { migrationsFolder });

  const safeRun = (statement: string): void => {
    try {
      db.run(sql.raw(statement));
    } catch {
      // ignore duplicate-column / already-exists cases
    }
  };

  // Runtime-safe DM upgrades for existing local DBs.
  safeRun('ALTER TABLE dm_messages ADD COLUMN editedAt integer');
  safeRun('ALTER TABLE dm_messages ADD COLUMN fileUrl text');
  safeRun('ALTER TABLE dm_messages ADD COLUMN fileName text');
  safeRun('ALTER TABLE dm_messages ADD COLUMN fileSize integer');
  safeRun('ALTER TABLE dm_messages ADD COLUMN fileMimeType text');
  safeRun(`CREATE TABLE IF NOT EXISTS dm_reactions (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    dmMessageId integer NOT NULL,
    userId integer NOT NULL,
    emoji text NOT NULL,
    createdAt integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (dmMessageId) REFERENCES dm_messages(id),
    FOREIGN KEY (userId) REFERENCES users(id)
  )`);
  safeRun('CREATE INDEX IF NOT EXISTS dm_reactions_message_id_idx ON dm_reactions(dmMessageId)');
  safeRun('CREATE INDEX IF NOT EXISTS dm_reactions_user_id_idx ON dm_reactions(userId)');

  console.log('[db] Migrations complete');
}
