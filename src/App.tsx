import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SocketProvider, useSocketContext } from './renderer/context/SocketContext';
import { JoinServer } from './renderer/components/JoinServer';
import { Lobby } from './renderer/components/Lobby';
import { ConnectionToast } from './renderer/components/ConnectionToast';
import { UpdateCheckModal } from './renderer/components/UpdateCheckModal';
import { getSavedIdentity } from './renderer/utils/identity';
import { theme } from './renderer/theme';
import type { UpdateCheckResult } from './shared/types';

interface SavedSession {
  sessionToken: string;
  serverAddress: string;
  displayName: string;
  avatarId: string;
}

function parseInvite(raw: string): { serverAddress: string; token: string } | null {
  const trimmed = raw.trim();
  const deepMatch = trimmed.match(/^theinn:\/\/join\/(.+)\/([^/]+)$/);
  if (deepMatch) return { serverAddress: deepMatch[1], token: deepMatch[2] };
  const urlMatch = trimmed.match(/^(https?:\/\/[^/]+)\/(.+)$/);
  if (urlMatch) return { serverAddress: urlMatch[1], token: urlMatch[2] };
  const lanMatch = trimmed.match(/^([^:]+):(\d+)\/(.+)$/);
  if (lanMatch) return { serverAddress: `${lanMatch[1]}:${lanMatch[2]}`, token: lanMatch[3] };
  return null;
}

function getSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem('session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.sessionToken && parsed.serverAddress && parsed.displayName) {
      return parsed as SavedSession;
    }
  } catch { /* ignore */ }
  return null;
}

function AppInner(): React.JSX.Element {
  const { connectionState, socket, connect } = useSocketContext();
  const [displayName, setDisplayName] = useState('');
  const [avatarId, setAvatarId] = useState('skull');
  const [isHost, setIsHost] = useState(false);
  const [hostPort, setHostPort] = useState<number | null>(null);
  const [attemptedRestore, setAttemptedRestore] = useState(false);
  const [deepLinkInvite, setDeepLinkInvite] = useState<string | null>(null);
  const [embeddedInvite, setEmbeddedInvite] = useState<string | null>(null);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handleSessionCreated = (data: { sessionToken: string; userId: number; displayName: string; avatarId: string }) => {
      setDisplayName(data.displayName);
      setAvatarId(data.avatarId);
    };
    socket.on('session:created', handleSessionCreated);
    return () => { socket.off('session:created', handleSessionCreated); };
  }, [socket]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const init = async () => {
      let serverRunning = false;
      let port = 0;
      let bootstrapInvite: string | null = null;
      let runServer = true;

      try {
        const bootstrap = await window.electronAPI.getBootstrapConfig();
        bootstrapInvite = bootstrap.embeddedInvite;
        runServer = bootstrap.runServer;
        setEmbeddedInvite(bootstrap.embeddedInvite);
      } catch { /* fallback */ }

      try {
        const status = await window.electronAPI.getServerStatus();
        serverRunning = status.running;
        port = status.port;
      } catch { /* not host */ }

      if (cancelled) return;
      if (serverRunning && runServer) {
        setIsHost(true);
        setHostPort(port);
      }

      const session = getSavedSession();
      if (session) {
        const address = serverRunning ? `localhost:${port}` : session.serverAddress;
        setDisplayName(session.displayName);
        setAvatarId(session.avatarId);
        connect(address, '', session.displayName, session.avatarId, session.sessionToken);
        setAttemptedRestore(true);
        return;
      }

      if (serverRunning && runServer) {
        const identity = getSavedIdentity();
        if (identity) {
          setDisplayName(identity.displayName);
          setAvatarId(identity.avatarId ?? 'skull');
          connect(`localhost:${port}`, '', identity.displayName, identity.avatarId ?? 'skull');
          setAttemptedRestore(true);
          return;
        }
        setDisplayName('Host');
        setAvatarId('skull');
        connect(`localhost:${port}`, '', 'Host', 'skull');
        setAttemptedRestore(true);
        return;
      }

      if (!serverRunning && bootstrapInvite) {
        const parsed = parseInvite(bootstrapInvite);
        if (parsed) {
          const identity = getSavedIdentity();
          if (identity) {
            setDisplayName(identity.displayName);
            setAvatarId(identity.avatarId ?? 'skull');
            connect(parsed.serverAddress, parsed.token, identity.displayName, identity.avatarId ?? 'skull');
            setAttemptedRestore(true);
            return;
          }
          setDeepLinkInvite(bootstrapInvite);
        }
      }

      setAttemptedRestore(true);
      if (!serverRunning) {
        cleanup = window.electronAPI.onServerReady((readyPort: number) => {
          if (cancelled) return;
          setIsHost(true);
          setHostPort(readyPort);
        });
      }
    };

    init();
    return () => { cancelled = true; if (cleanup) cleanup(); };
  }, [connect]);

  useEffect(() => {
    if (socket && connectionState === 'connected') {
      const auth = (socket as unknown as { auth?: { token?: string } }).auth;
      if (auth && !auth.token) setIsHost(true);
    }
  }, [socket, connectionState]);

  useEffect(() => {
    const cleanup = window.electronAPI.onDeepLinkInvite((data) => {
      const inviteString = `${data.address}/${data.token}`;
      const identity = getSavedIdentity();
      if (identity && connectionState !== 'connected' && connectionState !== 'connecting') {
        setDisplayName(identity.displayName);
        setAvatarId(identity.avatarId ?? 'skull');
        connect(data.address, data.token, identity.displayName, identity.avatarId ?? 'skull');
      } else {
        setDeepLinkInvite(inviteString);
      }
    });
    return cleanup;
  }, [connect, connectionState]);

  useEffect(() => {
    if (connectionState === 'connected') setHasConnectedOnce(true);
  }, [connectionState]);

  const triggerUpdateCheck = useCallback(async () => {
    setUpdateCheckLoading(true);
    try {
      const result = await window.electronAPI.checkForUpdates();
      setUpdateCheckResult(result);
    } finally {
      setUpdateCheckLoading(false);
    }
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI.onOpenUpdateChecker(() => {
      setUpdateModalOpen(true);
      void triggerUpdateCheck();
    });
    return cleanup;
  }, [triggerUpdateCheck]);

  const handleOpenReleaseFromModal = useCallback(() => {
    const releaseUrl = updateCheckResult?.releaseUrl;
    if (!releaseUrl) return;
    void window.electronAPI.openExternalUrl(releaseUrl);
  }, [updateCheckResult]);

  const showLobby = connectionState === 'connected' || (connectionState === 'reconnecting' && hasConnectedOnce);

  if (!attemptedRestore) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: theme.colors.bgDarkest }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ConnectionToast connectionState={connectionState} />
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {showLobby ? (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ height: '100vh', overflow: 'hidden' }}
          >
            <Lobby displayName={displayName} isHost={isHost} avatarId={avatarId} />
          </motion.div>
        ) : (
          <motion.div
            key="join"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ height: '100vh', overflow: 'hidden' }}
          >
            <JoinServer
              isHostMode={isHost}
              hostPort={hostPort ?? undefined}
              deepLinkInvite={(deepLinkInvite ?? embeddedInvite) ?? undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <ConnectionToast connectionState={connectionState} />
      <UpdateCheckModal
        open={updateModalOpen}
        loading={updateCheckLoading}
        result={updateCheckResult}
        onClose={() => setUpdateModalOpen(false)}
        onCheckNow={() => { void triggerUpdateCheck(); }}
        onOpenRelease={handleOpenReleaseFromModal}
      />
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
