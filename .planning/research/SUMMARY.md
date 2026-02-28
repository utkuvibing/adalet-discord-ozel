# Project Research Summary

**Project:** Sex Dungeon (self-hosted Discord alternative)
**Domain:** Private self-hosted voice/video/text chat desktop application (WebRTC + Electron)
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a self-hosted, retro-aesthetic voice and text chat desktop application built for a small private gaming friend group (2-5 users). The correct architecture is a WebRTC P2P mesh for media (audio, video, screen share) combined with a Socket.IO signaling server and SQLite persistence — all running inside an Electron desktop app. The host PC runs both the server (Node.js + Socket.IO + Express + SQLite) and the Electron client simultaneously. Friends download and run the Electron client, connect to the host's server via invite link, and communicate peer-to-peer. No cloud services, no monthly cost, no registration flow.

The recommended technology choices are well-established and have high confidence: Electron 40.x with the Forge vite-typescript template, React 19, TypeScript, Socket.IO 4.8.x, PeerJS 1.5.5 (wrapping WebRTC), better-sqlite3 12.6.2+, and Drizzle ORM. The retro aesthetic is served by RetroUI (a Tailwind-based pixel-art React component library) and Tailwind CSS v4. Critical avoidances: Prisma ORM (breaks Electron packaging), feross/simple-peer (unmaintained since 2021), Redux Toolkit (overkill), and nodeIntegration: true (security vulnerability).

The single largest risk category is WebRTC connectivity: symmetric NAT (~20% of home internet users) silently blocks STUN-only peer connections; ICE candidate race conditions cause intermittent connection failures; and Electron's screen share API differs entirely from the browser standard. All three must be addressed in the signaling and connection phase — before any higher-level features are built on top. The product's differentiator over Discord is unlimited screen share quality (Discord caps at 720p/30fps without Nitro), zero cost, full privacy, and the retro gaming aesthetic. These are achievable goals given the research-backed stack.

## Key Findings

### Recommended Stack

The stack is mature, cross-compatible, and specifically validated for Electron. Electron 40.x ships Chromium 128+ which provides full WebRTC API support; contextBridge and contextIsolation are secure defaults. The Forge vite-typescript scaffold gives hot-reload in both main and renderer processes. TypeScript across all process boundaries (main, preload, renderer, server) catches IPC contract mismatches at compile time — which is where the most subtle bugs in this architecture will surface.

One non-obvious compatibility trap exists: better-sqlite3 below 12.4.2 fails to build against Electron 39+. Use 12.6.2+. Drizzle ORM is the correct SQLite companion — Prisma's binary engine causes Electron packaging failures and 15x slower query latency. PeerJS 1.5.5 wraps RTCPeerConnection cleanly for this 2-5 user mesh scenario; simple-peer is unmaintained and should be avoided entirely.

**Core technologies:**
- Electron 40.x: Desktop shell — only mature cross-platform JS desktop framework with full WebRTC + contextBridge security model
- Node.js 22 LTS: Main process + signaling server runtime — active LTS through April 2027; matches Electron 40's internal Node version
- TypeScript 5.x: Full stack language — catches IPC contract bugs at compile time
- React 19: Renderer UI — official Electron Forge template target; required for RetroUI component ecosystem
- Vite 6.x: Renderer build — Electron Forge Vite plugin now stable; HMR in both processes
- Socket.IO 4.8.3: Signaling transport — room-based events map directly to voice room semantics; auto-reconnect built in
- WebRTC (native Chromium): P2P media — no library needed for actual transport; PeerJS provides the abstraction layer
- PeerJS 1.5.5: WebRTC peer abstraction — clean API for offer/answer/ICE; actively maintained
- better-sqlite3 12.6.2+: Local persistence — synchronous SQLite in main process; stores chat, users, invite tokens
- Drizzle ORM 0.38.x: Type-safe SQL — no binary engine, ~7KB, Electron-safe packaging
- Tailwind CSS 4.x + RetroUI: Retro aesthetic — 40+ pixel-art React components, neon colors, arcade buttons

