# Codebase Structure

**Analysis Date:** 2026-03-02

## Directory Layout

```
sex-dungeon/
├── src/
│   ├── main.ts                    # Electron main process entry point
│   ├── preload.ts                 # Preload script (contextBridge IPC surface)
│   ├── renderer.ts                # Renderer entry (bootstraps React)
│   ├── App.tsx                    # Root React component (routing, session restore)
│   ├── index.css                  # Global CSS reset
│   ├── server/
│   │   ├── index.ts               # Express + Socket.IO server bootstrap
│   │   ├── signaling.ts           # Socket.IO event handlers (rooms, chat, WebRTC relay)
│   │   ├── invite.ts              # Invite token CRUD operations
│   │   ├── user.ts                # User CRUD operations
│   │   ├── upload.ts              # File upload routes (multer + Express)
│   │   ├── middleware/
│   │   │   └── auth.ts            # Socket.IO auth middleware (3 auth flows)
│   │   └── db/
│   │       ├── schema.ts          # Drizzle ORM table definitions
│   │       ├── client.ts          # SQLite client singleton (lazy init, WAL mode)
│   │       ├── migrate.ts         # Drizzle migration runner
│   │       └── seed.ts            # Default room seeder
│   ├── renderer/
│   │   ├── theme.ts               # Color and font token definitions
│   │   ├── context/
│   │   │   └── SocketContext.tsx   # React context for Socket.IO connection
│   │   ├── hooks/
│   │   │   ├── useSocket.ts       # Socket.IO client lifecycle hook
│   │   │   ├── useWebRTC.ts       # WebRTC peer connection management hook
│   │   │   └── useAudio.ts        # Audio pipeline hook (mic, remote audio, VAD)
│   │   ├── components/
│   │   │   ├── JoinServer.tsx     # Login/join form (host mode + invite mode)
│   │   │   ├── Lobby.tsx          # Main app layout (sidebar + content area)
│   │   │   ├── RoomList.tsx       # Room sidebar with create/delete/join
│   │   │   ├── RoomMembers.tsx    # Member list with voice state indicators
│   │   │   ├── ChatPanel.tsx      # Chat message feed + input bar + file upload
│   │   │   ├── VoiceControls.tsx  # Mute/deafen/PTT controls bar
│   │   │   ├── VolumePopup.tsx    # Per-user volume slider (right-click popup)
│   │   │   ├── InvitePanel.tsx    # Host-only invite link generator
│   │   │   └── ConnectionToast.tsx # Reconnecting toast notification
│   │   └── utils/
│   │       └── notificationSounds.ts # Programmatic join/leave sound effects
│   └── shared/
│       ├── types.ts               # All shared TypeScript interfaces + Socket.IO event maps
│       ├── events.ts              # Socket.IO event name constants
│       ├── iceConfig.ts           # STUN/TURN server configuration
│       └── avatars.ts             # Emoji avatar preset definitions
├── drizzle/
│   ├── 0000_daily_ender_wiggin.sql    # Initial migration
│   ├── 0001_glamorous_killmonger.sql  # Second migration
│   ├── 0002_stormy_fixer.sql          # Third migration
│   └── meta/
│       ├── _journal.json              # Migration journal
│       ├── 0000_snapshot.json         # Schema snapshot
│       ├── 0001_snapshot.json
│       └── 0002_snapshot.json
├── resources/
│   └── tray-icon.png              # System tray icon
├── uploads/                       # Runtime: uploaded files stored here (dev mode)
├── index.html                     # HTML shell for renderer
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── forge.config.ts                # Electron Forge build/package configuration
├── forge.env.d.ts                 # Forge type declarations
├── drizzle.config.ts              # Drizzle Kit configuration
├── eslint.config.mjs              # ESLint configuration
├── vite.main.config.ts            # Vite config for main process bundle
├── vite.preload.config.ts         # Vite config for preload script bundle
└── vite.renderer.config.mts       # Vite config for renderer bundle
```

