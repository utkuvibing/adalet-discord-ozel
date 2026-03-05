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
  sortOrder: number;
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
  userId?: number;
  displayName: string;
  avatarId: string;
  profilePhotoUrl?: string | null;
  profileBannerGifUrl?: string | null;
  bio?: string;
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

export interface ReactionGroup {
  emoji: string;
  userIds: number[];
}

export interface ChatMessage {
  id: number;
  roomId: number;
  userId: number;
  displayName: string;
  avatarId: string;
  profilePhotoUrl?: string | null;
  content: string;
  timestamp: number; // Unix ms for client rendering
  editedAt?: number;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  reactions?: ReactionGroup[];
}

export interface FriendRequestItem {
  id: number;
  fromUserId: number;
  toUserId: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  actedAt: number | null;
  fromDisplayName: string;
  fromProfilePhotoUrl: string | null;
}

export interface FriendItem {
  userId: number;
  displayName: string;
  profilePhotoUrl: string | null;
  bio: string;
}

export interface DMMessage {
  id: number;
  fromUserId: number;
  toUserId: number;
  content: string;
  timestamp: number;
  editedAt?: number;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  reactions?: ReactionGroup[];
}

// -- Phase 7: Screen Sharing Types --

export interface ScreenSource {
  id: string;           // desktopCapturer source ID (e.g., "screen:0:0" or "window:12345:0")
  name: string;         // Human-readable source name
  thumbnail: string;    // Base64 data URL from NativeImage.toDataURL()
  appIcon: string | null; // App icon data URL (windows only, null for screens)
  display_id: string;   // Non-empty for screens, empty for windows
}

export interface UpdateCheckResult {
  status: 'up-to-date' | 'update-available' | 'no-release' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseUrl?: string;
  error?: string;
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
  'chat:message:update': (msg: ChatMessage) => void;
  'chat:message:delete': (payload: { messageId: number; roomId: number }) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'session:created': (data: {
    sessionToken: string;
    userId: number;
    displayName: string;
    avatarId: string;
    profilePhotoUrl?: string | null;
    profileBannerGifUrl?: string | null;
    bio?: string;
  }) => void;
  'typing:update': (payload: { socketId: string; displayName: string; typing: boolean }) => void;
  'reaction:update': (payload: { messageId: number; reactions: ReactionGroup[] }) => void;
  error: (err: { code: string; message: string }) => void;
  // Phase 7: Screen sharing
  'screen:started': (payload: { socketId: string; sourceName: string }) => void;
  'screen:stopped': (payload: { socketId: string }) => void;
  // Drag-drop: force move user to another room
  'room:force-move': (payload: { targetRoomId: number; targetRoomName: string }) => void;
  'friend:list': (friends: FriendItem[]) => void;
  'friend:request:list': (requests: FriendRequestItem[]) => void;
  'friend:request:incoming': (request: FriendRequestItem) => void;
  'friend:request:updated': (request: FriendRequestItem) => void;
  'dm:history': (payload: { targetUserId: number; messages: DMMessage[] }) => void;
  'dm:message': (payload: { targetUserId: number; message: DMMessage }) => void;
  'dm:message:update': (payload: { targetUserId: number; message: DMMessage }) => void;
  'dm:message:delete': (payload: { targetUserId: number; messageId: number }) => void;
  'dm:reaction:update': (payload: { targetUserId: number; messageId: number; reactions: ReactionGroup[] }) => void;
  'dm:call:started': (payload: { targetUserId: number; fromUserId: number }) => void;
  'dm:call:ended': (payload: { targetUserId: number; fromUserId: number }) => void;
  'dm:sdp:offer': (payload: SDPPayload & { dmTargetUserId: number }) => void;
  'dm:sdp:answer': (payload: SDPPayload & { dmTargetUserId: number }) => void;
  'dm:ice:candidate': (payload: ICEPayload & { dmTargetUserId: number }) => void;
  'profile:updated': (payload: {
    userId: number;
    displayName: string;
    bio: string;
    profilePhotoUrl: string | null;
    profileBannerGifUrl: string | null;
  }) => void;
}

