// contextBridge preload — establishes the IPC API surface for Phase 1
// Extended each phase to add new capability
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window management
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  quitApp: () => ipcRenderer.send('app:quit'),

  // Server status (invoked once on startup)
  getServerStatus: (): Promise<{ running: boolean; port: number }> =>
    ipcRenderer.invoke('server:get-status'),

  // Subscribe to server-ready notification
  onServerReady: (callback: (port: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, port: number) => callback(port);
    ipcRenderer.on('server:ready', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('server:ready', handler);
  },
});
