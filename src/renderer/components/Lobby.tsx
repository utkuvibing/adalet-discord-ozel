import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RoomWithMembers, SystemMessage } from '../../shared/types';
import { getAvatarEmoji } from '../../shared/avatars';
import { useSocketContext } from '../context/SocketContext';
import { useWebRTC } from '../hooks/useWebRTC';
import { useAudio } from '../hooks/useAudio';
import { RoomList } from './RoomList';
import { InvitePanel } from './InvitePanel';
import { VoiceControls } from './VoiceControls';
import { VolumePopup } from './VolumePopup';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track previous connection state for reconnect detection
  const prevConnectionStateRef = useRef(connectionState);

  // Get socket ID for WebRTC
  const socketId = socket?.id ?? null;

  // Phase 3: Create stable refs at Lobby level, shared between useWebRTC and useAudio.
  // useAudio writes the mic stream into localStreamRef and sets onTrackRef callback.
  // useWebRTC reads localStreamRef when adding peers and calls onTrackRef on remote tracks.
  const localStreamRef = useRef<MediaStream | null>(null);
  const onTrackRef = useRef<((socketId: string, stream: MediaStream) => void) | null>(null);

  // Initialize WebRTC Perfect Negotiation with audio refs
  const { peerConnections } = useWebRTC(socket, socketId, localStreamRef, onTrackRef);

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

  // Auto-scroll system messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [systemMessages]);

  // Reconnect watchdog: re-join active room after socket reconnects
  useEffect(() => {
    const prev = prevConnectionStateRef.current;
    prevConnectionStateRef.current = connectionState;

    if (prev === 'reconnecting' && connectionState === 'connected' && activeRoomId !== null) {
      console.log('[lobby] Socket reconnected, re-joining room', activeRoomId);
      socket?.emit('room:join', activeRoomId);
    }
  }, [connectionState, activeRoomId, socket]);

  const handleJoinRoom = useCallback(
    (roomId: number) => {
      if (!socket) return;
      socket.emit('room:join', roomId);
      setActiveRoomId(roomId);
      // Clear messages when switching rooms -- fresh view
      setSystemMessages([]);
    },
    [socket]
  );

  const handleLeaveRoom = useCallback(() => {
    if (!socket) return;
    socket.emit('room:leave');
    setActiveRoomId(null);
    setSystemMessages([]);
  }, [socket]);

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
          />
        </div>
        {isHost && <InvitePanel />}
        <VoiceControls
          myVoiceState={myVoiceState}
          onToggleMute={() => setMuted(!myVoiceState.muted)}
          onToggleDeafen={() => setDeafened(!myVoiceState.deafened)}
          activeRoomId={activeRoomId}
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
          {activeRoomId === null ? (
            <div style={styles.placeholder}>
              <p style={styles.placeholderText}>Select a room to join</p>
            </div>
          ) : (
            <div style={styles.messagesList}>
              {activeRoomMessages.length === 0 && (
                <p style={styles.emptyMessages}>No messages yet. Say hi by joining!</p>
              )}
              {activeRoomMessages.map((msg, i) => (
                <div key={`${msg.timestamp}-${i}`} style={styles.systemMsg}>
                  <span style={styles.systemMsgTime}>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span style={styles.systemMsgText}>{msg.text}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

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
    fontFamily: 'monospace',
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
  messagesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0.8rem 1rem',
  },
  emptyMessages: {
    color: '#555',
    fontSize: '0.8rem',
    fontStyle: 'italic',
  },
  systemMsg: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.2rem 0',
  },
  systemMsgTime: {
    color: '#555',
    fontSize: '0.75rem',
    flexShrink: 0,
  },
  systemMsgText: {
    color: '#888',
    fontSize: '0.8rem',
    fontStyle: 'italic',
  },
};
