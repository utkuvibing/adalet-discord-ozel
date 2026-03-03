import { contextBridge, ipcRenderer } from 'electron';
import type { ScreenSource } from './shared/types';

// Phase 1 IPC surface — intentionally minimal
// Extended each phase: add methods here AND add the type to ElectronAPI in src/shared/types.ts

contextBridge.exposeInMainWorld('electronAPI', {
  // Window management
  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  quitApp: (): void => ipcRenderer.send('app:quit'),

  // Server status — invoked by Connect.tsx to confirm server is ready
  getServerStatus: (): Promise<{ running: boolean; port: number }> =>
    ipcRenderer.invoke('server:get-status'),

  // Server-ready subscription — renderer calls this on mount to receive port
  // Returns a cleanup function so the caller can remove the listener on unmount
  onServerReady: (callback: (port: number) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, port: number): void => callback(port);
    ipcRenderer.on('server:ready', handler);
    return () => ipcRenderer.removeListener('server:ready', handler);
  },

  // Phase 2: Invite management
  createInvite: (
    options: { expiresInMs: number | null; maxUses: number | null }
  ): Promise<{ token: string; serverAddress: string }> =>
    ipcRenderer.invoke('invite:create', options),

  getServerAddress: (): Promise<string> =>
    ipcRenderer.invoke('server:get-address'),

  // Tailscale status
  getTailscaleStatus: (): Promise<{ installed: boolean; active: boolean; url: string | null }> =>
    ipcRenderer.invoke('tailscale:status'),

  // Phase 3: Push-to-talk
  registerPTTShortcut: (accelerator: string): Promise<boolean> =>
    ipcRenderer.invoke('ptt:register', accelerator),
  unregisterPTTShortcut: (): void =>
    ipcRenderer.send('ptt:unregister'),
  onPTTStateChange: (callback: (pressed: boolean) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, pressed: boolean): void => callback(pressed);
    ipcRenderer.on('ptt:state-change', handler);
    return () => ipcRenderer.removeListener('ptt:state-change', handler);
  },

  // Phase 7: Screen sharing
  getScreenSources: (): Promise<ScreenSource[]> =>
    ipcRenderer.invoke('screen:get-sources'),
  selectScreenSource: (sourceId: string, withAudio: boolean): Promise<void> =>
    ipcRenderer.invoke('screen:select-source', sourceId, withAudio),

  // Deep link support
  onDeepLinkInvite: (callback: (data: { address: string; token: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { address: string; token: string }): void => callback(data);
    ipcRenderer.on('deep-link:invite', handler);
    return () => ipcRenderer.removeListener('deep-link:invite', handler);
  },
} as const);
