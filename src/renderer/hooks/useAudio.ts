import { useRef, useEffect, useCallback, useState } from 'react';
import type { TypedSocket } from './useSocket';
import type { VoiceState, VoiceStatePayload } from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAudioOptions {
  socket: TypedSocket | null;
  mySocketId: string | null;
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>;
  activeRoomId: number | null;
  /** Ref shared with useWebRTC -- useAudio writes the mic stream here */
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  /** Ref shared with useWebRTC -- useAudio sets the ontrack callback here */
  onTrackRef: React.MutableRefObject<((socketId: string, stream: MediaStream) => void) | null>;
}

export interface RemoteStream {
  socketId: string;
  stream: MediaStream;
  gainNode: GainNode;
  analyser: AnalyserNode;
}

export interface UseAudioReturn {
  localStream: MediaStream | null;
  remoteStreams: Map<string, RemoteStream>;
  voiceStates: Map<string, VoiceState>;
  myVoiceState: VoiceState;
  speakingPeers: Set<string>;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setRemoteVolume: (socketId: string, volume: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VOICE_STATE: VoiceState = {
  muted: false,
  deafened: false,
  speaking: false,
};

const ICE_RESTART_TIMEOUT_MS = 5000;
const VAD_THRESHOLD = 15; // Voice activity threshold (0-255 byte frequency average)
const VAD_SILENCE_DELAY_MS = 200; // Delay before marking as not speaking

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudio({
  socket,
  mySocketId,
  peerConnections,
  activeRoomId,
  localStreamRef,
  onTrackRef,
}: UseAudioOptions): UseAudioReturn {
  // -- Refs (mutable, not triggering re-renders) --
  const audioContextRef = useRef<AudioContext | null>(null);
  const remoteNodesRef = useRef<
    Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode; analyser: AnalyserNode }>
  >(new Map());
  const savedVolumesRef = useRef<Map<string, number>>(new Map());
  const iceRestartTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const myVoiceStateRef = useRef<VoiceState>({ ...DEFAULT_VOICE_STATE });
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const localSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteSilenceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const speakingPeersRef = useRef<Set<string>>(new Set());

  // -- State --
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, RemoteStream>>(new Map());
  const [voiceStates, setVoiceStates] = useState<Map<string, VoiceState>>(new Map());
  const [myVoiceState, setMyVoiceState] = useState<VoiceState>({ ...DEFAULT_VOICE_STATE });
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // AudioContext singleton
  // ---------------------------------------------------------------------------
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {
        /* ignore -- user gesture will resume later */
      });
    }
    return audioContextRef.current;
  }, []);

  // ---------------------------------------------------------------------------
  // Remote stream routing via Web Audio API
  // ---------------------------------------------------------------------------
  const addRemoteStream = useCallback(
    (socketId: string, stream: MediaStream) => {
      // Avoid duplicate setup for same socketId
      const existing = remoteNodesRef.current.get(socketId);
      if (existing) {
        // Disconnect old nodes
        try {
          existing.source.disconnect();
          existing.gain.disconnect();
          existing.analyser.disconnect();
        } catch {
          /* already disconnected */
        }
        remoteNodesRef.current.delete(socketId);
      }

      const ctx = getAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      // Restore saved volume or default to 1.0
      const savedVol = savedVolumesRef.current.get(socketId) ?? 1.0;
      gain.gain.value = savedVol;

      // If currently deafened, mute this new stream
      if (myVoiceStateRef.current.deafened) {
        gain.gain.value = 0;
      }

      // Connect: source -> gain -> analyser -> destination
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);

      remoteNodesRef.current.set(socketId, { source, gain, analyser });

      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(socketId, { socketId, stream, gainNode: gain, analyser });
        return next;
      });
    },
    [getAudioContext]
  );

  const removeRemoteStream = useCallback((socketId: string) => {
    const nodes = remoteNodesRef.current.get(socketId);
    if (nodes) {
      try {
        nodes.source.disconnect();
        nodes.gain.disconnect();
        nodes.analyser.disconnect();
      } catch {
        /* already disconnected */
      }
      remoteNodesRef.current.delete(socketId);
    }

    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Wire onTrackRef so useWebRTC can call it
  // ---------------------------------------------------------------------------
  useEffect(() => {
    onTrackRef.current = (socketId: string, stream: MediaStream) => {
      console.log(`[audio] Received remote stream from ${socketId}`);
      addRemoteStream(socketId, stream);
    };
    return () => {
      onTrackRef.current = null;
    };
  }, [addRemoteStream, onTrackRef]);

  // ---------------------------------------------------------------------------
  // getUserMedia on room join, stop on leave
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    if (activeRoomId !== null) {
      // Acquire microphone
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        .then((stream) => {
          if (cancelled) {
            // Component unmounted or room changed before mic was acquired
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          localStreamRef.current = stream;
          setLocalStream(stream);

          // Apply current mute state to track
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = !myVoiceStateRef.current.muted;
          }

          // Add audio track to all existing peer connections
          for (const [, pc] of peerConnections.current) {
            // Check if audio track is already added
            const senders = pc.getSenders();
            const hasAudio = senders.some(
              (s) => s.track && s.track.kind === 'audio'
            );
            if (!hasAudio) {
              stream.getTracks().forEach((track) => {
                pc.addTrack(track, stream);
              });
            }
          }

          console.log('[audio] Microphone acquired and tracks added to peers');
        })
        .catch((err) => {
          console.error('[audio] Failed to acquire microphone:', err);
        });
    }

    return () => {
      cancelled = true;
      // Stop mic tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
      // Disconnect all remote audio nodes
      for (const [socketId] of remoteNodesRef.current) {
        removeRemoteStream(socketId);
      }
      // Clear voice states
      setVoiceStates(new Map());
      // Reset own voice state
      myVoiceStateRef.current = { ...DEFAULT_VOICE_STATE };
      setMyVoiceState({ ...DEFAULT_VOICE_STATE });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId]);

  // ---------------------------------------------------------------------------
  // Voice state controls
  // ---------------------------------------------------------------------------
  const setMuted = useCallback(
    (muted: boolean) => {
      const next = { ...myVoiceStateRef.current, muted };
      myVoiceStateRef.current = next;
      setMyVoiceState(next);

      // Enable/disable local audio track
      const track = localStreamRef.current?.getAudioTracks()[0];
      if (track) {
        track.enabled = !muted;
      }

      // Emit to server
      socket?.emit('voice:state-change', next);
    },
    [socket, localStreamRef]
  );

  const setDeafened = useCallback(
    (deafened: boolean) => {
      const next = { ...myVoiceStateRef.current, deafened };
      myVoiceStateRef.current = next;
      setMyVoiceState(next);

      // When deafened, set all remote gain nodes to 0; when undeafened, restore
      for (const [socketId, nodes] of remoteNodesRef.current) {
        if (deafened) {
          // Save current volume before deafening
          savedVolumesRef.current.set(socketId, nodes.gain.gain.value);
          nodes.gain.gain.value = 0;
        } else {
          // Restore saved volume
          const saved = savedVolumesRef.current.get(socketId) ?? 1.0;
          nodes.gain.gain.value = saved;
        }
      }

      // Emit to server
      socket?.emit('voice:state-change', next);
    },
    [socket]
  );

  const setSpeaking = useCallback(
    (speaking: boolean) => {
      if (myVoiceStateRef.current.speaking === speaking) return;
      const next = { ...myVoiceStateRef.current, speaking };
      myVoiceStateRef.current = next;
      setMyVoiceState(next);
      socket?.emit('voice:state-change', next);
    },
    [socket]
  );

  const setRemoteVolume = useCallback(
    (socketId: string, volume: number) => {
      const clamped = Math.max(0, Math.min(2, volume)); // Allow up to 2x boost
      savedVolumesRef.current.set(socketId, clamped);
      const nodes = remoteNodesRef.current.get(socketId);
      if (nodes) {
        nodes.gain.gain.value = clamped;
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Listen for remote voice state changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const handleVoiceStateChange = (payload: VoiceStatePayload) => {
      setVoiceStates((prev) => {
        const next = new Map(prev);
        next.set(payload.socketId, payload.state);
        return next;
      });
    };

    socket.on('voice:state-change', handleVoiceStateChange);
    return () => {
      socket.off('voice:state-change', handleVoiceStateChange);
    };
  }, [socket]);

  // ---------------------------------------------------------------------------
  // ICE restart watchdog -- if ICE restart doesn't recover within timeout,
  // log it (peer will be re-added via room:peers on reconnect)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!peerConnections.current.size) return;

    const handleConnectionStateChange = (remoteSocketId: string, pc: RTCPeerConnection) => {
      if (pc.connectionState === 'failed') {
        console.warn(`[audio] Peer ${remoteSocketId} connection failed, attempting ICE restart`);
        pc.restartIce();

        // Set a timer -- if not recovered in 5s, log warning
        const timer = setTimeout(() => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            console.warn(`[audio] Peer ${remoteSocketId} ICE restart timed out`);
          }
          iceRestartTimersRef.current.delete(remoteSocketId);
        }, ICE_RESTART_TIMEOUT_MS);

        iceRestartTimersRef.current.set(remoteSocketId, timer);
      } else if (pc.connectionState === 'connected') {
        // Clear any pending restart timer
        const timer = iceRestartTimersRef.current.get(remoteSocketId);
        if (timer) {
          clearTimeout(timer);
          iceRestartTimersRef.current.delete(remoteSocketId);
        }
      }
    };

    // Attach listeners to current peers
    const listeners = new Map<string, () => void>();
    for (const [socketId, pc] of peerConnections.current) {
      const handler = () => handleConnectionStateChange(socketId, pc);
      pc.addEventListener('connectionstatechange', handler);
      listeners.set(socketId, handler);
    }

    return () => {
      for (const [socketId, handler] of listeners) {
        const pc = peerConnections.current.get(socketId);
        if (pc) {
          pc.removeEventListener('connectionstatechange', handler);
        }
      }
      // Clear all timers
      for (const [, timer] of iceRestartTimersRef.current) {
        clearTimeout(timer);
      }
      iceRestartTimersRef.current.clear();
    };
  }, [peerConnections, remoteStreams]); // Re-attach when peer set changes

  // ---------------------------------------------------------------------------
  // Voice Activity Detection (VAD) -- rAF loop for local + remote analysers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (activeRoomId === null) return;

    const freqData = new Uint8Array(128) as Uint8Array<ArrayBuffer>; // Reusable buffer for getByteFrequencyData

    const computeAvg = (analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      return sum / buf.length;
    };

    const tick = () => {
      // -- Local speaking detection --
      const localAnalyser = localAnalyserRef.current;
      if (localAnalyser && !myVoiceStateRef.current.muted) {
        const avg = computeAvg(localAnalyser, freqData);
        if (avg > VAD_THRESHOLD) {
          // Clear silence timer
          if (localSilenceTimerRef.current) {
            clearTimeout(localSilenceTimerRef.current);
            localSilenceTimerRef.current = null;
          }
          if (!myVoiceStateRef.current.speaking) {
            setSpeaking(true);
          }
        } else {
          // Start silence timer if currently speaking
          if (myVoiceStateRef.current.speaking && !localSilenceTimerRef.current) {
            localSilenceTimerRef.current = setTimeout(() => {
              setSpeaking(false);
              localSilenceTimerRef.current = null;
            }, VAD_SILENCE_DELAY_MS);
          }
        }
      } else if (myVoiceStateRef.current.speaking && myVoiceStateRef.current.muted) {
        // If muted while speaking, stop speaking immediately
        setSpeaking(false);
      }

      // -- Remote speaking detection --
      let changed = false;
      const nextSpeaking = new Set(speakingPeersRef.current);

      for (const [socketId, nodes] of remoteNodesRef.current) {
        const avg = computeAvg(nodes.analyser, freqData);
        if (avg > VAD_THRESHOLD) {
          // Clear silence timer for this peer
          const timer = remoteSilenceTimersRef.current.get(socketId);
          if (timer) {
            clearTimeout(timer);
            remoteSilenceTimersRef.current.delete(socketId);
          }
          if (!nextSpeaking.has(socketId)) {
            nextSpeaking.add(socketId);
            changed = true;
          }
        } else {
          // Start silence timer if currently speaking
          if (nextSpeaking.has(socketId) && !remoteSilenceTimersRef.current.has(socketId)) {
            const timer = setTimeout(() => {
              speakingPeersRef.current.delete(socketId);
              setSpeakingPeers(new Set(speakingPeersRef.current));
              remoteSilenceTimersRef.current.delete(socketId);
            }, VAD_SILENCE_DELAY_MS);
            remoteSilenceTimersRef.current.set(socketId, timer);
          }
        }
      }

      if (changed) {
        speakingPeersRef.current = nextSpeaking;
        setSpeakingPeers(new Set(nextSpeaking));
      }

      vadRafRef.current = requestAnimationFrame(tick);
    };

    vadRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (vadRafRef.current) {
        cancelAnimationFrame(vadRafRef.current);
        vadRafRef.current = null;
      }
      if (localSilenceTimerRef.current) {
        clearTimeout(localSilenceTimerRef.current);
        localSilenceTimerRef.current = null;
      }
      for (const [, timer] of remoteSilenceTimersRef.current) {
        clearTimeout(timer);
      }
      remoteSilenceTimersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId, setSpeaking]);

  // ---------------------------------------------------------------------------
  // Set up local AnalyserNode when local stream is acquired
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!localStream) {
      // Clean up local analyser
      if (localSourceRef.current) {
        try { localSourceRef.current.disconnect(); } catch { /* */ }
        localSourceRef.current = null;
      }
      localAnalyserRef.current = null;
      return;
    }

    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(localStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Connect source -> analyser (NOT to destination -- we don't hear ourselves)
    source.connect(analyser);

    localSourceRef.current = source;
    localAnalyserRef.current = analyser;

    return () => {
      try { source.disconnect(); } catch { /* */ }
      localSourceRef.current = null;
      localAnalyserRef.current = null;
    };
  }, [localStream, getAudioContext]);

  // ---------------------------------------------------------------------------
  // Cleanup AudioContext on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {
          /* ignore */
        });
        audioContextRef.current = null;
      }
    };
  }, []);

  return {
    localStream,
    remoteStreams,
    voiceStates,
    myVoiceState,
    speakingPeers,
    setMuted,
    setDeafened,
    setSpeaking,
    setRemoteVolume,
  };
}