## Directory Purposes

**`src/server/`:**
- Purpose: Embedded HTTP + WebSocket server (runs in Electron main process)
- Contains: Express routes, Socket.IO event handlers, auth middleware, DB access layer
- Key files: `index.ts` (bootstrap), `signaling.ts` (all real-time event handling), `middleware/auth.ts` (authentication)

**`src/server/db/`:**
- Purpose: SQLite database access via Drizzle ORM
- Contains: Schema definitions, client singleton, migration runner, seed data
- Key files: `schema.ts` (4 tables: users, rooms, messages, inviteTokens), `client.ts` (lazy-init singleton)

**`src/renderer/`:**
- Purpose: React UI layer (runs in Electron renderer process)
- Contains: Components, hooks, context providers, utilities, theme tokens
- Organization: By type (components/, hooks/, context/, utils/)

**`src/renderer/hooks/`:**
- Purpose: Custom React hooks encapsulating complex stateful logic
- Contains: Socket.IO connection, WebRTC peer management, audio pipeline with VAD
- Key files: `useWebRTC.ts` (Perfect Negotiation), `useAudio.ts` (mic + remote audio + VAD)

**`src/renderer/components/`:**
- Purpose: React UI components (functional components with inline styles)
- Contains: 9 components covering the full UI surface
- Key files: `Lobby.tsx` (main layout, orchestrates hooks), `ChatPanel.tsx` (chat + file upload)

**`src/shared/`:**
- Purpose: Code shared between main process and renderer (must be environment-agnostic)
- Contains: TypeScript interfaces, Socket.IO event definitions, ICE config, avatar data
- Rule: No imports from `electron`, `better-sqlite3`, or `node:*`

**`drizzle/`:**
- Purpose: SQL migration files generated by Drizzle Kit
- Contains: Numbered `.sql` migration files and JSON metadata/snapshots
- Generated: Yes (via `drizzle-kit generate`)
- Committed: Yes (bundled into packaged app via `extraResources`)

**`resources/`:**
- Purpose: Static assets for the Electron app shell
- Contains: Tray icon PNG
- Committed: Yes (bundled into packaged app via `extraResources`)

**`uploads/`:**
- Purpose: Runtime directory for user-uploaded files
- Generated: Yes (created at runtime by `src/server/upload.ts`)
- Committed: No (runtime data)

## Key File Locations

**Entry Points:**
- `src/main.ts`: Electron main process -- starts server, creates window, registers IPC
- `src/preload.ts`: Preload script -- exposes `window.electronAPI` via contextBridge
- `src/renderer.ts`: Renderer bootstrap -- creates React root, renders `<App />`
- `src/App.tsx`: Root React component -- session restore, SocketProvider, view routing
- `src/server/index.ts`: Server bootstrap -- Express, Socket.IO, DB init

**Configuration:**
- `package.json`: Dependencies, scripts, app metadata (version 1.0.8)
- `tsconfig.json`: TypeScript compiler options
- `forge.config.ts`: Electron Forge packaging (Squirrel maker, native module hooks, asar config)
- `drizzle.config.ts`: Drizzle Kit schema/migration configuration
- `vite.main.config.ts`: Vite bundler config for main process
- `vite.preload.config.ts`: Vite bundler config for preload script
- `vite.renderer.config.mts`: Vite bundler config for renderer (React plugin)
- `eslint.config.mjs`: ESLint flat config

**Core Server Logic:**
- `src/server/signaling.ts`: All Socket.IO event handlers (422 lines) -- room management, WebRTC relay, chat, presence
- `src/server/middleware/auth.ts`: Three-flow authentication middleware
- `src/server/invite.ts`: Invite token generation and validation
- `src/server/user.ts`: User creation and session lookup
- `src/server/upload.ts`: File upload via multer with Socket.IO broadcast

