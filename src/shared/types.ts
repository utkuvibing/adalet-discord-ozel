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
}

export interface InviteToken {
  id: number;
  token: string;
  usedBy: number | null;
  createdAt: Date;
  expiresAt: Date | null;
  isRevoked: boolean;
}

// IPC API surface — exposed to renderer via contextBridge
// Extended each phase by adding new methods to preload.ts
export interface ElectronAPI {
  minimizeWindow: () => void;
  quitApp: () => void;
  getServerStatus: () => Promise<{ running: boolean; port: number }>;
  onServerReady: (callback: (port: number) => void) => () => void;
}

// Window augmentation — gives renderer type-safe access to electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