export interface ClientToServerEvents {
  'room:join': (roomId: number) => void;
  'room:leave': () => void;
  'sdp:offer': (payload: SDPPayload) => void;
  'sdp:answer': (payload: SDPPayload) => void;
  'ice:candidate': (payload: ICEPayload) => void;
  'voice:state-change': (state: VoiceState) => void;
  'chat:message': (payload: { roomId: number; content: string }) => void;
  'chat:history:request': (payload: { roomId: number }) => void;
  'chat:message:edit': (payload: { messageId: number; content: string }) => void;
  'chat:message:delete': (payload: { messageId: number }) => void;
  'typing:start': (roomId: number) => void;
  'reaction:toggle': (payload: { messageId: number; emoji: string }) => void;
  'room:list:request': () => void;
  'room:create': (name: string) => void;
  'room:delete': (roomId: number) => void;
  'room:reorder': (orderedIds: number[]) => void;
  // Phase 7: Screen sharing
  'screen:start': (state: { sourceName: string }) => void;
  'screen:stop': () => void;
  // Drag-drop: host moves a user to another room
  'room:move-user': (payload: { socketId: string; targetRoomId: number }) => void;
  'friend:list:request': () => void;
  'friend:request:list:request': () => void;
  'friend:request:send': (payload: { targetUserId: number }) => void;
  'friend:request:accept': (payload: { requestId: number }) => void;
  'friend:request:reject': (payload: { requestId: number }) => void;
  'dm:history:request': (payload: { targetUserId: number }) => void;
  'dm:message': (payload: { targetUserId: number; content: string }) => void;
  'dm:message:edit': (payload: { targetUserId: number; messageId: number; content: string }) => void;
  'dm:message:delete': (payload: { targetUserId: number; messageId: number }) => void;
  'dm:reaction:toggle': (payload: { targetUserId: number; messageId: number; emoji: string }) => void;
  'dm:call:start': (payload: { targetUserId: number }) => void;
  'dm:call:end': (payload: { targetUserId: number }) => void;
  'dm:sdp:offer': (payload: SDPPayload & { dmTargetUserId: number }) => void;
  'dm:sdp:answer': (payload: SDPPayload & { dmTargetUserId: number }) => void;
  'dm:ice:candidate': (payload: ICEPayload & { dmTargetUserId: number }) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  inviteTokenId: number;
  displayName: string;
  avatarId: string;
  profilePhotoUrl?: string | null;
  profileBannerGifUrl?: string | null;
  bio?: string;
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
  // Tailscale status
  getTailscaleStatus: () => Promise<{ installed: boolean; active: boolean; url: string | null }>;
  downloadFile: (
    url: string,
    suggestedName: string
  ) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
  // Phase 3: Push-to-talk
  registerPTTShortcut: (accelerator: string) => Promise<boolean>;
  unregisterPTTShortcut: () => void;
  onPTTStateChange: (callback: (pressed: boolean) => void) => () => void;
  // Phase 7: Screen sharing
  getScreenSources: () => Promise<ScreenSource[]>;
  selectScreenSource: (sourceId: string, withAudio: boolean) => Promise<void>;
  // Deep link support
  onDeepLinkInvite: (callback: (data: { address: string; token: string }) => void) => () => void;
  // Bootstrap config (embedded invite + server mode)
  getBootstrapConfig: () => Promise<{ embeddedInvite: string | null; runServer: boolean }>;
  checkForUpdates: () => Promise<UpdateCheckResult>;
  openExternalUrl: (url: string) => Promise<boolean>;
  onOpenUpdateChecker: (callback: () => void) => () => void;
}

// Window augmentation — gives renderer type-safe access to electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
