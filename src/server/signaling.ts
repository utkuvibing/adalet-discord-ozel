import type { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  RoomWithMembers,
  PeerInfo,
  SDPPayload,
  ICEPayload,
  VoiceState,
  ChatMessage,
} from '../shared/types';
import { eq, desc, count } from 'drizzle-orm';
import { db } from './db/client';
import { rooms, messages, users } from './db/schema';

type TypedIO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Socket.IO room key prefix — maps DB room IDs to Socket.IO room names */
const ROOM_PREFIX = 'room:';

/**
 * Get the list of peer socket IDs in a Socket.IO room, excluding one socket.
 */
function getPeersInRoom(
  io: TypedIO,
  roomKey: string,
  excludeSocketId: string
): string[] {
  const members = io.sockets.adapter.rooms.get(roomKey);
  if (!members) return [];
  return [...members].filter((id) => id !== excludeSocketId);
}

/**
 * Build the full room+member presence snapshot and broadcast to all clients.
 */
async function broadcastPresence(io: TypedIO): Promise<void> {
  const allRooms = db.select().from(rooms).all();
  const roomsWithMembers: RoomWithMembers[] = [];

  for (const room of allRooms) {
    const roomKey = `${ROOM_PREFIX}${room.id}`;
    const memberIds = io.sockets.adapter.rooms.get(roomKey);
    const members: PeerInfo[] = [];

    if (memberIds) {
      for (const socketId of memberIds) {
        const memberSocket = io.sockets.sockets.get(socketId);
        if (memberSocket) {
          members.push({
            socketId,
            displayName: memberSocket.data.displayName || 'Unknown',
            avatarId: memberSocket.data.avatarId || 'skull',
          });
        }
      }
    }

    roomsWithMembers.push({
      id: room.id,
      name: room.name,
      isDefault: room.isDefault,
      members,
    });
  }

  io.emit('presence:update', { rooms: roomsWithMembers });
}

/**
 * Leave all voice rooms that a socket is currently in.
 * Broadcasts system messages for each room left.
 * Returns the list of room keys that were left.
 */
function leaveAllVoiceRooms(
  io: TypedIO,
  socket: TypedSocket
): string[] {
  const leftRooms: string[] = [];

  for (const roomKey of socket.rooms) {
    if (roomKey.startsWith(ROOM_PREFIX)) {
      const roomIdStr = roomKey.slice(ROOM_PREFIX.length);
      const roomId = parseInt(roomIdStr, 10);

      // Emit to entire room (including leaver) BEFORE socket.leave()
      io.to(roomKey).emit('system:message', {
        text: `${socket.data.displayName || 'Someone'} left the room.`,
        roomId,
        timestamp: Date.now(),
      });

      socket.leave(roomKey);
      leftRooms.push(roomKey);
    }
  }

  return leftRooms;
}

/**
 * Register all signaling event handlers on the Socket.IO server.
 * Must be called AFTER registerAuthMiddleware.
 */
