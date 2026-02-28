# Architecture Research

**Domain:** Self-hosted peer-to-peer voice/video chat desktop application
**Researched:** 2026-03-01
**Confidence:** HIGH — WebRTC and Electron are mature, well-documented technologies with authoritative sources available

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ELECTRON APP (per user)                       │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Renderer Process (Chromium — UI)                             │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │   │
│  │  │  React UI   │  │  WebRTC Peer │  │  Socket.IO Client│    │   │
│  │  │  Rooms, Chat│  │  Connection  │  │  (signaling)     │    │   │
│  │  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │   │
│  │         │                │                    │              │   │
│  │  ┌──────▼────────────────▼────────────────────▼──────────┐  │   │
│  │  │              Preload Script (contextBridge)             │  │   │
│  │  │              Exposes safe IPC APIs to renderer          │  │   │
│  │  └──────────────────────────────┬─────────────────────────┘  │   │
│  └─────────────────────────────────│────────────────────────────┘   │
│                                    │ IPC (ipcMain / ipcRenderer)    │
│  ┌─────────────────────────────────▼────────────────────────────┐   │
│  │  Main Process (Node.js)                                       │   │
│  │  ┌───────────────┐  ┌──────────────────┐  ┌──────────────┐   │   │
│  │  │ Window Manager│  │ desktopCapturer  │  │ File Manager │   │   │
│  │  │ BrowserWindow │  │ (screen sharing) │  │ (downloads)  │   │   │
│  │  └───────────────┘  └──────────────────┘  └──────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               │ WebSocket (Socket.IO)
                               │ (signaling messages only)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Node.js SERVER (host's PC — always on)              │
│                                                                       │
│  ┌────────────────────────┐   ┌───────────────────────────────┐     │
│  │  Express HTTP Server   │   │  Socket.IO Signaling Server   │     │
│  │  - Static file serve   │   │  - Room management            │     │
│  │  - Invite link gen     │   │  - SDP relay (offer/answer)   │     │
│  │  - Auth token check    │   │  - ICE candidate relay        │     │
│  └────────────────────────┘   │  - Presence tracking          │     │
│                                │  - Text chat broadcast        │     │
│  ┌────────────────────────┐   └───────────────────────────────┘     │
│  │  Data Store (SQLite)   │                                          │
│  │  - User accounts       │   ┌───────────────────────────────┐     │
│  │  - Chat message history│   │  STUN Config (external)       │     │
│  │  - Invite tokens       │   │  Google STUN (free)           │     │
│  │  - Room definitions    │   │  OR self-hosted coturn        │     │
│  └────────────────────────┘   └───────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                    │                          │
          WebRTC P2P Media                WebRTC P2P Media
          (audio/video/screen)            (audio/video/screen)
                    │                          │
       ┌────────────▼──────────┐  ┌───────────▼────────────┐
       │  Peer A (Electron)    │  │  Peer B (Electron)     │
       │  RTCPeerConnection    │  │  RTCPeerConnection     │
       └───────────────────────┘  └────────────────────────┘
```

**Key insight:** The server only carries signaling (small JSON messages). All audio, video, and screen share data flows directly peer-to-peer via WebRTC after the initial handshake. The server never touches media.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Signaling Server | Relay SDP offers/answers and ICE candidates between peers. Manage room membership. No media. | Express + Socket.IO on Node.js |
| RTCPeerConnection | Establish direct P2P link between two peers. Handle ICE negotiation, DTLS encryption, codec negotiation. | Browser-native API in Chromium renderer |
| STUN Server | Tell peers their public IP address so they can include it in ICE candidates. Stateless and cheap. | Google's `stun.l.google.com:19302` (free, no setup) |
| TURN Server | Relay media when direct P2P fails (symmetric NAT, strict firewall). Last resort. | coturn on the host PC or a VPS |
| Electron Main Process | Manage BrowserWindow lifecycle. Provide desktopCapturer for screen share. Bridge Node.js APIs to renderer. | ipcMain + BrowserWindow |
| Preload Script | Security bridge between renderer and main process. Expose safe contextBridge APIs only. | contextBridge.exposeInMainWorld |
| Renderer Process | Run the React UI. Handle WebRTC in the Chromium context. Connect to signaling server. | React + Socket.IO client + WebRTC APIs |
| Data Store | Persist user accounts, chat history, invite tokens. Must survive server restarts. | SQLite via better-sqlite3 |

## Recommended Project Structure

```
sex-dungeon/
├── server/                     # Node.js server (runs on host's PC)
│   ├── index.ts                # Entry point — Express + Socket.IO setup
│   ├── signaling/
│   │   ├── rooms.ts            # Room state: who is in which room
│   │   └── relay.ts            # SDP and ICE candidate relay logic
│   ├── auth/
│   │   ├── invites.ts          # Invite token generation and validation
│   │   └── sessions.ts         # Session token management
│   ├── chat/
│   │   └── messages.ts         # Text chat persistence and broadcast
│   ├── db/
│   │   ├── schema.ts           # SQLite schema definitions
│   │   └── client.ts           # better-sqlite3 connection singleton
│   └── config.ts               # Server config (port, STUN/TURN URLs)
│
├── client/                     # Electron + React app (all users)
│   ├── electron/
│   │   ├── main.ts             # Electron main process entry point
│   │   ├── preload.ts          # contextBridge API exposure
│   │   └── ipc/
│   │       ├── screen.ts       # desktopCapturer IPC handlers
│   │       └── window.ts       # Window management IPC handlers
│   └── renderer/               # React app (runs in Chromium)
│       ├── App.tsx
│       ├── pages/
│       │   ├── Join.tsx        # Invite link entry / first-time setup
│       │   ├── Lobby.tsx       # Room list, who's online
│       │   └── Room.tsx        # Active voice room view
│       ├── components/
│       │   ├── VoiceRoom/
│       │   ├── TextChat/
│       │   ├── UserAvatar/
│       │   └── ScreenShare/
│       ├── hooks/
│       │   ├── useWebRTC.ts    # RTCPeerConnection lifecycle
│       │   ├── useSignaling.ts # Socket.IO connection and events
│       │   └── useMedia.ts     # getUserMedia / getDisplayMedia
│       └── store/
│           └── index.ts        # Zustand or similar — client state
│
├── shared/                     # Types shared between server and client
│   ├── events.ts               # Socket.IO event name constants
│   └── types.ts                # Shared TypeScript interfaces
│
├── package.json                # Monorepo or separate package.json per workspace
└── tsconfig.json
```

### Structure Rationale

- **server/ vs client/ separation:** The server and client are deployed differently. The host runs the server. All friends run the client. Clear separation prevents import confusion and enables independent builds.
- **shared/:** Sharing event names and TypeScript types between server and client eliminates a whole class of signaling bugs where event names drift out of sync.
- **client/electron/ vs client/renderer/:** Electron's security model requires strict separation between main process code (Node.js access) and renderer code (web only). Mixing them is a security anti-pattern and also breaks the build.
- **hooks/ for WebRTC:** WebRTC lifecycle (creating RTCPeerConnection, handling ICE events, adding tracks) is stateful and complex. Isolating it in custom hooks keeps components readable and makes the WebRTC logic testable.

## Architectural Patterns

### Pattern 1: Mesh Topology for N <= 5 Peers

**What:** Each peer creates a direct RTCPeerConnection to every other peer. With 5 users, that is 10 connections total (n*(n-1)/2). No media server needed.

**When to use:** Fixed use case: 2-5 friends. Mesh is the correct choice here. An SFU (Selective Forwarding Unit) media server like mediasoup adds significant operational complexity and cost for a group this size.

**Trade-offs:** With 5 users each uploading to 4 peers, upstream bandwidth multiplies. For voice-only at ~32kbps Opus, 4 streams = ~128kbps up — well within home internet limits. Screen share at 720p/1Mbps across 4 peers = ~4Mbps up, which is near the edge of typical home upload speeds. Limit screen share to one sender at a time.

**Example:**
```typescript
// When a new peer joins the room, each existing peer creates a connection TO them
async function onPeerJoined(peerId: string, isInitiator: boolean) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:your-host:3478', username: 'user', credential: 'pass' }
    ]
  });

  // Add local audio/video tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // Initiator creates offer; joiner waits for offer
  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { to: peerId, sdp: offer });
  }

  peers[peerId] = pc;
}
```

### Pattern 2: Trickle ICE (Always Use This)

**What:** Send ICE candidates to the remote peer as they are discovered, rather than waiting for gathering to complete. Reduces connection setup time from seconds to under a second in the common case.

**When to use:** Always. The alternative (waiting for full ICE gathering) adds 1-5 seconds of extra delay before media flows.

**Trade-offs:** Requires the signaling server to be connected and responsive during ICE gathering. No meaningful downside for this use case.

**Example:**
```typescript
pc.onicecandidate = (event) => {
  if (event.candidate) {
    // Send candidate immediately — do not batch or wait
    socket.emit('ice-candidate', {
      to: peerId,
      candidate: event.candidate
    });
  }
};

