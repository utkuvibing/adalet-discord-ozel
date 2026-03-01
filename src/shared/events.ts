// Socket.io event name constants.
// Using constants prevents typos in event names across server and renderer.
// Extended each phase as new events are added.

export const SocketEvents = {
  // Connection lifecycle
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  // Room management
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_LIST: 'room:list',
  // Signaling
  SDP_OFFER: 'sdp:offer',
  SDP_ANSWER: 'sdp:answer',
  ICE_CANDIDATE: 'ice:candidate',
  // Presence
  PRESENCE_UPDATE: 'presence:update',
  SYSTEM_MESSAGE: 'system:message',
  // Voice state
  VOICE_STATE_CHANGE: 'voice:state-change',
  // Errors
  ERROR: 'error',
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
