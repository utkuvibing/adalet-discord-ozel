# Phase 1: Foundation - Research

**Researched:** 2026-03-01
**Domain:** Electron Forge vite-typescript scaffold, Drizzle ORM + better-sqlite3, contextBridge preload security
**Confidence:** HIGH (core stack verified via official docs and Context7-equivalent authoritative sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**App Structure**
- Host runs the server AND uses the app in the same window — no separate server process
- Server auto-starts when the host opens the app — no manual "Start Server" button
- Close button minimizes to system tray (like Discord) — app runs in background
- First-time users see a login/connect screen (enter server address + invite code), returning users go straight to the lobby

**Room Defaults**
- Pre-made rooms on first server start — gaming-themed names that fit the retro aesthetic (e.g., "Dungeon", "Arena", "Tavern")
- Host can create, rename, and delete rooms later (Phase 6 delivers the UI for this)
- Room schema should support custom names from the start

**Data & Storage**
- Chat history kept forever — no auto-deletion (it's their own server, disk is cheap)
- Shared files stored in app data folder (AppData on Windows) — clean, out of sight
- No artificial file size limit — self-hosted advantage
- SQLite database in the same app data directory

**Server Access**
- Friends connect via invite link that encodes server address + auth token
- Server runs on a configurable port (default picked by Claude)
- The invite link should work as a URL that opens the app directly if installed

### Claude's Discretion
- Exact default port number
- System tray icon design (can be placeholder for v1)
- SQLite schema details beyond what's specified in requirements
- ESLint/Prettier configuration details
- Exact folder structure and file organization
- Splash screen timing and animation (if any)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFR-01 | Server runs on host's own PC with zero external paid services | Electron main process embeds Express + Socket.io server; better-sqlite3 stores all data locally; no cloud dependency |
| INFR-02 | Friends connect via desktop app (Electron) to host's server | Electron Forge vite-typescript scaffold creates the distributable client app; contextBridge preload bridges UI to Node.js APIs securely |
| INFR-03 | Voice/video flows peer-to-peer (WebRTC) — server never handles media | Architecture established in Phase 1: Socket.io server in main process handles signaling only; WebRTC P2P connections happen in renderer via Chromium's built-in WebRTC stack |
</phase_requirements>

---

## Summary

Phase 1 establishes the entire skeleton that all future phases build on. There are two plans: (01-01) the Electron Forge scaffold with shared types and lint tooling, and (01-02) the SQLite schema with Drizzle ORM and the contextBridge preload. Every architectural decision made here — IPC shape, DB schema design, file structure — locks in patterns that are expensive to retrofit.

The critical security constraint is that `contextIsolation: true` and `nodeIntegration: false` must be set in Phase 1. These are now Electron defaults (since Electron 12), but they must be explicitly confirmed in the BrowserWindow config and never overridden. The preload must expose only named, typed wrapper functions — never `ipcRenderer` itself. The project stack (Electron 40, Forge vite-typescript, better-sqlite3 12.6.2+, Drizzle ORM 0.38.x) has known compatibility requirements that must be respected during scaffold.

The main Electron-specific pitfall for this phase is native module handling: better-sqlite3 is a native addon that must be rebuilt against Electron's V8 version using `electron-rebuild`, and it must be listed as `external` in Vite's rollup config so Vite doesn't attempt to bundle it. Drizzle migrations in a packaged Electron app have a known path resolution issue that requires environment-aware path detection (`app.isPackaged`) to solve correctly.

**Primary recommendation:** Scaffold with `npx create-electron-app@latest sex-dungeon -- --template=vite-typescript`, immediately lock down BrowserWindow security options, mark `better-sqlite3` as Vite external, run `electron-rebuild`, then build the Drizzle schema. Do these steps in order — retrofitting security or native module config mid-phase is painful.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron | ^40.x | Desktop app shell + Node.js runtime | Ships Chromium 128+ with full WebRTC support; contextBridge is a security default; v40 is latest stable as of research date |
| Electron Forge | ^7.x | Scaffold, dev server, build, package | Official Electron tool; vite-typescript template is the current recommended path (replaces legacy Webpack template) |
| @electron-forge/plugin-vite | ^7.x | Vite integration for Forge | Provides separate Vite builds for main, preload, renderer; HMR in all three processes |
| Vite | ^6.x | Build tool (renderer + preload + main) | Required by Forge's Vite plugin; dramatically faster than Webpack; HMR reduces iteration time |
| TypeScript | ^5.x | Language | End-to-end type safety across main/preload/renderer/server; catches IPC contract bugs at compile time |
| React | ^19.x | Renderer UI framework | Targeted by Electron Forge's template; compatible with Electron 40; no known issues |
| better-sqlite3 | ^12.6.2 | Local SQLite (main process only) | Synchronous API — correct for Electron main process; v12.4.2+ fixed Electron 39/40 V8 compatibility break; versions before 12.4.2 fail to build |
| Drizzle ORM | ^0.38.x | SQL query builder + schema manager | Type-safe SQL; ~7.4KB; no binary engine (Prisma's binary engine breaks Electron packaging); schema as TypeScript code |
| drizzle-kit | ^0.28.x | Schema migration CLI | `drizzle-kit push` for dev; `drizzle-kit generate` + runtime `migrate()` for production |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| electron-rebuild | ^3.x | Rebuild native addons | Required after every `npm install` when better-sqlite3 is a dep; automate in `postinstall` script |
| @types/better-sqlite3 | latest | TypeScript types for better-sqlite3 | Dev dependency; always install alongside better-sqlite3 |
| ESLint | ^9.x | Linting | Use flat config (eslint.config.mjs); ESLint 9 is now the default; v8 is deprecated |
| typescript-eslint | ^8.x | TypeScript linting rules | Provides `tseslint.configs.recommended`; use with ESLint 9 flat config |
| Prettier | ^3.x | Code formatting | Separate from ESLint (do NOT use eslint-plugin-prettier — it slows lint); run Prettier independently |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle ORM | Prisma | Prisma's binary engine breaks Electron packaging; multiple real-world Electron developers switched away from it. Never use Prisma here. |
| Drizzle ORM | Raw better-sqlite3 | Acceptable for 1-2 tables; with users/rooms/messages/invite_tokens, Drizzle's type safety prevents category of bugs |
| better-sqlite3 | sql.js | sql.js is pure JS (no native rebuild needed) but stores data in memory only — must manually serialize to disk, losing crash safety |
| ESLint 9 flat config | .eslintrc.js (v8 style) | ESLint 8 is deprecated; flat config is the future; use flat config from day one |
| Vite external for better-sqlite3 | Bundling it | Vite cannot bundle native .node addons; marking as external is mandatory |

**Installation:**
```bash
# Step 1: Scaffold
npx create-electron-app@latest sex-dungeon -- --template=vite-typescript
cd sex-dungeon

# Step 2: Core runtime dependencies
npm install better-sqlite3 drizzle-orm
npm install react react-dom

# Step 3: Dev dependencies
npm install -D drizzle-kit @types/better-sqlite3
npm install -D electron-rebuild
npm install -D eslint @eslint/js typescript-eslint prettier
npm install -D @types/react @types/react-dom

# Step 4: Rebuild native addons against Electron's V8
npx electron-rebuild

# Step 5: Add postinstall hook to package.json so rebuild runs automatically
# "postinstall": "electron-rebuild"
```

---

## Architecture Patterns

### Recommended Project Structure

```
sex-dungeon/
├── src/
│   ├── main.ts                    # Electron main process entry (BrowserWindow, Tray, IPC handlers, server start)
│   ├── preload.ts                 # contextBridge API surface — only named wrappers, no raw ipcRenderer
│   ├── renderer.ts                # Renderer entry point (mounts React)
│   ├── App.tsx                    # Root React component
│   │
│   ├── server/                    # Node.js server (runs inside main process)
│   │   ├── index.ts               # Express + Socket.io setup — called from main.ts on app ready
│   │   └── db/
│   │       ├── schema.ts          # Drizzle table definitions (users, rooms, messages, invite_tokens)
│   │       ├── client.ts          # better-sqlite3 singleton + drizzle() initialization
│   │       └── migrate.ts         # Runtime migration runner (environment-aware path)
│   │
│   ├── renderer/                  # React UI (Chromium renderer process)
│   │   ├── pages/
│   │   │   ├── Connect.tsx        # First-time: enter server address + invite code
│   │   │   └── Lobby.tsx          # Returning user: room list
│   │   └── store/
│   │       └── index.ts           # Zustand store (client state)
│   │
│   └── shared/                    # Types shared between main and renderer (no Node.js imports)
│       ├── types.ts               # User, Room, Message, InviteToken interfaces
│       └── events.ts              # Socket.io event name constants
│
├── drizzle/                       # Generated migration SQL files (do NOT edit manually)
├── resources/                     # Static assets: tray icon (tray-icon.png), app icon
│
├── forge.config.ts                # Electron Forge configuration
├── vite.main.config.ts            # Vite config for main process
├── vite.preload.config.ts         # Vite config for preload script
├── vite.renderer.config.ts        # Vite config for renderer (React)
├── drizzle.config.ts              # Drizzle Kit config (points to schema, outputs migrations)
├── eslint.config.mjs              # ESLint 9 flat config
├── .prettierrc                    # Prettier config
└── tsconfig.json                  # Root TypeScript config
```

**Structure rationale:**
- `src/server/` inside `src/` (not a top-level `server/`) because Electron Forge's Vite plugin builds everything from `src/`. The server runs in the main process — it is not a separate build target.
- `src/shared/` contains only plain TypeScript types and constants — no `import from 'electron'` or `import from 'better-sqlite3'`. This file is imported by both main and renderer safely.
- `drizzle/` migrations live at project root so `drizzle-kit push` works in development without extra config.

---

### Pattern 1: Electron Forge Vite Plugin Configuration

**What:** The Forge Vite plugin produces three separate Vite builds: main process, preload script, and renderer. Each has its own config file. `better-sqlite3` must be marked external in the main config.

**When to use:** Always — this is the only way to use Vite with Electron Forge correctly.

**Example:**
```typescript
// forge.config.ts
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Sex Dungeon',
    executableName: 'sex-dungeon',
    icon: './resources/app-icon',
  },
  rebuildConfig: {
    // Tell Forge to rebuild better-sqlite3 for the packaged Electron version
    onlyModules: ['better-sqlite3'],
    force: true,
  },
  makers: [new MakerSquirrel({ name: 'SexDungeon' })],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts',    config: 'vite.main.config.ts' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts' },
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.ts' },
      ],
    }),
  ],
};

export default config;
```

```typescript
// vite.main.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      // better-sqlite3 is a native .node addon — Vite cannot bundle it
      // Mark as external so it is require()'d at runtime from node_modules
      external: ['better-sqlite3'],
    },
  },
});
```

```typescript
// vite.preload.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron'],
    },
  },
});
```

```typescript
// vite.renderer.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

Source: https://www.electronforge.io/config/plugins/vite (HIGH confidence)

---

### Pattern 2: BrowserWindow Security Configuration

**What:** Set `contextIsolation: true` (default) and `nodeIntegration: false` (default) explicitly — never rely on defaults for security-critical settings. Set `backgroundColor` to dark to prevent white flash on load.

**When to use:** Every BrowserWindow created in this app. These settings must never be overridden.

**Example:**
```typescript
// src/main.ts — Source: https://www.electronjs.org/docs/latest/api/context-bridge (HIGH confidence)
import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { startServer } from './server/index';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const DEFAULT_PORT = 7432; // Chosen: memorable, not commonly used

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Sex Dungeon',
    backgroundColor: '#0d0d0d',   // Dark background prevents white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,     // MUST be true — isolates preload from renderer
      nodeIntegration: false,     // MUST be false — renderer has no Node.js access
      sandbox: false,             // false required for preload to use Node APIs
    },
  });

  // Intercept close — minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow?.hide();
  });

  // In dev: load Vite dev server URL
  // In prod: load built index.html
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../../resources/tray-icon.png')
  );
  tray = new Tray(icon);
  tray.setToolTip('Sex Dungeon');
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.quit(); } },
    ])
  );
}