### Expected Features

Research confirms this feature set against Discord, Mumble, Revolt, and TeamSpeak. The MVP is well-scoped: the features listed as "must have" are genuinely required for the friend group to replace Discord. Screen sharing is held to v1.x (not v1) because voice stability must be proven first.

**Must have (table stakes, v1 launch):**
- Always-on voice rooms with drop in/out — core Discord UX pattern
- Mute / deafen / push-to-talk (Electron globalShortcut API) — gaming standard
- Speaking indicator (Web Audio API AnalyserNode) — essential spatial awareness
- Room presence list (who is in which room) — fundamental before joining
- Persistent text chat per room (SQLite) — links, memes, coordination
- File and image sharing — screenshots and game clips
- Invite link auth (token-based, no registration required) — frictionless onboarding
- User display name and avatar — basic identity
- Retro gaming UI (RetroUI + pixel fonts) — the brand differentiator
- Reconnect handling (ICE restart + Socket.IO auto-reconnect) — home internet drops constantly

**Should have (differentiators, v1.x after validation):**
- Screen sharing with configurable resolution/fps — the primary competitive advantage over Discord (no Nitro paywall)
- Per-user volume memory (local config) — quality of life
- Custom room names and count — admin convenience
- Soundboard / reaction sounds — gaming session energy

**Defer (v2+):**
- Camera/video — bandwidth-heavy; WebRTC mesh strain at 5 users
- E2E voice encryption — DTLS already encrypts in transit; Insertable Streams API adds significant complexity
- Web browser client — bridges mobile gap before native app
- Mobile app — separate codebase; out of scope

**Anti-features (explicitly excluded by design):**
- Bot integrations (infinite scope)
- Role-based permissions (overkill for 2-5 people)
- DMs / private messaging (breaks small-group model)
- Server discovery / public rooms (contradicts privacy motivation)
- Recording/VODs (legal gray area, storage cost)

### Architecture Approach

The architecture separates concerns cleanly across Electron's two process types. The Node.js main process hosts the signaling server (Socket.IO + Express), database (better-sqlite3 + Drizzle), and file management. The Chromium renderer process runs React UI, WebRTC peer connections (PeerJS), and the Socket.IO client. The preload script (contextBridge) bridges them with narrow, named API wrappers — never raw ipcRenderer exposure. All media (audio, video, screen share) flows directly P2P via WebRTC after the initial signaling handshake; the server never handles media bytes. This is the correct choice: routing media through the server would double latency and saturate the host's upload bandwidth.

**Major components:**
1. Signaling Server (Express + Socket.IO, main process) — room state machine, SDP relay, ICE relay, presence broadcast, text chat persistence
2. SQLite Data Store (better-sqlite3 + Drizzle, main process) — user accounts, chat history, invite tokens, room definitions
3. WebRTC Mesh (PeerJS in renderer, Chromium) — one RTCPeerConnection per peer, trickle ICE, P2P audio/video/screen tracks
4. React UI (renderer) — room views, chat, presence list, retro aesthetic via RetroUI + Tailwind
5. Preload Bridge (contextBridge) — exposes only: joinRoom, sendMessage, getHistory, getScreenSources, onPeerJoined, onPeerLeft
6. STUN/TURN Infrastructure — Google STUN (free) + coturn or Metered.ca for TURN relay fallback

**Build order from ARCHITECTURE.md (dependency-driven):**
Shared types → SQLite schema → Express HTTP server → Socket.IO signaling → Invite auth → Electron shell → React UI shell → Signaling client → WebRTC peers → Audio/video tracks → Screen share → Text chat → File sharing → UI polish

### Critical Pitfalls

1. **Symmetric NAT blocks ~20% of users silently** — STUN-only ICE fails without a TURN relay. Symptoms: works perfectly on LAN, fails for specific friends. Fix: deploy coturn (30 minutes) or use Metered.ca free TURN tier; always configure TURN credentials alongside STUN. Test from a mobile hotspot before declaring voice working.

