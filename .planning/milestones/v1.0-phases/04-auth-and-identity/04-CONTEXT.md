# Phase 4: Auth and Identity - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Friends joining via invite link establish a persistent identity with display name and avatar. Returning users skip the join form and reconnect automatically. Server validates session tokens before sharing room state. Host also sets up their own identity on first launch.

</domain>

<decisions>
## Implementation Decisions

### Avatar System
- Preset avatar picker — curated set of icons users choose from
- No image upload or auto-generation
- Style, count, and duplicate policy are Claude's discretion

### First-Join Flow
- Single-form approach preferred — extend existing JoinServer component with avatar picker alongside display name and invite link fields
- Form layout details are Claude's discretion

### Session Persistence
- localStorage for client-side session storage (as specified in roadmap)
- Returning users auto-reconnect silently using saved session
- Reconnect failure behavior is Claude's discretion
- Logout/disconnect mechanism is Claude's discretion

### Host Identity
- Host picks display name and avatar on first launch (same flow as guests)
- Host identity persistence is Claude's discretion
- Host visual distinction (badge/icon) is Claude's discretion
- Host editing follows same rules as guests

### Claude's Discretion
- Avatar preset style (pixel art, geometric, etc.) and count
- Whether duplicate avatars are allowed per room
- Display name max length and uniqueness validation
- Reconnect failure UX (fallback to form vs retry with toast)
- Whether explicit logout/disconnect button exists
- Host badge/crown icon presence
- Host storage mechanism (localStorage vs SQLite)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `JoinServer.tsx`: Already collects display name + invite link in a single form. Can be extended with avatar picker grid.
- `useSocket.ts`: Sends `token` and `displayName` via `socket.handshake.auth`. Can be extended to send avatar + session token.
- `auth.ts` middleware: Validates invite tokens on Socket.IO handshake. Needs session token validation path added.
- `users` table in `schema.ts`: Already has `displayName`, `avatarUrl`, `sessionToken` columns. Schema is ready.
- `invite.ts`: Token creation, validation, and use-count increment. Fully functional.

### Established Patterns
- `contextBridge` + `preload.ts`: All main-process APIs exposed via `window.electronAPI`. New IPC calls follow this pattern.
- Socket.IO typed events: `ServerToClientEvents` / `ClientToServerEvents` in `shared/types.ts`. New events must be added to these interfaces.
- Inline styles via `React.CSSProperties` objects: All components use this pattern (no CSS modules or Tailwind).
- Color palette: `#0d0d0d` background, `#141414` cards, `#7fff00` accent, `#b0b0b0` labels, `#e0e0e0` text.

### Integration Points
- `App.tsx`: Routes between `JoinServer` and `Lobby` based on `connectionState`. Auto-connect logic for host needs session-aware refactor.
- `SocketContext`: Provides `connect()` throughout the app. Session restoration will call `connect()` with saved credentials.
- `SocketData` interface: Currently holds `inviteTokenId` and `displayName`. Needs `avatarUrl` and `userId` added.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The existing retro gaming aesthetic (#7fff00 neon green, monospace fonts, dark backgrounds) should guide avatar and UI choices.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-auth-and-identity*
*Context gathered: 2026-03-01*
