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
import { eq, desc, asc, count, and, or } from 'drizzle-orm';
import { db } from './db/client';
import { rooms, messages, users, reactions, friendRequests, friendships, dmMessages, dmReactions } from './db/schema';
import type { ReactionGroup } from '../shared/types';

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
  const allRooms = db.select().from(rooms).orderBy(asc(rooms.sortOrder), asc(rooms.id)).all();
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
            userId: memberSocket.data.userId,
            displayName: memberSocket.data.displayName || 'Unknown',
            avatarId: memberSocket.data.avatarId || 'skull',
            profilePhotoUrl: memberSocket.data.profilePhotoUrl ?? null,
            profileBannerGifUrl: memberSocket.data.profileBannerGifUrl ?? null,
            bio: memberSocket.data.bio ?? '',
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

function findSocketByUserId(io: TypedIO, userId: number): TypedSocket | null {
  for (const s of io.sockets.sockets.values()) {
    if (s.data.userId === userId) {
      return s;
    }
  }
  return null;
}

function buildRoomChatHistory(roomId: number): ChatMessage[] {
  const historyRows = db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      userId: messages.userId,
      content: messages.content,
      createdAt: messages.createdAt,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      profilePhotoUrl: users.profilePhotoUrl,
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

  return historyRows.reverse().map((row) => {
    const msg: ChatMessage = {
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      displayName: row.displayName || 'Unknown',
      avatarId: row.avatarUrl || 'skull',
      profilePhotoUrl: row.profilePhotoUrl ?? null,
      content: row.content,
      timestamp: row.createdAt.getTime(),
    };
    if (row.fileUrl) {
      msg.fileUrl = row.fileUrl;
      msg.fileName = row.fileName ?? undefined;
      msg.fileSize = row.fileSize ?? undefined;
      msg.fileMimeType = row.fileMimeType ?? undefined;
    }

    const msgReactions = db.select().from(reactions).where(eq(reactions.messageId, row.id)).all();
    if (msgReactions.length > 0) {
      const groups = new Map<string, number[]>();
      for (const r of msgReactions) {
        const arr = groups.get(r.emoji) || [];
        arr.push(r.userId);
        groups.set(r.emoji, arr);
      }
      msg.reactions = [...groups.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
    }
    return msg;
  });
}

function buildFriendList(userId: number): { userId: number; displayName: string; profilePhotoUrl: string | null; bio: string }[] {
  const rows = db
    .select({
      userAId: friendships.userAId,
      userBId: friendships.userBId,
      displayNameA: users.displayName,
      photoA: users.profilePhotoUrl,
      bioA: users.bio,
    })
    .from(friendships)
    .leftJoin(users, eq(friendships.userAId, users.id))
    .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)))
    .all();

  const result: { userId: number; displayName: string; profilePhotoUrl: string | null; bio: string }[] = [];
  for (const row of rows) {
    const targetUserId = row.userAId === userId ? row.userBId : row.userAId;
    const target = db
      .select({
        id: users.id,
        displayName: users.displayName,
        profilePhotoUrl: users.profilePhotoUrl,
        bio: users.bio,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .get();
    if (target) {
      result.push({
        userId: target.id,
        displayName: target.displayName,
        profilePhotoUrl: target.profilePhotoUrl ?? null,
        bio: target.bio ?? '',
      });
    }
  }
  return result;
}

function buildIncomingRequestList(userId: number): {
  id: number;
  fromUserId: number;
  toUserId: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  actedAt: number | null;
  fromDisplayName: string;
  fromProfilePhotoUrl: string | null;
}[] {
  const rows = db
    .select({
      id: friendRequests.id,
      fromUserId: friendRequests.fromUserId,
      toUserId: friendRequests.toUserId,
      status: friendRequests.status,
      createdAt: friendRequests.createdAt,
      actedAt: friendRequests.actedAt,
      fromDisplayName: users.displayName,
      fromProfilePhotoUrl: users.profilePhotoUrl,
    })
    .from(friendRequests)
    .leftJoin(users, eq(friendRequests.fromUserId, users.id))
    .where(and(eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')))
    .orderBy(desc(friendRequests.createdAt))
    .all();

  return rows.map((r) => ({
    id: r.id,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    status: (r.status as 'pending' | 'accepted' | 'rejected') ?? 'pending',
    createdAt: r.createdAt.getTime(),
    actedAt: r.actedAt ? r.actedAt.getTime() : null,
    fromDisplayName: r.fromDisplayName ?? 'Unknown',
    fromProfilePhotoUrl: r.fromProfilePhotoUrl ?? null,
  }));
}

function buildDMHistory(myUserId: number, targetUserId: number): {
  id: number;
  fromUserId: number;
  toUserId: number;
  content: string;
  timestamp: number;
  editedAt?: number;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  reactions?: ReactionGroup[];
}[] {
  const rows = db
    .select()
    .from(dmMessages)
    .where(
      or(
        and(eq(dmMessages.fromUserId, myUserId), eq(dmMessages.toUserId, targetUserId)),
        and(eq(dmMessages.fromUserId, targetUserId), eq(dmMessages.toUserId, myUserId))
      )
    )
    .orderBy(asc(dmMessages.createdAt))
    .limit(200)
    .all();

  return rows.map((row) => {
    const msg = {
      id: row.id,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      content: row.content,
      timestamp: row.createdAt.getTime(),
      editedAt: row.editedAt ? row.editedAt.getTime() : undefined,
      fileUrl: row.fileUrl ?? undefined,
      fileName: row.fileName ?? undefined,
      fileSize: row.fileSize ?? undefined,
      fileMimeType: row.fileMimeType ?? undefined,
      reactions: undefined as ReactionGroup[] | undefined,
    };

    const allReactions = db.select().from(dmReactions).where(eq(dmReactions.dmMessageId, row.id)).all();
    if (allReactions.length > 0) {
      const groups = new Map<string, number[]>();
      for (const r of allReactions) {
        const arr = groups.get(r.emoji) || [];
        arr.push(r.userId);
        groups.set(r.emoji, arr);
      }
      msg.reactions = [...groups.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
    }
    return msg;
  });
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
        profilePhotoUrl: socket.data.profilePhotoUrl ?? null,
        profileBannerGifUrl: socket.data.profileBannerGifUrl ?? null,
        bio: socket.data.bio ?? '',
      });
    }

    // Send current room state to the newly connected client
    const allRooms = db.select().from(rooms).orderBy(asc(rooms.sortOrder), asc(rooms.id)).all();
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
              userId: memberSocket.data.userId,
              displayName: memberSocket.data.displayName || 'Unknown',
              avatarId: memberSocket.data.avatarId || 'skull',
              profilePhotoUrl: memberSocket.data.profilePhotoUrl ?? null,
              profileBannerGifUrl: memberSocket.data.profileBannerGifUrl ?? null,
              bio: memberSocket.data.bio ?? '',
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

    // --- room:list:request (re-send room list on demand, fixes race condition) ---
    socket.on('room:list:request', async () => {
      const reqRooms = db.select().from(rooms).orderBy(asc(rooms.sortOrder), asc(rooms.id)).all();
      const reqRoomList: RoomWithMembers[] = [];

      for (const room of reqRooms) {
        const roomKey = `${ROOM_PREFIX}${room.id}`;
        const memberIds = io.sockets.adapter.rooms.get(roomKey);
        const members: PeerInfo[] = [];

        if (memberIds) {
          for (const socketId of memberIds) {
            const memberSocket = io.sockets.sockets.get(socketId);
            if (memberSocket) {
              members.push({
                socketId,
                userId: memberSocket.data.userId,
                displayName: memberSocket.data.displayName || 'Unknown',
                avatarId: memberSocket.data.avatarId || 'skull',
                profilePhotoUrl: memberSocket.data.profilePhotoUrl ?? null,
                profileBannerGifUrl: memberSocket.data.profileBannerGifUrl ?? null,
                bio: memberSocket.data.bio ?? '',
              });
            }
          }
        }

        reqRoomList.push({
          id: room.id,
          name: room.name,
          isDefault: room.isDefault,
          members,
        });
      }

      socket.emit('room:list', reqRoomList);
    });

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

      socket.emit('chat:history', buildRoomChatHistory(roomId));
    });

    // --- chat:history:request ---
    socket.on('chat:history:request', (payload: { roomId: number }) => {
      const roomId = Number(payload.roomId);
      if (!Number.isFinite(roomId)) return;
      const roomKey = `${ROOM_PREFIX}${roomId}`;
      if (!socket.rooms.has(roomKey)) return;
      socket.emit('chat:history', buildRoomChatHistory(roomId));
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

    // --- typing:start ---
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    socket.on('typing:start', (roomId: number) => {
      const roomKey = ROOM_PREFIX + roomId;
      if (!socket.rooms.has(roomKey)) return;

      // Broadcast typing to others in the room
      socket.to(roomKey).emit('typing:update', {
        socketId: socket.id,
        displayName: socket.data.displayName || 'Unknown',
        typing: true,
      });

      // Clear previous timer for this socket
      const prev = typingTimers.get(socket.id);
      if (prev) clearTimeout(prev);

      // Auto-stop typing after 3 seconds
      const timer = setTimeout(() => {
        socket.to(roomKey).emit('typing:update', {
          socketId: socket.id,
          displayName: socket.data.displayName || 'Unknown',
          typing: false,
        });
        typingTimers.delete(socket.id);
      }, 3000);
      typingTimers.set(socket.id, timer);
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
        profilePhotoUrl: socket.data.profilePhotoUrl ?? null,
        content,
        timestamp: Date.now(),
      };

      // Broadcast to the entire room (including sender for canonical rendering)
      io.to(roomKey).emit('chat:message', chatMessage);
    });

    // --- chat:message:edit ---
    socket.on('chat:message:edit', (payload: { messageId: number; content: string }) => {
      const messageId = Number(payload.messageId);
      if (!Number.isFinite(messageId)) return;

      const existing = db.select().from(messages).where(eq(messages.id, messageId)).get();
      if (!existing) return;

      const roomKey = ROOM_PREFIX + existing.roomId;
      if (!socket.rooms.has(roomKey)) return;

      const canEdit = existing.userId === socket.data.userId || socket.data.isHost;
      if (!canEdit) return;

      const content = typeof payload.content === 'string' ? payload.content.trim() : '';
      const hasFile = !!existing.fileUrl;
      if (!hasFile && content.length === 0) return;
      if (content.length > 2000) return;

      db.update(messages).set({ content }).where(eq(messages.id, messageId)).run();

      const author = db
        .select({
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          profilePhotoUrl: users.profilePhotoUrl,
        })
        .from(users)
        .where(eq(users.id, existing.userId))
        .get();

      const updated: ChatMessage = {
        id: existing.id,
        roomId: existing.roomId,
        userId: existing.userId,
        displayName: author?.displayName || 'Unknown',
        avatarId: author?.avatarUrl || 'skull',
        profilePhotoUrl: author?.profilePhotoUrl ?? null,
        content,
        timestamp: existing.createdAt.getTime(),
        editedAt: Date.now(),
      };

      if (existing.fileUrl) {
        updated.fileUrl = existing.fileUrl;
        updated.fileName = existing.fileName ?? undefined;
        updated.fileSize = existing.fileSize ?? undefined;
        updated.fileMimeType = existing.fileMimeType ?? undefined;
      }

      const allReactions = db.select().from(reactions).where(eq(reactions.messageId, existing.id)).all();
      if (allReactions.length > 0) {
        const groups = new Map<string, number[]>();
        for (const r of allReactions) {
          const arr = groups.get(r.emoji) || [];
          arr.push(r.userId);
          groups.set(r.emoji, arr);
        }
        updated.reactions = [...groups.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
      }

      io.to(roomKey).emit('chat:message:update', updated);
    });

    // --- chat:message:delete ---
    socket.on('chat:message:delete', (payload: { messageId: number }) => {
      const messageId = Number(payload.messageId);
      if (!Number.isFinite(messageId)) return;

      const existing = db.select().from(messages).where(eq(messages.id, messageId)).get();
      if (!existing) return;

      const roomKey = ROOM_PREFIX + existing.roomId;
      if (!socket.rooms.has(roomKey)) return;

      const canDelete = existing.userId === socket.data.userId || socket.data.isHost;
      if (!canDelete) return;

      db.delete(reactions).where(eq(reactions.messageId, messageId)).run();
      db.delete(messages).where(eq(messages.id, messageId)).run();

      io.to(roomKey).emit('chat:message:delete', { messageId, roomId: existing.roomId });
    });

    // --- reaction:toggle ---
    socket.on('reaction:toggle', (payload: { messageId: number; emoji: string }) => {
      const userId = socket.data.userId;
      const { messageId, emoji } = payload;

      // Check if the message exists and get its roomId
      const msg = db.select({ roomId: messages.roomId }).from(messages).where(eq(messages.id, messageId)).get();
      if (!msg) return;

      const roomKey = ROOM_PREFIX + msg.roomId;
      if (!socket.rooms.has(roomKey)) return;

      // Toggle: if exists, remove; else, add
      const existing = db.select().from(reactions)
        .where(and(eq(reactions.messageId, messageId), eq(reactions.userId, userId), eq(reactions.emoji, emoji)))
        .get();

      if (existing) {
        db.delete(reactions).where(eq(reactions.id, existing.id)).run();
      } else {
        db.insert(reactions).values({ messageId, userId, emoji }).run();
      }

      // Build updated reaction groups for this message
      const allReactions = db.select().from(reactions).where(eq(reactions.messageId, messageId)).all();
      const groups = new Map<string, number[]>();
      for (const r of allReactions) {
        const arr = groups.get(r.emoji) || [];
        arr.push(r.userId);
        groups.set(r.emoji, arr);
      }
      const reactionGroups: ReactionGroup[] = [...groups.entries()].map(([e, uids]) => ({ emoji: e, userIds: uids }));

      // Broadcast to room
      io.to(roomKey).emit('reaction:update', { messageId, reactions: reactionGroups });
    });

    // --- friend list + requests ---
    socket.on('friend:list:request', () => {
      socket.emit('friend:list', buildFriendList(socket.data.userId));
    });

    socket.on('friend:request:list:request', () => {
      socket.emit('friend:request:list', buildIncomingRequestList(socket.data.userId));
    });

    socket.on('friend:request:send', (payload: { targetUserId: number }) => {
      const targetUserId = Number(payload.targetUserId);
      if (!Number.isFinite(targetUserId) || targetUserId === socket.data.userId) return;

      const alreadyFriend = db
        .select()
        .from(friendships)
        .where(
          or(
            and(eq(friendships.userAId, socket.data.userId), eq(friendships.userBId, targetUserId)),
            and(eq(friendships.userAId, targetUserId), eq(friendships.userBId, socket.data.userId))
          )
        )
        .get();
      if (alreadyFriend) return;

      const existingReq = db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.fromUserId, socket.data.userId),
            eq(friendRequests.toUserId, targetUserId),
            eq(friendRequests.status, 'pending')
          )
        )
        .get();
      if (existingReq) return;

      const insertResult = db
        .insert(friendRequests)
        .values({
          fromUserId: socket.data.userId,
          toUserId: targetUserId,
          status: 'pending',
        })
        .run();

      const created = db
        .select({
          id: friendRequests.id,
          fromUserId: friendRequests.fromUserId,
          toUserId: friendRequests.toUserId,
          status: friendRequests.status,
          createdAt: friendRequests.createdAt,
          actedAt: friendRequests.actedAt,
          fromDisplayName: users.displayName,
          fromProfilePhotoUrl: users.profilePhotoUrl,
        })
        .from(friendRequests)
        .leftJoin(users, eq(friendRequests.fromUserId, users.id))
        .where(eq(friendRequests.id, Number(insertResult.lastInsertRowid)))
        .get();
      if (!created) return;

      const outgoing = {
        id: created.id,
        fromUserId: created.fromUserId,
        toUserId: created.toUserId,
        status: (created.status as 'pending' | 'accepted' | 'rejected') ?? 'pending',
        createdAt: created.createdAt.getTime(),
        actedAt: created.actedAt ? created.actedAt.getTime() : null,
        fromDisplayName: created.fromDisplayName ?? socket.data.displayName,
        fromProfilePhotoUrl: created.fromProfilePhotoUrl ?? null,
      };

      const targetSocket = findSocketByUserId(io, targetUserId);
      targetSocket?.emit('friend:request:incoming', outgoing);
    });

    socket.on('friend:request:accept', (payload: { requestId: number }) => {
      const requestId = Number(payload.requestId);
      if (!Number.isFinite(requestId)) return;
      const req = db.select().from(friendRequests).where(eq(friendRequests.id, requestId)).get();
      if (!req || req.toUserId !== socket.data.userId || req.status !== 'pending') return;

      db
        .update(friendRequests)
        .set({ status: 'accepted', actedAt: new Date() })
        .where(eq(friendRequests.id, requestId))
        .run();

      const userA = Math.min(req.fromUserId, req.toUserId);
      const userB = Math.max(req.fromUserId, req.toUserId);
      const existingFriendship = db
        .select()
        .from(friendships)
        .where(and(eq(friendships.userAId, userA), eq(friendships.userBId, userB)))
        .get();
      if (!existingFriendship) {
        db.insert(friendships).values({ userAId: userA, userBId: userB }).run();
      }

      const updated = db
        .select()
        .from(friendRequests)
        .where(eq(friendRequests.id, requestId))
        .get();
      if (!updated) return;

      const eventPayload = {
        id: updated.id,
        fromUserId: updated.fromUserId,
        toUserId: updated.toUserId,
        status: (updated.status as 'pending' | 'accepted' | 'rejected') ?? 'accepted',
        createdAt: updated.createdAt.getTime(),
        actedAt: updated.actedAt ? updated.actedAt.getTime() : null,
        fromDisplayName: socket.data.displayName,
        fromProfilePhotoUrl: socket.data.profilePhotoUrl ?? null,
      };

      socket.emit('friend:request:updated', eventPayload);
      const fromSocket = findSocketByUserId(io, req.fromUserId);
      fromSocket?.emit('friend:request:updated', eventPayload);
      socket.emit('friend:list', buildFriendList(socket.data.userId));
      fromSocket?.emit('friend:list', buildFriendList(req.fromUserId));
    });

    socket.on('friend:request:reject', (payload: { requestId: number }) => {
      const requestId = Number(payload.requestId);
      if (!Number.isFinite(requestId)) return;
      const req = db.select().from(friendRequests).where(eq(friendRequests.id, requestId)).get();
      if (!req || req.toUserId !== socket.data.userId || req.status !== 'pending') return;

      db
        .update(friendRequests)
        .set({ status: 'rejected', actedAt: new Date() })
        .where(eq(friendRequests.id, requestId))
        .run();
      socket.emit('friend:request:list', buildIncomingRequestList(socket.data.userId));
    });

    // --- DM ---
    socket.on('dm:history:request', (payload: { targetUserId: number }) => {
      const targetUserId = Number(payload.targetUserId);
      if (!Number.isFinite(targetUserId)) return;
      socket.emit('dm:history', { targetUserId, messages: buildDMHistory(socket.data.userId, targetUserId) });
    });

    const buildDMReactionGroups = (messageId: number): ReactionGroup[] => {
      const allReactions = db.select().from(dmReactions).where(eq(dmReactions.dmMessageId, messageId)).all();
      const groups = new Map<string, number[]>();
      for (const r of allReactions) {
        const arr = groups.get(r.emoji) || [];
        arr.push(r.userId);
        groups.set(r.emoji, arr);
      }
      return [...groups.entries()].map(([emoji, userIds]) => ({ emoji, userIds }));
    };

    const buildDMMessageFromRow = (row: typeof dmMessages.$inferSelect) => {
      const message = {
        id: row.id,
        fromUserId: row.fromUserId,
        toUserId: row.toUserId,
        content: row.content,
        timestamp: row.createdAt.getTime(),
        editedAt: row.editedAt ? row.editedAt.getTime() : undefined,
        fileUrl: row.fileUrl ?? undefined,
        fileName: row.fileName ?? undefined,
        fileSize: row.fileSize ?? undefined,
        fileMimeType: row.fileMimeType ?? undefined,
      };
      const reactionGroups = buildDMReactionGroups(row.id);
      return reactionGroups.length > 0
        ? { ...message, reactions: reactionGroups }
        : message;
    };

    socket.on('dm:message', (payload: { targetUserId: number; content: string }) => {
      const targetUserId = Number(payload.targetUserId);
      const content = typeof payload.content === 'string' ? payload.content.trim() : '';
      if (!Number.isFinite(targetUserId) || content.length === 0 || content.length > 2000) return;

      const result = db
        .insert(dmMessages)
        .values({
          fromUserId: socket.data.userId,
          toUserId: targetUserId,
          content,
        })
        .run();

      const row = db.select().from(dmMessages).where(eq(dmMessages.id, Number(result.lastInsertRowid))).get();
      if (!row) return;
      const message = buildDMMessageFromRow(row);
      socket.emit('dm:message', { targetUserId, message });
      const targetSocket = findSocketByUserId(io, targetUserId);
      targetSocket?.emit('dm:message', { targetUserId: socket.data.userId, message });
    });

    socket.on('dm:message:edit', (payload: { targetUserId: number; messageId: number; content: string }) => {
      const targetUserId = Number(payload.targetUserId);
      const messageId = Number(payload.messageId);
      if (!Number.isFinite(targetUserId) || !Number.isFinite(messageId)) return;

      const existing = db.select().from(dmMessages).where(eq(dmMessages.id, messageId)).get();
      if (!existing) return;

      const isParticipant =
        existing.fromUserId === socket.data.userId ||
        existing.toUserId === socket.data.userId;
      if (!isParticipant && !socket.data.isHost) return;

      const partnerUserId =
        existing.fromUserId === socket.data.userId
          ? existing.toUserId
          : existing.fromUserId;
      if (partnerUserId !== targetUserId && !socket.data.isHost) return;

      const content = typeof payload.content === 'string' ? payload.content.trim() : '';
      const hasFile = !!existing.fileUrl;
      if (!hasFile && content.length === 0) return;
      if (content.length > 2000) return;

      db
        .update(dmMessages)
        .set({ content, editedAt: new Date() })
        .where(eq(dmMessages.id, messageId))
        .run();

      const updatedRow = db.select().from(dmMessages).where(eq(dmMessages.id, messageId)).get();
      if (!updatedRow) return;
      const message = buildDMMessageFromRow(updatedRow);

      socket.emit('dm:message:update', { targetUserId: partnerUserId, message });
      const targetSocket = findSocketByUserId(io, partnerUserId);
      targetSocket?.emit('dm:message:update', { targetUserId: socket.data.userId, message });
    });

    socket.on('dm:message:delete', (payload: { targetUserId: number; messageId: number }) => {
      const targetUserId = Number(payload.targetUserId);
      const messageId = Number(payload.messageId);
      if (!Number.isFinite(targetUserId) || !Number.isFinite(messageId)) return;

      const existing = db.select().from(dmMessages).where(eq(dmMessages.id, messageId)).get();
      if (!existing) return;

      const isParticipant =
        existing.fromUserId === socket.data.userId ||
        existing.toUserId === socket.data.userId;
      const canDelete = existing.fromUserId === socket.data.userId || socket.data.isHost;
      if (!isParticipant && !socket.data.isHost) return;
      if (!canDelete) return;

      const partnerUserId =
        existing.fromUserId === socket.data.userId
          ? existing.toUserId
          : existing.fromUserId;
      if (partnerUserId !== targetUserId && !socket.data.isHost) return;

      db.delete(dmReactions).where(eq(dmReactions.dmMessageId, messageId)).run();
      db.delete(dmMessages).where(eq(dmMessages.id, messageId)).run();

      socket.emit('dm:message:delete', { targetUserId: partnerUserId, messageId });
      const targetSocket = findSocketByUserId(io, partnerUserId);
      targetSocket?.emit('dm:message:delete', { targetUserId: socket.data.userId, messageId });
    });

    socket.on('dm:reaction:toggle', (payload: { targetUserId: number; messageId: number; emoji: string }) => {
      const targetUserId = Number(payload.targetUserId);
      const messageId = Number(payload.messageId);
      const emoji = typeof payload.emoji === 'string' ? payload.emoji.trim() : '';
      if (!Number.isFinite(targetUserId) || !Number.isFinite(messageId) || emoji.length === 0) return;

      const existingMessage = db.select().from(dmMessages).where(eq(dmMessages.id, messageId)).get();
      if (!existingMessage) return;

      const isParticipant =
        existingMessage.fromUserId === socket.data.userId ||
        existingMessage.toUserId === socket.data.userId;
      if (!isParticipant && !socket.data.isHost) return;

      const partnerUserId =
        existingMessage.fromUserId === socket.data.userId
          ? existingMessage.toUserId
          : existingMessage.fromUserId;
      if (partnerUserId !== targetUserId && !socket.data.isHost) return;

      const existingReaction = db
        .select()
        .from(dmReactions)
        .where(
          and(
            eq(dmReactions.dmMessageId, messageId),
            eq(dmReactions.userId, socket.data.userId),
            eq(dmReactions.emoji, emoji)
          )
        )
        .get();

      if (existingReaction) {
        db.delete(dmReactions).where(eq(dmReactions.id, existingReaction.id)).run();
      } else {
        db
          .insert(dmReactions)
          .values({ dmMessageId: messageId, userId: socket.data.userId, emoji })
          .run();
      }

      const reactionsPayload = buildDMReactionGroups(messageId);
      socket.emit('dm:reaction:update', {
        targetUserId: partnerUserId,
        messageId,
        reactions: reactionsPayload,
      });
      const targetSocket = findSocketByUserId(io, partnerUserId);
      targetSocket?.emit('dm:reaction:update', {
        targetUserId: socket.data.userId,
        messageId,
        reactions: reactionsPayload,
      });
    });

    socket.on('dm:call:start', (payload: { targetUserId: number }) => {
      const targetUserId = Number(payload.targetUserId);
      if (!Number.isFinite(targetUserId)) return;
      const targetSocket = findSocketByUserId(io, targetUserId);
      if (!targetSocket) return;

      const startedPayload = {
        targetUserId,
        fromUserId: socket.data.userId,
      };

      // Notify both sides so caller and callee share the same call state.
      socket.emit('dm:call:started', startedPayload);
      targetSocket.emit('dm:call:started', startedPayload);
    });

    socket.on('dm:call:end', (payload: { targetUserId: number }) => {
      const targetUserId = Number(payload.targetUserId);
      if (!Number.isFinite(targetUserId)) return;
      const targetSocket = findSocketByUserId(io, targetUserId);

      const endedPayload = {
        targetUserId,
        fromUserId: socket.data.userId,
      };

      socket.emit('dm:call:ended', endedPayload);
      targetSocket?.emit('dm:call:ended', endedPayload);
    });

    socket.on('dm:sdp:offer', (payload: SDPPayload & { dmTargetUserId: number }) => {
      const targetSocket = findSocketByUserId(io, Number(payload.dmTargetUserId));
      if (!targetSocket) return;
      targetSocket.emit('dm:sdp:offer', { ...payload, from: socket.id });
    });

    socket.on('dm:sdp:answer', (payload: SDPPayload & { dmTargetUserId: number }) => {
      const targetSocket = findSocketByUserId(io, Number(payload.dmTargetUserId));
      if (!targetSocket) return;
      targetSocket.emit('dm:sdp:answer', { ...payload, from: socket.id });
    });

    socket.on('dm:ice:candidate', (payload: ICEPayload & { dmTargetUserId: number }) => {
      const targetSocket = findSocketByUserId(io, Number(payload.dmTargetUserId));
      if (!targetSocket) return;
      targetSocket.emit('dm:ice:candidate', { ...payload, from: socket.id });
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
      } catch {
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

    // --- room:reorder ---
    socket.on('room:reorder', (orderedIds: number[]) => {
      if (!socket.data.isHost) {
        socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can reorder rooms.' });
        return;
      }
      // Update sortOrder for each room
      for (let i = 0; i < orderedIds.length; i++) {
        db.update(rooms).set({ sortOrder: i }).where(eq(rooms.id, orderedIds[i])).run();
      }
      broadcastPresence(io);
    });

    // --- room:move-user (host drags user to another room) ---
    socket.on('room:move-user', (payload: { socketId: string; targetRoomId: number }) => {
      // Host-only validation
      if (!socket.data.isHost) {
        socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can move users.' });
        return;
      }

      const { socketId: targetSocketId, targetRoomId } = payload;

      // Find the target socket
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (!targetSocket) {
        socket.emit('error', { code: 'USER_NOT_FOUND', message: 'User not found.' });
        return;
      }

      // Verify target room exists
      const targetRoom = db.select().from(rooms).where(eq(rooms.id, targetRoomId)).all()[0];
      if (!targetRoom) {
        socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Target room not found.' });
        return;
      }

      // Find which room the user is currently in
      let currentRoomKey: string | null = null;
      let currentRoomId: number | null = null;
      for (const roomKey of targetSocket.rooms) {
        if (roomKey.startsWith(ROOM_PREFIX)) {
          currentRoomKey = roomKey;
          currentRoomId = parseInt(roomKey.slice(ROOM_PREFIX.length), 10);
          break;
        }
      }

      // If already in the target room, do nothing
      if (currentRoomId === targetRoomId) return;

      // Leave old room with system message
      if (currentRoomKey && currentRoomId !== null) {
        io.to(currentRoomKey).emit('system:message', {
          text: `${targetSocket.data.displayName || 'Someone'} was moved to #${targetRoom.name} by the host.`,
          roomId: currentRoomId,
          timestamp: Date.now(),
        });
        targetSocket.leave(currentRoomKey);
      }

      // Join new room
      const newRoomKey = `${ROOM_PREFIX}${targetRoomId}`;
      targetSocket.join(newRoomKey);

      // System message in new room
      io.to(newRoomKey).emit('system:message', {
        text: `${targetSocket.data.displayName || 'Someone'} was moved here by the host.`,
        roomId: targetRoomId,
        timestamp: Date.now(),
      });

      // Notify the moved user's client to update its state
      targetSocket.emit('room:force-move', {
        targetRoomId,
        targetRoomName: targetRoom.name,
      });

      // Send peer list for WebRTC re-establishment
      const existingPeers = getPeersInRoom(io, newRoomKey, targetSocketId);
      targetSocket.emit('room:peers', existingPeers);

      targetSocket.emit('chat:history', buildRoomChatHistory(targetRoomId));

      // Broadcast updated presence
      broadcastPresence(io);

      console.log(`[signaling] ${socket.data.displayName} moved ${targetSocket.data.displayName} to room "${targetRoom.name}"`);
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

      // Clear typing timers on disconnect
      const typingTimer = typingTimers.get(socket.id);
      if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimers.delete(socket.id);
      }

      broadcastPresence(io);
      console.log(
        `[signaling] disconnected: ${socket.id} (${socket.data.displayName})`
      );
    });
  });
}
