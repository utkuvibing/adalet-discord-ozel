// Shared types imported by both main process and renderer.
// RULE: No imports from 'electron', 'better-sqlite3', or 'node:*' — renderer cannot access these.

export interface User {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  sessionToken: string | null;
  createdAt: Date;
}

export interface Room {
  id: number;
  name: string;
  createdAt: Date;
  isDefault: boolean;
}

export interface Message {
  id: number;
  roomId: number;
  userId: number;
  content: string;
  createdAt: Date;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
}

export interface InviteToken {
  id: number;
  token: string;
  maxUses: number | null; // null = unlimited
  useCount: number;
  createdAt: Date;
  expiresAt: Date | null;
  isRevoked: boolean;
}

// -- Phase 3: Voice State Types --

export interface VoiceState {
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
}

export interface VoiceStatePayload {
  socketId: string;
  state: VoiceState;
}

// -- Phase 2: Signaling Types --

export interface SDPPayload {
  to: string; // Target socket.id
  from?: string; // Set by server on relay
  description: RTCSessionDescriptionInit;
}

export interface ICEPayload {
  to: string; // Target socket.id
  from?: string; // Set by server on relay
  candidate: RTCIceCandidateInit;
}

export interface PeerInfo {
  socketId: string;
  displayName: string;
  avatarId: string;
}

export interface RoomWithMembers {
  id: number;
  name: string;
  isDefault: boolean;
  members: PeerInfo[];
}

export interface PresenceUpdate {
  rooms: RoomWithMembers[];
}

export interface SystemMessage {
  text: string;
  roomId: number;
  timestamp: number;
}

export interface ChatMessage {
  id: number;
  roomId: number;
  userId: number;
  displayName: string;
  avatarId: string;
  content: string;
  timestamp: number; // Unix ms for client rendering
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
}

// -- Phase 7: Screen Sharing Types --

export interface ScreenSource {
  id: string;           // desktopCapturer source ID (e.g., "screen:0:0" or "window:12345:0")
  name: string;         // Human-readable source name
  thumbnail: string;    // Base64 data URL from NativeImage.toDataURL()
  appIcon: string | null; // App icon data URL (windows only, null for screens)
  display_id: string;   // Non-empty for screens, empty for windows
}

// Socket.IO typed event maps (https://socket.io/docs/v4/typescript/)
export interface ServerToClientEvents {
  'room:list': (rooms: RoomWithMembers[]) => void;
  'room:peers': (peers: string[]) => void;
  'presence:update': (update: PresenceUpdate) => void;
  'sdp:offer': (payload: SDPPayload) => void;
  'sdp:answer': (payload: SDPPayload) => void;
  'ice:candidate': (payload: ICEPayload) => void;
  'system:message': (msg: SystemMessage) => void;
  'voice:state-change': (payload: VoiceStatePayload) => void;
  'chat:message': (msg: ChatMessage) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'session:created': (data: { sessionToken: string; userId: number; displayName: string; avatarId: string }) => void;
  error: (err: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'room:join': (roomId: number) => void;
  'room:leave': () => void;
  'sdp:offer': (payload: SDPPayload) => void;
  'sdp:answer': (payload: SDPPayload) => void;
  'ice:candidate': (payload: ICEPayload) => void;
  'voice:state-change': (state: VoiceState) => void;
  'chat:message': (payload: { roomId: number; content: string }) => void;
  'room:create': (name: string) => void;
  'room:delete': (roomId: number) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  inviteTokenId: number;
  displayName: string;
  avatarId: string;
  userId: number;
  sessionToken: string;
  isHost: boolean;
}

// IPC API surface — exposed to renderer via contextBridge
// Extended each phase by adding new methods to preload.ts
export interface ElectronAPI {
  minimizeWindow: () => void;
  quitApp: () => void;
  getServerStatus: () => Promise<{ running: boolean; port: number }>;
  onServerReady: (callback: (port: number) => void) => () => void;
  // Phase 2: Invite management
  createInvite: (options: {
    expiresInMs: number | null;
    maxUses: number | null;
  }) => Promise<{ token: string; serverAddress: string }>;
  getServerAddress: () => Promise<string>;
  // Tunnel support
  setTunnelUrl: (url: string | null) => Promise<void>;
  getTunnelUrl: () => Promise<string | null>;
  // Phase 3: Push-to-talk
  registerPTTShortcut: (accelerator: string) => Promise<boolean>;
  unregisterPTTShortcut: () => void;
  onPTTStateChange: (callback: (pressed: boolean) => void) => () => void;
  // Phase 7: Screen sharing
  getScreenSources: () => Promise<ScreenSource[]>;
  selectScreenSource: (sourceId: string, withAudio: boolean) => Promise<void>;
}

// Window augmentation — gives renderer type-safe access to electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
