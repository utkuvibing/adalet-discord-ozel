# Phase 3: Voice Chat - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Friends can drop into a voice room and hear each other clearly, with full audio controls and reliable reconnection after network drops. Includes getUserMedia microphone capture, audio track management on existing WebRTC peer connections, mute/deafen, push-to-talk, speaking indicators, per-user volume, and auto-reconnect.

</domain>

<decisions>
## Implementation Decisions

### Audio controls layout
- Bottom bar fixed at the bottom of the sidebar (Discord-style)
- Always visible when in a voice room
- Contains mic icon (mute toggle), headphone icon (deafen toggle), and settings/PTT toggle
- Compact — does not take up main content space

### Per-user volume control
- Right-click a user in the member list to get a volume slider popup (Discord-style)
- Not always visible inline — keeps the member list clean

### Speaking indicator
- Green glow (#7fff00) border around user's name when talking (Discord green ring style)
- RoomMembers component already has green dots — speaking indicator adds a glow effect around the name/dot

### Push-to-talk
- Claude's discretion on default hotkey (sensible default with option to rebind)
- Hold-to-talk behavior (hold key to transmit, release to mute)
- Must work when app is minimized to tray (Electron globalShortcut)
- PTT activation should have a subtle visual indicator

### Voice mode
- Open mic by default (voice activity detection) — PTT is an optional toggle
- Like Discord default behavior

### Reconnection experience
- Claude's Discretion — handle reconnection gracefully with appropriate UX

### Claude's Discretion
- Voice activity detection threshold and noise gate sensitivity
- Reconnection UX (visual/audio feedback during reconnect)
- PTT default hotkey choice
- Audio quality settings (bitrate, sample rate)
- Speaking indicator animation specifics (glow intensity, fade timing)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/hooks/useWebRTC.ts`: Perfect Negotiation hook with peer connection map — explicitly says "Phase 3 can call pc.addTrack(audioTrack, stream) on existing connections"
- `src/renderer/components/RoomMembers.tsx`: User list with green dots — extend with speaking glow
- `src/renderer/components/Lobby.tsx`: Already calls useWebRTC — extend with audio controls
- `src/shared/iceConfig.ts`: STUN/TURN config ready for audio connections

### Established Patterns
- WebRTC: Perfect Negotiation with polite/impolite roles by socket.id comparison
- IPC: Named wrappers via contextBridge for Electron APIs (globalShortcut for PTT)
- Events: Typed Socket.IO events in src/shared/events.ts
- State: React hooks + context pattern (SocketContext)

### Integration Points
- `useWebRTC.addPeer()` — add getUserMedia audio track to RTCPeerConnection
- `pc.ontrack` — receive remote audio streams and route to Web Audio API
- `src/shared/events.ts` — add voice state events (mute/deafen/speaking)
- `src/preload.ts` — add PTT globalShortcut IPC methods
- `src/main.ts` — register globalShortcut handlers for PTT

</code_context>

<specifics>
## Specific Ideas

- Bottom bar should feel like Discord's voice panel (compact, always accessible)
- Right-click volume popup like Discord's user volume control
- Green glow speaking indicator like Discord's green ring around avatars
- Open mic default like Discord — gaming-friendly out of the box

</specifics>

<deferred>
## Deferred Ideas

- Discord-like channel adding/management — Phase 6
- Admin dashboard panel — not in current roadmap, noted for future
- Audio processing effects (noise suppression, echo cancellation) — future enhancement

</deferred>

---

*Phase: 03-voice-chat*
*Context gathered: 2026-03-01*
