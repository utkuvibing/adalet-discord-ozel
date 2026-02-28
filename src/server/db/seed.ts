import { count } from 'drizzle-orm';
import { db } from './client';
import { rooms } from './schema';

const DEFAULT_ROOMS = ['Dungeon', 'Arena', 'Tavern'] as const;

export function seedDefaultRooms(): void {
  const result = db.select({ total: count() }).from(rooms).all();
  const total = result[0]?.total ?? 0;

  if (total === 0) {
    for (const name of DEFAULT_ROOMS) {
      db.insert(rooms).values({ name, isDefault: true }).run();
    }
    console.log(`[db] Seeded default rooms: ${DEFAULT_ROOMS.join(', ')}`);
  }
}
