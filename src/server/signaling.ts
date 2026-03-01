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
import { eq, desc } from 'drizzle-orm';
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

      socket.to(roomKey).emit('system:message', {
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

      // Notify the room
      socket.to(roomKey).emit('system:message', {
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
        })
        .from(messages)
        .leftJoin(users, eq(messages.userId, users.id))
        .where(eq(messages.roomId, roomId))
        .orderBy(desc(messages.createdAt))
        .limit(50)
        .all();

      // Reverse so oldest first for display, then map to ChatMessage format
      const chatHistory: ChatMessage[] = historyRows.reverse().map((row) => ({
        id: row.id,
        roomId: row.roomId,
        userId: row.userId,
        displayName: row.displayName || 'Unknown',
        avatarId: row.avatarUrl || 'skull',
        content: row.content,
        timestamp: row.createdAt.getTime(),
      }));

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
