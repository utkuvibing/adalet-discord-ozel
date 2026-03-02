# Architecture

**Analysis Date:** 2026-03-02

## Pattern Overview

**Overall:** Monolithic Electron application with embedded server

**Key Characteristics:**
- Single Electron process hosts both the HTTP/WebSocket server and the BrowserWindow UI
- Server runs in the Electron main process (Node.js); no separate backend deployment
- Renderer communicates with the server via Socket.IO over localhost (same as remote clients)
- WebRTC audio is peer-to-peer (full mesh); the server only relays signaling metadata
- SQLite database is embedded in the main process via `better-sqlite3` (synchronous)
- The host instance runs the server; guest instances connect over LAN or tunnel

## Process Model

**Electron Main Process** (`src/main.ts`):
- Creates BrowserWindow, tray icon, IPC handlers
- Starts the embedded HTTP + Socket.IO server on port 7432
- Manages global shortcuts (push-to-talk) via `globalShortcut`
- Handles invite token creation via IPC
- Single-instance lock prevents duplicate processes

**Preload Script** (`src/preload.ts`):
- Runs with `contextIsolation: true`, `nodeIntegration: false`
- Exposes a minimal `window.electronAPI` surface via `contextBridge`
- IPC channels: window management, server status, invite creation, tunnel URL, PTT shortcuts
- Type contract defined in `src/shared/types.ts` (`ElectronAPI` interface)

**Renderer Process** (`src/renderer.ts` -> `src/App.tsx`):
- React 19 SPA, no router (two views: JoinServer and Lobby)
- Connects to the server via `socket.io-client` (same as any remote client)
- Manages WebRTC peer connections and audio pipeline entirely in the renderer
- No direct Node.js or Electron API access except through `window.electronAPI`

## Layers

**IPC Layer:**
- Purpose: Bridge between renderer and main process for Electron-specific operations
- Location: `src/preload.ts` (implementation), `src/shared/types.ts` (type contract)
- Contains: Window management, server status, invite creation, tunnel URL, PTT shortcuts
- Pattern: `ipcMain.handle` / `ipcRenderer.invoke` for request-response; `ipcMain.on` / `ipcRenderer.send` for fire-and-forget
- Used by: Renderer components (`InvitePanel`, `VoiceControls`, `JoinServer`, `App`)

**Server Layer:**
- Purpose: HTTP server, Socket.IO signaling, authentication, database access
- Location: `src/server/`
- Contains: Express app, Socket.IO server, auth middleware, signaling handlers, file upload, DB access
- Depends on: `src/shared/types.ts`, `src/server/db/`
- Used by: All connected clients (host renderer + remote guests)

**Database Layer:**
- Purpose: Persistent storage for users, rooms, messages, invite tokens
- Location: `src/server/db/`
- Contains: Schema definitions (Drizzle ORM), client singleton, migrations, seed data
- Key files:
  - `src/server/db/schema.ts`: Table definitions (users, rooms, messages, inviteTokens)
  - `src/server/db/client.ts`: Lazy-initialized `better-sqlite3` + Drizzle client with WAL mode
  - `src/server/db/migrate.ts`: Runs Drizzle migrations from `drizzle/` folder
  - `src/server/db/seed.ts`: Seeds default rooms (Dungeon, Arena, Tavern)
- Depends on: `better-sqlite3`, `drizzle-orm`
- Used by: Server layer exclusively (auth, signaling, upload)

**Shared Layer:**
- Purpose: Type definitions and constants shared between main process and renderer
- Location: `src/shared/`
- Contains: TypeScript interfaces, Socket.IO event maps, ICE server config, avatar presets
- Rule: No imports from `electron`, `better-sqlite3`, or `node:*`
- Key files:
  - `src/shared/types.ts`: All shared interfaces, Socket.IO typed event maps, ElectronAPI contract
  - `src/shared/events.ts`: Socket.IO event name constants
  - `src/shared/iceConfig.ts`: STUN/TURN server list for WebRTC
  - `src/shared/avatars.ts`: Emoji avatar preset definitions

**Renderer Layer:**
- Purpose: React UI, WebRTC management, audio pipeline
- Location: `src/renderer/`, `src/App.tsx`
- Contains: Components, hooks, context providers, utilities
- Depends on: `src/shared/`, `socket.io-client`, Web Audio API, WebRTC APIs
- Used by: User (via BrowserWindow)

