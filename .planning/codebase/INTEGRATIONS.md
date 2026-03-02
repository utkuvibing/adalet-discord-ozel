# External Integrations

**Analysis Date:** 2026-03-02

## APIs & External Services

**WebRTC STUN Servers (NAT traversal):**
- Google public STUN servers (free, no auth required)
  - `stun:stun.l.google.com:19302` (and stun1 through stun4)
  - Config: `src/shared/iceConfig.ts`

**WebRTC TURN Servers (relay fallback):**
- Metered.ca Open Relay (free, static auth)
  - `turn:openrelay.metered.ca:80` (UDP)
  - `turn:openrelay.metered.ca:80?transport=tcp` (TCP)
  - `turn:openrelay.metered.ca:443` (TLS)
  - `turns:openrelay.metered.ca:443?transport=tcp` (DTLS)
  - `turn:staticauth.openrelay.metered.ca:80` and `:443` variants
  - Credentials: `openrelayproject` / `openrelayproject` (public, hardcoded)
  - Config: `src/shared/iceConfig.ts`

**No other external services.** The app is fully self-hosted with no cloud APIs, no analytics, no crash reporting.

## IPC Bridge (Main <-> Renderer)

The Electron IPC bridge uses `contextBridge.exposeInMainWorld` with `contextIsolation: true` and `nodeIntegration: false`.

**Preload script:** `src/preload.ts`
**Type definitions:** `src/shared/types.ts` (ElectronAPI interface)

**IPC Channels:**

| Channel | Direction | Method | Purpose |
|---------|-----------|--------|---------|
| `window:minimize` | Renderer -> Main | `send` (fire-and-forget) | Hide window to tray |
| `app:quit` | Renderer -> Main | `send` (fire-and-forget) | Remove close listener and quit |
| `server:get-status` | Renderer -> Main | `invoke` (async) | Returns `{ running: boolean, port: number }` |
| `server:ready` | Main -> Renderer | `on` (event) | Notifies renderer of server port on startup |
| `invite:create` | Renderer -> Main | `invoke` (async) | Creates invite token, returns `{ token, serverAddress }` |
| `server:get-address` | Renderer -> Main | `invoke` (async) | Returns server LAN IP or tunnel URL |
| `tunnel:set-url` | Renderer -> Main | `invoke` (async) | Sets/clears public tunnel URL (e.g., ngrok) |
| `tunnel:get-url` | Renderer -> Main | `invoke` (async) | Returns current tunnel URL or null |
| `ptt:register` | Renderer -> Main | `invoke` (async) | Registers global shortcut for push-to-talk |
| `ptt:unregister` | Renderer -> Main | `send` (fire-and-forget) | Unregisters PTT global shortcut |
| `ptt:state-change` | Main -> Renderer | `on` (event) | PTT key press/release detection via polling |

**Push-to-talk implementation** (`src/main.ts`):
- Uses `globalShortcut.register` for system-wide hotkey capture
- Key release detection via 50ms polling interval (globalShortcut fires repeatedly while held; >150ms silence = key released)

## Socket.IO Event Contracts

**Server:** `src/server/index.ts`, `src/server/signaling.ts`
**Client:** `src/renderer/hooks/useSocket.ts`, `src/renderer/hooks/useWebRTC.ts`
**Type contracts:** `src/shared/types.ts` (ServerToClientEvents, ClientToServerEvents)

### Client -> Server Events

| Event | Payload | Handler Location |
|-------|---------|------------------|
| `room:join` | `roomId: number` | `src/server/signaling.ts` - Leaves current rooms, joins new room, sends peers list and chat history |
| `room:leave` | (none) | `src/server/signaling.ts` - Leaves all voice rooms |
| `room:create` | `name: string` | `src/server/signaling.ts` - Host-only, max 20 rooms, unique names |
| `room:delete` | `roomId: number` | `src/server/signaling.ts` - Host-only, kicks members, deletes messages, cannot delete default rooms |
| `sdp:offer` | `SDPPayload { to, description }` | `src/server/signaling.ts` - Relay to target socket, adds `from` |
| `sdp:answer` | `SDPPayload { to, description }` | `src/server/signaling.ts` - Relay to target socket, adds `from` |
| `ice:candidate` | `ICEPayload { to, candidate }` | `src/server/signaling.ts` - Relay to target socket, adds `from` |
| `voice:state-change` | `VoiceState { muted, deafened, speaking }` | `src/server/signaling.ts` - Broadcasts to all rooms the socket is in |
| `chat:message` | `{ roomId: number, content: string }` | `src/server/signaling.ts` - Validates room membership and content (1-2000 chars), persists to SQLite, broadcasts |

