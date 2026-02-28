import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { startServer } from './server/index';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Declare Vite dev server URL injected by Forge at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const DEFAULT_PORT = 7432;

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
  const iconPath = path.join(__dirname, '../../resources/tray-icon.png');
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
}

app.whenReady().then(() => {
  // 1. Start embedded server (runs in main process, no media passes through)
  startServer(DEFAULT_PORT);
  // 2. Register IPC handlers
  registerIpcHandlers();
  // 3. Create window and tray
  createWindow();
  createTray();
});

// Prevent default "quit on all windows closed" — tray keeps the app alive
app.on('window-all-closed', (event: Event) => {
  event.preventDefault();
});
