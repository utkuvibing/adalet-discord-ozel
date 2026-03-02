# Codebase Concerns

**Analysis Date:** 2026-03-02

## Security Concerns

**No CSP Headers (HIGH):**
- Issue: The Electron BrowserWindow in `src/main.ts` does not set a Content-Security-Policy header. Any XSS in the renderer could load arbitrary scripts.
- Files: `src/main.ts` (lines 45-57)
- Current mitigation: `contextIsolation: true` and `nodeIntegration: false` are correctly set, limiting damage from XSS. React's default escaping also helps.
- Fix approach: Add a `session.defaultSession.webRequest.onHeadersReceived` handler to inject a strict CSP, or set it via `<meta>` tag in the HTML template.

**Sandbox Disabled for Preload (MEDIUM):**
- Issue: `sandbox: false` in `src/main.ts` line 55 allows the preload script to use Node.js APIs. This is required for IPC but widens the attack surface.
- Files: `src/main.ts` (line 55)
- Current mitigation: The preload API surface in `src/preload.ts` is intentionally minimal and uses `contextBridge.exposeInMainWorld` correctly. No raw `ipcRenderer` is exposed.
- Fix approach: Acceptable tradeoff. The preload surface is small and well-scoped. No action needed unless surface grows.

**CORS Wildcard on Express and Socket.IO (MEDIUM):**
- Issue: Both Socket.IO (`cors: { origin: '*' }`) and Express middleware set `Access-Control-Allow-Origin: *`. Any webpage on the same network could make requests to the server.
- Files: `src/server/index.ts` (lines 32, 36-40)
- Current mitigation: Auth middleware requires valid invite tokens for non-localhost connections. Upload endpoint has no auth check (see below).
- Fix approach: For tunnel deployments, restrict CORS origin to the tunnel domain. For LAN, the wildcard is acceptable given the private use case.

**Upload Endpoint Has No Authentication (HIGH):**
- Issue: `POST /upload` in `src/server/upload.ts` accepts any request with a valid `roomId` and `userId` integer. There is no session token or Socket.IO auth check on this HTTP endpoint. Anyone on the network can upload files by guessing user/room IDs.
- Files: `src/server/upload.ts` (lines 62-143)
- Current mitigation: None. The endpoint trusts `userId` from the request body.
- Fix approach: Add a middleware that validates a session token header against the database before accepting uploads.

**No File Type Validation on Upload (MEDIUM):**
- Issue: Multer accepts any file type. Only file size is limited (25 MB). The uploaded file is served statically via `express.static`, so an attacker could upload HTML files containing scripts that execute when visited.
- Files: `src/server/upload.ts` (lines 52-55), `src/server/index.ts` (line 45)
- Current mitigation: Files are renamed to random UUIDs, reducing guessability. The app serves them under `/uploads/` path.
- Fix approach: Add a `fileFilter` to multer that restricts to allowed MIME types (images, audio, video, documents). Alternatively, set `Content-Disposition: attachment` headers on the static file serving.

**Session Tokens Stored in localStorage (LOW):**
- Issue: Session tokens are stored in `localStorage` in the renderer process. In Electron with `contextIsolation: true`, this is relatively safe, but any XSS could read them.
- Files: `src/renderer/hooks/useSocket.ts` (lines 78-83), `src/App.tsx` (lines 14-26)
- Current mitigation: `contextIsolation` prevents direct Node.js access from renderer scripts.
- Fix approach: Acceptable for this private app. Could move to encrypted storage via `safeStorage` API if needed.

**Display Name Not Validated Server-Side (LOW):**
- Issue: When creating users in `src/server/middleware/auth.ts`, the `displayName` from `auth.displayName` is accepted with only a fallback to "Anonymous" if empty. No length limit or character sanitization is enforced server-side.
- Files: `src/server/middleware/auth.ts` (lines 61, 98), `src/server/user.ts` (line 13)
- Current mitigation: Client-side `maxLength={32}` on the input in `src/renderer/components/JoinServer.tsx`.
- Fix approach: Add server-side validation: trim, enforce max length (32 chars), reject empty names.

## Performance Concerns