export function registerSignalingHandlers(io: TypedIO): void {
  io.on('connection', async (socket: TypedSocket) => {
    console.log(
      `[signaling] connected: ${socket.id} (${socket.data.displayName})`
    );

    // Emit session data so client can save to localStorage
    if (socket.data.sessionToken) {
      socket.emit('session:created', {
        sessionToken: socket.data.sessionToken,
        userId: socket.data.userId,
        displayName: socket.data.displayName,
        avatarId: socket.data.avatarId || 'skull',
      });
    }

    // Send current room state to the newly connected client
    const allRooms = db.select().from(rooms).all();
    const roomList: RoomWithMembers[] = [];

    for (const room of allRooms) {
      const roomKey = `${ROOM_PREFIX}${room.id}`;
      const memberIds = io.sockets.adapter.rooms.get(roomKey);
      const members: PeerInfo[] = [];

      if (memberIds) {
        for (const socketId of memberIds) {
          const memberSocket = io.sockets.sockets.get(socketId);
          if (memberSocket) {
            members.push({
              socketId,
              displayName: memberSocket.data.displayName || 'Unknown',
              avatarId: memberSocket.data.avatarId || 'skull',
            });
          }
        }
      }

      roomList.push({
        id: room.id,
        name: room.name,
        isDefault: room.isDefault,
        members,
      });
    }

    socket.emit('room:list', roomList);

    // --- room:join ---
    socket.on('room:join', (roomId: number) => {
      // Leave any current voice rooms first
      leaveAllVoiceRooms(io, socket);

      const roomKey = `${ROOM_PREFIX}${roomId}`;
      socket.join(roomKey);

      // Notify the entire room (including the joiner, so all clients get the event)
      io.to(roomKey).emit('system:message', {
        text: `${socket.data.displayName || 'Someone'} joined the room.`,
        roomId,
        timestamp: Date.now(),
      });

      // Send existing peers to the newly joined socket so it can initiate WebRTC
      const existingPeers = getPeersInRoom(io, roomKey, socket.id);
      socket.emit('room:peers', existingPeers);

      // Broadcast updated presence to all clients
      broadcastPresence(io);

      // Emit chat history (last 50 messages) to the joining socket
      const historyRows = db
        .select({
          id: messages.id,
          roomId: messages.roomId,
          userId: messages.userId,
          content: messages.content,
          createdAt: messages.createdAt,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          fileUrl: messages.fileUrl,
          fileName: messages.fileName,
          fileSize: messages.fileSize,
          fileMimeType: messages.fileMimeType,
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.roomId, roomId))
        .orderBy(desc(messages.createdAt))
        .limit(50)
        .all();

      // Reverse so oldest first for display, then map to ChatMessage format
      const chatHistory: ChatMessage[] = historyRows.reverse().map((row) => {
        const msg: ChatMessage = {
          id: row.id,
          roomId: row.roomId,
          userId: row.userId,
          displayName: row.displayName || 'Unknown',
          avatarId: row.avatarUrl || 'skull',
          content: row.content,
          timestamp: row.createdAt.getTime(),
        };
        if (row.fileUrl) {
          msg.fileUrl = row.fileUrl;
          msg.fileName = row.fileName ?? undefined;
          msg.fileSize = row.fileSize ?? undefined;
          msg.fileMimeType = row.fileMimeType ?? undefined;
        }
        return msg;
      });

      socket.emit('chat:history', chatHistory);
    });

    // --- room:leave ---
    socket.on('room:leave', () => {
      leaveAllVoiceRooms(io, socket);
      broadcastPresence(io);
    });

    // --- SDP offer relay ---
    socket.on('sdp:offer', (payload: SDPPayload) => {
      io.to(payload.to).emit('sdp:offer', {
        from: socket.id,
        to: payload.to,
        description: payload.description,
      });
    });

    // --- SDP answer relay ---
    socket.on('sdp:answer', (payload: SDPPayload) => {
      io.to(payload.to).emit('sdp:answer', {
        from: socket.id,
        to: payload.to,
        description: payload.description,
      });
    });

    // --- ICE candidate relay ---
    socket.on('ice:candidate', (payload: ICEPayload) => {
      io.to(payload.to).emit('ice:candidate', {
        from: socket.id,
        to: payload.to,
        candidate: payload.candidate,
      });
    });

    // --- voice:state-change relay ---
    socket.on('voice:state-change', (state: VoiceState) => {
      // Broadcast voice state to all rooms the socket is in
      for (const roomKey of socket.rooms) {
        if (roomKey.startsWith(ROOM_PREFIX)) {
          socket.to(roomKey).emit('voice:state-change', {
            socketId: socket.id,
            state,
          });
        }
      }
    });

    // --- Phase 7: Screen sharing signaling ---
    socket.on('screen:start', (state) => {
      const socketRooms = [...socket.rooms].filter((r) => r.startsWith(ROOM_PREFIX));
      socketRooms.forEach((room) => {
        socket.to(room).emit('screen:started', {
          socketId: socket.id,
          sourceName: state.sourceName,
        });
      });
      console.log(`[signaling] ${socket.data.displayName} started screen sharing: ${state.sourceName}`);
    });

    socket.on('screen:stop', () => {
      const socketRooms = [...socket.rooms].filter((r) => r.startsWith(ROOM_PREFIX));
      socketRooms.forEach((room) => {
        socket.to(room).emit('screen:stopped', {
          socketId: socket.id,
        });
      });
      console.log(`[signaling] ${socket.data.displayName} stopped screen sharing`);
    });

    // --- chat:message ---
    socket.on('chat:message', (payload: { roomId: number; content: string }) => {
      const roomKey = ROOM_PREFIX + payload.roomId;

      // Validate the socket is in the target room
      if (!socket.rooms.has(roomKey)) {
        return;
      }

      // Validate content
      const content = typeof payload.content === 'string' ? payload.content.trim() : '';
      if (content.length === 0 || content.length > 2000) {
        return;
      }

      // Persist message to SQLite
      const result = db
        .insert(messages)
        .values({
          roomId: payload.roomId,
          userId: socket.data.userId,
          content,
        })
        .run();

      // Construct ChatMessage for broadcast
      const chatMessage: ChatMessage = {
        id: Number(result.lastInsertRowid),
        roomId: payload.roomId,
        userId: socket.data.userId,
        displayName: socket.data.displayName || 'Unknown',
        avatarId: socket.data.avatarId || 'skull',
        content,
        timestamp: Date.now(),
      };

      // Broadcast to the entire room (including sender for canonical rendering)
      io.to(roomKey).emit('chat:message', chatMessage);
    });

    // --- room:create ---
    socket.on('room:create', (name: string) => {
      // Host-only validation
      if (!socket.data.isHost) {
        socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can create rooms.' });
        return;
      }

      // Sanitize and validate name
      const trimmed = (typeof name === 'string' ? name : '').trim();
      if (trimmed.length < 1 || trimmed.length > 50) {
        socket.emit('error', { code: 'INVALID_ROOM_NAME', message: 'Room name must be 1-50 characters.' });
        return;
      }

      // Check room count limit (max 20)
      const total = db.select({ total: count() }).from(rooms).all()[0]?.total ?? 0;
      if (total >= 20) {
        socket.emit('error', { code: 'ROOM_LIMIT', message: 'Maximum 20 rooms reached.' });
        return;
      }

      // Insert room (UNIQUE constraint on name catches duplicates)
      try {
        db.insert(rooms).values({ name: trimmed, isDefault: false }).run();
      } catch (err) {
        socket.emit('error', { code: 'DUPLICATE_ROOM', message: 'A room with that name already exists.' });
        return;
      }

      console.log(`[signaling] room created: "${trimmed}" by ${socket.data.displayName}`);
      broadcastPresence(io);
    });

    // --- room:delete ---
    socket.on('room:delete', (roomId: number) => {
      // Host-only validation
      if (!socket.data.isHost) {
        socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can delete rooms.' });
        return;
      }

      // Look up the room
      const room = db.select().from(rooms).where(eq(rooms.id, roomId)).all()[0];
      if (!room) return;

      // Prevent deleting default rooms
      if (room.isDefault) {
        socket.emit('error', { code: 'CANNOT_DELETE_DEFAULT', message: 'Cannot delete default rooms.' });
        return;
      }

      // Kick all users out of the room before deleting
      const roomKey = `${ROOM_PREFIX}${roomId}`;
      const memberSocketIds = io.sockets.adapter.rooms.get(roomKey);
      if (memberSocketIds) {
        for (const memberId of memberSocketIds) {
          const memberSocket = io.sockets.sockets.get(memberId);
          if (memberSocket) {
            memberSocket.leave(roomKey);
            memberSocket.emit('system:message', {
              text: `Room "${room.name}" was deleted by the host.`,
              roomId,
              timestamp: Date.now(),
            });
          }
        }
      }

      // Delete messages for this room first (FK constraint: messages.roomId references rooms.id)
      db.delete(messages).where(eq(messages.roomId, roomId)).run();

      // Delete the room
      db.delete(rooms).where(eq(rooms.id, roomId)).run();

      console.log(`[signaling] room deleted: "${room.name}" (id=${roomId}) by ${socket.data.displayName}`);
      broadcastPresence(io);
    });

    // --- disconnect ---
    socket.on('disconnect', () => {
      // Broadcast leave messages for any rooms the socket was in
      // Note: Socket.IO auto-removes the socket from rooms on disconnect,
      // but we already read socket.rooms before the event fires
      for (const roomKey of socket.rooms) {
        if (roomKey.startsWith(ROOM_PREFIX)) {
          const roomIdStr = roomKey.slice(ROOM_PREFIX.length);
          const roomId = parseInt(roomIdStr, 10);

          socket.to(roomKey).emit('system:message', {
            text: `${socket.data.displayName || 'Someone'} left the room.`,
            roomId,
            timestamp: Date.now(),
          });
        }
      }

      broadcastPresence(io);
      console.log(
        `[signaling] disconnected: ${socket.id} (${socket.data.displayName})`
      );
    });
  });
}
