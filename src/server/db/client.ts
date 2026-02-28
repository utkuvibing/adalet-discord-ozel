import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;

  // Use userData (AppData/Local/sex-dungeon on Windows) in production
  // Use a dev-named file in development so prod and dev DBs never collide
  const dbPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'sex-dungeon.db')
    : path.join(app.getPath('userData'), 'sex-dungeon.dev.db');

  const sqlite = new Database(dbPath);

  // WAL mode: better concurrent read performance
  sqlite.pragma('journal_mode = WAL');
  // Enforce referential integrity
  sqlite.pragma('foreign_keys = ON');

  _db = drizzle({ client: sqlite, schema });
  return _db;
}

// Proxy convenience export — always delegates to getDb()
// Safe to import at module load time; actual DB open is deferred to first access
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