### Server -> Client Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `room:list` | `RoomWithMembers[]` | Sent on connection - full room state with members |
| `room:peers` | `string[]` (socket IDs) | Sent on room:join - list of existing peers for WebRTC initiation |
| `presence:update` | `PresenceUpdate { rooms: RoomWithMembers[] }` | Broadcast on any room membership change |
| `sdp:offer` | `SDPPayload { from, to, description }` | Relayed SDP offer |
| `sdp:answer` | `SDPPayload { from, to, description }` | Relayed SDP answer |
| `ice:candidate` | `ICEPayload { from, to, candidate }` | Relayed ICE candidate |
| `system:message` | `SystemMessage { text, roomId, timestamp }` | Join/leave/delete notifications |
| `voice:state-change` | `VoiceStatePayload { socketId, state }` | Peer mute/deafen/speaking state |
| `chat:message` | `ChatMessage` | New chat message (text or file) |
| `chat:history` | `ChatMessage[]` | Last 50 messages on room join |
| `session:created` | `{ sessionToken, userId, displayName, avatarId }` | Session data for localStorage persistence |
| `error` | `{ code: string, message: string }` | Typed error codes (NOT_HOST, INVALID_ROOM_NAME, ROOM_LIMIT, DUPLICATE_ROOM, CANNOT_DELETE_DEFAULT) |

### Authentication Middleware

**File:** `src/server/middleware/auth.ts`

Three authentication flows, checked in order:
1. **Returning user** - `auth.sessionToken` validated against `users.sessionToken` in DB
2. **Host localhost bypass** - Connections from `127.0.0.1` / `::1` auto-create user, always `isHost: true`
3. **New user with invite** - `auth.token` validated against `invite_tokens` table, creates new user

**Socket data set by middleware:** `userId`, `displayName`, `avatarId`, `sessionToken`, `isHost`, `inviteTokenId`

**Error codes:** `INVALID_SESSION`, `MISSING_TOKEN`, `INVALID_TOKEN`, `EXPIRED_TOKEN`, `TOKEN_LIMIT_REACHED`

## WebRTC Connection Flow

**Client implementation:** `src/renderer/hooks/useWebRTC.ts`
**Pattern:** Perfect Negotiation (RFC 8829 compliant)

**Connection establishment:**
1. User A joins room -> server sends `room:peers` with list of existing socket IDs
2. User A creates `RTCPeerConnection` for each existing peer (initiator=true)
3. If local audio stream available, tracks are added to PC (triggers `onnegotiationneeded`)
4. If no audio stream, a `keepalive` data channel is created to trigger negotiation
5. `onnegotiationneeded` fires -> creates offer -> sends via `sdp:offer` through server
6. Remote peer receives offer -> sets remote description -> creates answer -> sends `sdp:answer`
7. ICE candidates exchanged via `ice:candidate` relay through server
8. On `ontrack` event, remote audio stream is routed to `useAudio` hook

**Polite/impolite roles:** Determined by lexicographic comparison of socket IDs (`mySocketId < remoteSocketId` = polite)

**ICE candidate queuing:** Candidates received before `remoteDescription` is set are queued in `pendingCandidates[]` and drained after `setRemoteDescription`

**Failure recovery:** Connection state `failed` triggers `restartIce()` with 5s timeout watchdog (`src/renderer/hooks/useAudio.ts`)

## Audio Pipeline

**File:** `src/renderer/hooks/useAudio.ts`

**Local audio:**
- `getUserMedia` with `echoCancellation`, `noiseSuppression`, `autoGainControl` enabled
- Acquired on room join, stopped on room leave
- Tracks added to all existing peer connections
- Local AnalyserNode for VAD (voice activity detection) - NOT connected to destination (no self-hearing)

