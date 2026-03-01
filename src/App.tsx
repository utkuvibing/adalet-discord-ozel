import React, { useState, useEffect } from 'react';
import { SocketProvider, useSocketContext } from './renderer/context/SocketContext';
import { JoinServer } from './renderer/components/JoinServer';
import { Lobby } from './renderer/components/Lobby';
import { ConnectionToast } from './renderer/components/ConnectionToast';

interface SavedSession {
  sessionToken: string;
  serverAddress: string;
  displayName: string;
  avatarId: string;
}

function getSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem('session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.sessionToken && parsed.serverAddress && parsed.displayName) {
      return parsed as SavedSession;
    }
  } catch {
    // Corrupt data — ignore
  }
  return null;
}

/**
 * Inner app component that consumes SocketContext.
 * Routes between JoinServer and Lobby based on connection state.
 *
 * Session restore logic:
 *   1. On mount, check localStorage for saved session
 *   2. If found, attempt auto-reconnect with session token
 *   3. If INVALID_SESSION error, localStorage is cleared by useSocket hook
 *   4. If no session, show JoinServer form
 *
 * Host first-launch:
 *   - Host sees JoinServer form with no invite field (isHostMode)
 *   - On subsequent launches, host auto-reconnects via saved session
 */
function AppInner(): React.JSX.Element {
  const { connectionState, socket, connect, error } = useSocketContext();
  const [displayName, setDisplayName] = useState('');
  const [avatarId, setAvatarId] = useState('skull');
  const [isHost, setIsHost] = useState(false);
  const [hostPort, setHostPort] = useState<number | null>(null);
  const [attemptedRestore, setAttemptedRestore] = useState(false);

  // Listen for session:created to update display name and avatar
  useEffect(() => {
    if (!socket) return;

    const handleSessionCreated = (data: { sessionToken: string; userId: number; displayName: string; avatarId: string }) => {
      setDisplayName(data.displayName);
      setAvatarId(data.avatarId);
    };

    socket.on('session:created', handleSessionCreated);
    return () => {
      socket.off('session:created', handleSessionCreated);
    };
  }, [socket]);

  // Detect host status and attempt session restore
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const init = async () => {
      // Check if this instance is the host
      let serverRunning = false;
      let port = 0;

      try {
        const status = await window.electronAPI.getServerStatus();
        serverRunning = status.running;
        port = status.port;
      } catch {
        // Not the host, or server not ready yet
      }

      if (cancelled) return;

      if (serverRunning) {
        setIsHost(true);
        setHostPort(port);
      }

      // Try to restore saved session
      const session = getSavedSession();
      if (session) {
        // For host: use localhost address with current port (port may have changed)
        const address = serverRunning ? `localhost:${port}` : session.serverAddress;
        setDisplayName(session.displayName);
        setAvatarId(session.avatarId);
        connect(address, '', session.displayName, session.avatarId, session.sessionToken);
        setAttemptedRestore(true);
        return;
      }

      // No saved session
      setAttemptedRestore(true);

      // If host and server not running yet, wait for server ready event
      if (!serverRunning) {
        cleanup = window.electronAPI.onServerReady((readyPort: number) => {
          if (cancelled) return;
          setIsHost(true);
          setHostPort(readyPort);
        });
      }
    };

    init();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [connect]);

  // Detect host from socket auth after connection
  useEffect(() => {
    if (socket && connectionState === 'connected') {
      const auth = (socket as unknown as { auth?: { token?: string } }).auth;
      if (auth && !auth.token) {
        setIsHost(true);
      }
    }
  }, [socket, connectionState]);

  // If restore attempt failed with INVALID_SESSION, we'll be disconnected
  // and error state will show the message. The form is shown automatically.

  const showLobby = connectionState === 'connected' || connectionState === 'reconnecting';

  // Don't flash the join form before session restore attempt completes
  if (!attemptedRestore) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#0d0d0d' }}>
        <ConnectionToast connectionState={connectionState} />
      </div>
    );
  }

  return (
    <>
      {showLobby ? (
        <Lobby displayName={displayName} isHost={isHost} avatarId={avatarId} />
      ) : (
        <JoinServer isHostMode={isHost} hostPort={hostPort ?? undefined} />
      )}
      <ConnectionToast connectionState={connectionState} />
    </>
  );
}

function App(): React.JSX.Element {
  return (
    <SocketProvider>
      <AppInner />
    </SocketProvider>
  );
}

export default App;
