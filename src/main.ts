import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  globalShortcut,
  dialog,
  desktopCapturer,
  session,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { networkInterfaces } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import started from 'electron-squirrel-startup';
import { startServer } from './server/index';
import { createInviteToken } from './server/invite';
import type { UpdateCheckResult } from './shared/types';

const execFileAsync = promisify(execFile);

/** Resolve the Tailscale CLI path — Windows needs the full path. */
function getTailscaleCLI(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe');
  }
  return 'tailscale';
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Phase 7: Prevent WebRTC CPU throttling that causes low fps screen share (Electron bug #23254)
app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '100');

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
let runServerInThisInstance = true;
let embeddedInviteLink: string | null = null;
const RELEASE_REPO = 'utkuvibing/adalet-discord-ozel';
const RELEASE_PAGE_URL = `https://github.com/${RELEASE_REPO}/releases/latest`;

interface GitHubLatestRelease {
  tag_name: string;
  name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

// Deep link state
let pendingDeepLink: { address: string; token: string } | null = null;

// Tailscale state
let tailscaleInstalled = false;
let tailscaleActive = false;

function parseVersion(version: string): [number, number, number] {
  const normalized = version.trim().replace(/^v/i, '').split('-')[0];
  const [majorRaw, minorRaw, patchRaw] = normalized.split('.');
  const major = Number.parseInt(majorRaw ?? '0', 10) || 0;
  const minor = Number.parseInt(minorRaw ?? '0', 10) || 0;
  const patch = Number.parseInt(patchRaw ?? '0', 10) || 0;
  return [major, minor, patch];
}

function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = parseVersion(a);
  const [bMaj, bMin, bPatch] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

async function fetchLatestGitHubRelease(): Promise<GitHubLatestRelease | null> {
  const response = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'The-Inn-Desktop',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub release check failed (${response.status})`);
  }
  const json = (await response.json()) as GitHubLatestRelease;
  if (!json?.tag_name) return null;
  return json;
}

async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  try {
    const latest = await fetchLatestGitHubRelease();
    if (!latest || latest.draft) {
      return {
        status: 'no-release',
        currentVersion,
      };
    }

    const latestVersion = latest.tag_name;
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    const releaseUrl = latest.html_url || RELEASE_PAGE_URL;
    const releaseName = latest.name?.trim() ? latest.name.trim() : undefined;
    if (!hasUpdate) {
      return {
        status: 'up-to-date',
        currentVersion,
        latestVersion,
        releaseName,
        releaseUrl,
      };
    }
    return {
      status: 'update-available',
      currentVersion,
      latestVersion,
      releaseName,
      releaseUrl,
    };
  } catch (err) {
    return {
      status: 'error',
      currentVersion,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function setupApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Show The Inn',
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
          },
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => {
            mainWindow?.webContents.send('update:open-modal');
          },
        },
        {
          label: 'Open Releases',
          click: () => {
            void shell.openExternal(RELEASE_PAGE_URL);
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            mainWindow?.webContents.send('update:open-modal');
          },
        },
        {
          label: 'Open Releases',
          click: () => {
            void shell.openExternal(RELEASE_PAGE_URL);
          },
        },
        {
          label: `Current Version: v${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Try to start Tailscale Funnel. Graceful fallback — never crashes the app. */
async function startTailscaleFunnel(): Promise<void> {
  const cli = getTailscaleCLI();
  try {
    // 1. Check if Tailscale is installed and get hostname
    const { stdout } = await execFileAsync(cli, ['status', '--json']);
    const status = JSON.parse(stdout);
    tailscaleInstalled = true;

    // Extract DNS name (e.g. "mypc.tailnet-name.ts.net.")
    const dnsName: string = status.Self?.DNSName ?? '';
    if (!dnsName) {
      console.warn('[tailscale] No DNSName found in status — skipping funnel');
      return;
    }
    // Remove trailing dot
    const hostname = dnsName.replace(/\.$/, '');

    // 2. Start funnel in background
    await execFileAsync(cli, ['funnel', '--bg', String(DEFAULT_PORT)]);
    publicTunnelUrl = `https://${hostname}`;
    tailscaleActive = true;
    console.log(`[tailscale] Funnel active: ${publicTunnelUrl}`);
  } catch (err) {
    // Tailscale not installed or funnel failed — LAN-only mode
    console.log('[tailscale] Not available, running in LAN-only mode:', (err as Error).message);
  }
}

/** Stop Tailscale Funnel on app exit. */
async function stopTailscaleFunnel(): Promise<void> {
  if (!tailscaleActive) return;
  const cli = getTailscaleCLI();
  try {
    await execFileAsync(cli, ['funnel', 'off']);
    console.log('[tailscale] Funnel stopped');
  } catch (err) {
    console.warn('[tailscale] Failed to stop funnel:', (err as Error).message);
  }
  tailscaleActive = false;
}

/** Register theinn:// protocol for deep links */
if (process.defaultApp) {
  // Dev mode: pass the script path so Electron can handle the protocol
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('theinn', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('theinn');
}

/** Parse theinn://join/ADDRESS/TOKEN into { address, token } */
function parseDeepLink(url: string): { address: string; token: string } | null {
  try {
    // theinn://join/host:port/TOKEN or theinn://join/https://domain.com/TOKEN
    const match = url.match(/^theinn:\/\/join\/(.+)\/([^/]+)$/);
    if (match) {
      return { address: match[1], token: match[2] };
    }
  } catch {
    // malformed URL
  }
  return null;
}

/** Extract deep link from command line argv */
function extractDeepLinkFromArgv(argv: string[]): { address: string; token: string } | null {
  const deepLinkArg = argv.find((arg) => arg.startsWith('theinn://'));
  return deepLinkArg ? parseDeepLink(deepLinkArg) : null;
}

// Phase 7: Screen sharing state (shared between IPC handler and display media request handler)
let pendingScreenSourceId: string | null = null;
let pendingScreenAudio = false;
let pendingScreenSource: Electron.DesktopCapturerSource | null = null;
const latestScreenSources = new Map<string, Electron.DesktopCapturerSource>();

function readEmbeddedInviteLink(): string | null {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'embedded-invite.txt')
    : path.join(app.getAppPath(), 'resources', 'embedded-invite.txt');
  try {
    const raw = fs.readFileSync(candidate, 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function readHostModeFlag(): boolean {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'host-mode.txt')
    : path.join(app.getAppPath(), 'resources', 'host-mode.txt');
  try {
    const raw = fs.readFileSync(candidate, 'utf8').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'host';
  } catch {
    return false;
  }
}

/** Find the first non-internal IPv4 address (LAN IP for invite sharing). */
function getLocalIPAddress(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (!interfaces) continue;
    for (const iface of interfaces) {
      // Skip internal (loopback), non-IPv4, and Tailscale CGNAT (100.64.0.0/10) addresses
      if (!iface.internal && iface.family === 'IPv4') {
        const firstOctet = parseInt(iface.address.split('.')[0], 10);
        const secondOctet = parseInt(iface.address.split('.')[1], 10);
        if (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) continue;
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function sanitizeDownloadName(name: string): string {
  const invalidChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
  const sanitized = [...name]
    .map((ch) => {
      const charCode = ch.charCodeAt(0);
      return invalidChars.has(ch) || charCode < 32 ? '_' : ch;
    })
    .join('')
    .trim();
  return sanitized.length > 0 ? sanitized : 'download';
}

function createWindow(): void {
  // Try multiple possible paths for the logo
  const possibleLogoNames = ['app-logo.png', 'new logo.png', 'app logo.png', 'logo.png', 'tray-icon.png'];
  let iconPath = '';

  for (const name of possibleLogoNames) {
    const p = app.isPackaged
      ? path.join(process.resourcesPath, 'resources', name)
      : path.join(__dirname, '../../resources', name);
    if (fs.existsSync(p)) {
      iconPath = p;
      break;
    }
    // Also check root in dev mode
    const rootP = path.join(app.getAppPath(), name);
    if (fs.existsSync(rootP)) {
      iconPath = rootP;
      break;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'The Inn',
    icon: iconPath ? nativeImage.createFromPath(iconPath) : undefined,
    backgroundColor: '#070504',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
  tray.setToolTip('The Inn');
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
    running: runServerInThisInstance,
    port: DEFAULT_PORT,
  }));

  ipcMain.handle('app:get-bootstrap-config', () => ({
    embeddedInvite: embeddedInviteLink,
    runServer: runServerInThisInstance,
  }));

  ipcMain.handle('update:check', async (): Promise<UpdateCheckResult> => {
    return checkForUpdates();
  });

  ipcMain.handle(
    'app:open-external',
    async (_event: Electron.IpcMainInvokeEvent, payload: { url: string }): Promise<boolean> => {
      try {
        const rawUrl = typeof payload?.url === 'string' ? payload.url : '';
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return false;
        }
        await shell.openExternal(parsed.toString());
        return true;
      } catch {
        return false;
      }
    }
  );

  // Phase 2: Invite management
  ipcMain.handle(
    'invite:create',
    async (
      _event: Electron.IpcMainInvokeEvent,
      options: { expiresInMs: number | null; maxUses: number | null }
    ) => {
      if (!runServerInThisInstance) {
        throw new Error('HOST_DISABLED_IN_THIS_BUILD');
      }
      const token = createInviteToken(options);
      const serverAddress = publicTunnelUrl ?? `${getLocalIPAddress()}:${DEFAULT_PORT}`;
      return { token, serverAddress };
    }
  );

  ipcMain.handle('server:get-address', () => {
    if (!runServerInThisInstance) {
      throw new Error('HOST_DISABLED_IN_THIS_BUILD');
    }
    return publicTunnelUrl ?? `${getLocalIPAddress()}:${DEFAULT_PORT}`;
  });

  // Tailscale status
  ipcMain.handle('tailscale:status', () => ({
    installed: tailscaleInstalled,
    active: tailscaleActive,
    url: publicTunnelUrl,
  }));

  ipcMain.handle(
    'file:download',
    async (
      _event: Electron.IpcMainInvokeEvent,
      payload: { url: string; suggestedName: string }
    ): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }> => {
      try {
        if (!mainWindow) {
          return { ok: false, error: 'Main window is not ready.' };
        }

        const rawUrl = typeof payload?.url === 'string' ? payload.url : '';
        const suggestedName = sanitizeDownloadName(
          typeof payload?.suggestedName === 'string' ? payload.suggestedName : ''
        );
        const parsedUrl = new URL(rawUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          return { ok: false, error: 'Only http/https downloads are supported.' };
        }

        const defaultPath = path.join(app.getPath('downloads'), suggestedName);
        const saveResult = await dialog.showSaveDialog(mainWindow, {
          title: 'Save attachment',
          defaultPath,
          buttonLabel: 'Save',
        });

        if (saveResult.canceled || !saveResult.filePath) {
          return { ok: false, canceled: true };
        }

        const response = await fetch(parsedUrl.toString(), {
          headers: { 'ngrok-skip-browser-warning': '1' },
        });
        if (!response.ok) {
          return { ok: false, error: `Download failed (${response.status}).` };
        }

        const data = await response.arrayBuffer();
        await fs.promises.writeFile(saveResult.filePath, Buffer.from(data));
        return { ok: true, path: saveResult.filePath };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Download failed.',
        };
      }
    }
  );

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

  // Phase 7: Screen sharing IPC
  ipcMain.handle('screen:get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    latestScreenSources.clear();
    for (const source of sources) {
      latestScreenSources.set(source.id, source);
    }
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon?.toDataURL() ?? null,
      display_id: s.display_id,
    }));
  });

