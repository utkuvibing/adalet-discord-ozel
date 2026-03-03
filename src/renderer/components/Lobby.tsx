import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { RoomWithMembers, SystemMessage, PeerInfo, FriendItem } from '../../shared/types';
import { useSocketContext } from '../context/SocketContext';
import { useWebRTC } from '../hooks/useWebRTC';
import { useAudio } from '../hooks/useAudio';
import { useScreenShare } from '../hooks/useScreenShare';
import { RoomList } from './RoomList';
import { InvitePanel } from './InvitePanel';
import { VoiceControls } from './VoiceControls';
import { VolumePopup } from './VolumePopup';
import { ChatPanel } from './ChatPanel';
import { DMPanel } from './DMPanel';
import { FriendListSidebar } from './FriendListSidebar';
import { ScreenSharePicker } from './ScreenSharePicker';
import { ScreenShareViewer, ViewerMode } from './ScreenShareViewer';
import { AudioSettings } from './AudioSettings';
import { AvatarBadge } from './AvatarBadge';
import { UserSettingsModal } from './UserSettingsModal';
import { UserCardModal } from './UserCardModal';
import { playJoinSound, playLeaveSound } from '../utils/notificationSounds';

interface LobbyProps {
  displayName: string;
  isHost: boolean;
  avatarId: string;
}

