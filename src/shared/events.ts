// Socket.io event name constants.
// Using constants prevents typos in event names across server and renderer.
// Extended each phase as new events are added.

export const SocketEvents = {
  // Connection lifecycle (Phase 1 stubs)
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',

  // Phase 2: Signaling (reserved — implemented in Phase 2)
  // ROOM_JOIN: 'room:join',
  // ROOM_LEAVE: 'room:leave',
  // SDP_OFFER: 'sdp:offer',
  // SDP_ANSWER: 'sdp:answer',
  // ICE_CANDIDATE: 'ice:candidate',
  // PRESENCE_UPDATE: 'presence:update',
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
