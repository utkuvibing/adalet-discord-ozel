import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, dialog } from 'electron';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import started from 'electron-squirrel-startup';
import { startServer } from './server/index';
import { createInviteToken } from './server/invite';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Single instance lock — prevent multiple instances running at once
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Declare Vite dev server URL injected by Forge at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const DEFAULT_PORT = 7432;
let publicTunnelUrl: string | null = null;

/** Find the first non-internal IPv4 address (LAN IP for invite sharing). */
function getLocalIPAddress(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (!interfaces) continue;
    for (const iface of interfaces) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Sex Dungeon',
    backgroundColor: '#0d0d0d', // Prevents white flash on load
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // MUST be true — isolates preload from renderer
      nodeIntegration: false, // MUST be false — renderer has no Node.js access
      sandbox: false, // false required for preload to use Node APIs
    },
  });

  // Intercept close — minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow?.hide();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'tray-icon.png')
    : path.join(__dirname, '../../resources/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Sex Dungeon');
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          // Remove close prevention so app can actually quit
          mainWindow?.removeAllListeners('close');
          app.quit();
        },
      },
    ])
  );
}

function registerIpcHandlers(): void {
  ipcMain.on('window:minimize', () => mainWindow?.hide());
  ipcMain.on('app:quit', () => {
    mainWindow?.removeAllListeners('close');
    app.quit();
  });
  ipcMain.handle('server:get-status', () => ({
    running: true,
    port: DEFAULT_PORT,
  }));

  // Phase 2: Invite management
  ipcMain.handle(
    'invite:create',
    async (
      _event: Electron.IpcMainInvokeEvent,
      options: { expiresInMs: number | null; maxUses: number | null }
    ) => {
      const token = createInviteToken(options);
      const serverAddress = publicTunnelUrl ?? `${getLocalIPAddress()}:${DEFAULT_PORT}`;
      return { token, serverAddress };
    }
  );

  ipcMain.handle('server:get-address', () => {
    return publicTunnelUrl ?? `${getLocalIPAddress()}:${DEFAULT_PORT}`;
  });

  // Tunnel URL management
  ipcMain.handle('tunnel:set-url', (_event: Electron.IpcMainInvokeEvent, url: string | null) => {
    publicTunnelUrl = url && url.trim() !== '' ? url.trim().replace(/\/+$/, '') : null;
  });

  ipcMain.handle('tunnel:get-url', () => {
    return publicTunnelUrl;
  });

  // Phase 3: Push-to-talk with repeat-detection keyup
  let currentPTTAccelerator: string | null = null;
  let pttPressed = false;
  let lastPTTFire = 0;
  let pttInterval: ReturnType<typeof setInterval> | null = null;

  ipcMain.handle('ptt:register', (_event: Electron.IpcMainInvokeEvent, accelerator: string) => {
    // Unregister previous if exists
    if (currentPTTAccelerator) {
      globalShortcut.unregister(currentPTTAccelerator);
    }
    if (pttInterval) {
      clearInterval(pttInterval);
      pttInterval = null;
    }

    try {
      const registered = globalShortcut.register(accelerator, () => {
        lastPTTFire = Date.now();
        if (!pttPressed) {
          pttPressed = true;
          mainWindow?.webContents.send('ptt:state-change', true);
        }
      });

      if (registered) {
        currentPTTAccelerator = accelerator;
        // Start polling interval to detect key release
        // globalShortcut fires repeatedly while held; if no fire for >150ms, key was released
        pttInterval = setInterval(() => {
          if (pttPressed && Date.now() - lastPTTFire > 150) {
            pttPressed = false;
            mainWindow?.webContents.send('ptt:state-change', false);
          }
        }, 50);
      }
      return registered;
    } catch {
      return false;
    }
  });

  ipcMain.on('ptt:unregister', () => {
    if (currentPTTAccelerator) {
      globalShortcut.unregister(currentPTTAccelerator);
      currentPTTAccelerator = null;
    }
    if (pttInterval) {
      clearInterval(pttInterval);
      pttInterval = null;
    }
    pttPressed = false;
  });
}

// If a second instance tries to open, focus the existing window
app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  try {
    // 1. Start embedded server (runs in main process, no media passes through)
    startServer(DEFAULT_PORT);
    // 2. Register IPC handlers
    registerIpcHandlers();
    // 3. Create window and tray
    createWindow();
    createTray();
  } catch (err) {
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start: ${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

// Prevent default "quit on all windows closed" — tray keeps the app alive
app.on('window-all-closed', (event: Event) => {
  event.preventDefault();
});