2. **Localhost testing gives false confidence** — Two tabs on the same machine never traverse NAT. All WebRTC "works" claims must be validated cross-network (different home network or 4G hotspot). Build cross-network testing into the definition of done for the signaling phase.

3. **Electron screen sharing requires desktopCapturer, not getDisplayMedia** — Standard browser `navigator.mediaDevices.getDisplayMedia()` does not work as expected in Electron. Must use `desktopCapturer.getSources()` in main process via IPC, then `getUserMedia({ chromeMediaSource: 'desktop', chromeMediaSourceId })` in renderer. Also: known Electron bug caps frame rate at 5-6 fps without explicit frameRate constraints.

4. **No reconnect logic means silent dead sessions** — WiFi drops transition RTCPeerConnection to `disconnected` then `failed`. Without `onconnectionstatechange` handlers + ICE restart + watchdog timers, users talk into the void while UI shows them as connected. Reconnection is not an enhancement — it is baseline for a voice app.

5. **Signaling race conditions (glare) break multi-user joins** — When 2+ users join simultaneously, both may send offers before receiving answers, causing `InvalidStateError`. Fix: implement MDN's Perfect Negotiation pattern (polite/impolite peer roles with offer rollback) and queue ICE candidates until after `setRemoteDescription` completes.

## Implications for Roadmap

Based on component dependencies from ARCHITECTURE.md and pitfall-to-phase mapping from PITFALLS.md, the following phase structure is recommended. Phases are ordered by dependency; no phase should begin before its prerequisites are verified working from external networks.

### Phase 1: Foundation and App Skeleton
**Rationale:** Shared TypeScript types, SQLite schema, Electron shell, and contextBridge preload must exist before any feature can be built. Electron security configuration (contextIsolation: true, nodeIntegration: false) must be correct from day one — retrofitting it is expensive. This phase has no functional features but enables everything else.
**Delivers:** Bootstrapped Electron app with Forge vite-typescript template; shared types/events file; SQLite DB with Drizzle schema (users, rooms, messages, invite_tokens); contextBridge preload with typed API surface; ESLint + Prettier configured.
**Addresses:** User identity (display name, avatar storage schema), room definitions in DB.
**Avoids:** nodeIntegration security anti-pattern (must be locked down in this phase, not patched later); Prisma ORM (use Drizzle from the start).
**Research flag:** Standard patterns — well-documented, skip research-phase.

### Phase 2: Signaling Server and NAT Traversal
**Rationale:** The signaling server is the prerequisite for all voice features. No peer can find another without it. Critically, NAT traversal (STUN + TURN) must be validated against real external networks before any voice features are built on top — otherwise all subsequent work is on a false foundation. This is the highest-risk phase of the project.
**Delivers:** Express + Socket.IO signaling server (room join/leave, SDP relay, ICE relay, presence broadcast); coturn TURN server configured with credentials and external-ip; invite link generation and token validation (HTTP + SQLite); Socket.IO client in renderer connected to server.
**Addresses:** Reconnect handling (ICE restart logic, onconnectionstatechange handlers), room presence broadcast.
**Avoids:** STUN-only configuration (add TURN from the start); localhost-only testing (cross-network test ritual required before phase sign-off); signaling race conditions (implement Perfect Negotiation pattern here, not later).
**Research flag:** Needs research-phase — coturn Windows/WSL2 setup specifics, Metered.ca free tier TURN integration, and Perfect Negotiation implementation need detailed task breakdowns.

