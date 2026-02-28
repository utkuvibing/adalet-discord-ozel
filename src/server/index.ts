import express from 'express';
import { createServer } from 'node:http';
import { Server as SocketIO } from 'socket.io';

export function startServer(port: number): {
  httpServer: ReturnType<typeof createServer>;
  io: SocketIO;
} {
  const expressApp = express();
  const httpServer = createServer(expressApp);
  const io = new SocketIO(httpServer, {
    cors: { origin: '*' },
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