## Data Flow

**Voice Audio (WebRTC Mesh):**

1. User joins room -> renderer emits `room:join` to server via Socket.IO
2. Server adds socket to Socket.IO room, responds with `room:peers` (list of existing peer socket IDs)
3. New joiner creates `RTCPeerConnection` for each existing peer (initiator=true) in `useWebRTC`
4. `useAudio` acquires mic via `getUserMedia`, adds audio tracks to all peer connections
5. Adding tracks triggers `onnegotiationneeded` -> SDP offer sent via server relay (`sdp:offer` event)
6. Existing peers receive offer via server relay, respond with SDP answer
7. ICE candidates exchanged via server relay (`ice:candidate` event)
8. Once connected, audio streams directly peer-to-peer (server never touches media)
9. Remote audio routed through hidden `<audio>` elements + Web Audio API (GainNode for volume, AnalyserNode for VAD)

**Text Chat:**

1. User types message -> renderer emits `chat:message` to server via Socket.IO
2. Server validates content (1-2000 chars, user must be in room), persists to SQLite `messages` table
3. Server broadcasts `chat:message` to all sockets in the Socket.IO room (including sender)
4. On room join, server sends last 50 messages via `chat:history` event

**File Upload:**

1. User selects file -> renderer sends `POST /upload` multipart form to Express server (HTTP, not Socket.IO)
2. Server saves file to disk via `multer` (25 MB limit), persists file metadata to `messages` table
3. Server broadcasts `chat:message` with `fileUrl`, `fileName`, `fileSize`, `fileMimeType` to Socket.IO room
4. Renderer displays inline image preview (for images) or downloadable file card
5. Files served statically via `express.static('/uploads')`

**Authentication:**

1. Three flows handled by `src/server/middleware/auth.ts` (Socket.IO middleware):
   - **Host localhost bypass**: Localhost connections create/restore user without invite token, `isHost=true`
   - **Returning user**: Client sends `sessionToken` in Socket.IO auth; validated against `users` table
   - **New user with invite**: Client sends invite `token`; validated, use count incremented, new user created
2. On successful auth, server emits `session:created` with session token
3. Renderer saves session to `localStorage` for auto-reconnect on next launch

**Presence:**

1. Server maintains presence by tracking which sockets are in which Socket.IO rooms
2. On any join/leave/disconnect/room-create/room-delete, server calls `broadcastPresence(io)`
3. `broadcastPresence` queries all rooms from DB, maps Socket.IO room membership to `PeerInfo[]`
4. Broadcasts `presence:update` to all connected clients
5. Renderer updates room list with member counts and member details

## WebRTC Topology

**Pattern:** Full mesh (every peer connects directly to every other peer)

**Negotiation:** Perfect Negotiation pattern (polite/impolite roles determined by lexicographic socket ID comparison)

**Signaling:** Socket.IO server relays SDP offers/answers and ICE candidates between peers. Events:
- `sdp:offer` / `sdp:answer`: Relay `RTCSessionDescriptionInit` between specific peers
- `ice:candidate`: Relay `RTCIceCandidateInit` between specific peers

**ICE Configuration** (`src/shared/iceConfig.ts`):
- 5 Google STUN servers
- 7 Metered.ca Open Relay TURN servers (static auth, multiple ports/transports)

**Connection Recovery:**
- `pc.onconnectionstatechange` triggers `pc.restartIce()` on failure
- ICE restart watchdog in `useAudio` logs timeout after 5 seconds
- On Socket.IO reconnect, renderer re-joins active room (triggers fresh `room:peers`)
- `removeAllPeers()` called before joining any room to ensure clean peer state

**Scale Limit:** Full mesh is O(n^2) connections. Designed for 2-5 users.

## State Management

**Approach:** React hooks + Context (no external state library)

**Socket Connection State** (`src/renderer/hooks/useSocket.ts`):
- Manages Socket.IO client lifecycle: `connect`, `disconnect`, `reconnect`
- Exposes `connectionState`: `'disconnected' | 'connecting' | 'connected' | 'reconnecting'`
- Wrapped in `SocketContext` (`src/renderer/context/SocketContext.tsx`) for app-wide access