### Phase 3: Core Voice Chat
**Rationale:** Once signaling and NAT traversal are verified from external networks, WebRTC peer connections can be established reliably. This phase wires audio tracks into the established connection infrastructure. Voice is the entire reason this product exists — it must be solid before text chat or UI polish is added.
**Delivers:** RTCPeerConnection mesh (one connection per peer, Map keyed by socket ID); getUserMedia for microphone; audio track management; mute/deafen toggles; push-to-talk (Electron globalShortcut); speaking indicators (Web Audio API AnalyserNode); per-user volume control (gain nodes); graceful leave/disconnect with peer notification.
**Uses:** PeerJS 1.5.5, Electron globalShortcut API, Web Audio API.
**Implements:** Mesh topology pattern; trickle ICE; ICE candidate buffering; reconnection watchdog.
**Avoids:** Single RTCPeerConnection for all peers (anti-pattern); missing ICE candidate buffering (race condition); audio starting on join without user action (UX pitfall); no connection state UI feedback.
**Research flag:** Standard patterns for mute/deafen/gain nodes. Needs research-phase for push-to-talk globalShortcut edge cases (focus stealing, OS-level hotkey conflicts).

### Phase 4: Invite Auth and User Identity
**Rationale:** The app cannot be shared with friends until auth exists. Invite links with token validation are required before any multi-user testing beyond the developer's own machines. This phase is sequenced after voice is working so that integration testing (voice + auth + multi-user) can happen together.
**Delivers:** Token-based invite link generation (admin creates link); HTTP token validation on client connect; Socket.IO connection authentication (reject unauthenticated sockets before room state is shared); display name + avatar selection on first join; session persistence (localStorage); token expiry.
**Addresses:** Frictionless onboarding (no email/OAuth), invite link auth (P1 feature).
**Avoids:** Invite tokens with no expiry; open signaling server with no auth; TURN server with no credentials (must be locked in this phase).
**Research flag:** Standard patterns — skip research-phase.

### Phase 5: Text Chat and File Sharing
**Rationale:** Text chat reuses the existing Socket.IO connection — it is not a separate system to build from scratch. The signaling WebSocket channel already connects all clients. Persistence to SQLite (already scaffolded) is straightforward. File sharing uses Express HTTP multipart upload to local disk and static serving. Together these unblock the group's primary coordination workflow (links, memes, screenshots).
**Delivers:** Real-time text chat per room (Socket.IO broadcast + SQLite persist); message history on room join (load from SQLite); file and image upload (multipart HTTP POST, disk storage, configurable size limit); file URL broadcast to room; graceful leave message; connection status indicators in UI.
**Uses:** Socket.IO rooms (already implemented), better-sqlite3 + Drizzle (already scaffolded), Express static file serving.
**Avoids:** electron-store for messages (use SQLite); message routing through WebRTC data channels (use server broadcast for reliability and persistence).
**Research flag:** Standard patterns — skip research-phase.

### Phase 6: Retro UI and Polish
**Rationale:** UI polish comes last because the feature surface must be stable before investing design effort. Changing component structure after applying retro themes is expensive. This phase applies the retro aesthetic system-wide and delivers the product's visual differentiator.
**Delivers:** RetroUI component integration (pixel-art borders, neon palette, arcade buttons); Press Start 2P font (bundled as local asset, not network-fetched); scanline/CRT effects; consistent retro layout across all screens (Join, Lobby, Room); audio level meters; connection state indicators; graceful disconnect on window close (before-quit signal).
**Uses:** RetroUI, Tailwind CSS v4, Vite 6 (already configured).
**Avoids:** Network-dependent font loading; UI polish before features are stable.
**Research flag:** Verify exact npm package name for RetroUI before implementation begins. Standard patterns otherwise.

