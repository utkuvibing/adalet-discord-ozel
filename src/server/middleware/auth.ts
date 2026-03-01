import type { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../shared/types';
import { findValidInviteToken, incrementTokenUseCount } from '../invite';

type TypedIO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Register Socket.IO authentication middleware.
 * Validates invite tokens on handshake. Localhost (host) connections
 * are allowed through without a token.
 */
export function registerAuthMiddleware(io: TypedIO): void {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    const address = socket.handshake.address;

    // Host bypass: localhost connections do not require a token
    const isLocalhost =
      address === '127.0.0.1' ||
      address === '::1' ||
      address === '::ffff:127.0.0.1';

    if (!token && isLocalhost) {
      socket.data.displayName = 'Host';
      return next();
    }

    if (!token) {
      return next(new Error('MISSING_TOKEN'));
    }

    const invite = findValidInviteToken(token);

    if (!invite) {
      return next(new Error('INVALID_TOKEN'));
    }

    // Double-check expiry (findValidInviteToken already checks, but be explicit)
    if (invite.expiresAt != null && invite.expiresAt < new Date()) {
      return next(new Error('EXPIRED_TOKEN'));
    }

    // Double-check max uses
    if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
      return next(new Error('TOKEN_LIMIT_REACHED'));
    }

    // Token is valid — increment use count and allow connection
    incrementTokenUseCount(invite.id);
    socket.data.inviteTokenId = invite.id;
    socket.data.displayName =
      (socket.handshake.auth.displayName as string) || 'Anonymous';
    return next();
  });
}
