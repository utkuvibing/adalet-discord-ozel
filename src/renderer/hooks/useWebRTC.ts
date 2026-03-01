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
}

/**
 * Perfect Negotiation WebRTC hook.
 *
 * Manages a Map of RTCPeerConnections keyed by remote socket ID.
 * Does NOT add audio/video tracks -- that is Phase 3.
 * Structured so Phase 3 can call pc.addTrack(audioTrack, stream) on existing connections.
 */
export function useWebRTC(
  socket: TypedSocket | null,
  mySocketId: string | null
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

      // --- Perfect Negotiation: negotiation needed ---
      pc.onnegotiationneeded = async () => {
        try {
          state.makingOffer = true;
          await pc.setLocalDescription();
          socket.emit('sdp:offer', {
            to: remoteSocketId,
            description: pc.localDescription!,
          });
        } catch (err) {
          console.error('[webrtc] Error during negotiation:', err);
        } finally {
          state.makingOffer = false;
        }
      };

      // --- ICE candidate gathering ---
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice:candidate', {
            to: remoteSocketId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // --- Connection state monitoring ---
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          console.warn(`[webrtc] Peer ${remoteSocketId} connection ${pc.connectionState}`);
        }
      };

      // If this peer is the initiator, add a data channel to trigger negotiation.
      // Without any tracks or data channels, onnegotiationneeded won't fire.
      // Phase 3 will add audio tracks; for now a keepalive data channel ensures
      // the connection is actually established.
      if (initiator) {
        pc.createDataChannel('keepalive');
      }
    },
    [socket, mySocketId, drainCandidates]
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

  return { peerConnections, addPeer, removePeer };
}
