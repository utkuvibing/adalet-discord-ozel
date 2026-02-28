import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import path from 'node:path';
import { getDb } from './client';

export function runMigrations(): void {
  // In development: drizzle/ is at project root
  // In packaged app: drizzle/ is bundled via extraResources into process.resourcesPath
  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.join(app.getAppPath(), 'drizzle');

  migrate(getDb(), { migrationsFolder });
  console.log('[db] Migrations complete');
}
