# Phase 2: Signaling and NAT Traversal - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Friends on different home networks can reliably find and connect to the host's signaling server, with peer-to-peer connections succeeding even through NAT. Includes Socket.IO signaling (room join/leave, SDP relay, ICE relay, presence broadcast), Perfect Negotiation pattern, STUN/TURN configuration, and invite link generation/validation.

</domain>

<decisions>
## Implementation Decisions

### Invite sharing flow
- Host clicks a "Copy Invite" button and gets a text string (IP:port + token) to paste into Discord/WhatsApp/etc.
- Host sees a configurable UI: generated link preview + expiry picker (1 hour, 24 hours, never)
- Invite tokens are multi-use with a configurable limit (Discord-style) — one link can be used by N friends until limit or expiry
- Friend opens the app and pastes the invite string into a "Join Server" input field to connect

### Room joining experience
- On connect, friend sees a room list sidebar showing all rooms (Dungeon, Arena, Tavern) with user counts per room
- Clicking/hovering a room expands to show who's inside (Discord voice channel style)
- Users are NOT auto-joined to any room — they pick from the list

### Presence display
- Each user in a room shows: display name + green online dot
- No status/idle/away indicators in this phase — just connected or not

### Join/leave notifications
- Inline system message in the room: "PlayerOne joined the room." / "PlayerOne left the room."
- Like Discord's join/leave messages — subtle, not intrusive

### Connection failure handling
- Server unreachable: auto-retry with countdown ("Can't reach server. Retrying in 5s...") + manual retry button
- Expired/invalid invite: actionable error message ("This invite has expired. Ask the host for a new invite link.")
- NAT traversal failure: silent automatic TURN relay fallback — user doesn't see connection method details
- Mid-session disconnect: Socket.IO auto-reconnects silently; brief "Reconnecting..." toast only if reconnection takes >3 seconds

### Host view
- Host sees the same room/presence view as friends — no special admin dashboard in this phase

### Claude's Discretion
- STUN/TURN provider choice (coturn vs Metered.ca vs other)
- Exact invite token format and encoding
- Socket.IO reconnection strategy and timing parameters
- Perfect Negotiation implementation details
- Error message copy and toast styling

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/index.ts`: Express + Socket.IO server already running on port 7432 with `cors: { origin: '*' }` and `0.0.0.0` binding — extend with signaling handlers
- `src/shared/events.ts`: Phase 2 event names already reserved as comments (ROOM_JOIN, ROOM_LEAVE, SDP_OFFER, SDP_ANSWER, ICE_CANDIDATE, PRESENCE_UPDATE) — uncomment and implement
- `src/shared/types.ts`: User, Room, ElectronAPI interfaces ready for extension
- `src/server/db/schema.ts`: `rooms` table (with isDefault) and `inviteTokens` table already defined with all fields needed
- `src/preload.ts`: contextBridge IPC wrappers ready for new methods

### Established Patterns
- IPC: Named wrappers via contextBridge — no raw ipcRenderer exposure
- DB: Drizzle ORM with better-sqlite3, lazy-init singleton, WAL mode
- Events: Typed constants in `src/shared/events.ts` (SocketEvents object)
- Server startup: migrations -> seed -> listen (sequential initialization)

### Integration Points
- `src/server/index.ts` `io.on('connection')` — add signaling event handlers here
- `src/shared/events.ts` — uncomment and extend Phase 2 events
- `src/shared/types.ts` — add signaling-related types (PeerInfo, SignalPayload, etc.)
- `src/preload.ts` + `src/main.ts` — add IPC methods for invite generation
- `inviteTokens` table — already has token, usedBy, expiresAt, isRevoked fields

</code_context>

<specifics>
## Specific Ideas

- Room list UX should feel like Discord's voice channel sidebar — rooms listed vertically, expandable to show members
- Join/leave messages modeled after Discord's system messages
- Invite flow is copy-paste focused (not deep links or QR codes) — optimized for pasting into messaging apps

</specifics>

<deferred>
## Deferred Ideas

- Host connection status dashboard (see all users, connection type, latency) — future admin/monitoring phase
- Deep link protocol (sexdungeon://) — could be added later for convenience
- QR code invite sharing — nice to have but not essential

</deferred>

---

*Phase: 02-signaling-and-nat-traversal*
*Context gathered: 2026-03-01*
