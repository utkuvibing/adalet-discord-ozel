import { useState, useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types';
import { saveIdentity } from '../utils/identity';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Map server error codes to user-friendly messages per locked decisions. */
const ERROR_MESSAGES: Record<string, string> = {
  EXPIRED_TOKEN: 'This invite has expired. Ask the host for a new invite link.',
  INVALID_TOKEN: 'This invite link is not valid. Check for typos or ask the host for a new one.',
  TOKEN_LIMIT_REACHED: 'This invite has reached its use limit. Ask the host for a new invite link.',
  MISSING_TOKEN: 'No invite token provided.',
  INVALID_SESSION: 'Session expired. Please join again.',
};

function friendlyError(raw: string): string {
  // Server sends JSON-encoded error or plain error code
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data && parsed.data.code) {
      return ERROR_MESSAGES[parsed.data.code] ?? parsed.data.message ?? raw;
    }
  } catch {
    // Not JSON — try matching raw string directly
  }
  return ERROR_MESSAGES[raw] ?? "Can't reach server. Retrying in 5s...";
}

export interface UseSocketReturn {
  socket: TypedSocket | null;
  connectionState: ConnectionState;
  error: string | null;
  connect: (serverAddress: string, token: string, displayName: string, avatarId: string, sessionToken?: string) => void;
  disconnect: () => void;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<TypedSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback((serverAddress: string, token: string, displayName: string, avatarId: string, sessionToken?: string) => {
    // Clean up any existing connection
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionState('connecting');
    setError(null);

    const hasProtocol = /^https?:\/\//.test(serverAddress);
    const url = hasProtocol ? serverAddress : `http://${serverAddress}`;
    // Tunnels need polling fallback; LAN can use websocket-only
    const transports: ('polling' | 'websocket')[] = hasProtocol
      ? ['polling', 'websocket']
      : ['websocket'];

    const socket: TypedSocket = io(url, {
      transports,
      extraHeaders: hasProtocol ? { 'ngrok-skip-browser-warning': '1' } : {},
      auth: { token, displayName, avatarId, sessionToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });

    socketRef.current = socket;

    // Save session data when server confirms identity
    socket.on('session:created', (data) => {
      localStorage.setItem('session', JSON.stringify({
        sessionToken: data.sessionToken,
        serverAddress,
        userId: data.userId,
        displayName: data.displayName,
        avatarId: data.avatarId,
      }));
      // Persist identity separately so it survives session expiration
      saveIdentity(data.displayName, data.avatarId);
    });

    socket.on('connect', () => {
      setConnectionState('connected');
      setError(null);
    });

    socket.on('disconnect', () => {
      setConnectionState('disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      setConnectionState('reconnecting');
    });

    socket.io.on('reconnect', () => {
      setConnectionState('connected');
      setError(null);
    });

    socket.on('connect_error', (err: Error) => {
      const message = friendlyError(err.message);
      setError(message);

      // If session was invalid, clear stored session so user sees join form
      if (err.message.includes('INVALID_SESSION')) {
        localStorage.removeItem('session');
        // Stop reconnection attempts — user needs to re-enter credentials
        socket.disconnect();
        setConnectionState('disconnected');
      }
    });
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnectionState('disconnected');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    socket: socketRef.current,
    connectionState,
    error,
    connect,
    disconnect,
  };
}
