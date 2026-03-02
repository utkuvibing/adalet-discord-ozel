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
    const state = peerStates.current.get(remoteSocketId);
    if (state) {
      state.pc.close();
      peerStates.current.delete(remoteSocketId);
    }
    peerConnections.current.delete(remoteSocketId);
  }, []);

  const removeAllPeers = useCallback(() => {
    console.log(`[webrtc] removeAllPeers: closing ${peerStates.current.size} connections`);
    for (const [, state] of peerStates.current) {
      state.pc.close();
    }
    peerStates.current.clear();
    peerConnections.current.clear();
  }, []);

  /**
   * Add screen share tracks to all existing peer connections.
   * Does NOT touch audio (mic) senders -- only adds new video + optional audio tracks.
   */
  const addScreenShareTracks = useCallback((stream: MediaStream) => {
    for (const [peerId, pc] of peerConnections.current) {
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        // Set high bitrate for screen share video quality
        if (track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings?.length) params.encodings = [{}];
          params.encodings[0].maxBitrate = 8_000_000; // 8 Mbps
          params.degradationPreference = 'maintain-resolution';
          sender.setParameters(params).catch((err) => {
            console.warn('[webrtc] Failed to set screen share encoding params:', err);
          });
        }
      });
      console.log(`[webrtc] Added ${stream.getTracks().length} screen share tracks to peer ${peerId}`);
    }
  }, []);

  /**
   * Remove screen share tracks from all peer connections.
   * Only removes senders whose track belongs to the screen share stream.
   * Voice audio senders are NOT touched.
   */
  const removeScreenShareTracks = useCallback((stream: MediaStream) => {
    const screenTrackIds = new Set(stream.getTracks().map((t) => t.id));
    for (const [peerId, pc] of peerConnections.current) {
      const senders = pc.getSenders();
      for (const sender of senders) {
        if (sender.track && screenTrackIds.has(sender.track.id)) {
          pc.removeTrack(sender);
        }
      }
      console.log(`[webrtc] Removed screen share tracks from peer ${peerId}`);
    }
  }, []);

  const addPeer = useCallback(
    (remoteSocketId: string, initiator: boolean) => {
      // Don't create duplicate connections
      if (peerStates.current.has(remoteSocketId)) return;
      if (!socket || !mySocketId) return;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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
        const stream = event.streams[0];
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
        console.log(`[webrtc] ICE connection state for ${remoteSocketId}: ${pc.iceConnectionState}`);
      };

      // --- Connection state monitoring ---
      pc.onconnectionstatechange = () => {
        console.log(`[webrtc] Connection state for ${remoteSocketId}: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          console.warn(`[webrtc] Peer ${remoteSocketId} connection failed, attempting ICE restart`);
          pc.restartIce();
        } else if (pc.connectionState === 'closed') {
          console.warn(`[webrtc] Peer ${remoteSocketId} connection closed`);
        }
      };

      // Phase 3: If local audio stream is available, add tracks to trigger negotiation.
      // This replaces the keepalive data channel approach -- audio tracks cause
      // onnegotiationneeded to fire naturally.
      const stream = localStreamRef?.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
        console.log(`[webrtc] Added ${stream.getTracks().length} local tracks to peer ${remoteSocketId}`);
      } else if (initiator) {
        // Fallback: no audio stream yet, use a data channel to trigger negotiation.
        pc.createDataChannel('keepalive');
        console.log(`[webrtc] No local stream yet, created keepalive data channel for ${remoteSocketId}`);
      } else {
        console.log(`[webrtc] No local stream yet and not initiator for ${remoteSocketId}`);
      }

      // Phase 7: If screen share is active, also add screen share tracks to new peer
      const screenStream = screenStreamRef?.current;
      if (screenStream) {
        screenStream.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, screenStream);
          if (track.kind === 'video') {
            const params = sender.getParameters();
            if (!params.encodings?.length) params.encodings = [{}];
            params.encodings[0].maxBitrate = 8_000_000;
            params.degradationPreference = 'maintain-resolution';
            sender.setParameters(params).catch((err) => {
              console.warn('[webrtc] Failed to set screen share params for new peer:', err);
            });
          }
        });
        console.log(`[webrtc] Added ${screenStream.getTracks().length} screen share tracks to new peer ${remoteSocketId}`);
      }
    },
    [socket, mySocketId, drainCandidates, localStreamRef, onTrackRef, screenStreamRef]
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
      const offerCollision =
        state.makingOffer || pc.signalingState !== 'stable';

      state.ignoreOffer = !polite && offerCollision;
      if (state.ignoreOffer) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
        drainCandidates(state);

        if (payload.description.type === 'offer') {
          await pc.setLocalDescription();
          socket.emit('sdp:answer', {
            to: from,
            description: pc.localDescription!,
          });
        }
      } catch (err) {
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
      for (const [, state] of peerStates.current) {
        state.pc.close();
      }
      peerStates.current.clear();
      peerConnections.current.clear();
    };
  }, []);

  return { peerConnections, addPeer, removePeer, removeAllPeers, addScreenShareTracks, removeScreenShareTracks };
}
