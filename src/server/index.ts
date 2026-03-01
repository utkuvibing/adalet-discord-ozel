import express from 'express';
import { createServer } from 'node:http';
import { Server as SocketIO } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../shared/types';
import { runMigrations } from './db/migrate';
import { seedDefaultRooms } from './db/seed';
import { registerAuthMiddleware } from './middleware/auth';
import { registerSignalingHandlers } from './signaling';

export function startServer(port: number): {
  httpServer: ReturnType<typeof createServer>;
  io: SocketIO<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
} {
  // Initialize DB first — server must not accept connections before DB is ready
  runMigrations();
  seedDefaultRooms();

  const expressApp = express();
  const httpServer = createServer(expressApp);
  const io = new SocketIO<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: { origin: '*' }, // LAN-only — acceptable for Phase 2
  });

  // Auth middleware must run before connection handlers
  registerAuthMiddleware(io);

  // Signaling handlers (room join/leave, SDP/ICE relay, presence)
  registerSignalingHandlers(io);

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[server] Sex Dungeon server running on port ${port}`);
  });

  return { httpServer, io };
}