### Phase 7: Screen Sharing
**Rationale:** Screen sharing is held to a dedicated phase because it depends on Electron-specific APIs that differ from browser standards, requires careful bandwidth management at 5 users, and the gaming-optimized quality (removing Discord's Nitro paywall limit) is the primary product differentiator worth getting right. Voice stability must be proven before adding the most bandwidth-intensive feature.
**Delivers:** desktopCapturer.getSources() IPC pipeline; custom source picker UI (list windows and screens with thumbnails); getUserMedia with chromeMediaSource constraint; WebRTC track replacement on existing peer connections (replaceTrack, no full renegotiation); configurable resolution/fps (target: 1080p/30fps for LAN, adaptive for internet); frame rate enforcement (avoid 5-6fps Electron bug); system audio capture option.
**Avoids:** getDisplayMedia() used directly in renderer (does not work in Electron); frame rate left unconstrained (known Electron bug); screen share without explicit bitrate constraints (bandwidth saturation at 5 users).
**Research flag:** Needs research-phase — desktopCapturer IPC pattern details, frameRate constraint workarounds for specific Electron versions, VP9 vs VP8 codec selection for screen content, system audio capture on Windows.

### Phase 8: V1.x Enhancements (Post-Validation)
**Rationale:** After the friend group uses v1 daily for 1-2 weeks, add quality-of-life features based on actual friction points rather than speculation.
**Delivers:** Per-user volume memory (Electron userData local config); custom room names and admin rename; soundboard with audio file library (Socket.IO broadcast trigger, play on all clients); audio device selection UI with devicechange listener.
**Research flag:** Standard patterns — skip research-phase.

### Phase Ordering Rationale

- Foundation must precede everything (no feature can exist without types, schema, and Electron shell)
- Signaling and NAT traversal precede voice (peers cannot find each other without it; real-network validation cannot be deferred)
- Voice precedes text chat (voice is the product; text reuses voice infrastructure)
- Auth precedes multi-user testing but can be built in parallel with voice development on single-user
- UI polish is always last (stable feature surface required before design investment)
- Screen sharing is deliberately late (Electron-specific complexity, bandwidth risk, and gaming quality requirements justify isolation in its own phase)
- V1.x enhancements are explicitly post-launch to avoid premature optimization

### Research Flags

Phases needing deeper research during planning (use `/gsd:research-phase`):
- **Phase 2 (Signaling + NAT Traversal):** coturn configuration on Windows/WSL2, Metered.ca TURN integration, Perfect Negotiation implementation details, cross-network testing ritual setup
- **Phase 3 (Voice):** Electron globalShortcut edge cases for push-to-talk (OS-level conflicts, focus stealing), audio constraint combinations that cause getUserMedia failures in Electron
- **Phase 7 (Screen Sharing):** desktopCapturer IPC pattern specifics, frameRate constraint workarounds, VP9/VP8 for screen content, system audio capture on Windows, MediaRecorder memory leak mitigation

Phases with well-documented standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Electron Forge scaffold is official and well-documented
- **Phase 4 (Auth):** Token-based invite flow is standard; no novel integration
- **Phase 5 (Text Chat + File Sharing):** Socket.IO broadcast + SQLite persist is a standard pattern
- **Phase 6 (UI Polish):** RetroUI + Tailwind v4 has sufficient documentation; verify npm package name before starting
- **Phase 8 (V1.x Enhancements):** All items are standard patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core technologies (Electron, Node.js, Socket.IO, better-sqlite3) verified against official docs and release notes. PeerJS and RetroUI are MEDIUM — PeerJS 1.5.5 is 9 months old but actively maintained; RetroUI npm package name needs verification before use. |
| Features | MEDIUM | Feature landscape well-understood from competitor analysis (Discord, Mumble, Revolt). Complexity estimates are informed but not measured builds. MVP scoping is opinionated but backed by dependency analysis. |
| Architecture | HIGH | WebRTC and Electron are mature with authoritative MDN and official Electron docs. Mesh topology for 2-5 users is well-validated. P2P vs SFU decision is clear at this user count. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (symmetric NAT, desktopCapturer, ICE race conditions, reconnect) verified across multiple sources including official Electron GitHub issues and Mozilla engineering blog. Some edge cases (bandwidth at exactly 5 users with screen share) are MEDIUM confidence. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **RetroUI package name:** Research notes to verify exact npm package name at npmjs.com/package/retroui before installation. Do not assume — use the npm search during Phase 6 planning.
- **coturn on Windows host:** coturn runs awkwardly on Windows. Research phase for Phase 2 must resolve whether to recommend Docker Desktop, WSL2, or Metered.ca free TURN tier as the primary path for Windows hosts.
- **Metered.ca free tier limits:** 3GB/month relay bandwidth is documented but should be validated against actual usage patterns for a 5-user group with screen sharing sessions.
- **Screen share frame rate floor:** The 5-6fps Electron bug (issue #23254) is real, but exact Electron version ranges where it appears and the precise constraint combination to fix it need validation in Phase 7 research.
- **Push-to-talk OS conflicts:** Electron globalShortcut conflicts with OS-level hotkeys (e.g., F-keys, media keys used by games) need testing across Windows 11 game environments during Phase 3.
- **Audio constraints causing getUserMedia failure:** PITFALLS.md notes some echoCancellation/noiseSuppression constraint combinations fail in Electron. The specific failing combinations need documentation during Phase 3.

## Sources

### Primary (HIGH confidence)
- Electron releases and official docs: https://releases.electronjs.org / https://www.electronjs.org/docs/latest — Electron 40.6.1 stack decisions, contextBridge security, desktopCapturer API, process model
- Electron Forge Vite template: https://www.electronforge.io/templates/vite-+-typescript — Official scaffold recommendation
- MDN WebRTC API: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API — Connectivity, protocols, Perfect Negotiation pattern
- MDN Perfect Negotiation: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation — Definitive signaling race condition fix
- Mozilla Perfect Negotiation blog: https://blog.mozilla.org/webrtc/perfect-negotiation-in-webrtc/ — Engineering rationale
- Socket.IO v4.8.3 changelog: https://socket.io/docs/v4/changelog/4.8.3 — December 2025 release confirmed
- better-sqlite3 Electron 39 fix: https://github.com/WiseLibs/better-sqlite3/issues/1416 — v12.4.2 fix confirmed
- coturn official repo: https://github.com/coturn/coturn — Self-hosted TURN reference
- Electron security docs: https://www.electronjs.org/docs/latest/tutorial/security — contextIsolation requirements
- Electron desktopCapturer API: https://www.electronjs.org/docs/latest/api/desktop-capturer/ — Screen share implementation
- Node.js 22 LTS: https://nodejs.org/en/blog/release/v22.20.0 — Active LTS confirmed
- Electron bug #23254 (screen share fps): https://github.com/electron/electron/issues/23254 — Frame rate floor confirmed
- Electron bug #31182 (desktopCapturer requires mainWindow): https://github.com/electron/electron/issues/31182 — Confirmed
- WebRTC.ventures STUN/TURN setup 2025: https://webrtc.ventures/2025/01/how-to-set-up-self-hosted-stun-turn-servers-for-webrtc-applications/ — Practical setup guidance

### Secondary (MEDIUM confidence)
- Prisma vs Drizzle in Electron: https://www.dbpro.app/blog/goodbye-prisma-hello-drizzle — Real-world benchmark; Drizzle decision validated
- PeerJS v1.5.5: https://github.com/peers/peerjs/releases — Maintained, 9 months old
- RetroUI component library: https://github.com/Dksie09/RetroUI — React + Tailwind pixel art components; npm package name needs verification
- WebRTC.ventures mesh architecture: https://webrtc.ventures/2021/06/webrtc-mesh-architecture/ — Mesh topology at 2-5 users
- BlogGeek.me WebRTC TURN: https://bloggeek.me/webrtc-turn/ — STUN vs TURN NAT type analysis
- BlogGeek.me common beginner mistakes: https://bloggeek.me/common-beginner-mistakes-in-webrtc/ — Pitfall validation
- Discord competitor analysis sources: Pumble review 2026, Discord support docs, How-To Geek self-hosted alternatives — Feature landscape

### Tertiary (LOW confidence — needs validation during implementation)
- Tailwind v4 + Electron Forge Vite: https://blog.mohitnagaraj.in/blog/202505/Electron_Shadcn_Guide — May 2025 guide; test Tailwind v4 integration early
- Metered.ca free TURN tier limits: Documented as 3GB/month but verify against actual group usage
- WebRTC.ventures 2026 tech stack guide: Partially inaccessible at research time; use with caution

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