**VAD Uses requestAnimationFrame Loop (LOW):**
- Issue: The Voice Activity Detection in `src/renderer/hooks/useAudio.ts` runs a continuous `requestAnimationFrame` loop that computes FFT averages for local and all remote analysers every frame (~60fps). This runs even when nobody is speaking.
- Files: `src/renderer/hooks/useAudio.ts` (lines 451-561)
- Current mitigation: The computation is lightweight (128-byte frequency data per analyser). With 2-5 users, this is at most 5-6 analyser reads per frame.
- Fix approach: For 2-5 users this is acceptable. If scaling beyond that, switch to a `setInterval` at a lower rate (e.g., 20fps) or use `AudioWorklet` for VAD.

**broadcastPresence Queries All Rooms on Every Event (LOW):**
- Issue: `broadcastPresence()` in `src/server/signaling.ts` performs a full `db.select().from(rooms).all()` query and iterates all Socket.IO room members every time any user joins, leaves, disconnects, or when rooms are created/deleted.
- Files: `src/server/signaling.ts` (lines 50-81)
- Current mitigation: With max 20 rooms and 2-5 users, the overhead is negligible. SQLite queries are synchronous and fast.
- Fix approach: Acceptable for current scale. No action needed.

**Chat History Loaded Without Pagination (LOW):**
- Issue: Chat history is limited to the last 50 messages per room join (`LIMIT 50`). This is fine, but there is no mechanism for loading older messages.
- Files: `src/server/signaling.ts` (lines 189-208)
- Fix approach: Add a `chat:load-more` event with cursor-based pagination if message volume grows.

## Technical Debt

**Duplicated Presence Building Logic (MEDIUM):**
- Issue: The logic to build `RoomWithMembers[]` from DB rooms and Socket.IO adapter is duplicated: once in `broadcastPresence()` (lines 50-81) and again in the `connection` handler (lines 135-163) in `src/server/signaling.ts`. Any change to the data shape requires updating both locations.
- Files: `src/server/signaling.ts` (lines 50-81, 135-163)
- Fix approach: Extract a `buildRoomList(io)` helper function and use it in both places.

**avatarUrl Column Repurposed for avatarId (LOW):**
- Issue: The `users.avatarUrl` column in the schema stores an avatar preset ID string (e.g., "skull"), not a URL. The column name is misleading.
- Files: `src/server/db/schema.ts` (line 8), `src/server/user.ts` (line 25, comment: "repurpose avatarUrl column to store avatar preset ID")
- Current mitigation: Comment documents the repurposing.
- Fix approach: Create a migration to rename `avatarUrl` to `avatarId`. Low priority since the column is used consistently.

**Deprecated `usedBy` Column in invite_tokens (LOW):**
- Issue: The `usedBy` column on `invite_tokens` table is deprecated per inline comment, replaced by the `maxUses`/`useCount` pattern. Dead schema weight.
- Files: `src/server/db/schema.ts` (line 35)
- Fix approach: Create a migration to drop the `usedBy` column.

**No TODO/FIXME/HACK Comments Found (GOOD):**
- The codebase has zero TODO, FIXME, or HACK comments. All known issues are addressed inline or documented in phase planning files.

## Reliability Concerns

**Socket.IO Reconnect Re-joins Room But Does Not Re-establish WebRTC (MEDIUM):**
- Issue: When Socket.IO reconnects, `src/renderer/components/Lobby.tsx` re-emits `room:join` (line 119), which triggers `room:peers` from the server and re-establishes WebRTC connections. However, the reconnect watchdog only fires when transitioning from `reconnecting` to `connected`. If the socket disconnects and reconnects quickly without hitting `reconnecting` state, the room re-join may not trigger.
- Files: `src/renderer/components/Lobby.tsx` (lines 112-121)
- Current mitigation: Socket.IO's built-in reconnection sends auth on reconnect. The server re-authenticates and emits `room:list`.
- Fix approach: Also listen for the Socket.IO `connect` event and check if `activeRoomId` needs re-joining, not just the `reconnecting->connected` transition.

**ICE Restart Timeout Only Logs Warning (LOW):**
- Issue: When an ICE restart times out after 5 seconds, the code only logs a warning. The failed peer connection is not cleaned up or retried beyond the single ICE restart attempt.
- Files: `src/renderer/hooks/useAudio.ts` (lines 398-414)
- Current mitigation: If the user leaves and re-joins the room, all peer connections are rebuilt from scratch.
- Fix approach: After ICE restart timeout, remove the failed peer and re-add it. Or prompt the user that a connection failed.

