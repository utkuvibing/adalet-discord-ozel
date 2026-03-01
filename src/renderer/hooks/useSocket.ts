import { useState, useRef, useCallback, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Map server error codes to user-friendly messages per locked decisions. */
const ERROR_MESSAGES: Record<string, string> = {
  EXPIRED_TOKEN: 'This invite has expired. Ask the host for a new invite link.',
  INVALID_TOKEN: 'This invite link is not valid. Check for typos or ask the host for a new one.',
  TOKEN_LIMIT_REACHED: 'This invite has reached its use limit. Ask the host for a new invite link.',
  MISSING_TOKEN: 'No invite token provided.',
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
  connect: (serverAddress: string, token: string, displayName: string) => void;
  disconnect: () => void;
}

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<TypedSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback((serverAddress: string, token: string, displayName: string) => {
    // Clean up any existing connection
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionState('connecting');
    setError(null);

    const socket: TypedSocket = io(`http://${serverAddress}`, {
      transports: ['websocket'], // Electron optimization — skip HTTP long-polling
      auth: { token, displayName },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });

    socketRef.current = socket;

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
      // Stay in 'connecting' if reconnection will retry, otherwise 'disconnected'
      // Socket.IO will auto-retry unless max attempts reached
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