export function Lobby({ displayName, isHost }: LobbyProps): React.JSX.Element {
  const { socket, connectionState } = useSocketContext();
  const [rooms, setRooms] = useState<RoomWithMembers[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [activeDmTargetUserId, setActiveDmTargetUserId] = useState<number | null>(null);
  const [friendList, setFriendList] = useState<FriendItem[]>([]);
  const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
  const [userCardOpen, setUserCardOpen] = useState(false);
  const [selectedUserCard, setSelectedUserCard] = useState<PeerInfo | null>(null);
  const [volumePopup, setVolumePopup] = useState<{
    socketId: string;
    displayName: string;
    x: number;
    y: number;
  } | null>(null);
  const [userVolumes, setUserVolumes] = useState<Map<string, number>>(new Map());
  const [screenAudioVolume, setScreenAudioVolume] = useState(1);
  const [screenAudioMuted, setScreenAudioMuted] = useState(false);
  const [screenAudioPopup, setScreenAudioPopup] = useState<{ x: number; y: number } | null>(null);

  const prevConnectionStateRef = useRef(connectionState);
  const socketId = socket?.id ?? null;

  const localStreamRef = useRef<MediaStream | null>(null);
  const onTrackRef = useRef<((socketId: string, stream: MediaStream) => void) | null>(null);

  const [vadMode, setVadMode] = useState(false);
  const [noiseGate, setNoiseGate] = useState(false);
  const [noiseCancellationMode, setNoiseCancellationMode] = useState<'standard' | 'enhanced'>(() => {
    try {
      const saved = localStorage.getItem('noiseCancellationMode');
      return saved === 'enhanced' ? 'enhanced' : 'standard';
    } catch {
      return 'standard';
    }
  });
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('');
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState('');
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [remoteScreenShare, setRemoteScreenShare] = useState<{
    socketId: string;
    sourceName: string;
    stream: MediaStream | null;
  } | null>(null);

  const [ownShareMode, setOwnShareMode] = useState<'normal' | 'minimized'>('minimized');
  const [remoteViewerMode, setRemoteViewerMode] = useState<'closed' | 'normal' | 'minimized' | 'fullscreen'>('closed');

  const [myProfile, setMyProfile] = useState({
    displayName,
    bio: '',
    profilePhotoUrl: null as string | null,
    profileBannerGifUrl: null as string | null,
  });

  const addScreenShareTracksRef = useRef<((stream: MediaStream) => void) | null>(null);
  const removeScreenShareTracksRef = useRef<((stream: MediaStream) => void) | null>(null);

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

  const { peerConnections, removeAllPeers, addScreenShareTracks, removeScreenShareTracks } = useWebRTC(
    socket, socketId, localStreamRef, onTrackRef, screenStreamRef
  );

  addScreenShareTracksRef.current = addScreenShareTracks;
  removeScreenShareTracksRef.current = removeScreenShareTracks;

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
    vadMode,
    noiseGate,
    noiseCancellationMode,
    selectedInputDeviceId: selectedInputDeviceId || undefined,
    selectedOutputDeviceId: selectedOutputDeviceId || undefined,
  });

  useEffect(() => {
    localStorage.setItem('noiseCancellationMode', noiseCancellationMode);
  }, [noiseCancellationMode]);

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
      const lower = msg.text.toLowerCase();
      if (lower.includes('joined')) playJoinSound();
      if (lower.includes('left') || lower.includes('disconnected')) playLeaveSound();
    };
    const handleProfileUpdated = (payload: {
      userId: number;
      displayName: string;
      bio: string;
      profilePhotoUrl: string | null;
      profileBannerGifUrl: string | null;
    }) => {
      setRooms((prev) =>
        prev.map((room) => ({
          ...room,
          members: room.members.map((m) =>
            m.userId === payload.userId
              ? {
                  ...m,
                  displayName: payload.displayName,
                  bio: payload.bio,
                  profilePhotoUrl: payload.profilePhotoUrl,
                  profileBannerGifUrl: payload.profileBannerGifUrl,
                }
              : m
          ),
        }))
      );

      if (payload.userId === myUserId) {
        setMyProfile({
          displayName: payload.displayName,
          bio: payload.bio,
          profilePhotoUrl: payload.profilePhotoUrl,
          profileBannerGifUrl: payload.profileBannerGifUrl,
        });
      }
    };

    socket.on('presence:update', handlePresenceUpdate);
    socket.on('room:list', handleRoomList);
    socket.on('system:message', handleSystemMessage);
    socket.on('profile:updated', handleProfileUpdated);
    socket.emit('room:list:request');

    return () => {
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('room:list', handleRoomList);
      socket.off('system:message', handleSystemMessage);
      socket.off('profile:updated', handleProfileUpdated);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleForceMove = (payload: { targetRoomId: number }) => {
      removeAllPeers();
      if (isScreenSharing) stopShare();
      setRemoteScreenShare(null);
      setOwnShareMode('minimized');
      setRemoteViewerMode('closed');
      setActiveRoomId(payload.targetRoomId);
      setSystemMessages([]);
      playJoinSound();
    };

    socket.on('room:force-move', handleForceMove);
    return () => {
      socket.off('room:force-move', handleForceMove);
    };
  }, [socket, removeAllPeers, isScreenSharing, stopShare]);

  const { myUserId, serverAddress, initialProfile } = useMemo(() => {
    try {
      const session = JSON.parse(localStorage.getItem('session') || '{}');
      return {
        myUserId: (session.userId as number) ?? null,
        serverAddress: (session.serverAddress as string) ?? 'localhost:7432',
        initialProfile: {
          displayName: (session.displayName as string) ?? displayName,
          bio: (session.bio as string) ?? '',
          profilePhotoUrl: (session.profilePhotoUrl as string | null) ?? null,
          profileBannerGifUrl: (session.profileBannerGifUrl as string | null) ?? null,
        },
      };
    } catch {
      return {
        myUserId: null as number | null,
        serverAddress: 'localhost:7432',
        initialProfile: {
          displayName,
          bio: '',
          profilePhotoUrl: null,
          profileBannerGifUrl: null,
        },
      };
    }
  }, [displayName]);

  useEffect(() => setMyProfile(initialProfile), [initialProfile]);

  useEffect(() => {
    const prev = prevConnectionStateRef.current;
    prevConnectionStateRef.current = connectionState;
    if (prev === 'reconnecting' && connectionState === 'connected' && activeRoomId !== null) {
      socket?.emit('room:join', activeRoomId);
    }
  }, [connectionState, activeRoomId, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleScreenStarted = (payload: { socketId: string; sourceName: string }) => {
      setRemoteScreenShare({ socketId: payload.socketId, sourceName: payload.sourceName, stream: null });
    };
    const handleScreenStopped = (payload: { socketId: string }) => {
      setRemoteScreenShare((prev) => {
        if (prev?.socketId === payload.socketId) {
          setRemoteViewerMode('closed');
          return null;
        }
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

  useEffect(() => {
    if (!remoteScreenShare) return;

    const sharerSocketId = remoteScreenShare.socketId;
    const pc = peerConnections.current.get(sharerSocketId);
    if (!pc) return;

    const buildStreamFromReceivers = (): MediaStream | null => {
      const tracks = pc
        .getReceivers()
        .map((r) => r.track)
        .filter((t): t is MediaStreamTrack => !!t && t.readyState === 'live' && (t.kind === 'video' || t.kind === 'audio'));
      if (tracks.length === 0) return null;
      return new MediaStream(tracks);
    };

    // Attempt to hydrate immediately from already received tracks.
    const initial = buildStreamFromReceivers();
    if (initial) {
      setRemoteScreenShare((prev) => (prev?.socketId === sharerSocketId ? { ...prev, stream: initial } : prev));
    }

    const handler = (event: RTCTrackEvent) => {
      if (event.track.kind !== 'video' && event.track.kind !== 'audio') return;

      setRemoteScreenShare((prev) => {
        if (!prev || prev.socketId !== sharerSocketId) return prev;

        const current = prev.stream ?? new MediaStream();
        const exists = current.getTracks().some((t) => t.id === event.track.id);
        if (!exists) {
          current.addTrack(event.track);
        }
        return { ...prev, stream: current };
      });
    };

    pc.addEventListener('track', handler);
    return () => {
      pc.removeEventListener('track', handler);
    };
  }, [remoteScreenShare, peerConnections]);

  const handleJoinRoom = useCallback(
    (roomId: number) => {
      if (!socket) return;
      removeAllPeers();
      setRemoteScreenShare(null);
      setOwnShareMode('minimized');
      setRemoteViewerMode('closed');
      setActiveDmTargetUserId(null);
      socket.emit('room:join', roomId);
      setActiveRoomId(roomId);
      setSystemMessages([]);
      playJoinSound();
    },
    [socket, removeAllPeers]
  );

  const handleLeaveRoom = useCallback(() => {
    if (!socket) return;
    if (isScreenSharing) stopShare();
    setRemoteScreenShare(null);
    setOwnShareMode('minimized');
    setRemoteViewerMode('closed');
    removeAllPeers();
    socket.emit('room:leave');
    setActiveRoomId(null);
    setSystemMessages([]);
    playLeaveSound();
  }, [socket, removeAllPeers, isScreenSharing, stopShare]);

  const handleMemberRightClick = useCallback(
    (memberSocketId: string, event: React.MouseEvent) => {
      let remoteName = memberSocketId;
      for (const room of rooms) {
        const member = room.members.find((m) => m.socketId === memberSocketId);
        if (member) {
          remoteName = member.displayName;
          break;
        }
      }
      setVolumePopup({ socketId: memberSocketId, displayName: remoteName, x: event.clientX, y: event.clientY });
    },
    [rooms]
  );

  const handleMemberClick = useCallback((member: PeerInfo) => {
    setSelectedUserCard(member);
    setUserCardOpen(true);
  }, []);

  const handleVolumeChange = useCallback(
    (memberSocketId: string, volume: number) => {
      setRemoteVolume(memberSocketId, volume);
      setUserVolumes((prev) => {
        const next = new Map(prev);
        next.set(memberSocketId, volume);
        return next;
      });
    },
    [setRemoteVolume]
  );

  const handleScreenVolumeChange = useCallback((_key: string, volume: number) => {
    setScreenAudioMuted(volume <= 0);
    setScreenAudioVolume(Math.max(0, Math.min(1, volume / 2)));
  }, []);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const activeRoomMessages = systemMessages.filter((m) => m.roomId === activeRoomId);

  const remoteSharerName = useMemo(() => {
    if (!remoteScreenShare) return '';
    const member = rooms.flatMap((r) => r.members).find((m) => m.socketId === remoteScreenShare.socketId);
    return member?.displayName ?? 'Someone';
  }, [rooms, remoteScreenShare]);

  const isSelectedUserFriend = useMemo(() => {
    if (!selectedUserCard?.userId) return false;
    return friendList.some((f) => f.userId === selectedUserCard.userId);
  }, [friendList, selectedUserCard]);

  return (
    <div style={styles.wrapper}>
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
            onMemberClick={handleMemberClick}
            serverAddress={serverAddress}
            isHost={isHost}
            socket={socket}
          />
        </div>

        <FriendListSidebar
          socket={socket}
          serverAddress={serverAddress}
          activeTargetUserId={activeDmTargetUserId}
          onOpenConversation={setActiveDmTargetUserId}
          onFriendListChange={setFriendList}
        />

        {isHost && <InvitePanel />}

        <VoiceControls
          myVoiceState={myVoiceState}
          onToggleMute={() => setMuted(!myVoiceState.muted)}
          onToggleDeafen={() => setDeafened(!myVoiceState.deafened)}
          onSetMuted={setMuted}
          activeRoomId={activeRoomId}
          onSetVadMode={setVadMode}
          noiseGateEnabled={noiseGate}
          onToggleNoiseGate={() => setNoiseGate((prev) => !prev)}
          onOpenAudioSettings={() => setAudioSettingsOpen(true)}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={() => {
            if (isScreenSharing) stopShare();
            else openPicker();
          }}
        />
      </div>

      <div style={styles.main}>
        <div style={styles.topBar}>
          <div style={styles.topBarLeft}>
            <span style={styles.roomTitle}>
              {activeDmTargetUserId !== null ? 'Friend Conversation' : activeRoom ? `#${activeRoom.name}` : 'Select a room'}
            </span>
            {activeDmTargetUserId !== null && (
              <button style={styles.backToRoomBtn} onClick={() => setActiveDmTargetUserId(null)}>
                Back to Room
              </button>
            )}
          </div>

          <button style={styles.profileBtn} onClick={() => setSettingsOpen(true)}>
            <AvatarBadge
              displayName={myProfile.displayName}
              profilePhotoUrl={myProfile.profilePhotoUrl}
              serverAddress={serverAddress}
              size={22}
            />
            <span style={styles.connectedAs}>{myProfile.displayName}</span>
            <span style={styles.gear}>⚙</span>
          </button>
        </div>

        <div style={styles.messagesArea}>
          {isScreenSharing && screenStream && (
            <ScreenShareViewer
              stream={screenStream}
              sharerName="You"
              mode={ownShareMode}
              isOwnShare={true}
              onModeChange={(m) => setOwnShareMode(m === 'fullscreen' ? 'normal' : m)}
              onClose={stopShare}
            />
          )}

          {!isScreenSharing && remoteScreenShare && remoteViewerMode === 'closed' && (
            <div style={styles.indicatorBar}>
              <span style={styles.indicatorText}>{remoteSharerName} is sharing their screen</span>
              <button style={styles.watchBtn} onClick={() => setRemoteViewerMode('normal')}>Watch</button>
            </div>
          )}

          {!isScreenSharing && remoteScreenShare?.stream && remoteViewerMode !== 'closed' && (
            <ScreenShareViewer
              stream={remoteScreenShare.stream}
              sharerName={remoteSharerName}
              mode={remoteViewerMode as ViewerMode}
              isOwnShare={false}
              muted={screenAudioMuted}
              volume={screenAudioVolume}
              onContextMenu={(e) => {
                e.preventDefault();
                setScreenAudioPopup({ x: e.clientX, y: e.clientY });
              }}
              onModeChange={(m) => setRemoteViewerMode(m)}
              onClose={() => setRemoteViewerMode('closed')}
            />
          )}

          {activeDmTargetUserId !== null ? (
            <DMPanel
              socket={socket}
              myUserId={myUserId}
              targetUserId={activeDmTargetUserId}
              serverAddress={serverAddress}
            />
          ) : activeRoomId === null ? (
            <div style={styles.placeholder}><p style={styles.placeholderText}>Select a room to join</p></div>
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

      {pickerOpen && <ScreenSharePicker sources={sources} onSelect={startShare} onClose={closePicker} />}

      {audioSettingsOpen && (
        <AudioSettings
          selectedInputDeviceId={selectedInputDeviceId}
          selectedOutputDeviceId={selectedOutputDeviceId}
          noiseCancellationMode={noiseCancellationMode}
          onInputDeviceChange={setSelectedInputDeviceId}
          onOutputDeviceChange={setSelectedOutputDeviceId}
          onNoiseCancellationModeChange={setNoiseCancellationMode}
          onClose={() => setAudioSettingsOpen(false)}
        />
      )}

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

      {screenAudioPopup && (
        <VolumePopup
          socketId="screen-share"
          displayName={`${remoteSharerName} screen audio`}
          position={{ x: screenAudioPopup.x, y: screenAudioPopup.y }}
          currentVolume={screenAudioMuted ? 0 : screenAudioVolume * 2}
          onVolumeChange={handleScreenVolumeChange}
          isMuted={screenAudioMuted}
          onToggleMute={() => setScreenAudioMuted((prev) => !prev)}
          onResetVolume={() => {
            setScreenAudioMuted(false);
            setScreenAudioVolume(1);
          }}
          onClose={() => setScreenAudioPopup(null)}
        />
      )}

      <UserSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        serverAddress={serverAddress}
        userId={myUserId}
        currentDisplayName={myProfile.displayName}
        currentBio={myProfile.bio}
        currentProfilePhotoUrl={myProfile.profilePhotoUrl}
        currentBannerGifUrl={myProfile.profileBannerGifUrl}
        onProfileUpdated={(payload) => {
          setMyProfile(payload);
          const prev = JSON.parse(localStorage.getItem('session') || '{}');
          localStorage.setItem('session', JSON.stringify({
            ...prev,
            displayName: payload.displayName,
            bio: payload.bio,
            profilePhotoUrl: payload.profilePhotoUrl,
            profileBannerGifUrl: payload.profileBannerGifUrl,
          }));
        }}
      />

      <UserCardModal
        open={userCardOpen}
        user={selectedUserCard}
        serverAddress={serverAddress}
        isFriend={isSelectedUserFriend}
        onClose={() => setUserCardOpen(false)}
        onMessage={(userId) => {
          setActiveDmTargetUserId(userId);
          setUserCardOpen(false);
        }}
        onAddFriend={(userId) => {
          socket?.emit('friend:request:send', { targetUserId: userId });
        }}
      />
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
    width: '300px',
    minWidth: '300px',
    backgroundColor: '#111111',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'slideRight 0.25s ease-out',
  },
  sidebarTop: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'fadeIn 0.3s ease-out 0.1s both',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.7rem 1.2rem',
    borderBottom: '1px solid #2a2a2a',
    backgroundColor: '#0f0f0f',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    zIndex: 1,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  roomTitle: {
    fontSize: '1.05rem',
    color: '#7fff00',
    fontFamily: "'Coolvetica', 'Inter', sans-serif",
    fontWeight: 'normal',
    letterSpacing: '0.02em',
  },
  backToRoomBtn: {
    background: '#171a21',
    border: '1px solid #2b3140',
    borderRadius: 8,
    color: '#bac2d2',
    fontSize: '0.74rem',
    padding: '0.28rem 0.62rem',
    cursor: 'pointer',
  },
  profileBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    background: 'transparent',
    border: '1px solid #2b3140',
    borderRadius: '999px',
    color: '#c7d0df',
    padding: '0.25rem 0.6rem 0.25rem 0.25rem',
    cursor: 'pointer',
  },
  connectedAs: {
    fontSize: '0.78rem',
    color: '#c6d0dd',
  },
  gear: {
    fontSize: '0.85rem',
    opacity: 0.8,
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
  indicatorBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.6rem',
    padding: '0.4rem 0.8rem',
    backgroundColor: '#1a2e1a',
    borderBottom: '1px solid #2a4a2a',
  },
  indicatorText: {
    fontSize: '0.78rem',
    color: '#7fff00',
    fontWeight: 500,
  },
  watchBtn: {
    background: '#2d8a2d',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    padding: '0.2rem 0.7rem',
    fontSize: '0.72rem',
    fontWeight: 600,
  },
};