**WebRTC State** (`src/renderer/hooks/useWebRTC.ts`):
- `Map<string, RTCPeerConnection>` keyed by remote socket ID (mutable ref, not React state)
- `PeerState` objects track Perfect Negotiation flags per peer (mutable ref)

**Audio State** (`src/renderer/hooks/useAudio.ts`):
- `localStream`: MediaStream from `getUserMedia`
- `remoteStreams`: Map of `RemoteStream` (stream + GainNode + AnalyserNode per peer)
- `voiceStates`: Map of `VoiceState` per remote peer (muted/deafened/speaking)
- `myVoiceState`: Local mute/deafen/speaking state
- `speakingPeers`: Set of socket IDs currently speaking (driven by VAD rAF loop)
- Volumes persisted per-peer in refs, survive stream reconnection

**UI State** (component-level `useState`):
- Room list, active room, system messages managed in `Lobby`
- Chat messages managed in `ChatPanel`
- No global UI state store; props are drilled from `Lobby` to child components

**Session Persistence:**
- `localStorage` stores `{ sessionToken, serverAddress, displayName, avatarId }`
- On app launch, `App.tsx` attempts session restore before showing UI

## Key Abstractions

**TypedSocket** (`src/renderer/hooks/useSocket.ts`):
- `Socket<ServerToClientEvents, ClientToServerEvents>` -- fully typed Socket.IO client
- All event emissions and listeners are type-checked at compile time

**Socket.IO Typed Event Maps** (`src/shared/types.ts`):
- `ServerToClientEvents`: 12 events the server can emit to clients
- `ClientToServerEvents`: 9 events clients can emit to the server
- `SocketData`: Per-socket data stored on the server (userId, displayName, isHost, etc.)

**Perfect Negotiation PeerState** (`src/renderer/hooks/useWebRTC.ts`):
- `polite`, `makingOffer`, `ignoreOffer`, `isSettingRemoteAnswerPending` flags
- Handles glare (simultaneous offers) correctly per WebRTC spec

## Entry Points

**Main Process** (`src/main.ts`):
- Electron `app.whenReady()` -> starts server, registers IPC, creates window + tray
- Packaged entry: `.vite/build/main.js`

**Preload** (`src/preload.ts`):
- Loaded via BrowserWindow `webPreferences.preload`
- Exposes `window.electronAPI`

**Renderer** (`src/renderer.ts`):
- Bootstraps React via `createRoot`, renders `<App />`
- HTML entry: `index.html` -> `<script type="module" src="/src/renderer.ts">`

**Server** (`src/server/index.ts`):
- `startServer(port)` called from main process
- Creates Express + HTTP + Socket.IO stack, runs migrations, seeds rooms

## Error Handling

**Strategy:** Defensive error handling with user-friendly error messages

**Patterns:**
- Socket.IO `connect_error` mapped to user-friendly messages via `ERROR_MESSAGES` lookup (`src/renderer/hooks/useSocket.ts`)
- Invalid session tokens cause disconnect + localStorage clear (forces re-login)
- Server-side validation on all Socket.IO events (room membership check, content length, host-only operations)
- Server emits typed `error` events for domain errors (NOT_HOST, ROOM_LIMIT, DUPLICATE_ROOM, etc.)
- WebRTC connection failures trigger ICE restart with 5-second timeout
- File upload errors return appropriate HTTP status codes (400, 413, 500)
- `try/catch` around all async operations in renderer hooks

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.warn` / `console.error` with `[tag]` prefixes: `[server]`, `[signaling]`, `[db]`, `[webrtc]`, `[audio]`, `[invite]`, `[upload]`, `[lobby]`

**Validation:** Server-side validation on Socket.IO events (room membership, content length 1-2000, host-only guards). Client-side input validation (display name length, invite format parsing).

**Authentication:** Socket.IO middleware (`src/server/middleware/auth.ts`). Three flows: session token restore, invite token, localhost host bypass. No traditional HTTP auth (file uploads include userId in form data, not authenticated).

**CORS:** Permissive `origin: '*'` on both Socket.IO and Express (acceptable for LAN-only/private use).

---

*Architecture analysis: 2026-03-02*