// On receiving a candidate:
socket.on('ice-candidate', async ({ from, candidate }) => {
  const pc = peers[from];
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
});
```

### Pattern 3: Electron desktopCapturer for Screen Share

**What:** Electron does not implement the standard `navigator.mediaDevices.getDisplayMedia()` API the same way browsers do. For screen sharing, use Electron's `desktopCapturer.getSources()` from the main process, send the source ID to the renderer via IPC, then construct the MediaStream in the renderer using `navigator.mediaDevices.getUserMedia` with the source constraint.

**When to use:** Any time screen share is required in an Electron app. This is the correct Electron-specific pattern.

**Trade-offs:** More complex than the web-only path. Requires an IPC round-trip. The source picker UI must be built manually (no browser dialog).

**Example:**
```typescript
// main.ts — main process
ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 300, height: 200 }
  });
  return sources.map(s => ({ id: s.id, name: s.name }));
});

// renderer — after user picks a source
const sourceId = await window.electronAPI.getScreenSources(); // via contextBridge
const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId
    }
  } as any
});
```

### Pattern 4: Signaling Server as Room State Machine

**What:** The server maintains authoritative room state in memory (which socket IDs are in which room). When a peer joins a room, the server sends them the list of existing peers and broadcasts their arrival. Peers then establish mesh connections based on this list.

**When to use:** Always. The server must be the authority on room membership because clients cannot see each other before connecting.

**Trade-offs:** In-memory room state is lost if the server restarts. Acceptable for this use case — when the server restarts, all peers reconnect automatically via Socket.IO's reconnection logic.

**Example:**
```typescript
// Server-side room state
const rooms: Map<string, Set<string>> = new Map();

