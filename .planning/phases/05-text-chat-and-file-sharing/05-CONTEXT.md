# Phase 5: Text Chat and File Sharing - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Friends send text messages, share links/memes, and drop files in a room's chat. Messages persist in SQLite and full history is available when joining a room. Images render inline. This phase does NOT include message editing, deletion, reactions, threads, or search.

</domain>

<decisions>
## Implementation Decisions

### Chat Message Display
- Claude's discretion on message layout style, grouping, and visual treatment
- Claude's discretion on system message vs user message differentiation
- Claude's discretion on URL handling (clickable links or plain text)
- Claude's discretion on own-message visual distinction

### Message Input & Sending
- Claude's discretion on input bar design, send behavior, and multiline support
- Claude's discretion on character limits and input validation
- Claude's discretion on typing indicators

### File & Image Sharing
- Claude's discretion on upload methods (button, drag-and-drop, paste)
- Claude's discretion on file size limits
- Claude's discretion on inline image display (thumbnails vs full size, lightbox)
- Claude's discretion on non-image file display (file cards vs simple links)

### Chat History
- Claude's discretion on initial history load count and pagination
- Messages persist in SQLite (schema already has messages table with roomId, userId, content, createdAt)
- Claude's discretion on new-message dividers and auto-scroll behavior

### Claude's Discretion
- All implementation details for this phase are at Claude's discretion
- The user trusts Claude to make sensible UX choices matching the existing retro aesthetic
- Key constraints: messages must persist in SQLite, images must render inline, all room members must see messages in real time

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `messages` table in `schema.ts`: Already defined with `roomId`, `userId`, `content`, `createdAt` columns. Ready to use.
- `Lobby.tsx`: Has `messagesArea` div with system messages rendering. Can be extended with chat messages and input bar.
- `systemMessages` state in Lobby: Shows the pattern for real-time message display (listen on socket event, append to state, auto-scroll).
- `signaling.ts`: Has room-scoped broadcast pattern (`socket.to(roomKey).emit(...)`) for message relay.
- `user.ts`: User CRUD with session tokens — provides `userId` for message attribution.
- `avatars.ts`: `getAvatarEmoji()` helper for displaying user avatars alongside messages.
- `PeerInfo` type: Already carries `socketId`, `displayName`, `avatarId` — can identify message authors.

### Established Patterns
- Inline styles via `React.CSSProperties` objects — all components follow this pattern.
- Socket.IO typed events: New events (`chat:message`, `chat:history`, `file:upload`) must be added to `ServerToClientEvents`/`ClientToServerEvents`.
- Color palette: `#0d0d0d` bg, `#141414` cards, `#7fff00` accent, `#b0b0b0` labels, `#e0e0e0` text, `#555` muted, `#888` system.
- Express server in `src/server/index.ts`: Can add HTTP routes for file upload (multipart POST).

### Integration Points
- `Lobby.tsx messagesArea`: Currently renders system messages only. Chat messages and input bar plug in here.
- `signaling.ts room:join handler`: Place to emit message history to joining clients.
- `src/server/index.ts`: Express app available for adding `/upload` route for file sharing.
- `SocketData` interface: Carries `userId`, `displayName`, `avatarId` — available for message attribution on server side.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The existing retro gaming aesthetic (#7fff00 neon green, monospace fonts, dark backgrounds) should guide chat and file display choices.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-text-chat-and-file-sharing*
*Context gathered: 2026-03-01*
