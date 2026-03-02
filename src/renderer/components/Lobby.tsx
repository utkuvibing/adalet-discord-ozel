import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { RoomWithMembers, SystemMessage } from '../../shared/types';
import { getAvatarEmoji } from '../../shared/avatars';
import { useSocketContext } from '../context/SocketContext';
import { useWebRTC } from '../hooks/useWebRTC';
import { useAudio } from '../hooks/useAudio';
import { useScreenShare } from '../hooks/useScreenShare';
import { RoomList } from './RoomList';
import { InvitePanel } from './InvitePanel';
import { VoiceControls } from './VoiceControls';
import { VolumePopup } from './VolumePopup';
import { ChatPanel } from './ChatPanel';
import { ScreenSharePicker } from './ScreenSharePicker';
import { ScreenShareViewer } from './ScreenShareViewer';
import { playJoinSound, playLeaveSound } from '../utils/notificationSounds';

interface LobbyProps {
  displayName: string;
  isHost: boolean;
  avatarId: string;
}

export function Lobby({ displayName, isHost, avatarId }: LobbyProps): React.JSX.Element {
  const { socket, connectionState } = useSocketContext();
  const [rooms, setRooms] = useState<RoomWithMembers[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
  const [volumePopup, setVolumePopup] = useState<{
    socketId: string;
    displayName: string;
    x: number;
    y: number;
  } | null>(null);
  const [userVolumes, setUserVolumes] = useState<Map<string, number>>(new Map());

  // Track previous connection state for reconnect detection
  const prevConnectionStateRef = useRef(connectionState);

  // Get socket ID for WebRTC
  const socketId = socket?.id ?? null;

  // Phase 3: Create stable refs at Lobby level, shared between useWebRTC and useAudio.
  // useAudio writes the mic stream into localStreamRef and sets onTrackRef callback.
  // useWebRTC reads localStreamRef when adding peers and calls onTrackRef on remote tracks.
  const localStreamRef = useRef<MediaStream | null>(null);
  const onTrackRef = useRef<((socketId: string, stream: MediaStream) => void) | null>(null);

  // Phase 7: Screen sharing state
  const [remoteScreenShare, setRemoteScreenShare] = useState<{
    socketId: string;
    sourceName: string;
    stream: MediaStream | null;
  } | null>(null);

  // Phase 7: Refs to bridge useScreenShare callbacks with useWebRTC methods (avoids declaration order issue)
  const addScreenShareTracksRef = useRef<((stream: MediaStream) => void) | null>(null);
  const removeScreenShareTracksRef = useRef<((stream: MediaStream) => void) | null>(null);

  // Phase 7: Screen sharing hook (declared before useWebRTC so screenStreamRef is available)
  const {
    pickerOpen,
    sources,
    isSharing: isScreenSharing,
    screenStream,
    screenStreamRef,
    openPicker,
    closePicker,
    startShare,
    stopShare,
  } = useScreenShare({
    onShareStarted: (stream) => {
      addScreenShareTracksRef.current?.(stream);
      socket?.emit('screen:start', { sourceName: 'Screen' });
    },
    onShareStopped: (stream) => {
      removeScreenShareTracksRef.current?.(stream);
      socket?.emit('screen:stop');
    },
  });

  // Initialize WebRTC Perfect Negotiation with audio refs + screen share ref
  const { peerConnections, removeAllPeers, addScreenShareTracks, removeScreenShareTracks } = useWebRTC(
    socket, socketId, localStreamRef, onTrackRef, screenStreamRef
  );

  // Keep refs in sync with useWebRTC methods
  addScreenShareTracksRef.current = addScreenShareTracks;
  removeScreenShareTracksRef.current = removeScreenShareTracks;

  // Initialize audio pipeline -- uses same refs as WebRTC
  const {
    myVoiceState,
    voiceStates,
    speakingPeers,
    setMuted,
    setDeafened,
    setRemoteVolume,
  } = useAudio({
    socket,
    mySocketId: socketId,
    peerConnections,
    activeRoomId,
    localStreamRef,
    onTrackRef,
  });

  // Listen for presence updates
  useEffect(() => {
    if (!socket) return;

    const handlePresenceUpdate = (update: { rooms: RoomWithMembers[] }) => {
      setRooms(update.rooms);
    };

    const handleRoomList = (roomList: RoomWithMembers[]) => {
      setRooms(roomList);
    };

    const handleSystemMessage = (msg: SystemMessage) => {
      setSystemMessages((prev) => [...prev, msg]);
      // Play notification sound for join/leave events
      const lower = msg.text.toLowerCase();
      if (lower.includes('joined')) {
        playJoinSound();
      } else if (lower.includes('left') || lower.includes('disconnected')) {
        playLeaveSound();
      }
    };

    socket.on('presence:update', handlePresenceUpdate);
    socket.on('room:list', handleRoomList);
    socket.on('system:message', handleSystemMessage);

    return () => {
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('room:list', handleRoomList);
      socket.off('system:message', handleSystemMessage);
    };
  }, [socket]);

  // Get userId and serverAddress from localStorage session data
  const { myUserId, serverAddress } = useMemo(() => {
    try {
      const session = JSON.parse(localStorage.getItem('session') || '{}');
      return {
        myUserId: (session.userId as number) ?? null,
        serverAddress: (session.serverAddress as string) ?? 'localhost:7432',
      };
    } catch {
      return { myUserId: null as number | null, serverAddress: 'localhost:7432' };
    }
  }, []);

  // Reconnect watchdog: re-join active room after socket reconnects
  useEffect(() => {
    const prev = prevConnectionStateRef.current;
    prevConnectionStateRef.current = connectionState;

    if (prev === 'reconnecting' && connectionState === 'connected' && activeRoomId !== null) {
      console.log('[lobby] Socket reconnected, re-joining room', activeRoomId);
      socket?.emit('room:join', activeRoomId);
    }
  }, [connectionState, activeRoomId, socket]);

  // Phase 7: Listen for remote screen share events
  useEffect(() => {
    if (!socket) return;

    const handleScreenStarted = (payload: { socketId: string; sourceName: string }) => {
      console.log('[lobby] Remote screen share started:', payload);
      setRemoteScreenShare({ socketId: payload.socketId, sourceName: payload.sourceName, stream: null });
    };

    const handleScreenStopped = (payload: { socketId: string }) => {
      console.log('[lobby] Remote screen share stopped:', payload.socketId);
      setRemoteScreenShare((prev) => {
        if (prev?.socketId === payload.socketId) return null;
        return prev;
      });
    };

    socket.on('screen:started', handleScreenStarted);
    socket.on('screen:stopped', handleScreenStopped);

    return () => {
      socket.off('screen:started', handleScreenStarted);
      socket.off('screen:stopped', handleScreenStopped);
    };
  }, [socket]);

  // Phase 7: Detect remote screen share video tracks
  useEffect(() => {
    if (!remoteScreenShare || remoteScreenShare.stream) return;

    const sharerSocketId = remoteScreenShare.socketId;
    const pc = peerConnections.current.get(sharerSocketId);
    if (!pc) return;

    const handler = (event: RTCTrackEvent) => {
      if (event.track.kind === 'video' && event.streams[0]) {
        console.log('[lobby] Received screen share video track from', sharerSocketId);
        setRemoteScreenShare((prev) => {
          if (prev?.socketId === sharerSocketId) {
            return { ...prev, stream: event.streams[0] };
          }
          return prev;
        });
      }
    };

    pc.addEventListener('track', handler);
    return () => {
      pc.removeEventListener('track', handler);
    };
  }, [remoteScreenShare, peerConnections]);

  const handleJoinRoom = useCallback(
    (roomId: number) => {
      if (!socket) return;
      // Close all existing peer connections before joining a new room
      // so fresh connections are created via room:peers
      removeAllPeers();
      setRemoteScreenShare(null);
      socket.emit('room:join', roomId);
      setActiveRoomId(roomId);
      // Clear messages when switching rooms -- fresh view
      setSystemMessages([]);
      // Play join sound locally so user hears feedback
      playJoinSound();
    },
    [socket, removeAllPeers]
  );

  const handleLeaveRoom = useCallback(() => {
    if (!socket) return;
    // Stop screen share if active
    if (isScreenSharing) {
      stopShare();
    }
    setRemoteScreenShare(null);
    // Close all peer connections when leaving
    removeAllPeers();
    socket.emit('room:leave');
    setActiveRoomId(null);
    setSystemMessages([]);
    // Play leave sound locally
    playLeaveSound();
  }, [socket, removeAllPeers, isScreenSharing, stopShare]);

  const handleMemberRightClick = useCallback(
    (socketId: string, event: React.MouseEvent) => {
      // Find the display name for this member
      let displayName = socketId;
      for (const room of rooms) {
        const member = room.members.find((m) => m.socketId === socketId);
        if (member) {
          displayName = member.displayName;
          break;
        }
      }
      setVolumePopup({ socketId, displayName, x: event.clientX, y: event.clientY });
    },
    [rooms]
  );

  const handleVolumeChange = useCallback(
    (socketId: string, volume: number) => {
      setRemoteVolume(socketId, volume);
      setUserVolumes((prev) => {
        const next = new Map(prev);
        next.set(socketId, volume);
        return next;
      });
    },
    [setRemoteVolume]
  );

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const activeRoomMessages = systemMessages.filter(
    (m) => m.roomId === activeRoomId
  );

  return (
    <div style={styles.wrapper}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <RoomList
            rooms={rooms}
            activeRoomId={activeRoomId}
            onJoinRoom={handleJoinRoom}
            onLeaveRoom={handleLeaveRoom}
            voiceStates={voiceStates}
            speakingPeers={speakingPeers}
            onMemberRightClick={handleMemberRightClick}
            isHost={isHost}
            socket={socket}
          />
        </div>
        {isHost && <InvitePanel />}
        <VoiceControls
          myVoiceState={myVoiceState}
          onToggleMute={() => setMuted(!myVoiceState.muted)}
          onToggleDeafen={() => setDeafened(!myVoiceState.deafened)}
          onSetMuted={setMuted}
          activeRoomId={activeRoomId}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={() => {
            if (isScreenSharing) {
              stopShare();
            } else {
              openPicker();
            }
          }}
        />
      </div>

      {/* Main content area */}
      <div style={styles.main}>
        <div style={styles.topBar}>
          <span style={styles.connectedAs}>
            Connected as {getAvatarEmoji(avatarId)} <strong style={{ color: '#7fff00' }}>{displayName}</strong>
          </span>
          {activeRoom && (
            <span style={styles.roomTitle}>#{activeRoom.name}</span>
          )}
          {/* Voice controls moved to sidebar bottom (VoiceControls component) */}
        </div>

        <div style={styles.messagesArea}>
          {/* Screen share viewer (own share preview or remote share) */}
          {isScreenSharing && screenStream && (
            <ScreenShareViewer
              stream={screenStream}
              sharerName="You"
              onClose={stopShare}
            />
          )}
          {!isScreenSharing && remoteScreenShare?.stream && (
            <ScreenShareViewer
              stream={remoteScreenShare.stream}
              sharerName={
                rooms
                  .flatMap((r) => r.members)
                  .find((m) => m.socketId === remoteScreenShare.socketId)
                  ?.displayName ?? 'Someone'
              }
            />
          )}

          {activeRoomId === null ? (
            <div style={styles.placeholder}>
              <p style={styles.placeholderText}>Select a room to join</p>
            </div>
          ) : (
            <ChatPanel
              socket={socket}
              activeRoomId={activeRoomId}
              systemMessages={activeRoomMessages}
              myUserId={myUserId}
              serverAddress={serverAddress}
            />
          )}
        </div>
      </div>

      {/* Screen share picker modal */}
      {pickerOpen && (
        <ScreenSharePicker
          sources={sources}
          onSelect={startShare}
          onClose={closePicker}
        />
      )}

      {/* Per-user volume popup (right-click on member) */}
      {volumePopup && (
        <VolumePopup
          socketId={volumePopup.socketId}
          displayName={volumePopup.displayName}
          position={{ x: volumePopup.x, y: volumePopup.y }}
          currentVolume={userVolumes.get(volumePopup.socketId) ?? 1.0}
          onVolumeChange={handleVolumeChange}
          onClose={() => setVolumePopup(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#0d0d0d',
    color: '#e0e0e0',
  },
  sidebar: {
    width: '250px',
    minWidth: '250px',
    backgroundColor: '#111111',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarTop: {
    flex: 1,
    overflowY: 'auto',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.6rem 1rem',
    borderBottom: '1px solid #2a2a2a',
    backgroundColor: '#0f0f0f',
  },
  connectedAs: {
    fontSize: '0.8rem',
    color: '#888',
  },
  roomTitle: {
    fontSize: '0.9rem',
    color: '#7fff00',
    fontWeight: 'bold',
  },
  messagesArea: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#555',
    fontSize: '1rem',
  },
};
