# Stack Research

**Domain:** Self-hosted voice/video chat desktop app (Discord alternative)
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH (core stack HIGH, some edge cases MEDIUM)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Electron | ^40.x (latest stable) | Desktop app shell | Only mature cross-platform JS desktop framework; v40 ships Chromium 128+ with full WebRTC getDisplayMedia support; contextBridge + context isolation are now defaults which closes the biggest historical security gaps |
| Node.js | 22.x LTS | Runtime (main process + server) | Active LTS until April 2027; Electron 39/40 ships Node 22 internally, so aligning the dev environment avoids version mismatch; native `node:sqlite` landed in Node 22.5 as an alternative to native addons |
| TypeScript | ^5.x | Language | End-to-end type safety across main/renderer/preload/server; catches IPC contract mismatches at compile time which is where this project will have the most subtle bugs |
| React 19 | ^19.x | Renderer UI framework | Electron Forge's official Vite+TypeScript template targets React; ecosystem of retro-themed component libraries (RetroUI) are React-based; Concurrent Mode features help keep audio controls responsive |
| Vite | ^6.x | Renderer build tool | Electron Forge Vite plugin is now stable (v7.5+); HMR in both main and renderer processes; dramatically faster than Webpack for iteration |
| Socket.io | ^4.8.3 | WebRTC signaling | Industry-standard WebRTC signaling transport; room-based events map directly to "voice room" semantics; auto-reconnect handles the home-internet disconnection scenario; version 4.8.x actively maintained as of Dec 2025 |
| WebRTC (native) | Browser API | Peer-to-peer voice/video/screen | Built into Electron's Chromium; no library needed for the actual P2P transport — only signaling infrastructure is required |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PeerJS | ^1.5.5 | WebRTC peer abstraction | Wraps RTCPeerConnection with a clean API for offer/answer/ICE exchange; use for voice/video connections between peers (2-5 users); actively maintained, last published 2025 |
| better-sqlite3 | ^12.6.2 | Local SQLite database (main process) | Synchronous SQLite for Electron main process; stores chat messages, user accounts, room history; v12.4.2+ fixed the Electron 39/40 V8 compatibility break — use 12.6.2+ |
| Drizzle ORM | ^0.38.x | SQL query builder / schema management | Type-safe SQL for better-sqlite3; ~7.4KB bundle; no binary engine (unlike Prisma which causes Electron build failures); schema lives as TypeScript code next to your models |
| Tailwind CSS | ^4.x | UI utility classes | v4 ships with Vite plugin support; works with Electron Forge Vite template; use for the retro aesthetic's layout and spacing |
| RetroUI | latest | Retro component primitives | Tailwind-based, 40+ React components with pixel-art borders, neon colors, arcade-style buttons; exact fit for the gaming aesthetic requirement |
| Zustand | ^5.x | Client-side state | ~1KB; manages voice room state (who is connected, muted/unmuted, screen share active) across React renderer; works cleanly with Electron IPC boundaries |
| electron-forge | ^7.x | Build + package + distribute | Official Electron tool; handles code signing, Windows installer (NSIS), macOS DMG; use vite-typescript template to bootstrap |
| electron-rebuild | ^3.x | Rebuild native addons | Required to recompile better-sqlite3 against specific Electron V8; run after `npm install`; configured once and then automated |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Electron Forge (vite-typescript template) | Project scaffold + dev/build pipeline | `npm create electron-app@latest my-app -- --template=vite-typescript`; gives hot-reload main process + Vite HMR renderer out of the box |
| electron-devtools-installer | Install React DevTools in Electron dev mode | Add to main process development block; remove for production |
| Drizzle Kit | Schema migration CLI | `drizzle-kit push` for local dev; `drizzle-kit migrate` for production schema changes; keeps SQLite schema in sync |
| ESLint + TypeScript ESLint | Lint | Enforce contextBridge patterns and IPC type safety |
| Prettier | Format | Consistency across main/renderer/preload files |

---

## Installation