app.whenReady().then(() => {
  // 1. Start embedded server
  startServer(DEFAULT_PORT);
  // 2. Create window and tray
  createWindow();
  createTray();
});

// Prevent default "quit on all windows closed" behavior — tray keeps it alive
app.on('window-all-closed', (event: Event) => {
  event.preventDefault();
});
```

---

### Pattern 3: contextBridge Preload — Named Wrappers Only

**What:** The preload script is the ONLY file that can import from `'electron'`. It exposes a typed API to the renderer via `contextBridge.exposeInMainWorld`. Never expose `ipcRenderer` directly — always wrap each IPC call in a named function.

**When to use:** All renderer-to-main communication. This pattern is extended each phase to add new API methods.

**Example:**
```typescript
// src/preload.ts — Source: https://www.electronjs.org/docs/latest/api/context-bridge (HIGH confidence)
import { contextBridge, ipcRenderer } from 'electron';

// Define the API surface here — renderer gets ONLY these methods
const electronAPI = {
  // Example: window management
  minimizeToTray: () => ipcRenderer.send('window:minimize-to-tray'),

  // Example: server health check (returns Promise)
  getServerStatus: () => ipcRenderer.invoke('server:status'),

  // Example: event subscription (renderer listens for main-initiated events)
  onServerReady: (callback: (port: number) => void) => {
    ipcRenderer.on('server:ready', (_event, port) => callback(port));
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

```typescript
// src/shared/types.ts — Window augmentation (included by renderer tsconfig)
export interface ElectronAPI {
  minimizeToTray: () => void;
  getServerStatus: () => Promise<{ running: boolean; port: number }>;
  onServerReady: (callback: (port: number) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

**Usage in renderer:**
```typescript
// Renderer code — type-safe, no direct Electron import needed
const status = await window.electronAPI.getServerStatus();
```

Source: https://www.electronjs.org/docs/latest/api/context-bridge (HIGH confidence)

---

### Pattern 4: Drizzle Schema + Client Initialization

**What:** Define tables in `src/server/db/schema.ts` using Drizzle's sqlite-core builders. Initialize better-sqlite3 and drizzle in `src/server/db/client.ts` with a path based on `app.isPackaged` + `app.getPath('userData')`. Run migrations at startup.

**When to use:** Database initialization on every app start, before the server begins accepting connections.

**Example:**
```typescript
// src/server/db/schema.ts — Source: https://orm.drizzle.team/docs/column-types/sqlite (HIGH confidence)
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id:          integer().primaryKey({ autoIncrement: true }),
  username:    text().notNull().unique(),
  displayName: text().notNull(),
  avatarUrl:   text(),
  sessionToken: text().unique(),
  createdAt:   integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const rooms = sqliteTable('rooms', {
  id:        integer().primaryKey({ autoIncrement: true }),
  name:      text().notNull().unique(),          // e.g. "Dungeon", "Arena", "Tavern"
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  isDefault: integer({ mode: 'boolean' }).notNull().default(false),
});

export const messages = sqliteTable('messages', {
  id:        integer().primaryKey({ autoIncrement: true }),
  roomId:    integer().notNull().references(() => rooms.id),
  userId:    integer().notNull().references(() => users.id),
  content:   text().notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const inviteTokens = sqliteTable('invite_tokens', {
  id:        integer().primaryKey({ autoIncrement: true }),
  token:     text().notNull().unique(),
  usedBy:    integer().references(() => users.id),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  expiresAt: integer({ mode: 'timestamp' }),     // null = never expires
  isRevoked: integer({ mode: 'boolean' }).notNull().default(false),
});
```

```typescript
// src/server/db/client.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import * as schema from './schema';

// Use userData directory (AppData/Local/sex-dungeon on Windows) in production
// Use a dev-named file in development to avoid corrupting prod data
const dbPath = app.isPackaged
  ? path.join(app.getPath('userData'), 'sex-dungeon.db')
  : path.join(app.getPath('userData'), 'sex-dungeon.dev.db');

const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

export const db = drizzle({ client: sqlite, schema });
```

```typescript
// src/server/db/migrate.ts — environment-aware migration path
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import path from 'node:path';
import { db } from './client';

export function runMigrations() {
  // In development: migrations are in project root /drizzle
  // In production (packaged): migrations are bundled in app resources
  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.join(app.getAppPath(), 'drizzle');

  migrate(db, { migrationsFolder });
}
```

```typescript
// drizzle.config.ts — used by drizzle-kit CLI only (not imported at runtime)
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema.ts',
  out:    './drizzle',
  dialect: 'sqlite',
  // Note: no 'dbCredentials' needed here — drizzle-kit push uses this for dev only
} satisfies Config;
```

Source: https://orm.drizzle.team/docs/get-started-sqlite + https://orm.drizzle.team/docs/migrations (HIGH confidence)

---

### Pattern 5: Default Rooms Seeding

**What:** On first server start, check if the `rooms` table is empty and seed the default gaming-themed rooms. Run after migrations.

**Example:**
```typescript
// src/server/db/seed.ts
import { db } from './client';
import { rooms } from './schema';
import { eq, count } from 'drizzle-orm';

const DEFAULT_ROOMS = ['Dungeon', 'Arena', 'Tavern'];

export function seedDefaultRooms() {
  const [{ total }] = db.select({ total: count() }).from(rooms).all();
  if (total === 0) {
    for (const name of DEFAULT_ROOMS) {
      db.insert(rooms).values({ name, isDefault: true }).run();
    }
  }
}
```

---

### Pattern 6: Embedded Server Startup

**What:** The Socket.io + Express server starts inside the Electron main process when the app is ready. It runs on a configurable port, defaulting to 7432.

**Example:**
```typescript
// src/server/index.ts
import express from 'express';
import { createServer } from 'node:http';
import { Server as SocketIO } from 'socket.io';
import { runMigrations } from './db/migrate';
import { seedDefaultRooms } from './db/seed';

export function startServer(port: number) {
  runMigrations();
  seedDefaultRooms();

  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIO(httpServer, {
    cors: { origin: '*' }, // Acceptable for LAN-only signaling
  });

  // Placeholder event handlers — extended in Phase 2
  io.on('connection', (socket) => {
    console.log(`[server] client connected: ${socket.id}`);
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[server] running on port ${port}`);
  });

  return { io, httpServer };
}
```

---

### Pattern 7: ESLint 9 Flat Config

**What:** Use ESLint 9's flat config format (`eslint.config.mjs`) with typescript-eslint. Run Prettier separately — do not integrate it into ESLint.

**Example:**
```javascript
// eslint.config.mjs — Source: https://typescript-eslint.io/getting-started/ (HIGH confidence)
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // Relax rules that are overly strict for an Electron project
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',  // 'as any' needed for Electron media constraints
      '@typescript-eslint/no-require-imports': 'off', // CommonJS require() used in Electron main
    },
  },
  {
    // Ignore build output
    ignores: ['.vite/**', 'out/**', 'drizzle/**'],
  }
);
```

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

### Anti-Patterns to Avoid

- **`nodeIntegration: true`**: Gives the renderer full Node.js access. Any XSS vulnerability becomes a full system compromise. Never set this.
- **Exposing raw `ipcRenderer` in preload**: Allows renderer to send arbitrary IPC messages to main process. Always wrap in named functions.
- **Importing `electron` or `better-sqlite3` in renderer code**: These are main-process-only modules. If imported in renderer, the build will fail or produce broken output.
- **Using `drizzle-kit` at runtime**: drizzle-kit is a CLI dev tool. Call `migrate()` (drizzle-orm's runtime migrator) at startup. Never shell out to drizzle-kit from main process.
- **Hardcoding `process.cwd()` for DB path**: Will break in packaged app. Always use `app.getPath('userData')`.
- **Not calling `event.preventDefault()` in `app.on('window-all-closed')`**: Default Electron behavior quits the app when all windows close. Without this, closing the window quits instead of going to tray.
- **Forgetting `npx electron-rebuild` after adding better-sqlite3**: The native addon is built for the local Node.js version, not Electron's. The app will fail to start with a V8 API mismatch error.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite schema management | Hand-written CREATE TABLE SQL + manual version tracking | Drizzle ORM + drizzle-kit | Type-safe, migration history, no manual SQL diff |
| Window ↔ main process communication | Custom WebSocket or global variables | Electron IPC (ipcMain.handle / ipcRenderer.invoke) via contextBridge | Battle-tested, works across processes, type-safe with TypeScript |
| Desktop database path resolution | Hardcoded path strings | `app.getPath('userData')` | Cross-platform, survives app updates, standard location |
| Tray icon management | Custom OS API calls | Electron's `Tray` class | Handles Windows 11 quirks, icon association, tooltip |
| TypeScript compilation for multiple Electron processes | Custom build scripts | Electron Forge Vite plugin (three separate Vite configs) | Correct process isolation, HMR, proper externals |
| Native module compilation against Electron | Manual node-gyp invocations | `electron-rebuild` + `rebuildConfig` in forge.config.ts | Handles Electron ABI targeting correctly |

**Key insight:** The Electron process boundary (main/preload/renderer) creates a complexity that each of these tools specifically solves. Rolling custom solutions almost always results in security holes or build failures.

---

## Common Pitfalls

### Pitfall 1: better-sqlite3 V8 Mismatch

**What goes wrong:** App launches, then crashes immediately with an error like `The module '/path/to/better_sqlite3.node' was compiled against a different Node.js version`.

**Why it happens:** better-sqlite3 is a native addon compiled for a specific V8 API version. npm installs the version compiled for the local Node.js. Electron ships its own V8 version (different from system Node.js).

**How to avoid:** Run `npx electron-rebuild` after every `npm install`. Add `"postinstall": "electron-rebuild"` to package.json scripts. Pin to `better-sqlite3 >= 12.6.2` (versions before 12.4.2 fail with Electron 39/40 due to `Context::GetIsolate` deprecation).

**Warning signs:** App crashes immediately on startup, not in renderer. Error mentions `.node` file or `NODE_MODULE_VERSION`.

---

### Pitfall 2: Drizzle Migration Path Breaks in Packaged App

**What goes wrong:** App works in development (`npm start`) but after packaging with `npm run make`, the app crashes with `Can't find meta/_journal.json file at readMigrationFiles`.

**Why it happens:** In development, `drizzle/` is at the project root. In the packaged app, the project root doesn't exist — code runs from inside an `asar` archive or a temp directory. The migration folder must be explicitly bundled as an app resource.

**How to avoid:** Use environment-aware path resolution:
```typescript
const migrationsFolder = app.isPackaged
  ? path.join(process.resourcesPath, 'drizzle')
  : path.join(app.getAppPath(), 'drizzle');
```
Add the `drizzle/` directory to Electron Forge's `extraResources` in forge.config.ts:
```typescript
packagerConfig: {
  extraResources: [{ from: './drizzle', to: 'drizzle' }],
}
```

**Warning signs:** Works in `npm start`, breaks after `npm run make`. Error mentions `_journal.json` or migration files not found.

---

### Pitfall 3: `app.on('window-all-closed')` Quits the App

**What goes wrong:** User closes the window. App disappears from taskbar AND tray. App is completely dead.

**Why it happens:** Electron's default `window-all-closed` behavior on Windows and Linux quits the app. The tray icon is created after, but if the app quits first, the tray never gets a chance to keep it alive.

**How to avoid:**
```typescript
app.on('window-all-closed', (event: Event) => {
  // Prevent default quit behavior — let the tray keep the app alive
  event.preventDefault();
});
```
The actual quit should only happen via the tray context menu's "Quit" item, which calls `app.quit()`.

**Warning signs:** Tray icon disappears when window is closed. App process not visible in Task Manager after window close.

---

### Pitfall 4: Importing Server-Side Modules in Shared Types

**What goes wrong:** `src/shared/types.ts` imports something from `'better-sqlite3'` or `'electron'`. The renderer build fails because those modules are not available in the browser/Chromium context.

**Why it happens:** `shared/` types are imported by both main and renderer. If they pull in any Node.js-only module, the renderer Vite build fails.

**How to avoid:** `src/shared/` files must contain only pure TypeScript types and string constants. No imports from `electron`, `better-sqlite3`, `node:*`, or any other Node.js module. If you need to share an enum or interface that references an Electron type, extract just the value (e.g., use a string literal type instead of `import type { App } from 'electron'`).

**Warning signs:** Renderer build fails with `Cannot find module 'electron'` or similar. Build works in main but not renderer.

---

### Pitfall 5: White Flash on Window Load

**What goes wrong:** Window appears briefly white before the dark React UI loads. Jarring visual experience, especially with a retro/dark aesthetic.

**Why it happens:** Electron shows the window before the web page renders. The default background is white.

**How to avoid:** Set `backgroundColor: '#0d0d0d'` (or the darkest color in the app's palette) in BrowserWindow options. The window will show the background color while the page loads, eliminating the white flash.

**Warning signs:** Window flashes white for a fraction of a second when opening.

---

### Pitfall 6: `vite.renderer.config.ts` Missing React Plugin

**What goes wrong:** `.tsx` files fail to compile; JSX syntax causes build errors in the renderer.

**Why it happens:** Vite does not process JSX by default. The `@vitejs/plugin-react` plugin must be added to the renderer Vite config specifically. The main and preload configs must NOT include the React plugin.

**How to avoid:** Add `@vitejs/plugin-react` to `vite.renderer.config.ts` only. Install: `npm install -D @vitejs/plugin-react`.

---

## Code Examples

### Complete preload.ts with TypeScript types

```typescript
// src/preload.ts — establishes the IPC API surface for Phase 1
// Source: https://www.electronjs.org/docs/latest/api/context-bridge (HIGH confidence)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Phase 1 — Foundation IPC surface (intentionally minimal)
  // Extended each phase to add new capability

  // Window management
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  quitApp: () => ipcRenderer.send('app:quit'),

  // Server status (invoked once on startup, used by Connect.tsx to know server is ready)
  getServerStatus: (): Promise<{ running: boolean; port: number }> =>
    ipcRenderer.invoke('server:get-status'),

  // Subscribe to server-ready notification
  onServerReady: (callback: (port: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, port: number) => callback(port);
    ipcRenderer.on('server:ready', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('server:ready', handler);
  },
} as const);
```

### Database client singleton

```typescript
// src/server/db/client.ts
// Source: https://orm.drizzle.team/docs/get-started-sqlite (HIGH confidence)
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;

  const dbPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'sex-dungeon.db')
    : path.join(app.getPath('userData'), 'sex-dungeon.dev.db');

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  _db = drizzle({ client: sqlite, schema });
  return _db;
}

// Export a top-level convenience — call after app is ready
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  },
});
```

### package.json scripts

```json
{
  "scripts": {
    "start": "electron-forge start",
    "build": "electron-forge build",
    "package": "electron-forge package",
    "make": "electron-forge make",
    "lint": "eslint src --ext .ts,.tsx",
    "format": "prettier --write src",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "postinstall": "electron-rebuild"
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Electron Forge Webpack template | Electron Forge Vite template | Forge v7.5+ (2024) | 5-10x faster build times; HMR in all processes; Webpack template now legacy |
| `.eslintrc.js` (ESLint 8) | `eslint.config.mjs` flat config (ESLint 9) | ESLint 9 (April 2024) | Single config file, no "extends" chains, explicit control |
| `nodeIntegration: true` (old Electron tutorials) | `contextIsolation: true` + contextBridge | Electron 12 (2021) | contextIsolation is now the default; old tutorials using nodeIntegration are security vulnerabilities |
| better-sqlite3 < 12.4.2 | better-sqlite3 >= 12.6.2 | November 2025 | Fixes V8 `Context::GetIsolate` deprecation crash on Electron 39/40 |
| Prisma ORM in Electron | Drizzle ORM | 2023-2024 | Prisma binary engine breaks packaging; Drizzle has no binary engine |

**Deprecated / outdated:**
- `electron-store` for anything other than simple key-value settings: Use better-sqlite3 for queryable data
- `feross/simple-peer`: Unmaintained since 2021; use PeerJS 1.5.x
- `eslint-plugin-prettier`: Merging Prettier into ESLint is discouraged; run them separately
- Webpack in Electron Forge: Replaced by Vite template; Webpack template is the "legacy" path in official docs

---

## Open Questions

1. **Socket.io server on loopback vs 0.0.0.0**
   - What we know: Server must be reachable by LAN clients (friends connecting to the host's IP). Binding to `127.0.0.1` would prevent external connections.
   - What's unclear: Whether binding to `0.0.0.0` causes Windows Defender Firewall prompts on first run.
   - Recommendation: Bind to `0.0.0.0` in production. In development, `127.0.0.1` is fine. Document that Windows Firewall may prompt on first external connection — this is expected behavior, not a bug.

2. **Drizzle migration bundling in `asar`**
   - What we know: `asar` archives are read-only; migration files need to be readable at runtime. The `extraResources` approach (copies `drizzle/` outside the asar) is the correct pattern.
   - What's unclear: Whether Electron Forge's `asar.unpack` option is an alternative (allows specific files to be excluded from asar compression while still in the resources directory).
   - Recommendation: Use `extraResources` in Phase 1. If packaging issues arise, investigate `asar.unpack` as an alternative.

3. **Windows Firewall prompt for server port**
   - What we know: When an app binds a server port on Windows, the OS may show a "Windows Defender Firewall has blocked some features" dialog on first run.
   - What's unclear: Whether Electron apps trigger this dialog and how to suppress it or guide users through it.
   - Recommendation: Document this as expected first-run behavior. Users should allow access for the app to function on LAN. Phase 2 can add a first-run onboarding message explaining this.

4. **Default port selection**
   - Claude's discretion: `7432` is recommended — above the privileged port range (1024), not a commonly used well-known service port, reasonably memorable. Verify it's not in use by common software before finalizing.
   - Alternative: `4273` or `5678` (equally valid choices).

---

## Sources

### Primary (HIGH confidence)
- https://www.electronforge.io/config/plugins/vite — Electron Forge Vite plugin configuration, entry points, external modules
- https://www.electronjs.org/docs/latest/api/context-bridge — contextBridge.exposeInMainWorld API, security constraints
- https://www.electronjs.org/docs/latest/api/browser-window — BrowserWindow constructor options including backgroundColor, close event
- https://orm.drizzle.team/docs/column-types/sqlite — SQLite column types (integer modes, text, blob)
- https://orm.drizzle.team/docs/migrations — drizzle-kit push vs migrate, runtime migrate() function
- https://typescript-eslint.io/getting-started/ — ESLint 9 flat config with typescript-eslint

### Secondary (MEDIUM confidence)
- https://github.com/drizzle-team/drizzle-orm/discussions/1891 — Drizzle migration path resolution in Electron packaged apps
- https://www.electronjs.org/docs/latest/tutorial/tutorial-preload — Preload script security patterns
- https://www.electronforge.io/templates/vite-+-typescript — Scaffold command, template status

### Tertiary (LOW confidence — needs validation)
- Community guidance on `extraResources` for migration bundling: Mentioned in multiple sources but official Forge docs not checked directly. Validate during implementation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against official sources; compatibility constraints verified against GitHub issues
- Architecture: HIGH — Electron's process model is official documentation; patterns are from official Electron docs
- Pitfalls: HIGH for items 1-3 (confirmed by GitHub issues and official docs); MEDIUM for items 4-6 (confirmed by general Electron/Vite behavior)
- Drizzle migration bundling: MEDIUM — the environment-aware pattern is correct but extraResources bundling in Forge needs validation at package time

**Research date:** 2026-03-01
**Valid until:** 2026-05-01 (stack is stable; Drizzle and ESLint evolve faster — re-verify in 60 days)