**System Message Detection via String Matching (LOW):**
- Issue: Join/leave notification sounds are triggered by checking if system message text `.includes('joined')` or `.includes('left')`. This is fragile if message text changes.
- Files: `src/renderer/components/Lobby.tsx` (lines 80-85)
- Fix approach: Add a `type` field to `SystemMessage` (e.g., `'join' | 'leave' | 'info'`) and match on that instead of string content.

## Scalability Concerns

**Full-Mesh WebRTC Topology (MEDIUM):**
- Issue: Each client establishes a peer connection to every other client in a room (full mesh). For N users, this means N*(N-1)/2 total connections. At 5 users, each client manages 4 peer connections. This is fine for the 2-5 user target but would degrade rapidly at 10+ users.
- Files: `src/renderer/hooks/useWebRTC.ts`, `src/renderer/hooks/useAudio.ts`
- Current scope: 2-5 users = 1-10 connections total. Well within limits.
- Scaling path: For 10+ users, would need an SFU (Selective Forwarding Unit) server.

**Single-Process Architecture (LOW):**
- Issue: The Express server, Socket.IO, and SQLite all run in the Electron main process. There is no worker thread or separate process for the server.
- Files: `src/main.ts` (line 208), `src/server/index.ts`
- Current scope: For 2-5 users with synchronous SQLite, this is perfectly adequate.
- Scaling path: Move server to a child process or worker thread if main process becomes bottleneck.

## Missing Features / Gaps

**No Message Deletion or Editing:**
- Users cannot delete or edit sent messages. The schema supports only insert.
- Files: `src/server/signaling.ts` (chat:message handler), `src/shared/types.ts`

**No User Kick/Ban Functionality:**
- The host can create/delete rooms but cannot kick or ban users from the server.
- Files: `src/server/signaling.ts`, `src/server/middleware/auth.ts`

**No Invite Revocation UI:**
- Invite tokens can be marked `isRevoked` in the schema, but there is no UI or Socket.IO event to revoke an active invite.
- Files: `src/server/db/schema.ts` (line 40), `src/server/invite.ts`

**Upload Disk Space Not Managed:**
- Uploaded files accumulate in the `uploads/` directory indefinitely. There is no cleanup, quota, or retention policy.
- Files: `src/server/upload.ts` (lines 30-38)

## Dependency Risks

**npm audit Reports High Severity Vulnerabilities (MEDIUM):**
- Issue: `npm audit` reports high-severity vulnerabilities in `@electron-forge/*`, `electron-rebuild`, `serialize-javascript`, `tar`, `webpack` (transitive). Also moderate in `vite`, `drizzle-kit`, `esbuild`.
- Impact: These are all devDependencies or build-time dependencies. They do not ship in the production app binary. The runtime dependencies (`express`, `socket.io`, `better-sqlite3`, `react`, `drizzle-orm`, `multer`) have no reported vulnerabilities.
- Fix approach: Update `@electron-forge/*` packages when a compatible release is available. The build-time nature means low urgency for production security.

**TURN Server Dependency on Free Third-Party Service (MEDIUM):**
- Issue: ICE configuration in `src/shared/iceConfig.ts` relies on `openrelay.metered.ca` TURN servers with static public credentials. This free service could be discontinued or rate-limited at any time, breaking NAT traversal for users behind restrictive firewalls.
- Files: `src/shared/iceConfig.ts` (lines 16-53)
- Current mitigation: Multiple STUN servers (Google) provide fallback for common NAT types. TURN is only needed for symmetric NAT.
- Fix approach: Self-host a TURN server (e.g., coturn) for reliable long-term operation. Or use a paid TURN service.

## Test Coverage Gaps

**No Test Suite Exists (HIGH):**
- What's not tested: The entire application has zero automated tests. No unit tests, integration tests, or end-to-end tests.
- Files: No `*.test.ts`, `*.spec.ts`, or test configuration files exist in the project.
- Risk: Any refactoring or feature addition could silently break existing functionality. Auth logic, WebRTC signaling, file upload, and room management are all untested.
- Priority: HIGH for critical paths (auth middleware, invite validation, signaling logic).

---

*Concerns audit: 2026-03-02*
