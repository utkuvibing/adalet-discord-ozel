# Roadmap: Sex Dungeon

## Overview

Seven phases deliver a private, self-hosted voice chat application for a small gaming friend group. The build order is dependency-driven: infrastructure first, then signaling and NAT traversal (the highest-risk phase), then voice (the core product), then authentication and identity, then text and file sharing, then retro UI polish, and finally screen sharing. No phase begins before its prerequisites are verified working from external networks. Each phase delivers a coherent, verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Bootstrapped Electron app with shared types, SQLite schema, and secure contextBridge preload
- [ ] **Phase 2: Signaling and NAT Traversal** - Express/Socket.IO signaling server with STUN/TURN NAT traversal validated from external networks
- [ ] **Phase 3: Voice Chat** - WebRTC audio mesh with mute, deafen, push-to-talk, speaking indicators, and auto-reconnect
- [ ] **Phase 4: Auth and Identity** - Invite link authentication with display name, avatar, and session persistence
- [ ] **Phase 5: Text Chat and File Sharing** - Persistent per-room text chat with message history, file uploads, and inline image viewing
- [ ] **Phase 6: Retro UI and Room Management** - Retro gaming aesthetic applied system-wide with custom room creation
- [ ] **Phase 7: Screen Sharing** - Electron-native screen/window picker with gaming-optimized quality and system audio capture

## Phase Details

### Phase 1: Foundation
**Goal**: A working Electron app skeleton exists that all features can be built on top of, with correct security configuration from day one
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-03
**Success Criteria** (what must be TRUE):
  1. Running `npm start` (or equivalent) opens the Electron desktop app window without errors
  2. The app runs a local Node.js server on the host machine with zero external paid services required
  3. All WebRTC media (audio, video, screen) is designed to flow peer-to-peer — the server never handles media bytes (verified by architecture and code review)
  4. The preload bridge exposes only named API wrappers — no raw ipcRenderer is accessible from the renderer process
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Electron Forge vite-typescript scaffold, shared types, ESLint/Prettier, BrowserWindow security config, system tray
- [ ] 01-02-PLAN.md — SQLite schema (users, rooms, messages, invite_tokens) with Drizzle ORM, contextBridge preload, and default room seeding

### Phase 2: Signaling and NAT Traversal
**Goal**: Friends on different home networks can reliably find and connect to the host's signaling server, with peer-to-peer connections succeeding even through NAT
**Depends on**: Phase 1
**Requirements**: INFR-04, AUTH-01, AUTH-04
**Success Criteria** (what must be TRUE):
  1. A friend on a different home network (or 4G mobile hotspot) can connect to the host's server using only the server address — no LAN required
  2. Peer-to-peer WebRTC connections succeed from external networks where STUN alone would fail (verified via TURN relay)
  3. The host can generate an invite link with a configurable expiry and share it with friends
  4. An invite link that has passed its expiry time is rejected by the server with a clear error
  5. Two or more users joining simultaneously do not cause signaling race conditions (Perfect Negotiation pattern implemented)
**Plans**: TBD

Plans:
- [ ] 02-01: Express HTTP server, Socket.IO signaling (room join/leave, SDP relay, ICE relay, presence broadcast), and Perfect Negotiation implementation
- [ ] 02-02: STUN/TURN configuration (coturn or Metered.ca), invite link generation and token validation, and cross-network testing ritual

### Phase 3: Voice Chat
**Goal**: Friends can drop into a voice room and hear each other clearly, with full audio controls and reliable reconnection after network drops
**Depends on**: Phase 2
**Requirements**: VOIC-01, VOIC-02, VOIC-03, VOIC-04, VOIC-05, VOIC-06, VOIC-07, VOIC-08
**Success Criteria** (what must be TRUE):
  1. User can see a list of available voice rooms and drop into any room instantly — no loading screen or manual connect button
  2. User can see who is already in each room before joining
  3. User can mute their microphone or deafen themselves while remaining in the room, with their status visible to other room members
  4. User can activate push-to-talk with a configurable hotkey that works even when the app window is not focused
  5. User can see a visual speaking indicator on whoever is currently talking, and can adjust each friend's volume independently
  6. After a WiFi drop, the user's voice connection automatically recovers without any manual action required
**Plans**: TBD

