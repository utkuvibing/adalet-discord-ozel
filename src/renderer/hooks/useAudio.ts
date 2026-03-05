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
  /** When true, mic track is enabled/disabled based on voice activity detection */
  vadMode?: boolean;
  /** When true, a noise gate suppresses audio below the VAD threshold */
  noiseGate?: boolean;
  /** Selected input (mic) device ID */
  selectedInputDeviceId?: string;
  /** Selected output (speaker) device ID */
  selectedOutputDeviceId?: string;
  /** Noise cancellation profile */
  noiseCancellationMode?: 'standard' | 'enhanced';
  /** 0-100 aggressiveness for enhanced NC */
  noiseCancellationLevel?: number;
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
  removeRemoteStream: (socketId: string) => void;
  clearRemoteStreams: () => void;
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
const BASE_VAD_THRESHOLD = 11; // Base voice activity threshold (0-255 byte frequency average)
const VAD_LEVEL_BOOST = 6; // Additional threshold at 100% NC level
const REMOTE_VAD_THRESHOLD = 12;
const VAD_SILENCE_DELAY_MS = 200; // Delay before marking as not speaking
const STRICT_SPEECH_LEVEL = 90; // NC slider threshold where strict speech-only gating kicks in
const STRICT_SPEECH_STREAK = 3; // Frames required to open gate in strict mode
const EPSILON = 0.0001;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

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
  vadMode = false,
  noiseGate = false,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  noiseCancellationMode = 'standard',
  noiseCancellationLevel = 60,
}: UseAudioOptions): UseAudioReturn {
  // -- Refs (mutable, not triggering re-renders) --
  const audioContextRef = useRef<AudioContext | null>(null);
  const remoteNodesRef = useRef<
    Map<string, { source: MediaElementAudioSourceNode; gain: GainNode; analyser: AnalyserNode; audioElement: HTMLAudioElement }>
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
  const vadModeRef = useRef(vadMode);
  vadModeRef.current = vadMode;
  const noiseGateRef = useRef(noiseGate);
  noiseGateRef.current = noiseGate;
  const noiseCancellationModeRef = useRef<'standard' | 'enhanced'>(noiseCancellationMode);
  noiseCancellationModeRef.current = noiseCancellationMode;
  const noiseCancellationLevelRef = useRef<number>(noiseCancellationLevel);
  noiseCancellationLevelRef.current = Math.max(0, Math.min(100, noiseCancellationLevel));
  const noiseGateGainRef = useRef<GainNode | null>(null);
  const noiseGateStreamRef = useRef<MediaStream | null>(null);
  const enhancedDryGainRef = useRef<GainNode | null>(null);
  const enhancedWetGainRef = useRef<GainNode | null>(null);
  const enhancedMasterGainRef = useRef<GainNode | null>(null);
  const speechGateEnabledRef = useRef<boolean>(noiseGate);
  const speechLikeStreakRef = useRef<number>(0);
  const activeRoomIdRef = useRef<number | null>(activeRoomId);
  activeRoomIdRef.current = activeRoomId;
  speechGateEnabledRef.current = noiseGate || (
    noiseCancellationModeRef.current === 'enhanced'
    && noiseCancellationLevelRef.current >= STRICT_SPEECH_LEVEL
  );

  const getCurrentVadThreshold = useCallback((): number => {
    const level = noiseCancellationLevelRef.current / 100;
    const boost = noiseCancellationModeRef.current === 'enhanced'
      ? level * VAD_LEVEL_BOOST
      : level * (VAD_LEVEL_BOOST * 0.4);
    return BASE_VAD_THRESHOLD + boost;
  }, []);

  const getNoiseGateFloorGain = useCallback((): number => {
    const level = noiseCancellationLevelRef.current / 100;
    const baseFloor = noiseCancellationModeRef.current === 'enhanced' ? 0.16 : 0.22;
    const attenuation = noiseCancellationModeRef.current === 'enhanced' ? 0.14 : 0.11;
    return Math.max(0.03, baseFloor - level * attenuation);
  }, []);

  const setNoiseGateState = useCallback((open: boolean): void => {
    if (!speechGateEnabledRef.current || !noiseGateGainRef.current) return;
    const gain = noiseGateGainRef.current.gain;
    const now = noiseGateGainRef.current.context.currentTime;
    const target = open ? 1 : getNoiseGateFloorGain();
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(target, now, open ? 0.015 : 0.08);
  }, [getNoiseGateFloorGain]);

  const computeSpeechConfidence = useCallback((avg: number, spectrum: Uint8Array<ArrayBuffer>): number => {
    let lowEnergy = 0;
    let voiceEnergy = 0;
    let voiceCoreEnergy = 0;
    let highEnergy = 0;
    let total = 0;
    let maxBin = 0;
    let logSum = 0;

    for (let i = 0; i < spectrum.length; i++) {
      const value = spectrum[i];
      total += value;
      maxBin = Math.max(maxBin, value);
      logSum += Math.log(value + 1);
      if (i <= 1) lowEnergy += value; // ~0..190 Hz
      if (i >= 1 && i <= 22) voiceEnergy += value; // ~190..4.1 kHz
      if (i >= 3 && i <= 14) voiceCoreEnergy += value; // ~560..2.6 kHz
      if (i >= 26) highEnergy += value; // ~4.8 kHz+
    }

    const len = spectrum.length;
    const avgBin = total / (len + EPSILON);
    const voiceRatio = voiceEnergy / (total + EPSILON);
    const voiceCoreRatio = voiceCoreEnergy / (total + EPSILON);
    const lowRatio = lowEnergy / (total + EPSILON);
    const highRatio = highEnergy / (total + EPSILON);
    const activity = clamp((avg - 6) / 30, 0, 1);
    const flatness = Math.exp(logSum / len) / (avgBin + EPSILON);
    const crest = maxBin / (avgBin + EPSILON);
    const transientPenalty = clamp((crest - 5.5) / 10, 0, 1);

    return clamp(
      (voiceRatio * 1.6)
      + (voiceCoreRatio * 0.85)
      + (activity * 0.45)
      - (lowRatio * 0.55)
      - (highRatio * 0.75)
      - (flatness * 0.5)
      - (transientPenalty * 0.38),
      0,
      1
    );
  }, []);

  const getSpeechOpenThreshold = useCallback((): number => {
    const level = noiseCancellationLevelRef.current / 100;
    return 0.2 + (level * 0.32); // 0.2..0.52
  }, []);

  const updateEnhancedSuppression = useCallback((avg: number, spectrum: Uint8Array<ArrayBuffer>): number => {
    const dryNode = enhancedDryGainRef.current;
    const wetNode = enhancedWetGainRef.current;
    const masterNode = enhancedMasterGainRef.current;
    const speechConfidence = computeSpeechConfidence(avg, spectrum);
    if (!dryNode || !wetNode || !masterNode) return speechConfidence;
    if (noiseCancellationModeRef.current !== 'enhanced') return speechConfidence;

    const level = noiseCancellationLevelRef.current / 100;
    const activity = clamp((avg - 6) / 30, 0, 1);
    const nonSpeechStrength = clamp((1 - speechConfidence) * activity, 0, 1);
    const suppression = clamp(level * (0.28 + nonSpeechStrength * 1.1), 0, 1);

    const dryBase = 0.72 - (level * 0.58);
    const wetBase = 0.5 + (level * 0.38);

    const dryTarget = clamp(dryBase - (suppression * 0.62), 0.01, 0.75);
    const wetTarget = clamp(wetBase + (speechConfidence * 0.16) - (suppression * 0.18), 0.18, 0.95);
    const masterTarget = clamp(0.98 - (suppression * 0.82) + (speechConfidence * 0.05), 0.06, 1);

    const now = dryNode.context.currentTime;
    dryNode.gain.setTargetAtTime(dryTarget, now, 0.055);
    wetNode.gain.setTargetAtTime(wetTarget, now, 0.055);
    masterNode.gain.setTargetAtTime(masterTarget, now, 0.085);
    return speechConfidence;
  }, [computeSpeechConfidence]);

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
      console.log('[audio] Created new AudioContext, state:', audioContextRef.current.state);
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      console.log('[audio] AudioContext suspended, resuming...');
      audioContextRef.current.resume().then(() => {
        console.log('[audio] AudioContext resumed successfully');
      }).catch((err) => {
        console.warn('[audio] AudioContext resume failed:', err);
      });
    }
    return audioContextRef.current;
  }, []);

  // ---------------------------------------------------------------------------
  // Remote stream routing via Web Audio API
  // ---------------------------------------------------------------------------
  const addRemoteStream = useCallback(
    (socketId: string, stream: MediaStream) => {
      console.log(`[audio] addRemoteStream called for ${socketId}, tracks:`, stream.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`));

      // Avoid duplicate setup for same socketId
      const existing = remoteNodesRef.current.get(socketId);
      if (existing) {
        // Disconnect old nodes and remove old audio element
        try {
          existing.source.disconnect();
          existing.gain.disconnect();
          existing.analyser.disconnect();
        } catch {
          /* already disconnected */
        }
        try {
          existing.audioElement.pause();
          existing.audioElement.srcObject = null;
          existing.audioElement.remove();
        } catch {
          /* already removed */
        }
        remoteNodesRef.current.delete(socketId);
      }

      // Create a hidden <audio> element for reliable MediaStream playback.
      // In Chromium/Electron, createMediaStreamSource alone can silently fail
      // for remote WebRTC streams. Using an <audio> element ensures the stream
      // is properly activated, then createMediaElementSource captures its output
      // for volume control and VAD analysis via Web Audio API.
      const audioEl = document.createElement('audio');
      audioEl.srcObject = stream;
      audioEl.autoplay = true;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      audioEl.play().catch(err => {
        console.warn('[audio] Audio element play() failed:', err);
      });

      const ctx = getAudioContext();
      console.log(`[audio] AudioContext state: ${ctx.state}`);
      const source = ctx.createMediaElementSource(audioEl);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      // Restore saved volume or default to 1.0
      const savedVol = savedVolumesRef.current.get(socketId) ?? 1.0;
      gain.gain.value = savedVol;
      audioEl.volume = Math.max(0, Math.min(1, savedVol));

      // If currently deafened, mute this new stream
      if (myVoiceStateRef.current.deafened) {
        gain.gain.value = 0;
        audioEl.volume = 0;
      }

      // Connect: source -> gain -> analyser -> destination
      // Audio element output captured by createMediaElementSource flows through
      // the gain/analyser chain to the AudioContext destination (speakers).
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);

      remoteNodesRef.current.set(socketId, { source, gain, analyser, audioElement: audioEl });

      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(socketId, { socketId, stream, gainNode: gain, analyser });
        return next;
      });

      console.log(`[audio] Remote stream for ${socketId} routed through <audio> element + Web Audio API`);
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
      try {
        nodes.audioElement.pause();
        nodes.audioElement.srcObject = null;
        nodes.audioElement.remove();
      } catch {
        /* already removed */
      }
      remoteNodesRef.current.delete(socketId);
    }

    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(socketId);
      return next;
    });
  }, []);

  const clearRemoteStreams = useCallback(() => {
    for (const [socketId] of remoteNodesRef.current) {
      removeRemoteStream(socketId);
    }
    speakingPeersRef.current = new Set();
    setSpeakingPeers(new Set());
  }, [removeRemoteStream]);

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
      const isEnhancedNc = noiseCancellationModeRef.current === 'enhanced';
      const ncLevel = noiseCancellationLevelRef.current / 100;
      const strictSpeechMode = isEnhancedNc && noiseCancellationLevelRef.current >= STRICT_SPEECH_LEVEL;
      const shouldUseSpeechGate = noiseGateRef.current || strictSpeechMode;
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      };
      const supported = navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & { voiceIsolation?: boolean };
      if (isEnhancedNc && supported.voiceIsolation) {
        (audioConstraints as MediaTrackConstraints & { voiceIsolation?: boolean }).voiceIsolation = true;
      }
      if (selectedInputDeviceId) {
        audioConstraints.deviceId = { exact: selectedInputDeviceId };
      }
      navigator.mediaDevices
        .getUserMedia({ audio: audioConstraints })
        .then((stream) => {
          if (cancelled) {
            // Component unmounted or room changed before mic was acquired
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          // Enhanced profile:
          // Keep a dry/wet blend so voice stays intelligible while suppression increases.
          if (isEnhancedNc) {
            try {
              const ctx = getAudioContext();
              const source = ctx.createMediaStreamSource(stream);

              const highPass = ctx.createBiquadFilter();
              highPass.type = 'highpass';
              highPass.frequency.value = 55 + ncLevel * 65; // 55..120 Hz
              highPass.Q.value = 0.8;

              const lowPass = ctx.createBiquadFilter();
              lowPass.type = 'lowpass';
              lowPass.frequency.value = 12000 - ncLevel * 5000; // 12000..7000 Hz
              lowPass.Q.value = 0.7;

              const compressor = ctx.createDynamicsCompressor();
              compressor.threshold.value = -38 + ncLevel * 12; // -38..-26 dB
              compressor.knee.value = 34 - ncLevel * 14; // 34..20 dB
              compressor.ratio.value = 1.6 + ncLevel * 1.8; // 1.6..3.4
              compressor.attack.value = 0.003 + ncLevel * 0.006; // 3..9 ms
              compressor.release.value = 0.24 - ncLevel * 0.1; // 240..140 ms

              const dryGain = ctx.createGain();
              dryGain.gain.value = 0.78 - ncLevel * 0.5; // 0.78..0.28

              const wetGain = ctx.createGain();
              wetGain.gain.value = 0.42 + ncLevel * 0.45; // 0.42..0.87

              const gateGain = ctx.createGain();
              gateGain.gain.value = shouldUseSpeechGate ? getNoiseGateFloorGain() : 1;
              const limiter = ctx.createDynamicsCompressor();
              limiter.threshold.value = -4;
              limiter.knee.value = 8;
              limiter.ratio.value = 12;
              limiter.attack.value = 0.002;
              limiter.release.value = 0.09;
              const masterGain = ctx.createGain();
              masterGain.gain.value = 0.88;
              const dest = ctx.createMediaStreamDestination();

              source.connect(dryGain);
              dryGain.connect(gateGain);

              source.connect(highPass);
              highPass.connect(lowPass);
              lowPass.connect(compressor);
              compressor.connect(wetGain);
              wetGain.connect(gateGain);
              gateGain.connect(limiter);
              limiter.connect(masterGain);
              masterGain.connect(dest);
              noiseGateGainRef.current = shouldUseSpeechGate ? gateGain : null;
              enhancedDryGainRef.current = dryGain;
              enhancedWetGainRef.current = wetGain;
              enhancedMasterGainRef.current = masterGain;
              noiseGateStreamRef.current = stream; // Keep ref to original for stopping
              stream = dest.stream; // Replace stream with gated output
            } catch (err) {
              console.warn('[audio] Enhanced noise cancellation setup failed, using raw stream:', err);
            }
          } else if (noiseGateRef.current) {
            // Standard profile + optional gate:
            // mic -> gate -> destination
            try {
              const ctx = getAudioContext();
              const source = ctx.createMediaStreamSource(stream);
              const gateGain = ctx.createGain();
              gateGain.gain.value = getNoiseGateFloorGain(); // Start attenuated, not hard-muted
              const limiter = ctx.createDynamicsCompressor();
              limiter.threshold.value = -5;
              limiter.knee.value = 8;
              limiter.ratio.value = 10;
              limiter.attack.value = 0.002;
              limiter.release.value = 0.1;
              const dest = ctx.createMediaStreamDestination();
              source.connect(gateGain);
              gateGain.connect(limiter);
              limiter.connect(dest);
              noiseGateGainRef.current = gateGain;
              enhancedDryGainRef.current = null;
              enhancedWetGainRef.current = null;
              enhancedMasterGainRef.current = null;
              noiseGateStreamRef.current = stream; // Keep ref to original for stopping
              stream = dest.stream; // Replace stream with gated output
            } catch (err) {
              console.warn('[audio] Noise gate setup failed, using raw stream:', err);
            }
          } else {
            noiseGateGainRef.current = null;
            enhancedDryGainRef.current = null;
            enhancedWetGainRef.current = null;
            enhancedMasterGainRef.current = null;
            noiseGateStreamRef.current = null;
          }

          localStreamRef.current = stream;
          setLocalStream(stream);

          // Apply current mute state to track
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = !myVoiceStateRef.current.muted;
          }

          console.log(`[audio] Mic acquired: track=${audioTrack?.label}, enabled=${audioTrack?.enabled}, muted=${myVoiceStateRef.current.muted}`);
          console.log(`[audio] Existing peer connections: ${peerConnections.current.size}`);

          // Add/replace audio track on all existing peer connections.
          // When settings change, old sender tracks may exist but be ended.
          // Replace them so renegotiation is not required for recovery.
          const nextAudioTrack = stream.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
          for (const [peerId, pc] of peerConnections.current) {
            if (!nextAudioTrack) continue;
            const existingAudioSender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === 'audio');

            if (existingAudioSender) {
              existingAudioSender.replaceTrack(nextAudioTrack).then(() => {
                console.log(`[audio] Replaced audio track for peer ${peerId} (connectionState=${pc.connectionState})`);
              }).catch((err) => {
                console.warn(`[audio] Failed to replace audio track for peer ${peerId}:`, err);
                try {
                  pc.addTrack(nextAudioTrack, stream);
                  console.log(`[audio] Fallback addTrack applied for peer ${peerId} after replaceTrack failure`);
                } catch (addErr) {
                  console.warn(`[audio] Fallback addTrack failed for peer ${peerId}:`, addErr);
                }
              });
            } else {
              pc.addTrack(nextAudioTrack, stream);
              console.log(`[audio] Added audio track to peer ${peerId} (connectionState=${pc.connectionState})`);
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
      // Also stop original mic stream if noise gate replaced it
      if (noiseGateStreamRef.current) {
        noiseGateStreamRef.current.getTracks().forEach((t) => t.stop());
        noiseGateStreamRef.current = null;
      }
      noiseGateGainRef.current = null;
      enhancedDryGainRef.current = null;
      enhancedWetGainRef.current = null;
      enhancedMasterGainRef.current = null;
      speechLikeStreakRef.current = 0;
      // Keep remote streams alive when only local capture settings changed.
      // Otherwise existing peer audio can become silent until tracks renegotiate.
      const shouldResetRoomScopedState = activeRoomIdRef.current === null;
      if (shouldResetRoomScopedState) {
        for (const [socketId] of remoteNodesRef.current) {
          removeRemoteStream(socketId);
        }
        setVoiceStates(new Map());
        myVoiceStateRef.current = { ...DEFAULT_VOICE_STATE };
        setMyVoiceState({ ...DEFAULT_VOICE_STATE });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId, selectedInputDeviceId, noiseCancellationMode, noiseCancellationLevel, noiseGate]);

  // ---------------------------------------------------------------------------
  // Set output device via AudioContext.setSinkId (Chromium 110+)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedOutputDeviceId || !audioContextRef.current) return;
    const ctx = audioContextRef.current as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (typeof ctx.setSinkId === 'function') {
      ctx.setSinkId(selectedOutputDeviceId).catch((err) => {
        console.warn('[audio] Failed to set output device:', err);
      });
    }
  }, [selectedOutputDeviceId]);

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
          nodes.audioElement.volume = 0;
        } else {
          // Restore saved volume
          const saved = savedVolumesRef.current.get(socketId) ?? 1.0;
          nodes.gain.gain.value = saved;
          nodes.audioElement.volume = Math.max(0, Math.min(1, saved));
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
        nodes.audioElement.volume = Math.max(0, Math.min(1, clamped));
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
      const localId = mySocketId;
      if (localAnalyser && !myVoiceStateRef.current.muted) {
        const avg = computeAvg(localAnalyser, freqData);
        const speechConfidence = updateEnhancedSuppression(avg, freqData);
        const vadThreshold = getCurrentVadThreshold();
        const isEnhancedNc = noiseCancellationModeRef.current === 'enhanced';
        const strictSpeechMode = isEnhancedNc && noiseCancellationLevelRef.current >= STRICT_SPEECH_LEVEL;
        const speechOpenThreshold = getSpeechOpenThreshold();
        const strictOpenThreshold = Math.max(0.62, speechOpenThreshold + 0.16);
        const closeThreshold = strictSpeechMode
          ? strictOpenThreshold - 0.18
          : speechOpenThreshold * 0.72;
        const openThreshold = strictSpeechMode ? strictOpenThreshold : speechOpenThreshold;
        const isAboveVad = avg > vadThreshold;

        if (!isAboveVad || !isEnhancedNc) {
          speechLikeStreakRef.current = isAboveVad ? 1 : 0;
        } else if (speechConfidence >= openThreshold) {
          speechLikeStreakRef.current = Math.min(speechLikeStreakRef.current + 1, 12);
        } else if (speechConfidence < closeThreshold) {
          speechLikeStreakRef.current = 0;
        } else {
          speechLikeStreakRef.current = Math.max(0, speechLikeStreakRef.current - 1);
        }

        const isSpeechLike = isAboveVad && (
          !isEnhancedNc
          || (strictSpeechMode
            ? speechLikeStreakRef.current >= STRICT_SPEECH_STREAK
            : speechLikeStreakRef.current >= 1)
        );
        if (isSpeechLike) {
          // Clear silence timer
          if (localSilenceTimerRef.current) {
            clearTimeout(localSilenceTimerRef.current);
            localSilenceTimerRef.current = null;
          }
          // VAD mode: enable mic track when speaking
          if (vadModeRef.current) {
            const track = localStreamRef.current?.getAudioTracks()[0];
            if (track && !track.enabled) track.enabled = true;
          }
          // Noise gate: open gate when speaking
          setNoiseGateState(true);
          if (!myVoiceStateRef.current.speaking) {
            setSpeaking(true);
            // Add self to speakingPeers so UI shows green glow
            if (localId && !speakingPeersRef.current.has(localId)) {
              speakingPeersRef.current.add(localId);
              setSpeakingPeers(new Set(speakingPeersRef.current));
            }
          }
        } else {
          // Start silence timer if currently speaking
          const silenceDelayMs = strictSpeechMode ? 60 : isEnhancedNc ? 120 : VAD_SILENCE_DELAY_MS;
          if (myVoiceStateRef.current.speaking && !localSilenceTimerRef.current) {
            localSilenceTimerRef.current = setTimeout(() => {
              setSpeaking(false);
              // VAD mode: disable mic track when silent
              if (vadModeRef.current) {
                const track = localStreamRef.current?.getAudioTracks()[0];
                if (track && track.enabled) track.enabled = false;
              }
              // Noise gate: close gate when silent
              setNoiseGateState(false);
              // Remove self from speakingPeers
              if (localId) {
                speakingPeersRef.current.delete(localId);
                setSpeakingPeers(new Set(speakingPeersRef.current));
              }
              localSilenceTimerRef.current = null;
            }, silenceDelayMs);
          }
        }
      } else if (myVoiceStateRef.current.speaking && myVoiceStateRef.current.muted) {
        // If muted while speaking, stop speaking immediately
        speechLikeStreakRef.current = 0;
        setSpeaking(false);
        if (localId) {
          speakingPeersRef.current.delete(localId);
          setSpeakingPeers(new Set(speakingPeersRef.current));
        }
      }

      // -- Remote speaking detection --
      let changed = false;
      const nextSpeaking = new Set(speakingPeersRef.current);

      for (const [socketId, nodes] of remoteNodesRef.current) {
        const avg = computeAvg(nodes.analyser, freqData);
        if (avg > REMOTE_VAD_THRESHOLD) {
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
  }, [activeRoomId, getCurrentVadThreshold, getSpeechOpenThreshold, setNoiseGateState, setSpeaking, updateEnhancedSuppression]);

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
    const vadInputStream = noiseGateStreamRef.current ?? localStream;
    const source = ctx.createMediaStreamSource(vadInputStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.22;

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
  // Cleanup AudioContext and audio elements on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      // Clean up all hidden audio elements
      for (const [, nodes] of remoteNodesRef.current) {
        try {
          nodes.audioElement.pause();
          nodes.audioElement.srcObject = null;
          nodes.audioElement.remove();
        } catch {
          /* already removed */
        }
      }
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
    removeRemoteStream,
    clearRemoteStreams,
  };
}
