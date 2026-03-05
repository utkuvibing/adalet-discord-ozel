import { useRef, useEffect, useCallback } from 'react';
import type { TypedSocket } from './useSocket';
import { ICE_SERVERS } from '../../shared/iceConfig';

/**
 * Per-peer state for Perfect Negotiation pattern.
 * Kept outside React state (mutable refs) because RTCPeerConnection is inherently mutable.
 */
interface PeerState {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

interface ScreenTuning {
  bitrate: number;
  maxFramerate?: number;
}

interface RuntimeIceResponse {
  iceServers?: unknown;
  source?: string;
}

interface ScreenSenderState {
  video: RTCRtpSender;
}

const ICE_RESTART_DISCONNECTED_DELAY_MS = 3000;
const ICE_RESTART_COOLDOWN_MS = 8000;

function sanitizeIceServers(raw: unknown): RTCIceServer[] {
  if (!Array.isArray(raw)) return [];

  const result: RTCIceServer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const rawUrls = record.urls;

    let urls: string | string[] | null = null;
    if (typeof rawUrls === 'string' && rawUrls.trim().length > 0) {
      urls = rawUrls.trim();
    } else if (Array.isArray(rawUrls)) {
      const cleaned = rawUrls
        .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        .map((u) => u.trim());
      if (cleaned.length === 1) urls = cleaned[0];
      else if (cleaned.length > 1) urls = cleaned;
    }

    if (!urls) continue;

    const server: RTCIceServer = { urls };
    if (typeof record.username === 'string' && record.username.trim().length > 0) {
      server.username = record.username.trim();
    }
    if (typeof record.credential === 'string' && record.credential.trim().length > 0) {
      server.credential = record.credential.trim();
    }
    result.push(server);
  }

  return result;
}

function toUrlArray(urls: string | string[]): string[] {
  return Array.isArray(urls) ? urls : [urls];
}

