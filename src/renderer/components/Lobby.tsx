import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Hash, MessageSquare, ChevronLeft, Tv } from 'lucide-react';
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
import { theme } from '../theme';

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
  const [noiseCancellationLevel, setNoiseCancellationLevel] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('noiseCancellationLevel') ?? '60');
      if (Number.isNaN(raw)) return 60;
      return Math.max(0, Math.min(100, raw));
    } catch {
      return 60;
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

  const { peerConnections, addPeer, removePeer, removeAllPeers, addScreenShareTracks, removeScreenShareTracks } = useWebRTC(
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
    noiseCancellationLevel,
    selectedInputDeviceId: selectedInputDeviceId || undefined,
    selectedOutputDeviceId: selectedOutputDeviceId || undefined,
  });

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

  useEffect(() => {
    localStorage.setItem('noiseCancellationMode', noiseCancellationMode);
  }, [noiseCancellationMode]);

  useEffect(() => {
    localStorage.setItem('noiseCancellationLevel', String(noiseCancellationLevel));
  }, [noiseCancellationLevel]);

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
  }, [socket, myUserId]);

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

  useEffect(() => setMyProfile(initialProfile), [initialProfile]);

  useEffect(() => {
    const prev = prevConnectionStateRef.current;
    prevConnectionStateRef.current = connectionState;
    if (prev === 'reconnecting' && connectionState === 'connected' && activeRoomId !== null) {
      socket?.emit('room:join', activeRoomId);
    }
  }, [connectionState, activeRoomId, socket]);

  // Keep WebRTC peers in sync with active room membership.
  // This prevents stale socket IDs after reconnects, which can break audio routing and per-user volume.
  useEffect(() => {
    if (activeRoomId === null || !socketId) return;
    const room = rooms.find((r) => r.id === activeRoomId);
    if (!room) return;

    const expectedPeerIds = new Set(
      room.members
        .map((m) => m.socketId)
        .filter((id) => id !== socketId)
    );

    for (const peerId of Array.from(peerConnections.current.keys())) {
      if (!expectedPeerIds.has(peerId)) {
        removePeer(peerId);
      }
    }

    for (const peerId of expectedPeerIds) {
      if (!peerConnections.current.has(peerId)) {
        addPeer(peerId, socketId < peerId);
      }
    }
  }, [rooms, activeRoomId, socketId, peerConnections, addPeer, removePeer]);

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
    let activeScreenStreamId: string | null = null;

    const buildStreamFromReceivers = (): MediaStream | null => {
      const videoTracks = pc
        .getReceivers()
        .map((r) => r.track)
        .filter((t): t is MediaStreamTrack => !!t && t.readyState === 'live' && t.kind === 'video');
      if (videoTracks.length === 0) return null;
      return new MediaStream(videoTracks);
    };

    // Attempt to hydrate immediately from already received tracks.
    const initial = buildStreamFromReceivers();
    if (initial) {
      setRemoteScreenShare((prev) => (prev?.socketId === sharerSocketId ? { ...prev, stream: initial } : prev));
    }

    const handler = (event: RTCTrackEvent) => {
      if (event.track.kind !== 'video' && event.track.kind !== 'audio') return;
      const sourceStream = event.streams[0] ?? null;

      // Pick screen stream identity from video track events; only attach audio
      // that belongs to the same stream to avoid duplicating microphone playback.
      if (event.track.kind === 'video' && sourceStream?.id) {
        activeScreenStreamId = sourceStream.id;
      }
      if (event.track.kind === 'audio') {
        if (!sourceStream?.id || !activeScreenStreamId || sourceStream.id !== activeScreenStreamId) {
          return;
        }
      }

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
      const clamped = Math.max(0, Math.min(2, volume));
      setRemoteVolume(memberSocketId, clamped);
      setUserVolumes((prev) => {
        const next = new Map(prev);
        next.set(memberSocketId, clamped);
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
      <motion.div
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        style={styles.sidebar}
        className="glass"
      >
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
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={styles.main}
      >
        <div style={styles.topBar} className="glass">
          <div style={styles.topBarLeft}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeDmTargetUserId !== null ? 'dm' : activeRoomId ?? 'none'}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.15 }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                {activeDmTargetUserId !== null ? (
                  <MessageSquare size={18} color={theme.colors.accent} />
                ) : (
                  <Hash size={18} color={theme.colors.accent} />
                )}
                <span style={styles.roomTitle}>
                  {activeDmTargetUserId !== null ? 'Direct Message' : activeRoom ? activeRoom.name : 'The Inn'}
                </span>
              </motion.div>
            </AnimatePresence>

            {activeDmTargetUserId !== null && (
              <button style={styles.backToRoomBtn} onClick={() => setActiveDmTargetUserId(null)}>
                <ChevronLeft size={14} /> Back
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <button style={styles.profileBtn} onClick={() => setSettingsOpen(true)}>
              <AvatarBadge
                displayName={myProfile.displayName}
                profilePhotoUrl={myProfile.profilePhotoUrl}
                serverAddress={serverAddress}
                size={24}
              />
              <span style={styles.connectedAs}>{myProfile.displayName}</span>
              <Settings size={14} style={{ opacity: 0.6 }} />
            </button>
          </div>
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
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              style={styles.indicatorBar}
            >
              <Tv size={16} color={theme.colors.accent} />
              <span style={styles.indicatorText}>{remoteSharerName} is sharing their screen</span>
              <button style={styles.watchBtn} onClick={() => setRemoteViewerMode('normal')}>Watch</button>
            </motion.div>
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

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {activeDmTargetUserId !== null ? (
              <DMPanel
                socket={socket}
                myUserId={myUserId}
                targetUserId={activeDmTargetUserId}
                serverAddress={serverAddress}
              />
            ) : activeRoomId === null ? (
              <div style={styles.placeholder}>
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  style={{ textAlign: 'center' }}
                >
                  <p style={styles.placeholderText}>Welcome to The Inn</p>
                  <p style={{ color: theme.colors.textMuted, fontSize: '0.85rem' }}>Select a room to start chatting</p>
                </motion.div>
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
      </motion.div>

      <AnimatePresence>
        {pickerOpen && <ScreenSharePicker sources={sources} onSelect={startShare} onClose={closePicker} />}
      </AnimatePresence>

      <AnimatePresence>
        {audioSettingsOpen && (
          <AudioSettings
            selectedInputDeviceId={selectedInputDeviceId}
            selectedOutputDeviceId={selectedOutputDeviceId}
            noiseCancellationMode={noiseCancellationMode}
            noiseCancellationLevel={noiseCancellationLevel}
            onInputDeviceChange={setSelectedInputDeviceId}
            onOutputDeviceChange={setSelectedOutputDeviceId}
            onNoiseCancellationModeChange={setNoiseCancellationMode}
            onNoiseCancellationLevelChange={setNoiseCancellationLevel}
            onClose={() => setAudioSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

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
    backgroundColor: theme.colors.bgDarkest,
    color: theme.colors.textPrimary,
  },
  sidebar: {
    width: '300px',
    minWidth: '300px',
    backgroundColor: theme.colors.bgSidebar,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 10,
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
    position: 'relative',
    backgroundColor: theme.colors.bgDarkest,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.8rem 1.5rem',
    zIndex: 5,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  roomTitle: {
    fontSize: theme.font.sizeLg,
    color: theme.colors.accent,
    fontFamily: theme.font.familyDisplay,
    fontWeight: 'normal',
    letterSpacing: '0.01em',
    textTransform: 'lowercase',
  },
  backToRoomBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: theme.radiusSm,
    color: theme.colors.textSecondary,
    fontSize: theme.font.sizeXs,
    padding: '0.3rem 0.7rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
  },
  profileBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    background: 'rgba(255, 255, 255, 0.03)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    borderRadius: '100px',
    color: theme.colors.textPrimary,
    padding: '0.3rem 0.8rem 0.3rem 0.3rem',
    cursor: 'pointer',
  },
  connectedAs: {
    fontSize: theme.font.sizeSm,
    fontWeight: 500,
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
    color: theme.colors.textSecondary,
    fontSize: theme.font.sizeSubtitle,
    fontFamily: theme.font.familyDisplay,
    marginBottom: '0.4rem',
  },
  indicatorBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.8rem',
    padding: '0.6rem 1rem',
    backgroundColor: 'rgba(127, 255, 0, 0.08)',
    borderBottom: `1px solid ${theme.colors.accentBorder}`,
  },
  indicatorText: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.accent,
    fontWeight: 500,
  },
  watchBtn: {
    background: theme.colors.accent,
    border: 'none',
    borderRadius: theme.radiusSm,
    color: '#000',
    cursor: 'pointer',
    padding: '0.3rem 0.8rem',
    fontSize: theme.font.sizeXs,
    fontWeight: 600,
  },
};
