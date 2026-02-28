import { contextBridge, ipcRenderer } from 'electron';

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
} as const);