**Remote audio:**
- Hidden `<audio>` element created per remote stream (Chromium/Electron workaround for reliable playback)
- `createMediaElementSource` captures output into Web Audio API chain
- Chain: source -> GainNode (volume control, 0-2x) -> AnalyserNode (VAD) -> destination (speakers)
- Per-peer volume control via `savedVolumesRef`

**Voice Activity Detection:**
- `requestAnimationFrame` loop analyzing frequency data from AnalyserNodes
- Threshold: 15 (0-255 byte frequency average)
- Silence delay: 200ms before marking as not speaking
- Works for both local and remote streams

**Deafen:** Sets all remote GainNode values to 0, restores saved volumes on undeafen

## File Upload / Download

**Server endpoint:** `POST /upload` (`src/server/upload.ts`)
**Static serving:** `GET /uploads/*` via `express.static(getUploadsDir())`

**Upload flow:**
1. Client sends multipart form data with fields: `file`, `roomId`, `userId`, `content` (optional message text)
2. Multer stores file with UUID filename in uploads directory
3. File metadata persisted to `messages` table (`fileUrl`, `fileName`, `fileSize`, `fileMimeType`)
4. `ChatMessage` broadcast to room via Socket.IO `chat:message`
5. Response: `200 OK` with full `ChatMessage` JSON

**Storage:**
- Development: `{cwd}/uploads/`
- Production: `{userData}/uploads/`
- File size limit: 25 MB
- Filenames: `{UUID}.{ext}` (crypto.randomUUID)

**Download:** Direct HTTP GET to `/uploads/{filename}` - served as static files with original MIME type

## Database Access Patterns

**Client singleton:** `src/server/db/client.ts` - Lazy Proxy pattern, deferred DB open on first access

**Access pattern:** Synchronous Drizzle ORM queries (better-sqlite3 is synchronous)
- All DB calls are `.all()`, `.get()`, or `.run()` - no async/await needed
- Used directly in Socket.IO event handlers and Express route handlers

**Query examples from codebase:**
- Select all rooms: `db.select().from(rooms).all()` (`src/server/signaling.ts`)
- Chat history: `db.select().from(messages).leftJoin(users, ...).where(...).orderBy(desc(...)).limit(50).all()` (`src/server/signaling.ts`)
- Insert message: `db.insert(messages).values({...}).run()` (`src/server/signaling.ts`, `src/server/upload.ts`)
- Count rooms: `db.select({ total: count() }).from(rooms).all()` (`src/server/signaling.ts`)
- Delete cascade: `db.delete(messages).where(...)` then `db.delete(rooms).where(...)` (`src/server/signaling.ts`)

**Migrations:** Run at startup via `drizzle-orm/better-sqlite3/migrator` (`src/server/db/migrate.ts`). Folder resolved differently for dev vs packaged app.

**Seeding:** `src/server/db/seed.ts` - Creates 3 default rooms (Dungeon, Arena, Tavern) if `rooms` table is empty.

## Session & Identity

**Token generation:** `crypto.randomBytes` for both invite tokens (24 bytes = 32 chars base64url) and session tokens (32 bytes = 43 chars base64url)

**Session persistence:**
- Server: `sessionToken` stored in `users` table
- Client: Full session saved to `localStorage` as JSON (`sessionToken`, `serverAddress`, `displayName`, `avatarId`)
- Auto-restore on app launch (`src/App.tsx`)

**Invite system** (`src/server/invite.ts`):
- Tokens support optional expiry (`expiresAt`) and max uses (`maxUses`)
- Validated server-side on each connection attempt
- Use count incremented atomically via SQL expression

## Network Configuration

**Server binding:** `0.0.0.0:7432` (all interfaces, hardcoded port in `src/main.ts`)

**CORS:** Permissive (`origin: '*'`) for both Socket.IO and Express routes - acceptable for LAN-only deployment

**Transport selection** (`src/renderer/hooks/useSocket.ts`):
- LAN connections (no protocol prefix): WebSocket only
- Tunnel connections (http/https prefix): Polling + WebSocket upgrade
- ngrok support: `ngrok-skip-browser-warning: 1` header added for tunnel connections

**Reconnection:** Enabled with infinite attempts, 1-10s exponential backoff with 0.5 randomization

## Webhooks & Callbacks

**Incoming:** None
**Outgoing:** None

---

*Integration audit: 2026-03-02*