  ipcMain.handle(
    'screen:select-source',
    (_event: Electron.IpcMainInvokeEvent, sourceId: string, withAudio: boolean) => {
      pendingScreenSourceId = sourceId;
      pendingScreenAudio = withAudio;
      pendingScreenSource = latestScreenSources.get(sourceId) ?? null;
    }
  );
}

// If a second instance tries to open, focus the existing window and forward deep link
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    const deepLink = extractDeepLinkFromArgv(argv);
    if (deepLink) {
      mainWindow.webContents.send('deep-link:invite', deepLink);
    }
  }
});

app.whenReady().then(() => {
  try {
    setupApplicationMenu();

    embeddedInviteLink = readEmbeddedInviteLink();
    const hostMode = readHostModeFlag();
    // Packaged builds are client by default.
    // Host behavior is opt-in via resources/host-mode.txt.
    if (embeddedInviteLink) {
      runServerInThisInstance = false;
    } else if (app.isPackaged) {
      runServerInThisInstance = hostMode;
    } else {
      runServerInThisInstance = true; // dev convenience
    }

    // 1. Start embedded server (runs in main process, no media passes through)
    if (runServerInThisInstance) {
      startServer(DEFAULT_PORT);
    }

    // 1b. Start Tailscale Funnel (non-blocking, falls back to LAN-only)
    if (runServerInThisInstance) {
      startTailscaleFunnel();
    }

    // Phase 7: Register display media request handler for screen sharing.
    // Must be set before renderer calls getDisplayMedia.
    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        if (!pendingScreenSourceId) {
          callback({});
          return;
        }
        const selectedSourceId = pendingScreenSourceId;
        const selectedAudio = pendingScreenAudio;
        const selectedSource = pendingScreenSource;
        // Clear immediately to avoid race conditions between rapid successive picks.
        pendingScreenSourceId = null;
        pendingScreenAudio = false;
        pendingScreenSource = null;

        if (selectedSource) {
          const config: { video: Electron.DesktopCapturerSource; audio?: 'loopback' } = { video: selectedSource };
          if (selectedAudio) {
            config.audio = 'loopback';
          }
          callback(config);
          return;
        }

        desktopCapturer
          .getSources({ types: ['screen', 'window'] })
          .then((sources) => {
            const source = sources.find((s) => s.id === selectedSourceId);
            if (!source) {
              console.warn(`[screen-share] Selected source not found: ${selectedSourceId}`);
              callback({});
              return;
            }
            const config: { video: Electron.DesktopCapturerSource; audio?: 'loopback' } = { video: source };
            if (selectedAudio) {
              config.audio = 'loopback';
            }
            callback(config);
          })
          .catch(() => {
            callback({});
          });
      }
    );

    // 2. Register IPC handlers
    registerIpcHandlers();
    // 3. Create window and tray
    createWindow();
    createTray();

    // 4. Check for deep link from initial launch argv
    pendingDeepLink = extractDeepLinkFromArgv(process.argv);

    // Flush pending deep link once renderer is ready
    if (mainWindow) {
      mainWindow.webContents.on('did-finish-load', () => {
        if (pendingDeepLink) {
          mainWindow?.webContents.send('deep-link:invite', pendingDeepLink);
          pendingDeepLink = null;
        }
      });
    }
  } catch (err) {
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start: ${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

// Clean up Tailscale Funnel before quitting
app.on('before-quit', () => {
  stopTailscaleFunnel();
});

// Prevent default "quit on all windows closed" — tray keeps the app alive
app.on('window-all-closed', () => {});