io.on('connection', (socket) => {
  socket.on('join-room', (roomId: string) => {
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    const room = rooms.get(roomId)!;

    // Tell the joining peer who's already here
    socket.emit('room-peers', { peers: [...room] });

    // Tell existing peers someone joined
    socket.to(roomId).emit('peer-joined', { peerId: socket.id });

    room.add(socket.id);
    socket.join(roomId);
  });

  socket.on('disconnect', () => {
    // Notify all rooms this socket was in
    rooms.forEach((members, roomId) => {
      if (members.has(socket.id)) {
        members.delete(socket.id);
        socket.to(roomId).emit('peer-left', { peerId: socket.id });
      }
    });
  });
});
```

## Data Flow

### WebRTC Connection Establishment Flow

```
Peer A (joiner)          Signaling Server           Peer B (existing)
     |                         |                          |
     |--join-room(roomId)----->|                          |
     |                         |--room-peers([B.id])----->A
     |                         |--peer-joined(A.id)------>|
     |                         |                          |
     | [A is initiator, creates offer to B]               |
     |--createOffer()          |                          |
     |--setLocalDescription()  |                          |
     | [ICE gathering starts]  |                          |
     |--offer(to:B, sdp)------>|--offer(from:A, sdp)----->|
     |                         |           setRemoteDescription(offer)
     |                         |           createAnswer()
     |                         |           setLocalDescription(answer)
     |<-answer(from:B, sdp)----|<-answer(to:A, sdp)-------|
     |  setRemoteDescription() |                          |
     |                         |                          |
     | [Trickle ICE — both sides simultaneously]          |
     |--ice-candidate(to:B)--->|--ice-candidate(from:A)-->|
     |<-ice-candidate(from:B)--|<-ice-candidate(to:A)-----|
     |  addIceCandidate()      |              addIceCandidate()
     |                         |                          |
     | [ICE selects best candidate pair]                  |
     |<========================= media flows P2P ========>|
     |       (bypasses signaling server entirely)         |
