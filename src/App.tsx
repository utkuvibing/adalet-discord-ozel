import React, { useState, useEffect } from 'react';
import { SocketProvider, useSocketContext } from './renderer/context/SocketContext';
import { JoinServer } from './renderer/components/JoinServer';
import { Lobby } from './renderer/components/Lobby';
import { ConnectionToast } from './renderer/components/ConnectionToast';

/**
 * Inner app component that consumes SocketContext.
 * Routes between JoinServer and Lobby based on connection state.
 */
function AppInner(): React.JSX.Element {
  const { connectionState, socket } = useSocketContext();
  const [displayName, setDisplayName] = useState('');
  const [isHost, setIsHost] = useState(false);

  // Detect host: if the server is running locally, the host connects
  // without a token (localhost bypass). We detect this by checking
  // if the auth token was empty.
  useEffect(() => {
    if (socket && connectionState === 'connected') {
      const auth = (socket as unknown as { auth?: { token?: string; displayName?: string } }).auth;
      if (auth) {
        setDisplayName(auth.displayName ?? '');
        setIsHost(!auth.token); // Empty token = host (localhost bypass)
      }
    }
  }, [socket, connectionState]);

  // Auto-connect as host when server is ready on localhost
  const { connect } = useSocketContext();
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const tryAutoConnect = async () => {
      try {
        const status = await window.electronAPI.getServerStatus();
        if (status.running) {
          // Host auto-connects to own server with no token
          const hostName = 'Host';
          setDisplayName(hostName);
          setIsHost(true);
          connect(`localhost:${status.port}`, '', hostName);
          return;
        }
      } catch {
        // Server not ready yet, wait for event
      }

      // Listen for server ready event
      cleanup = window.electronAPI.onServerReady((port: number) => {
        const hostName = 'Host';
        setDisplayName(hostName);
        setIsHost(true);
        connect(`localhost:${port}`, '', hostName);
      });
    };

    tryAutoConnect();

    return () => {
      if (cleanup) cleanup();
    };
  }, [connect]);

  const showLobby = connectionState === 'connected' || connectionState === 'reconnecting';

  return (
    <>
      {showLobby ? (
        <Lobby displayName={displayName} isHost={isHost} />
      ) : (
        <JoinServer />
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