```bash
# Scaffold with Electron Forge vite-typescript template
npm create electron-app@latest sex-dungeon -- --template=vite-typescript
cd sex-dungeon

# Core runtime dependencies
npm install socket.io socket.io-client peerjs
npm install better-sqlite3 drizzle-orm
npm install react react-dom zustand

# UI
npm install tailwindcss @tailwindcss/vite
npm install retroui  # verify exact package name at npmjs.com/package/retroui

# Dev dependencies
npm install -D electron-rebuild
npm install -D drizzle-kit
npm install -D @types/better-sqlite3
npm install -D eslint typescript-eslint prettier

# Rebuild native addons against Electron
npx electron-rebuild
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Electron | Tauri | If Rust is acceptable and binary size / memory footprint is critical; Tauri does not ship a full browser engine so WebRTC APIs are OS-dependent and less predictable |
| Electron | NW.js | Never — NW.js has a smaller community, less documentation, and no equivalent to contextBridge security model |
| PeerJS | simple-peer | If you need lower-level control over ICE/SDP; note that feross/simple-peer is unmaintained (last published 2021); `@thaunknown/simple-peer` is an active fork but adds complexity |
| PeerJS | mediasoup / Janus | If you ever scale beyond 5 users and need an SFU; overkill for 2-5 users and requires a separate media server process |
| Socket.io | ws (raw WebSocket) | If you want zero overhead and will implement reconnection/room logic yourself; Socket.io's room model saves significant signaling code |
| Socket.io | PeerJS signaling server | PeerJS includes its own signaling server (`peerjs-server`), but it's harder to customize room semantics and text chat on top of it |
| better-sqlite3 | sql.js | If distributing native binaries is blocked; sql.js is pure JS but runs in memory (data lost on close) unless you manually serialize to disk |
| better-sqlite3 | Prisma | Never for Electron — Prisma requires a binary engine that causes build failures and doubles bundle size; multiple real-world Electron developers switched from Prisma to Drizzle |
| Drizzle ORM | Raw better-sqlite3 | Acceptable for a very simple schema; Drizzle adds safety without overhead once you have 3+ tables |
| React 19 | Svelte | Svelte is smaller but RetroUI and most Electron UI component libraries are React-based; switching means building retro components from scratch |
| Tailwind v4 | CSS Modules / vanilla CSS | Both work; Tailwind v4 compiles to near-zero runtime CSS which is better for Electron's constrained renderer |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Prisma ORM | Binary engine breaks Electron packaging; one developer saw bundle go from 523MB to 300MB after switching; Prisma's average query latency ~450ms vs Drizzle's ~30ms on SQLite | Drizzle ORM |
| feross/simple-peer | Unmaintained since 2021; last npm publish 4 years ago; will accumulate security debt | PeerJS or `@thaunknown/simple-peer` fork |
| better-sqlite3 < 12.4.2 | Fails to build with Electron 39+ due to V8 API removal (Context::GetIsolate deprecated); fixed in 12.4.2 | better-sqlite3 ^12.6.2 |
| Exposing raw ipcRenderer via contextBridge | Security footgun; grants renderer full IPC access; official Electron docs warn against this | Wrap each IPC call in a named function in preload, expose only the wrapper |
| Daily.co / Twilio / Agora SDKs | Paid services; violates zero-budget constraint | Native WebRTC + PeerJS + self-hosted signaling |
| Mediasoup / LiveKit / Janus | SFU architecture is correct at 10+ users; at 2-5 users it adds a mandatory media server process that the host PC must run, consuming CPU for transcoding that isn't needed in pure P2P | PeerJS P2P mesh for <=5 users |
| electron-store for critical data | electron-store (JSON file storage) is fine for settings/preferences but not for queryable chat history | better-sqlite3 for messages; electron-store only for simple key-value preferences |
| Redux Toolkit | Massive boilerplate for a 2-5 user chat app; overkill | Zustand (~1KB, zero boilerplate) |
| NW.js | No contextBridge security model; smaller ecosystem; effectively unmaintained relative to Electron | Electron |
| Webpack in Electron Forge | Electron Forge's Webpack plugin is the legacy path; Vite template is now stable and replaces it | Electron Forge vite-typescript template |

---

## Stack Patterns by Variant

**If all users are on the same local network (LAN only):**
- Skip coturn/TURN entirely
- Use only Google's public STUN (`stun:stun.l.google.com:19302`)
- ICE will resolve host candidates directly
- This is the simplest deployment scenario

**If users are on different home networks (internet, behind NAT):**
- STUN alone succeeds ~80% of the time for symmetric NAT
- Add coturn as TURN relay for the remaining ~20%
- Run coturn on the host PC (Linux/Docker) or use a free TURN service like Metered.ca (3GB/month free tier)
- On Windows host: coturn runs awkwardly; recommend Docker Desktop or WSL2 for coturn
- The Metered.ca free tier is acceptable for a 2-5 user private group as a zero-cost TURN fallback

**If the retro aesthetic needs pixel-perfect fonts:**
- Load `Press Start 2P` from Google Fonts (zero cost, open source)
- Bundle as a local font file in the Electron app assets to avoid network dependency

**If screen sharing optimization for gaming is needed:**
- Use `getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 } } })`
- Electron exposes `desktopCapturer.getSources()` for listing windows/screens (required because Electron does not implement browser-standard `getDisplayMedia` picker UI — you must build your own source picker)
- Cap at 1080p/30fps for a 2-5 user group on home internet; 60fps requires ~4-8 Mbps upload per viewer

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| better-sqlite3 ^12.6.2 | Electron ^40.x | Fixed in 12.4.2; requires `electron-rebuild` after npm install |
| Drizzle ORM ^0.38.x | better-sqlite3 ^12.x | Use `drizzle-kit push` for local dev; avoid `drizzle-kit studio` in Electron main process context |
| PeerJS ^1.5.5 | Electron renderer (Chromium) | Runs in renderer process; communicates back to main via contextBridge IPC |
| Socket.io ^4.8.3 | Node.js 22.x | Client runs in renderer; server runs in main process or as a separate Node server |
| Tailwind CSS v4 | Vite ^6.x | Use `@tailwindcss/vite` plugin; some electron-vite (unofficial) users reported migration issues — use Electron Forge's official Vite plugin, not electron-vite |
| React ^19.x | Electron ^40.x | No known compatibility issues; runs entirely in renderer process |

---

## Process Architecture (How the Stack Fits Together)

Electron has two process types. Understanding which library lives where avoids the most common Electron mistakes:

```
MAIN PROCESS (Node.js)
  - Socket.io server (signaling, room management)
  - better-sqlite3 + Drizzle (message/user storage)
  - File system operations (file sharing)
  - coturn process spawning (optional)
  - ipcMain handlers