Plans:
- [ ] 03-01: WebRTC peer mesh (one RTCPeerConnection per peer via PeerJS), getUserMedia microphone, audio track management, and ICE candidate buffering
- [ ] 03-02: Mute/deafen toggles, per-user gain nodes, speaking indicator (Web Audio API AnalyserNode), push-to-talk (Electron globalShortcut), and reconnect watchdog

### Phase 4: Auth and Identity
**Goal**: Friends can join the server using an invite link and establish a persistent identity with a display name and avatar
**Depends on**: Phase 3
**Requirements**: AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. A new user clicking an invite link is prompted to choose a display name and avatar before entering the app
  2. A returning user who restarts the app is still logged in — their display name, avatar, and session are preserved without re-entering the invite link
  3. The server rejects any Socket.IO connection that does not present a valid session token before room state is shared
**Plans**: TBD

Plans:
- [ ] 04-01: Display name and avatar selection on first join, session persistence (localStorage), and Socket.IO connection authentication middleware

### Phase 5: Text Chat and File Sharing
**Goal**: Friends can send messages, share links and memes, and drop files in a room's chat, with history available when joining
**Depends on**: Phase 4
**Requirements**: TEXT-01, TEXT-02, TEXT-03, TEXT-04
**Success Criteria** (what must be TRUE):
  1. User can send text messages in a room's chat and all other room members see them in real time
  2. User joining a room sees the full message history from previous sessions — chat persists across app restarts
  3. User can upload and share image and file attachments in the room chat
  4. Shared images appear inline in the chat — no need to open a separate window or browser tab
**Plans**: TBD

Plans:
- [ ] 05-01: Real-time text chat per room (Socket.IO broadcast + SQLite persistence) and message history load on room join
- [ ] 05-02: File and image upload (multipart HTTP POST, disk storage), file URL broadcast to room, and inline image rendering in chat

### Phase 6: Retro UI and Room Management
**Goal**: The app looks and feels like a retro gaming application, and the host can create and name custom voice rooms
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. Every screen in the app (join, lobby, room) uses the retro/gaming aesthetic — pixel-art borders, neon colors, arcade-style buttons, and pixel font
  2. The host can create a new voice room, give it a custom name, and it immediately appears in the room list for all connected users
  3. The retro aesthetic is applied consistently — no screen reverts to a default browser/Electron appearance
**Plans**: TBD

Plans:
- [ ] 06-01: RetroUI component integration system-wide (Join screen, Lobby, Room view) with Press Start 2P font, neon palette, and pixel-art borders
- [ ] 06-02: Host room creation UI, custom room naming, room list propagation to all clients, and connection state/audio level indicators

### Phase 7: Screen Sharing
**Goal**: A user can share their screen or a specific game window with the room at full gaming quality, with system audio included
**Depends on**: Phase 3
**Requirements**: SCRN-01, SCRN-02, SCRN-03
**Success Criteria** (what must be TRUE):
  1. User can open a screen/window picker, see thumbnails of available sources, and select one to start sharing
  2. Screen share runs at up to 1080p/30fps with no artificial quality cap — no paywall or tier restriction applies
  3. User can optionally include system audio (game sounds) alongside the screen share so friends hear game audio through the room
  4. Starting or stopping a screen share does not disconnect or disrupt the existing voice connection for any room member
**Plans**: TBD

Plans:
- [ ] 07-01: desktopCapturer IPC pipeline, custom source picker UI with thumbnails, getUserMedia with chromeMediaSource constraint, and frame rate enforcement
- [ ] 07-02: WebRTC track replacement on existing peer connections (replaceTrack), configurable resolution/fps, system audio capture, and bandwidth constraint configuration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7
Note: Phase 7 (Screen Sharing) depends on Phase 3 (Voice) — it can be built after Phase 3 is complete if desired, but is placed last to ensure voice stability is proven first.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/2 | Not started | - |
| 2. Signaling and NAT Traversal | 0/2 | Not started | - |
| 3. Voice Chat | 0/2 | Not started | - |
| 4. Auth and Identity | 0/1 | Not started | - |
| 5. Text Chat and File Sharing | 0/2 | Not started | - |
| 6. Retro UI and Room Management | 0/2 | Not started | - |
| 7. Screen Sharing | 0/2 | Not started | - |
