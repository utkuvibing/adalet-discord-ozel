import express from 'express';
import { createServer } from 'node:http';
import { Server as SocketIO } from 'socket.io';
import { runMigrations } from './db/migrate';
import { seedDefaultRooms } from './db/seed';

export function startServer(port: number): {
  httpServer: ReturnType<typeof createServer>;
  io: SocketIO;
} {
  // Initialize DB first — server must not accept connections before DB is ready
  runMigrations();
  seedDefaultRooms();

  const expressApp = express();
  const httpServer = createServer(expressApp);
  const io = new SocketIO(httpServer, {
    cors: { origin: '*' }, // LAN-only — acceptable for Phase 1
  });

  io.on('connection', (socket) => {
    console.log(`[server] client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[server] client disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[server] Sex Dungeon server running on port ${port}`);
  });

  return { httpServer, io };
}
