import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TypedSocket } from '../hooks/useSocket';
import type { DMMessage, FriendItem } from '../../shared/types';
import { AvatarBadge } from './AvatarBadge';
import { theme } from '../theme';
import { ICE_SERVERS } from '../../shared/iceConfig';
import {
  playCallAcceptedSound,
  playCallStartSound,
  playMessageReceiveSound,
  playMessageSendSound,
  startIncomingCallLoop,
  stopIncomingCallLoop,
} from '../utils/notificationSounds';

type CallStatus = 'idle' | 'calling' | 'ringing' | 'in-call';

interface DMPanelProps {
  socket: TypedSocket | null;
  myUserId: number | null;
  targetUserId: number | null;
  serverAddress: string;
}

export function DMPanel({ socket, myUserId, targetUserId, serverAddress }: DMPanelProps): React.JSX.Element {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [input, setInput] = useState('');
  const [inCallWith, setInCallWith] = useState<number | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callError, setCallError] = useState<string | null>(null);

  const callPeerUserIdRef = useRef<number | null>(null);
  const dmPcRef = useRef<RTCPeerConnection | null>(null);
  const dmLocalStreamRef = useRef<MediaStream | null>(null);
  const dmRemoteStreamRef = useRef<MediaStream | null>(null);
  const dmAudioElRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const acceptedPlayedRef = useRef(false);

  const markCallAccepted = useCallback(() => {
    stopIncomingCallLoop();
    setCallStatus('in-call');
    if (!acceptedPlayedRef.current) {
      playCallAcceptedSound();
      acceptedPlayedRef.current = true;
    }
  }, []);

  const cleanupRemoteAudio = useCallback(() => {
    const audioEl = dmAudioElRef.current;
    if (!audioEl) return;
    try {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
    } catch {
      // ignore
    }
    dmAudioElRef.current = null;
    dmRemoteStreamRef.current = null;
  }, []);

  const teardownCall = useCallback((stopLocalStream: boolean) => {
    const pc = dmPcRef.current;
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // ignore
      }
      dmPcRef.current = null;
    }

    if (stopLocalStream && dmLocalStreamRef.current) {
      dmLocalStreamRef.current.getTracks().forEach((t) => t.stop());
      dmLocalStreamRef.current = null;
    }

    pendingIceRef.current = [];
    acceptedPlayedRef.current = false;
    stopIncomingCallLoop();
    cleanupRemoteAudio();
  }, [cleanupRemoteAudio]);

  const ensureLocalStream = useCallback(async (): Promise<MediaStream> => {
    const existing = dmLocalStreamRef.current;
    if (existing && existing.getAudioTracks().some((t) => t.readyState === 'live')) {
      return existing;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    dmLocalStreamRef.current = stream;
    return stream;
  }, []);

  const getOrCreatePc = useCallback((partnerUserId: number): RTCPeerConnection => {
    if (dmPcRef.current) return dmPcRef.current;
    if (!socket) throw new Error('Socket not connected');

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      socket.emit('dm:ice:candidate', {
        to: '',
        dmTargetUserId: partnerUserId,
        candidate: event.candidate.toJSON(),
      });
    };

    pc.ontrack = (event) => {
      if (event.track.kind !== 'audio') return;
      const sourceStream = event.streams[0] ?? new MediaStream([event.track]);
      let remoteStream = dmRemoteStreamRef.current;
      if (!remoteStream) {
        remoteStream = new MediaStream();
        dmRemoteStreamRef.current = remoteStream;
      }

      const exists = remoteStream.getTracks().some((t) => t.id === event.track.id);
      if (!exists) remoteStream.addTrack(event.track);

      if (!dmAudioElRef.current) {
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        dmAudioElRef.current = audioEl;
      }

      dmAudioElRef.current.srcObject = sourceStream;
      dmAudioElRef.current.play().catch(() => {
        // autoplay may fail until first interaction on some setups
      });
      markCallAccepted();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        markCallAccepted();
      } else if (pc.connectionState === 'failed') {
        stopIncomingCallLoop();
        setCallError('Call connection failed.');
      } else if (pc.connectionState === 'disconnected') {
        stopIncomingCallLoop();
        setCallError('Call disconnected.');
      } else if (pc.connectionState === 'closed') {
        stopIncomingCallLoop();
        setCallStatus('idle');
      }
    };

    dmPcRef.current = pc;
    return pc;
  }, [socket, markCallAccepted]);

  const attachLocalTracks = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    const hasAudioSender = pc.getSenders().some((s) => s.track?.kind === 'audio');
    if (hasAudioSender) return;
    for (const track of stream.getAudioTracks()) {
      pc.addTrack(track, stream);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.emit('friend:list:request');
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleFriendList = (list: FriendItem[]) => setFriends(list);
    const handleHistory = (payload: { targetUserId: number; messages: DMMessage[] }) => {
      if (payload.targetUserId === targetUserId) setMessages(payload.messages);
    };
    const handleMessage = (payload: { targetUserId: number; message: DMMessage }) => {
      if (payload.targetUserId === targetUserId) {
        setMessages((prev) => [...prev, payload.message]);
        if (myUserId !== null && payload.message.fromUserId !== myUserId) {
          playMessageReceiveSound();
        }
      }
    };

    const handleCallStarted = (payload: { targetUserId: number; fromUserId: number }) => {
      const partnerUserId = payload.fromUserId === myUserId ? payload.targetUserId : payload.fromUserId;
      if (targetUserId !== null && partnerUserId !== targetUserId) return;

      callPeerUserIdRef.current = partnerUserId;
      setInCallWith(partnerUserId);
      setCallError(null);
      acceptedPlayedRef.current = false;
      setCallStatus(payload.fromUserId === myUserId ? 'calling' : 'ringing');
      if (payload.fromUserId === myUserId) {
        stopIncomingCallLoop();
      } else {
        startIncomingCallLoop();
      }
    };

    const handleCallEnded = (payload: { targetUserId: number; fromUserId: number }) => {
      const partnerUserId = payload.fromUserId === myUserId ? payload.targetUserId : payload.fromUserId;
      if (inCallWith !== null && partnerUserId !== inCallWith) return;

      teardownCall(true);
      setInCallWith(null);
      setCallStatus('idle');
      setCallError(null);
      callPeerUserIdRef.current = null;
    };

    const handleDmOffer = async (payload: { description: RTCSessionDescriptionInit }) => {
      if (!targetUserId) return;
      try {
        callPeerUserIdRef.current = targetUserId;
        setInCallWith(targetUserId);
        setCallError(null);
        acceptedPlayedRef.current = false;
        setCallStatus('ringing');
        startIncomingCallLoop();

        const localStream = await ensureLocalStream();
        const pc = getOrCreatePc(targetUserId);
        attachLocalTracks(pc, localStream);

        await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
        while (pendingIceRef.current.length > 0) {
          const candidate = pendingIceRef.current.shift()!;
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }

        await pc.setLocalDescription();
        if (!pc.localDescription) return;

        socket.emit('dm:sdp:answer', {
          to: '',
          dmTargetUserId: targetUserId,
          description: pc.localDescription,
        });
      } catch (err) {
        console.error('[dm-call] handle offer failed:', err);
        setCallError('Failed to accept call.');
      }
    };

    const handleDmAnswer = async (payload: { description: RTCSessionDescriptionInit }) => {
      const pc = dmPcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
        while (pendingIceRef.current.length > 0) {
          const candidate = pendingIceRef.current.shift()!;
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        markCallAccepted();
      } catch (err) {
        console.error('[dm-call] handle answer failed:', err);
        setCallError('Failed to finalize call.');
      }
    };

    const handleDmIce = async (payload: { candidate: RTCIceCandidateInit }) => {
      const pc = dmPcRef.current;
      if (!pc) return;
      if (pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          console.warn('[dm-call] add ICE failed:', err);
        }
      } else {
        pendingIceRef.current.push(payload.candidate);
      }
    };

    socket.on('friend:list', handleFriendList);
    socket.on('dm:history', handleHistory);
    socket.on('dm:message', handleMessage);
    socket.on('dm:call:started', handleCallStarted);
    socket.on('dm:call:ended', handleCallEnded);
    socket.on('dm:sdp:offer', handleDmOffer);
    socket.on('dm:sdp:answer', handleDmAnswer);
    socket.on('dm:ice:candidate', handleDmIce);

    return () => {
      socket.off('friend:list', handleFriendList);
      socket.off('dm:history', handleHistory);
      socket.off('dm:message', handleMessage);
      socket.off('dm:call:started', handleCallStarted);
      socket.off('dm:call:ended', handleCallEnded);
      socket.off('dm:sdp:offer', handleDmOffer);
      socket.off('dm:sdp:answer', handleDmAnswer);
      socket.off('dm:ice:candidate', handleDmIce);
    };
  }, [
    socket,
    targetUserId,
    myUserId,
    inCallWith,
    ensureLocalStream,
    getOrCreatePc,
    attachLocalTracks,
    markCallAccepted,
    teardownCall,
  ]);

  useEffect(() => {
    if (!socket || targetUserId === null) return;
    socket.emit('dm:history:request', { targetUserId });
  }, [socket, targetUserId]);

  useEffect(() => {
    return () => {
      teardownCall(true);
    };
  }, [teardownCall]);

  useEffect(() => {
    if (targetUserId === null) return;
    if (inCallWith === null) return;
    if (inCallWith === targetUserId) return;
    teardownCall(true);
    setInCallWith(null);
    setCallStatus('idle');
    setCallError(null);
    callPeerUserIdRef.current = null;
  }, [targetUserId, inCallWith, teardownCall]);

  const activeFriend = useMemo(
    () => friends.find((f) => f.userId === targetUserId) ?? null,
    [friends, targetUserId]
  );

  const sendMessage = useCallback(() => {
    if (!socket || targetUserId === null) return;
    const content = input.trim();
    if (!content) return;
    socket.emit('dm:message', { targetUserId, content });
    playMessageSendSound();
    setInput('');
  }, [socket, targetUserId, input]);

  const startCall = useCallback(async () => {
    if (!socket || targetUserId === null) return;
    if (callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'in-call') return;

    setCallError(null);
    acceptedPlayedRef.current = false;
    setCallStatus('calling');
    setInCallWith(targetUserId);
    callPeerUserIdRef.current = targetUserId;
    stopIncomingCallLoop();
    playCallStartSound();

    try {
      const localStream = await ensureLocalStream();
      const pc = getOrCreatePc(targetUserId);
      attachLocalTracks(pc, localStream);

      socket.emit('dm:call:start', { targetUserId });

      await pc.setLocalDescription();
      if (!pc.localDescription) throw new Error('No local description');

      socket.emit('dm:sdp:offer', {
        to: '',
        dmTargetUserId: targetUserId,
        description: pc.localDescription,
      });
    } catch (err) {
      console.error('[dm-call] start failed:', err);
      teardownCall(true);
      setInCallWith(null);
      setCallStatus('idle');
      setCallError('Could not start DM call.');
    }
  }, [socket, targetUserId, callStatus, ensureLocalStream, getOrCreatePc, attachLocalTracks, teardownCall]);

  const endCall = useCallback(() => {
    if (!socket || targetUserId === null) return;
    socket.emit('dm:call:end', { targetUserId });
    teardownCall(true);
    setInCallWith(null);
    setCallStatus('idle');
    setCallError(null);
    callPeerUserIdRef.current = null;
  }, [socket, targetUserId, teardownCall]);

  const callBannerText =
    callStatus === 'in-call'
      ? 'DM Call Active'
      : callStatus === 'calling'
        ? 'Calling...'
        : callStatus === 'ringing'
          ? 'Connecting call...'
          : '';

  if (targetUserId === null) {
    return <div style={styles.emptyPane}>Select a friend to open conversation.</div>;
  }

  return (
    <div style={styles.chatArea}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <AvatarBadge
            displayName={activeFriend?.displayName ?? `User ${targetUserId}`}
            profilePhotoUrl={activeFriend?.profilePhotoUrl ?? null}
            serverAddress={serverAddress}
            size={30}
          />
          <div>
            <div style={styles.headerName}>{activeFriend?.displayName ?? `User ${targetUserId}`}</div>
            <div style={styles.headerBio}>{activeFriend?.bio || 'No bio yet'}</div>
          </div>
        </div>
        <div style={styles.callButtons}>
          {!activeFriend && (
            <button style={styles.callBtn} onClick={() => socket?.emit('friend:request:send', { targetUserId })}>
              Add Friend
            </button>
          )}
          <button
            style={styles.callBtn}
            onClick={startCall}
            disabled={callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'in-call'}
          >
            {callStatus === 'calling' ? 'Calling...' : 'Call'}
          </button>
          <button
            style={styles.callEndBtn}
            onClick={endCall}
            disabled={callStatus === 'idle'}
          >
            End
          </button>
        </div>
      </header>

      {inCallWith === targetUserId && callBannerText && (
        <div style={styles.callBanner}>{callBannerText}</div>
      )}
      {callError && <div style={styles.callError}>{callError}</div>}

      <div style={styles.messages}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.msg,
              ...(msg.fromUserId === myUserId ? styles.msgMine : {}),
            }}
          >
            {msg.content}
          </div>
        ))}
      </div>
      <div style={styles.inputRow}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={styles.input}
          placeholder="Message..."
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button style={styles.sendBtn} onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chatArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background:
      'radial-gradient(circle at 50% -20%, rgba(227, 170, 106, 0.14) 0%, rgba(227, 170, 106, 0.03) 35%, transparent 70%), rgba(9, 6, 5, 0.72)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    padding: '0.7rem 0.9rem',
    backgroundColor: 'rgba(18, 13, 10, 0.86)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  headerName: { fontSize: '0.9rem', color: theme.colors.textPrimary, fontWeight: 700 },
  headerBio: { fontSize: '0.74rem', color: theme.colors.textMuted },
  callButtons: { display: 'flex', gap: 6 },
  callBtn: {
    background: 'rgba(227, 170, 106, 0.08)',
    border: `1px solid ${theme.colors.accentBorder}`,
    borderRadius: 8,
    color: theme.colors.accent,
    fontSize: '0.76rem',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  callEndBtn: {
    background: 'rgba(255, 75, 75, 0.12)',
    border: '1px solid rgba(255, 75, 75, 0.3)',
    borderRadius: 8,
    color: theme.colors.error,
    fontSize: '0.76rem',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  callBanner: {
    padding: '0.35rem 0.8rem',
    backgroundColor: 'rgba(227, 170, 106, 0.08)',
    color: theme.colors.accent,
    borderBottom: `1px solid ${theme.colors.accentBorder}`,
    fontSize: '0.74rem',
  },
  callError: {
    padding: '0.35rem 0.8rem',
    backgroundColor: 'rgba(255, 75, 75, 0.08)',
    color: theme.colors.error,
    borderBottom: '1px solid rgba(255, 75, 75, 0.24)',
    fontSize: '0.74rem',
  },
  messages: { flex: 1, overflowY: 'auto', padding: '0.85rem' },
  msg: {
    maxWidth: '70%',
    padding: '0.5rem 0.65rem',
    borderRadius: 10,
    backgroundColor: 'rgba(227, 170, 106, 0.08)',
    border: `1px solid ${theme.colors.borderSubtle}`,
    color: theme.colors.textPrimary,
    marginBottom: 6,
    fontSize: '0.82rem',
  },
  msgMine: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(227, 170, 106, 0.16)',
    borderColor: theme.colors.accentBorder,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    borderTop: `1px solid ${theme.colors.borderSubtle}`,
    padding: '0.65rem 0.8rem',
    backgroundColor: 'rgba(18, 13, 10, 0.85)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(30, 21, 14, 0.82)',
    border: `1px solid ${theme.colors.borderInput}`,
    borderRadius: 10,
    color: theme.colors.textPrimary,
    padding: '0.5rem 0.7rem',
    fontSize: '0.82rem',
  },
  sendBtn: {
    background: theme.colors.accent,
    border: `1px solid ${theme.colors.accentBorder}`,
    borderRadius: 10,
    color: '#1f140d',
    padding: '0.5rem 0.9rem',
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  emptyPane: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.textMuted,
  },
};