**Core Renderer Logic:**
- `src/renderer/hooks/useWebRTC.ts`: Perfect Negotiation WebRTC peer management (283 lines)
- `src/renderer/hooks/useAudio.ts`: Full audio pipeline -- mic, remote audio, VAD, volume (630 lines)
- `src/renderer/hooks/useSocket.ts`: Socket.IO client connection lifecycle (147 lines)
- `src/renderer/components/Lobby.tsx`: Main app layout, orchestrates WebRTC + audio hooks (314 lines)
- `src/renderer/components/ChatPanel.tsx`: Chat feed, file upload, lightbox (593 lines)

**Shared Type Definitions:**
- `src/shared/types.ts`: All interfaces, Socket.IO event maps, ElectronAPI contract (173 lines)

## Naming Conventions

**Files:**
- Components: PascalCase (`Lobby.tsx`, `ChatPanel.tsx`, `VoiceControls.tsx`)
- Hooks: camelCase with `use` prefix (`useSocket.ts`, `useWebRTC.ts`, `useAudio.ts`)
- Server modules: camelCase (`signaling.ts`, `invite.ts`, `upload.ts`)
- Shared modules: camelCase (`types.ts`, `events.ts`, `iceConfig.ts`, `avatars.ts`)
- Config files: kebab-case or dot-separated (`forge.config.ts`, `vite.main.config.ts`)

**Directories:**
- All lowercase, singular or descriptive (`server`, `renderer`, `shared`, `hooks`, `components`, `context`, `utils`, `db`, `middleware`)

**Exports:**
- Components: Named exports (`export function Lobby(...)`)
- Hooks: Named exports (`export function useSocket()`)
- Server functions: Named exports (`export function startServer(...)`)
- No default exports except `App.tsx` (default for Vite entry) and `forge.config.ts`

## Where to Add New Code

**New React Component:**
- Implementation: `src/renderer/components/ComponentName.tsx`
- Use named export, functional component with inline `styles` object
- Import shared types from `src/shared/types.ts`

**New Custom Hook:**
- Implementation: `src/renderer/hooks/useHookName.ts`
- Export interface for return type (`UseHookNameReturn`)
- Follow existing pattern: `useCallback`/`useEffect` with cleanup

**New Socket.IO Event:**
- Add to `ClientToServerEvents` and/or `ServerToClientEvents` in `src/shared/types.ts`
- Add handler in `src/server/signaling.ts` (inside `io.on('connection', ...)`)
- Add constant to `src/shared/events.ts`
- Listen in appropriate renderer hook or component

**New Database Table:**
- Add table definition to `src/server/db/schema.ts`
- Run `npm run db:generate` to create migration
- Migration files appear in `drizzle/`

**New IPC Channel:**
- Add handler in `src/main.ts` (`registerIpcHandlers()`)
- Add bridge method in `src/preload.ts` (inside `contextBridge.exposeInMainWorld`)
- Add type to `ElectronAPI` interface in `src/shared/types.ts`

**New Express Route:**
- Add to existing module or create new file in `src/server/`
- Register in `src/server/index.ts` (after CORS middleware, before `httpServer.listen`)

**Utility Functions:**
- Renderer utilities: `src/renderer/utils/`
- Shared utilities: `src/shared/` (must be environment-agnostic)
- Server utilities: `src/server/` (can use Node.js APIs)

## Special Directories

**`out/`:**
- Purpose: Electron Forge packaged output
- Generated: Yes (via `npm run package` or `npm run make`)
- Committed: No

**`dist/`:**
- Purpose: Vite build output (intermediate)
- Generated: Yes (during build)
- Committed: No (currently untracked per git status)

**`.vite/`:**
- Purpose: Vite dev server cache and build artifacts
- Generated: Yes
- Committed: No

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (via `npm install`)
- Committed: No

---

*Structure analysis: 2026-03-02*
