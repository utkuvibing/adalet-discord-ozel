# The Inn

Private, self-hosted voice and text chat for friend groups. Discord-like experience that runs entirely on your own computer — no cloud, no subscriptions, no third parties. Just you and your friends.

## Features

- **Push-to-Talk Voice Chat** — WebRTC peer-to-peer audio with mute/deafen controls and per-user speaking indicators
- **Text Chat** — Real-time messaging with emoji reactions, typing indicators, and message history
- **File & Image Sharing** — Drag-and-drop or paste files up to 25 MB; images render inline with lightbox preview
- **Room System** — Host can create, delete, and reorder rooms; users switch freely between them
- **Invite Codes** — Cryptographically secure tokens with configurable expiration and usage limits
- **Screen Sharing** — Share your screen or a specific window with audio capture support
- **Internet Tunneling** — Built-in support for ngrok, Cloudflare Tunnel, and other tunneling tools for remote access
- **System Tray** — Minimize to tray; stays running in the background
- **Session Persistence** — Auto-reconnects on network drops; sessions survive app restarts
- **Deep Links** — `theinn://` protocol handler for one-click invite joining
- **Single Instance Lock** — Prevents accidental duplicate launches

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | [Electron 40](https://www.electronjs.org/) with Electron Forge |
| Frontend | [React 19](https://react.dev/) + TypeScript |
| Bundler | [Vite 5](https://vite.dev/) (separate configs for main, preload, renderer) |
| Backend | [Express.js 5](https://expressjs.com/) + [Socket.IO 4](https://socket.io/) |
| Database | [SQLite](https://www.sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) with Drizzle Kit migrations |
| Voice/Video | WebRTC (peer-to-peer) with STUN/TURN fallback |
| File Uploads | [Multer](https://github.com/expressjs/multer) (disk storage, 25 MB limit) |
| Installer | Squirrel.Windows (auto-update capable) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- npm (comes with Node.js)
- Windows 10/11 (primary target; Electron supports macOS/Linux but installers are Windows-only)

### Install

```bash
git clone https://github.com/utkuvibing/adalet-discord-ozel.git
cd adalet-discord-ozel
npm install
```

The `postinstall` script automatically rebuilds native modules (better-sqlite3) for Electron.

### Run (Development)

```bash
npm start
```

Launches the Electron app with Vite hot-reload for the renderer process.

### Build

```bash
npm run make
```

Produces a Windows installer (`Setup.exe`) via Electron Forge + Squirrel.

### Database

Drizzle Kit manages the SQLite schema. Migrations run automatically on startup, but you can also run them manually:

```bash
npm run db:push       # Push schema to database
npm run db:generate   # Generate migration files
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Electron Main                     │
│  ┌──────────────┐  ┌────────────────────────────┐   │
│  │  IPC Bridge   │  │    Embedded Server          │   │
│  │  (preload.ts) │  │  ┌────────┐ ┌───────────┐  │   │
│  │               │  │  │Express │ │ Socket.IO │  │   │
│  │  PTT, tray,   │  │  │REST API│ │ signaling │  │   │
│  │  screen share │  │  └───┬────┘ └─────┬─────┘  │   │
│  └──────┬───────┘  │      │             │         │   │
│         │          │  ┌───┴─────────────┴───┐     │   │
│         │          │  │   SQLite (Drizzle)   │     │   │
│         │          │  └──────────────────────┘     │   │
│         │          └────────────────────────────┘   │
└─────────┼───────────────────────────────────────────┘
          │
┌─────────┴───────────────────────────────────────────┐
│                 Renderer (React + Vite)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │JoinServer│ │  Lobby   │ │ChatPanel │ │  Voice │  │
│  │          │ │          │ │          │ │Controls│  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│                                                       │
│  ┌──────────────────┐  ┌─────────────────────────┐   │
│  │ SocketContext     │  │ useWebRTC / useAudio    │   │
│  │ (connection mgmt) │  │ (P2P voice & screen)    │   │
│  └──────────────────┘  └─────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

**How it works:** The host launches the app, which starts an Express + Socket.IO server on port `7432`. The server handles signaling, chat persistence, file uploads, and invite validation. Voice and screen sharing are peer-to-peer via WebRTC — audio never passes through the server. Guests connect using invite links over LAN or through a tunnel for internet access.

## Connecting Over the Internet

For friends outside your local network, use any TCP tunneling tool:

```bash
# ngrok
ngrok http 7432

# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:7432

# localtunnel
npx localtunnel --port 7432
```

Paste the public URL into the app's "Public URL" field, and generated invite links will use it automatically.

## License

[MIT](https://opensource.org/licenses/MIT) — Utku Sahin