```

### Text Chat Flow

```
User types message
      ↓
Renderer → (Socket.IO emit) → Server
                                 ↓
                         Persist to SQLite
                                 ↓
                         Broadcast to all in room
                                 ↓
              All Renderer clients receive and display
```

### Screen Share Flow

```
User clicks "Share Screen"
      ↓
Renderer → IPC invoke → Main Process
                            ↓
                    desktopCapturer.getSources()
                            ↓
                    Returns source list → Renderer
                            ↓
                    User picks a source (custom UI)
                            ↓
                    getUserMedia({ chromeMediaSourceId })
                            ↓
                    Replace video track on all RTCPeerConnections
                    (replaceTrack — no renegotiation needed for same codec)
```

### Join / Invite Flow

```
Host generates invite link (server creates token → SQLite)
      ↓
Host shares link (e.g. http://192.168.1.x:PORT/join/TOKEN)
      ↓
Friend opens link in browser OR pastes into Electron client
      ↓
Client validates token with server (HTTP GET)
      ↓
Server returns server address + creates user session
      ↓
Client saves server address, connects Socket.IO
      ↓
User enters display name + avatar → stored in SQLite
      ↓
Normal operation begins
```

### Key Data Flows Summary

1. **Signaling:** Client → Socket.IO → Server → Socket.IO → Client (JSON messages only, no media)
2. **Media:** Client → WebRTC P2P → Client (direct, bypasses server after handshake)
3. **Chat:** Client → Socket.IO → Server (SQLite persist) → Socket.IO broadcast → All clients
4. **Screen share:** Main process → IPC → Renderer → WebRTC track replace → Peers
5. **File share:** Client → HTTP multipart POST → Server (disk) → HTTP GET link broadcast → Clients download

## Scaling Considerations

This app is deliberately scoped to 2-5 users. Scaling is not a goal. Documented here for awareness only.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2-5 users (target) | Mesh topology is correct. No media server needed. SQLite is sufficient. |
| 6-10 users | Mesh still works but screen share upstream bandwidth becomes painful. Consider muting video for non-speakers. SFU not yet necessary. |
| 10+ users | Mesh becomes unusable (n^2 connections). Would require SFU (mediasoup, Janus, LiveKit). Full architectural rewrite of media layer. Out of scope. |

### Scaling Priorities (if ever needed)

1. **First bottleneck:** Screen share upstream bandwidth. Fix: one active sharer at a time + resolution cap + VP8/VP9 adaptive bitrate.
2. **Second bottleneck:** Signaling server CPU at many connections. Fix: already solved for this scale — Socket.IO handles hundreds of concurrent connections on a single Node.js process.
3. **Not a bottleneck:** SQLite. At 2-5 users, chat message volume is trivial.

## Anti-Patterns

### Anti-Pattern 1: Routing Media Through the Signaling Server

**What people do:** Relay audio/video through the Node.js server using WebSocket or HTTP because it's simpler than setting up WebRTC.

**Why it's wrong:** Doubles latency (two hops instead of zero), saturates server upload bandwidth (1Mbps voice * 5 users = 5Mbps minimum always), and creates a bottleneck for screen share. The host's upload is limited to what they have available to relay.

**Do this instead:** Use WebRTC RTCPeerConnection for all media. The signaling server sends only small JSON control messages (SDP, ICE candidates, chat text).

### Anti-Pattern 2: Exposing Raw Node.js APIs to the Renderer

**What people do:** Set `nodeIntegration: true` in BrowserWindow options to make Node.js require() available in renderer code, or directly expose `ipcRenderer` via preload.

**Why it's wrong:** Any code running in the renderer (including any future XSS vulnerability) gets full Node.js access — file system, child_process, network. This is a critical security hole. Electron explicitly warns against it.

**Do this instead:** Use `contextBridge.exposeInMainWorld()` in the preload script to expose only the specific, narrow APIs the renderer needs. Keep `nodeIntegration: false` and `contextIsolation: true` (both are defaults in modern Electron).

### Anti-Pattern 3: Creating One RTCPeerConnection Per Room Instead of Per Peer

**What people do:** Create a single RTCPeerConnection and attempt to add multiple peers' tracks to it, or use a single connection object to multiplex all peers.

**Why it's wrong:** RTCPeerConnection is a bilateral (two-peer) protocol. One connection object represents exactly one peer-to-peer link. Mixing multiple peers into one connection is not how the API works and will fail at the ICE negotiation level.

**Do this instead:** Maintain a Map keyed by peer socket ID. Each entry is a separate RTCPeerConnection instance. When a peer leaves, close and delete their connection only.

### Anti-Pattern 4: Not Handling ICE Candidate Buffering

**What people do:** Call `addIceCandidate()` immediately when a candidate arrives from signaling, before `setRemoteDescription()` has been called.

**Why it's wrong:** ICE candidates cannot be added until the remote description is set. Calling `addIceCandidate()` before this throws an error and the candidate is lost, often causing connection failures.

**Do this instead:** Queue incoming ICE candidates in an array. After `setRemoteDescription()` completes successfully, drain the queue by calling `addIceCandidate()` for each buffered candidate.

```typescript
const iceCandidateBuffer: RTCIceCandidateInit[] = [];
let remoteDescSet = false;

async function handleRemoteDescription(sdp: RTCSessionDescriptionInit) {
  await pc.setRemoteDescription(sdp);
  remoteDescSet = true;
  // Drain buffer
  for (const candidate of iceCandidateBuffer) {
    await pc.addIceCandidate(candidate);
  }
  iceCandidateBuffer.length = 0;
}

function handleIceCandidate(candidate: RTCIceCandidateInit) {
  if (remoteDescSet) {
    pc.addIceCandidate(candidate);
  } else {
    iceCandidateBuffer.push(candidate);
  }
}
```

### Anti-Pattern 5: No TURN Server Fallback

**What people do:** Configure only STUN servers and assume P2P will always succeed.

**Why it's wrong:** Symmetric NAT (common on enterprise networks, some ISPs, and mobile hotspots) blocks STUN-discovered candidates. Without TURN, these peers simply cannot connect. The connection silently fails and users see no audio.

**Do this instead:** Include a TURN server in the ICE configuration. For a zero-budget project, the host's own PC can run coturn, OR use one of the free-tier TURN providers (Metered, Xirsys have limited free tiers). Document that TURN may require a public IP or port forwarding on the host side.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| STUN (Google) | ICE server config in RTCPeerConnection | Free, no setup. `stun:stun.l.google.com:19302`. HIGH confidence. |
| TURN (coturn) | ICE server config with username/credential | Self-hosted on host PC. Requires port 3478 (UDP/TCP) open. Moderate setup complexity. |
| TURN (Metered free tier) | ICE server config with API key | Free tier: 50GB/month relay bandwidth. Zero infrastructure to maintain. Fallback option. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Renderer ↔ Main Process | IPC (ipcMain.handle / ipcRenderer.invoke) via contextBridge | Use for: desktopCapturer, window management, any Node.js API the renderer needs |
| Client Renderer ↔ Signaling Server | Socket.IO WebSocket | Use for: room join/leave, SDP relay, ICE relay, text chat, presence events |
| Client ↔ Client (media) | WebRTC RTCPeerConnection | Audio, video, screen share tracks. Direct P2P after ICE negotiation. |
| Client ↔ Server (data) | HTTP REST (Express) | Use for: invite validation, file upload/download, initial user setup |
| Server ↔ SQLite | better-sqlite3 synchronous API | Synchronous is fine in Node.js for this scale. No async overhead, simpler code. |

## Build Order (Dependencies Between Components)

The correct build sequence based on component dependencies:

```
1. Shared types + event names       (no dependencies — foundation)
        ↓
2. SQLite schema + db client        (depends on: shared types)
        ↓
3. Express HTTP server + basic routes (depends on: db client)
        ↓
4. Socket.IO signaling server       (depends on: Express, db client)
        ↓
5. Invite link auth flow            (depends on: HTTP server, db client)
        ↓
6. Electron shell (main + preload)  (depends on: nothing — parallel with server)
        ↓
7. React UI shell + routing         (depends on: Electron shell)
        ↓
8. Signaling client (Socket.IO)     (depends on: React shell)
        ↓
9. WebRTC peer connections          (depends on: signaling client)
        ↓
10. Audio/video tracks              (depends on: WebRTC peer connections)
        ↓
11. Screen share (desktopCapturer)  (depends on: WebRTC, Electron IPC)
        ↓
12. Text chat                       (depends on: signaling client, db)
        ↓
13. File sharing                    (depends on: HTTP server, React UI)
        ↓
14. UI polish + retro aesthetic     (depends on: all features working)
```

**Rationale:** Shared types first prevents rework. Signaling must exist before WebRTC (peers cannot find each other without it). WebRTC must work before media features. Screen share depends on both WebRTC and Electron-specific IPC. Text chat and file share are independent features that can be built once the core works.

## Sources

- MDN WebRTC API: Connectivity — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity (HIGH confidence — official spec documentation)
- MDN WebRTC API: Protocols — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols (HIGH confidence — official)
- Electron Process Model docs — https://www.electronjs.org/docs/latest/tutorial/process-model (HIGH confidence — official)
- Electron IPC docs — https://www.electronjs.org/docs/latest/tutorial/ipc (HIGH confidence — official)
- Electron desktopCapturer API — https://www.electronjs.org/docs/latest/api/desktop-capturer/ (HIGH confidence — official)
- WebRTC.ventures: Mesh Architecture — https://webrtc.ventures/2021/06/webrtc-mesh-architecture/ (MEDIUM confidence — verified practitioner source)
- WebRTC.ventures: STUN/TURN Setup 2025 — https://webrtc.ventures/2025/01/how-to-set-up-self-hosted-stun-turn-servers-for-webrtc-applications/ (MEDIUM confidence — recent practitioner source)
- GetStream: WebRTC Signaling Server — https://getstream.io/resources/projects/webrtc/basics/signaling-server/ (MEDIUM confidence — verified with MDN)
- coturn GitHub — https://github.com/coturn/coturn (HIGH confidence — official project repository)
- WebRTC.ventures: Tech Stack Guide 2026 — https://webrtc.ventures/2026/01/webrtc-tech-stack-guide-architecture-for-scalable-real-time-applications/ (MEDIUM confidence — current year, content partially inaccessible)

---
*Architecture research for: self-hosted peer-to-peer voice/video chat (Sex Dungeon)*
*Researched: 2026-03-01*