function mergeIceServers(primary: RTCIceServer[], fallback: RTCIceServer[]): RTCIceServer[] {
  const out: RTCIceServer[] = [];
  const seen = new Set<string>();

  const pushUnique = (server: RTCIceServer): void => {
    const urls = toUrlArray(server.urls);
    const key = `${urls.join('|')}|${server.username ?? ''}|${server.credential ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(server);
  };

  for (const server of primary) pushUnique(server);
  for (const server of fallback) pushUnique(server);
  return out;
}

function resolveRuntimeIceEndpoint(socket: TypedSocket): string | null {
  const manager = socket.io as unknown as { uri?: string };
  if (!manager?.uri) return null;
  try {
    return new URL('/api/webrtc/ice-servers', manager.uri).toString();
  } catch {
    return null;
  }
}

function getScreenTuning(track: MediaStreamTrack): ScreenTuning {
  const settings = track.getSettings();
  const width = settings.width ?? 1280;
  const height = settings.height ?? 720;
  const fps = settings.frameRate ?? 30;
  const pixels = width * height;

  if (pixels >= 1920 * 1080) {
    return { bitrate: fps >= 50 ? 12_000_000 : 8_000_000, maxFramerate: Math.min(60, Math.round(fps)) };
  }
  if (pixels >= 1280 * 720) {
    return { bitrate: fps >= 50 ? 7_000_000 : 4_500_000, maxFramerate: Math.min(60, Math.round(fps)) };
  }
  return { bitrate: 2_500_000, maxFramerate: Math.min(30, Math.round(fps)) };
}

export interface UseWebRTCReturn {
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>;
  addPeer: (remoteSocketId: string, initiator: boolean) => void;
  removePeer: (remoteSocketId: string) => void;
  removeAllPeers: () => void;
  addScreenShareTracks: (stream: MediaStream) => void;
  removeScreenShareTracks: (stream: MediaStream) => void;
}

/**
 * Perfect Negotiation WebRTC hook.
 *
 * Manages a Map of RTCPeerConnections keyed by remote socket ID.
 * Phase 3: Accepts optional localStreamRef to inject audio tracks into new peers,
 * and onTrackRef callback to route remote audio to useAudio.
 */
export function useWebRTC(
  socket: TypedSocket | null,
  mySocketId: string | null,
  localStreamRef?: React.MutableRefObject<MediaStream | null>,
  onTrackRef?: React.MutableRefObject<((socketId: string, stream: MediaStream) => void) | null>,
  screenStreamRef?: React.MutableRefObject<MediaStream | null>
): UseWebRTCReturn {
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerStates = useRef<Map<string, PeerState>>(new Map());
  const runtimeIceServersRef = useRef<RTCIceServer[]>(ICE_SERVERS);
  const disconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastIceRestartAt = useRef<Map<string, number>>(new Map());
  const screenSenders = useRef<Map<string, ScreenSenderState>>(new Map());

  const clearDisconnectTimer = useCallback((remoteSocketId: string) => {
    const timer = disconnectTimers.current.get(remoteSocketId);
    if (!timer) return;
    clearTimeout(timer);
    disconnectTimers.current.delete(remoteSocketId);
  }, []);

  useEffect(() => {
    if (!socket) return;

    let cancelled = false;
    const endpoint = resolveRuntimeIceEndpoint(socket);
    if (!endpoint) return;

    fetch(endpoint, { headers: endpoint.startsWith('https://') ? { 'ngrok-skip-browser-warning': '1' } : {} })
      .then(async (res) => {
        if (!res.ok) return null;
        const payload = (await res.json()) as RuntimeIceResponse;
        return {
          servers: sanitizeIceServers(payload.iceServers),
          source: payload.source ?? 'unknown',
        };
      })
      .then((result) => {
        if (cancelled || !result || result.servers.length === 0) return;
        runtimeIceServersRef.current = mergeIceServers(result.servers, ICE_SERVERS);
        console.log(`[webrtc] Runtime ICE config loaded (${result.source}), mergedCount=${runtimeIceServersRef.current.length}`);
      })
      .catch(() => {
        // Keep local fallback servers when runtime config is unreachable.
      });

    return () => {
      cancelled = true;
    };
  }, [socket]);

  const maybeRestartIce = useCallback((remoteSocketId: string, pc: RTCPeerConnection, reason: string) => {
    if (pc.connectionState === 'closed' || pc.signalingState === 'closed') return;
    const now = Date.now();
    const last = lastIceRestartAt.current.get(remoteSocketId) ?? 0;
    if (now - last < ICE_RESTART_COOLDOWN_MS) {
      console.log(`[webrtc] Skip ICE restart for ${remoteSocketId} (${reason}) due to cooldown`);
      return;
    }

    lastIceRestartAt.current.set(remoteSocketId, now);
    console.warn(`[webrtc] Restarting ICE for ${remoteSocketId} (${reason})`);
    try {
      pc.restartIce();
    } catch (err) {
      console.warn(`[webrtc] ICE restart failed for ${remoteSocketId}:`, err);
    }
  }, []);

  const applyScreenSenderParams = useCallback((sender: RTCRtpSender, track: MediaStreamTrack, context: string) => {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];

    const tuning = getScreenTuning(track);
    params.encodings[0].maxBitrate = tuning.bitrate;
    if (tuning.maxFramerate) {
      params.encodings[0].maxFramerate = tuning.maxFramerate;
    }
    params.encodings[0].scaleResolutionDownBy = 1;

    sender.setParameters(params).catch((err) => {
      console.warn(`[webrtc] Failed to set screen share params (${context}):`, err);
    });
  }, []);

  const applyAudioSenderParams = useCallback((sender: RTCRtpSender, maxBitrate: number, context: string) => {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = maxBitrate;
    sender.setParameters(params).catch((err) => {
      console.warn(`[webrtc] Failed to set audio sender params (${context}):`, err);
    });
  }, []);

  /**
   * Drain queued ICE candidates once remoteDescription is set.
   */
  const drainCandidates = useCallback((state: PeerState) => {
    while (state.pendingCandidates.length > 0) {
      const candidate = state.pendingCandidates.shift()!;
      state.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.warn('[webrtc] Error adding queued ICE candidate:', err);
      });
    }
  }, []);

  const removePeer = useCallback((remoteSocketId: string) => {
    clearDisconnectTimer(remoteSocketId);
    lastIceRestartAt.current.delete(remoteSocketId);

    const state = peerStates.current.get(remoteSocketId);
    if (state) {
      state.pc.close();
      peerStates.current.delete(remoteSocketId);
    }
    peerConnections.current.delete(remoteSocketId);
    screenSenders.current.delete(remoteSocketId);
  }, [clearDisconnectTimer]);

  const removeAllPeers = useCallback(() => {
    for (const [, timer] of disconnectTimers.current) {
      clearTimeout(timer);
    }
    disconnectTimers.current.clear();
    lastIceRestartAt.current.clear();

    console.log(`[webrtc] removeAllPeers: closing ${peerStates.current.size} connections`);
    for (const [, state] of peerStates.current) {
      state.pc.close();
    }
    peerStates.current.clear();
    peerConnections.current.clear();
    screenSenders.current.clear();
  }, []);

  const ensureScreenSenders = useCallback((peerId: string, pc: RTCPeerConnection): ScreenSenderState => {
    const existing = screenSenders.current.get(peerId);
    if (existing) return existing;

    // Keep dedicated screen-video transceiver so m-line order stays stable
    // across screen share start/stop cycles.
    const video = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
    const created: ScreenSenderState = { video };
    screenSenders.current.set(peerId, created);
    return created;
  }, []);

  const replaceScreenTracksForPeer = useCallback((peerId: string, pc: RTCPeerConnection, stream: MediaStream | null) => {
    const senders = ensureScreenSenders(peerId, pc);
    const nextVideoTrack = stream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null;

    senders.video.replaceTrack(nextVideoTrack).then(() => {
      if (nextVideoTrack) {
        applyScreenSenderParams(senders.video, nextVideoTrack, `screen-video:${peerId}`);
      }
    }).catch((err) => {
      console.warn(`[webrtc] Failed to replace screen video track for ${peerId}:`, err);
    });
  }, [ensureScreenSenders, applyScreenSenderParams]);

  /**
   * Add screen share tracks to all existing peer connections.
   * Does NOT touch audio (mic) senders.
   */
  const addScreenShareTracks = useCallback((stream: MediaStream) => {
    for (const [peerId, pc] of peerConnections.current) {
      replaceScreenTracksForPeer(peerId, pc, stream);
      console.log(`[webrtc] Synced screen share tracks to peer ${peerId}`);
    }
  }, [replaceScreenTracksForPeer]);

  /**
   * Remove screen share tracks from all peer connections.
   * Voice audio senders are NOT touched.
   */
  const removeScreenShareTracks = useCallback((_stream: MediaStream) => {
    for (const [peerId, pc] of peerConnections.current) {
      replaceScreenTracksForPeer(peerId, pc, null);
      console.log(`[webrtc] Cleared screen share tracks from peer ${peerId}`);
    }
  }, [replaceScreenTracksForPeer]);

  const addPeer = useCallback(
    (remoteSocketId: string, initiator: boolean) => {
      // Don't create duplicate connections
      if (peerStates.current.has(remoteSocketId)) return;
      if (!socket || !mySocketId) return;

      const pc = new RTCPeerConnection({ iceServers: runtimeIceServersRef.current });

      // Polite/impolite role determined by lexicographic comparison of socket IDs
      const polite = mySocketId < remoteSocketId;

      const state: PeerState = {
        pc,
        polite,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
        pendingCandidates: [],
      };

      peerStates.current.set(remoteSocketId, state);
      peerConnections.current.set(remoteSocketId, pc);

      // --- Phase 3: ontrack handler for remote audio ---
      // Only route audio-only streams to useAudio pipeline.
      // Screen share streams contain video tracks — they must NOT overwrite mic audio.
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        console.log(`[webrtc] ontrack from ${remoteSocketId}: kind=${event.track.kind}, enabled=${event.track.enabled}, readyState=${event.track.readyState}, streams=${event.streams.length}, videoTracks=${stream?.getVideoTracks().length ?? 0}`);
        if (stream && event.track.kind === 'audio' && stream.getVideoTracks().length === 0 && onTrackRef?.current) {
          onTrackRef.current(remoteSocketId, stream);
        }
      };

      // --- Perfect Negotiation: negotiation needed ---
      pc.onnegotiationneeded = async () => {
        console.log(`[webrtc] negotiationneeded for peer ${remoteSocketId}`);
        try {
          state.makingOffer = true;
          await pc.setLocalDescription();
          socket.emit('sdp:offer', {
            to: remoteSocketId,
            description: pc.localDescription!,
          });
          console.log(`[webrtc] SDP offer sent to ${remoteSocketId}`);
        } catch (err) {
          console.error('[webrtc] Error during negotiation:', err);
        } finally {
          state.makingOffer = false;
        }
      };

      // --- ICE candidate gathering ---
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`[webrtc] ICE candidate for ${remoteSocketId}: type=${event.candidate.type} proto=${event.candidate.protocol} addr=${event.candidate.address}:${event.candidate.port}`);
          socket.emit('ice:candidate', {
            to: remoteSocketId,
            candidate: event.candidate.toJSON(),
          });
        } else {
          console.log(`[webrtc] ICE gathering complete for ${remoteSocketId}`);
        }
      };

      // --- ICE connection state monitoring ---
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        console.log(`[webrtc] ICE connection state for ${remoteSocketId}: ${iceState}`);

        if (iceState === 'connected' || iceState === 'completed') {
          clearDisconnectTimer(remoteSocketId);
          return;
        }

        if (iceState === 'failed') {
          clearDisconnectTimer(remoteSocketId);
          maybeRestartIce(remoteSocketId, pc, 'ice-failed');
          return;
        }

        if (iceState === 'disconnected') {
          if (disconnectTimers.current.has(remoteSocketId)) return;

          const timer = setTimeout(() => {
            disconnectTimers.current.delete(remoteSocketId);
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              maybeRestartIce(remoteSocketId, pc, 'ice-disconnected-timeout');
            }
          }, ICE_RESTART_DISCONNECTED_DELAY_MS);
          disconnectTimers.current.set(remoteSocketId, timer);
        }
      };

      // --- Connection state monitoring ---
      pc.onconnectionstatechange = () => {
        console.log(`[webrtc] Connection state for ${remoteSocketId}: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          maybeRestartIce(remoteSocketId, pc, 'connection-failed');
        } else if (pc.connectionState === 'closed') {
          clearDisconnectTimer(remoteSocketId);
          lastIceRestartAt.current.delete(remoteSocketId);
          console.warn(`[webrtc] Peer ${remoteSocketId} connection closed`);
        }
      };

      // Reserve a dedicated mic transceiver once and only swap tracks.
      // This keeps SDP sections stable across mic restarts.
      const micSender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
      const localStream = localStreamRef?.current ?? null;
      const nextMicTrack = localStream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
      if (nextMicTrack) {
        micSender.replaceTrack(nextMicTrack).then(() => {
          applyAudioSenderParams(micSender, 128_000, `mic:${remoteSocketId}`);
          console.log(`[webrtc] Bound live mic track to peer ${remoteSocketId}`);
        }).catch((err) => {
          console.warn(`[webrtc] Failed to bind mic track to peer ${remoteSocketId}:`, err);
        });
      } else if (initiator) {
        // Fallback: no audio stream yet, use a data channel to trigger negotiation.
        pc.createDataChannel('keepalive');
        console.log(`[webrtc] No local stream yet, created keepalive data channel for ${remoteSocketId}`);
      } else {
        console.log(`[webrtc] No local stream yet and not initiator for ${remoteSocketId}`);
      }

      // Reserve screen share m-lines once to keep SDP section ordering stable.
      // Then only swap tracks with replaceTrack during share start/stop.
      ensureScreenSenders(remoteSocketId, pc);
      const screenStream = screenStreamRef?.current ?? null;
      replaceScreenTracksForPeer(remoteSocketId, pc, screenStream);
    },
    [
      socket,
      mySocketId,
      drainCandidates,
      localStreamRef,
      onTrackRef,
      screenStreamRef,
      applyAudioSenderParams,
      maybeRestartIce,
      clearDisconnectTimer,
      ensureScreenSenders,
      replaceScreenTracksForPeer,
    ]
  );

  // --- Socket event handlers for signaling ---
  useEffect(() => {
    if (!socket || !mySocketId) return;

    const handleSdpOffer = async (payload: { from?: string; description: RTCSessionDescriptionInit }) => {
      const from = payload.from;
      if (!from) return;

      let state = peerStates.current.get(from);
      if (!state) {
        // Unknown peer sent us an offer -- create the connection (we are not initiator)
        addPeer(from, false);
        state = peerStates.current.get(from);
        if (!state) return;
      }

      const { pc, polite } = state;
      const incomingType = payload.description.type;
      const readyForOffer =
        !state.makingOffer
        && (pc.signalingState === 'stable' || state.isSettingRemoteAnswerPending);
      const offerCollision = incomingType === 'offer' && !readyForOffer;

      state.ignoreOffer = !polite && offerCollision;
      if (state.ignoreOffer) return;

      try {
        if (offerCollision) {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(payload.description)),
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
        }
        state.isSettingRemoteAnswerPending = false;
        drainCandidates(state);

        if (incomingType === 'offer') {
          await pc.setLocalDescription();
          socket.emit('sdp:answer', {
            to: from,
            description: pc.localDescription!,
          });
        }
      } catch (err) {
        state.isSettingRemoteAnswerPending = false;
        console.error('[webrtc] Error handling SDP offer:', err);
      }
    };

    const handleSdpAnswer = async (payload: { from?: string; description: RTCSessionDescriptionInit }) => {
      const from = payload.from;
      if (!from) return;

      const state = peerStates.current.get(from);
      if (!state) return;

      try {
        state.isSettingRemoteAnswerPending = true;
        await state.pc.setRemoteDescription(new RTCSessionDescription(payload.description));
        state.isSettingRemoteAnswerPending = false;
        drainCandidates(state);
      } catch (err) {
        console.error('[webrtc] Error handling SDP answer:', err);
        state.isSettingRemoteAnswerPending = false;
      }
    };

    const handleIceCandidate = async (payload: { from?: string; candidate: RTCIceCandidateInit }) => {
      const from = payload.from;
      if (!from) return;

      const state = peerStates.current.get(from);
      if (!state) return;

      if (state.pc.remoteDescription) {
        try {
          await state.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          // Ignore errors for ignored offers (polite peer may have rolled back)
          if (!state.ignoreOffer) {
            console.warn('[webrtc] Error adding ICE candidate:', err);
          }
        }
      } else {
        // Queue until remote description is set
        state.pendingCandidates.push(payload.candidate);
      }
    };

    const handleRoomPeers = (peers: string[]) => {
      console.log(`[webrtc] room:peers received, peers: ${peers.length}`, peers);
      // New joiner receives list of existing peers and initiates connections to each
      for (const peerId of peers) {
        if (peerId !== mySocketId) {
          addPeer(peerId, true);
        }
      }
    };

    socket.on('sdp:offer', handleSdpOffer);
    socket.on('sdp:answer', handleSdpAnswer);
    socket.on('ice:candidate', handleIceCandidate);
    socket.on('room:peers', handleRoomPeers);

    return () => {
      socket.off('sdp:offer', handleSdpOffer);
      socket.off('sdp:answer', handleSdpAnswer);
      socket.off('ice:candidate', handleIceCandidate);
      socket.off('room:peers', handleRoomPeers);
    };
  }, [socket, mySocketId, addPeer, drainCandidates]);

  // --- Cleanup on unmount: close all peer connections ---
  useEffect(() => {
    return () => {
      for (const [, timer] of disconnectTimers.current) {
        clearTimeout(timer);
      }
      disconnectTimers.current.clear();
      lastIceRestartAt.current.clear();

      for (const [, state] of peerStates.current) {
        state.pc.close();
      }
      peerStates.current.clear();
      peerConnections.current.clear();
    };
  }, []);

  return { peerConnections, addPeer, removePeer, removeAllPeers, addScreenShareTracks, removeScreenShareTracks };
}