PRELOAD SCRIPT (contextBridge)
  - Exposes named wrappers: { joinRoom, sendMessage, getHistory, onPeerJoined }
  - Never exposes raw ipcRenderer
  - Bridges main <-> renderer safely

RENDERER PROCESS (Chromium/React)
  - React 19 + Zustand (UI state)
  - Tailwind CSS + RetroUI (styling)
  - PeerJS + WebRTC (peer connections, media streams)
  - Socket.io-client (signaling connection to main process server)
```

The key insight: WebRTC (PeerJS) and Socket.io-client both run in the renderer (Chromium), not Node.js. This is correct — WebRTC is a browser API. The signaling server (Socket.io server) runs in the Electron main process, which means the host PC runs both the server and a client simultaneously.

---

## Sources

- Electron releases: https://releases.electronjs.org — Electron 40.6.1 is latest stable as of research date (HIGH confidence)
- Electron Forge Vite template: https://www.electronforge.io/templates/vite-+-typescript — Official recommendation (HIGH confidence)
- Socket.io v4.8.3 changelog: https://socket.io/docs/v4/changelog/4.8.3 — December 2025 release (HIGH confidence)
- better-sqlite3 Electron 39 fix: https://github.com/WiseLibs/better-sqlite3/issues/1416 — Fixed in v12.4.2 Nov 2025 (HIGH confidence)
- PeerJS v1.5.5: https://github.com/peers/peerjs/releases — 9 months old, actively maintained (MEDIUM confidence)
- simple-peer maintenance status: https://www.npmjs.com/package/simple-peer — Last published 4 years ago (HIGH confidence, unmaintained)
- Prisma vs Drizzle in Electron: https://www.dbpro.app/blog/goodbye-prisma-hello-drizzle — Real-world Electron app benchmark (MEDIUM confidence)
- Coturn for self-hosted TURN: https://webrtc.ventures/2025/01/how-to-set-up-self-hosted-stun-turn-servers-for-webrtc-applications/ — January 2025 (MEDIUM confidence)
- Node.js 22 LTS: https://nodejs.org/en/blog/release/v22.20.0 — Active LTS confirmed (HIGH confidence)
- RetroUI component library: https://github.com/Dksie09/RetroUI — Tailwind-based, React, pixel art components (MEDIUM confidence — verify npm package name before use)
- Electron contextBridge security: https://www.electronjs.org/docs/latest/api/context-bridge — Official docs (HIGH confidence)
- Electron desktopCapturer for screen share: WebRTC.ventures research + Electron GitHub issue #33837 — Electron requires custom source picker, not browser getDisplayMedia UI (MEDIUM confidence)
- Tailwind v4 + Electron Forge Vite: https://blog.mohitnagaraj.in/blog/202505/Electron_Shadcn_Guide — May 2025 guide (MEDIUM confidence)
- Zustand for Electron: https://github.com/goosewobbler/zutron — Zutron project confirms Zustand works in Electron renderer (MEDIUM confidence)

---
*Stack research for: Self-hosted voice/video chat desktop app*
*Researched: 2026-03-01*
