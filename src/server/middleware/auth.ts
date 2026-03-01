import type { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../shared/types';
import { findValidInviteToken, incrementTokenUseCount } from '../invite';
import { findUserBySession, createUser } from '../user';

type TypedIO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Register Socket.IO authentication middleware.
 *
 * Supports three flows:
 *   A) Returning user — has sessionToken in auth, validated against DB
 *   B) New user — has invite token, creates user in DB
 *   C) Host localhost bypass — creates or restores session for localhost connections
 */
export function registerAuthMiddleware(io: TypedIO): void {
  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as {
      token?: string;
      displayName?: string;
      avatarId?: string;
      sessionToken?: string;
    };

    const address = socket.handshake.address;
    const isLocalhost =
      address === '127.0.0.1' ||
      address === '::1' ||
      address === '::ffff:127.0.0.1';

    // --- Flow A: Returning user with session token ---
    if (auth.sessionToken) {
      const user = findUserBySession(auth.sessionToken);
      if (user) {
        socket.data.userId = user.id;
        socket.data.displayName = user.displayName;
        socket.data.avatarId = user.avatarId;
        socket.data.sessionToken = auth.sessionToken;
        socket.data.isHost = isLocalhost;
        return next();
      }
      // Session token was provided but is invalid
      // If localhost, fall through to host bypass; otherwise reject
      if (!isLocalhost) {
        return next(new Error('INVALID_SESSION'));
      }
    }

    // --- Flow C: Host localhost bypass ---
    if (isLocalhost) {
      const displayName = auth.displayName || 'Host';
      const avatarId = auth.avatarId || 'skull';
      const newUser = createUser(displayName, avatarId);
      socket.data.userId = newUser.id;
      socket.data.displayName = displayName;
      socket.data.avatarId = avatarId;
      socket.data.sessionToken = newUser.sessionToken;
      socket.data.isHost = true; // Always true for localhost bypass
      return next();
    }

    // --- Flow B: New user with invite token ---
    const token = auth.token;

    if (!token) {
      return next(new Error('MISSING_TOKEN'));
    }

    const invite = findValidInviteToken(token);

    if (!invite) {
      return next(new Error('INVALID_TOKEN'));
    }

    // Double-check expiry
    if (invite.expiresAt != null && invite.expiresAt < new Date()) {
      return next(new Error('EXPIRED_TOKEN'));
    }

    // Double-check max uses
    if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
      return next(new Error('TOKEN_LIMIT_REACHED'));
    }

    // Token is valid -- increment use count and create user
    incrementTokenUseCount(invite.id);

    const displayName = auth.displayName || 'Anonymous';
    const avatarId = auth.avatarId || 'skull';
    const newUser = createUser(displayName, avatarId);

    socket.data.inviteTokenId = invite.id;
    socket.data.userId = newUser.id;
    socket.data.displayName = displayName;
    socket.data.avatarId = avatarId;
    socket.data.sessionToken = newUser.sessionToken;
    socket.data.isHost = isLocalhost;

    return next();
  });
}
