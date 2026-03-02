# Phase 2: Signaling and NAT Traversal - Research

**Researched:** 2026-03-01
**Domain:** WebRTC signaling (Socket.IO), NAT traversal (STUN/TURN), invite token authentication
**Confidence:** HIGH

## Summary

This phase extends the existing Express + Socket.IO server (port 7432) with WebRTC signaling handlers, invite-based authentication, and NAT traversal configuration. The server already exists from Phase 1 with `io.on('connection')` stub, typed event constants (commented out), and an `invite_tokens` DB table. The renderer needs `socket.io-client` to connect, and each peer pair needs an `RTCPeerConnection` using the Perfect Negotiation pattern to handle simultaneous offers without race conditions.

The STUN/TURN decision (Claude's discretion) resolves to: use Google public STUN servers for the common case (works for ~85% of NAT types) plus Metered.ca Open Relay Project as the free TURN fallback for symmetric NAT. This avoids requiring Docker/WSL2/coturn on the host's Windows machine, which was flagged as a blocker in STATE.md. The invite token system needs a schema migration because the existing `usedBy` column is single-use, but the user decision requires Discord-style multi-use tokens with configurable limits.

**Primary recommendation:** Build signaling as thin relay handlers on the existing Socket.IO server, implement Perfect Negotiation on the client side with polite/impolite roles assigned by socket.id comparison, use Metered.ca Open Relay for TURN (zero host setup), and migrate the invite_tokens schema to support multi-use with maxUses + useCount columns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Host clicks a "Copy Invite" button and gets a text string (IP:port + token) to paste into Discord/WhatsApp/etc.
- Host sees a configurable UI: generated link preview + expiry picker (1 hour, 24 hours, never)
- Invite tokens are multi-use with a configurable limit (Discord-style) -- one link can be used by N friends until limit or expiry
- Friend opens the app and pastes the invite string into a "Join Server" input field to connect
- On connect, friend sees a room list sidebar showing all rooms (Dungeon, Arena, Tavern) with user counts per room
- Clicking/hovering a room expands to show who is inside (Discord voice channel style)
- Users are NOT auto-joined to any room -- they pick from the list
- Each user in a room shows: display name + green online dot
- No status/idle/away indicators in this phase -- just connected or not
- Inline system message in the room: "PlayerOne joined the room." / "PlayerOne left the room."
- Server unreachable: auto-retry with countdown ("Can't reach server. Retrying in 5s...") + manual retry button
- Expired/invalid invite: actionable error message ("This invite has expired. Ask the host for a new invite link.")
- NAT traversal failure: silent automatic TURN relay fallback -- user doesn't see connection method details
- Mid-session disconnect: Socket.IO auto-reconnects silently; brief "Reconnecting..." toast only if reconnection takes >3 seconds
- Host sees the same room/presence view as friends -- no special admin dashboard in this phase

### Claude's Discretion
- STUN/TURN provider choice (coturn vs Metered.ca vs other)
- Exact invite token format and encoding
- Socket.IO reconnection strategy and timing parameters
- Perfect Negotiation implementation details
- Error message copy and toast styling

### Deferred Ideas (OUT OF SCOPE)
- Host connection status dashboard (see all users, connection type, latency) -- future admin/monitoring phase
- Deep link protocol (sexdungeon://) -- could be added later for convenience
- QR code invite sharing -- nice to have but not essential
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFR-04 | App works across different home networks (NAT traversal with STUN/TURN) | Google STUN + Metered.ca Open Relay TURN; ICE configuration pattern; Perfect Negotiation handles glare |
| AUTH-01 | Host can generate invite links that friends use to join | crypto.randomBytes token generation; Socket.IO auth middleware validates token on handshake; invite_tokens schema with multi-use support |
| AUTH-04 | Invite links expire after a configurable time period | expiresAt column in invite_tokens table; server-side expiry check in Socket.IO middleware; UI expiry picker (1h, 24h, never) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| socket.io | 4.8.3 | Server-side signaling (already installed) | Already in dependencies; typed events, rooms, middleware auth |
| socket.io-client | 4.8.3 | Client-side signaling from renderer | Matched version with server; works in Electron renderer |
| RTCPeerConnection | Web API | Peer-to-peer connections | Browser built-in; no npm package needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (node:crypto) | Built-in | Secure invite token generation | Token creation via randomBytes -- no external dependency |
| uuid | Not needed | -- | crypto.randomBytes(24).toString('base64url') is simpler and more secure |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Metered.ca Open Relay (TURN) | Self-hosted coturn via Docker | coturn requires Docker Desktop + WSL2 on Windows host; operational burden; Open Relay is zero-setup with 500MB free TURN/month |
| Metered.ca Open Relay (TURN) | Metered.ca paid tier | Paid tier has 500MB free + enterprise features; Open Relay has 500MB free -- equivalent for 2-5 friend group |
| socket.io-client in renderer | Raw WebSocket | Socket.IO adds rooms, auto-reconnect, middleware auth, binary support -- too much to reimplement |
| Perfect Negotiation | Manual caller/callee roles | Perfect Negotiation is the W3C-recommended pattern; eliminates race conditions; same code for all peers |

**Installation:**
```bash
npm install socket.io-client
```

Note: `socket.io` 4.8.3 and `express` 5.2.1 are already installed. `node:crypto` is built-in. No other packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── server/
│   ├── index.ts              # Express + Socket.IO setup (EXTEND)
│   ├── signaling.ts          # NEW: Socket.IO event handlers (room, SDP, ICE relay)
│   ├── invite.ts             # NEW: Invite token CRUD (generate, validate, revoke)
│   ├── middleware/
│   │   └── auth.ts           # NEW: Socket.IO auth middleware (token validation)
│   └── db/
│       ├── schema.ts         # MODIFY: invite_tokens schema (add maxUses, useCount)
│       ├── client.ts          # Unchanged
│       ├── migrate.ts         # Unchanged (auto-runs new migration)
│       └── seed.ts            # Unchanged
├── shared/
│   ├── events.ts             # MODIFY: Uncomment Phase 2 events, add new ones
│   └── types.ts              # MODIFY: Add signaling types, update InviteToken
├── renderer/
│   ├── hooks/
│   │   ├── useSocket.ts      # NEW: Socket.IO client connection hook
│   │   └── useWebRTC.ts      # NEW: Perfect Negotiation + RTCPeerConnection hook
│   ├── components/
│   │   ├── JoinServer.tsx     # NEW: Paste invite string input
│   │   ├── RoomList.tsx       # NEW: Room sidebar with user counts
│   │   ├── RoomMembers.tsx    # NEW: Expandable member list per room
│   │   ├── InvitePanel.tsx    # NEW: Copy Invite button + expiry picker (host)
│   │   └── ConnectionToast.tsx # NEW: Reconnecting toast
│   └── context/
│       └── SocketContext.tsx  # NEW: React context for socket instance
├── preload.ts                # MODIFY: Add invite IPC methods
├── main.ts                   # MODIFY: Add invite IPC handlers
└── App.tsx                   # MODIFY: Route between Join and Room views
```

### Pattern 1: Socket.IO Typed Events
**What:** Define all event names and payload types as TypeScript interfaces shared between server and client
**When to use:** Every Socket.IO emit/on call
**Example:**
```typescript
// src/shared/events.ts
export const SocketEvents = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  // Room management
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_LIST: 'room:list',
  // Signaling
  SDP_OFFER: 'sdp:offer',
  SDP_ANSWER: 'sdp:answer',
  ICE_CANDIDATE: 'ice:candidate',
  // Presence
  PRESENCE_UPDATE: 'presence:update',
  SYSTEM_MESSAGE: 'system:message',
  // Errors
  ERROR: 'error',
} as const;

// src/shared/types.ts - Socket.IO typed interfaces
// Source: https://socket.io/docs/v4/typescript/
interface ServerToClientEvents {
  'room:list': (rooms: RoomWithMembers[]) => void;
  'presence:update': (update: PresenceUpdate) => void;
  'sdp:offer': (payload: SDPPayload) => void;
  'sdp:answer': (payload: SDPPayload) => void;
  'ice:candidate': (payload: ICEPayload) => void;
  'system:message': (msg: SystemMessage) => void;
  'error': (err: { code: string; message: string }) => void;
}

interface ClientToServerEvents {
  'room:join': (roomId: number) => void;
  'room:leave': (roomId: number) => void;
  'sdp:offer': (payload: SDPPayload) => void;
  'sdp:answer': (payload: SDPPayload) => void;
  'ice:candidate': (payload: ICEPayload) => void;
}
```

### Pattern 2: Socket.IO Auth Middleware
**What:** Validate invite token on connection handshake before allowing any signaling
**When to use:** Every new Socket.IO connection from a friend (not the host)
**Example:**
```typescript
// src/server/middleware/auth.ts
// Source: https://socket.io/docs/v4/middlewares/
import type { Server } from 'socket.io';

export function registerAuthMiddleware(io: Server): void {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error('MISSING_TOKEN'));
    }

    const invite = await findValidInviteToken(token);
    if (!invite) {
      return next(new Error('INVALID_TOKEN'));
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return next(new Error('EXPIRED_TOKEN'));
    }
    if (invite.maxUses && invite.useCount >= invite.maxUses) {
      return next(new Error('TOKEN_LIMIT_REACHED'));
    }

    // Increment use count
    await incrementTokenUseCount(invite.id);

    // Attach user info to socket for later use
    socket.data.inviteTokenId = invite.id;
    next();
  });
}

// Client-side connection with auth token:
// const socket = io(`http://${serverAddress}`, {
//   auth: { token: inviteToken }
// });
```

### Pattern 3: Perfect Negotiation (WebRTC)
**What:** Symmetric negotiation pattern where polite/impolite roles handle simultaneous offers
**When to use:** Every peer-to-peer WebRTC connection in a room
**Example:**
```typescript
// src/renderer/hooks/useWebRTC.ts
// Source: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    {
      urls: 'turn:a.]relay.metered.ca:80',
      username: 'open-relay-username',   // from Open Relay API
      credential: 'open-relay-credential',
    },
    {
      urls: 'turn:a.relay.metered.ca:443?transport=tcp',
      username: 'open-relay-username',
      credential: 'open-relay-credential',
    },
  ],
};

// Polite/impolite determination: compare socket IDs lexicographically
// The peer with the "lower" socket.id is polite
const polite = mySocketId < remoteSocketId;

let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;

const pc = new RTCPeerConnection(ICE_CONFIG);

pc.onnegotiationneeded = async () => {
  try {
    makingOffer = true;
    await pc.setLocalDescription();
    socket.emit('sdp:offer', {
      to: remoteSocketId,
      description: pc.localDescription,
    });
  } catch (err) {
    console.error(err);
  } finally {
    makingOffer = false;
  }
};

pc.onicecandidate = ({ candidate }) => {
  if (candidate) {
    socket.emit('ice:candidate', { to: remoteSocketId, candidate });
  }
};

// Handle incoming signaling messages
socket.on('sdp:offer', async ({ from, description }) => {
  if (from !== remoteSocketId) return;
  try {
    const readyForOffer =
      !makingOffer &&
      (pc.signalingState === 'stable' || isSettingRemoteAnswerPending);
    const offerCollision = description.type === 'offer' && !readyForOffer;
    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) return;

    isSettingRemoteAnswerPending = description.type === 'answer';
    await pc.setRemoteDescription(description);
    isSettingRemoteAnswerPending = false;

    if (description.type === 'offer') {
      await pc.setLocalDescription();
      socket.emit('sdp:answer', {
        to: remoteSocketId,
        description: pc.localDescription,
      });
    }
  } catch (err) {
    console.error(err);
  }
});
```

### Pattern 4: Signaling Relay (Server-Side)
**What:** Server does NOT interpret SDP/ICE -- it simply relays payloads between specific peers
**When to use:** All SDP and ICE candidate messages
**Example:**
```typescript
// src/server/signaling.ts
socket.on('sdp:offer', (payload: { to: string; description: RTCSessionDescriptionInit }) => {
  // Relay to the target peer only
  io.to(payload.to).emit('sdp:offer', {
    from: socket.id,
    description: payload.description,
  });
});

socket.on('sdp:answer', (payload: { to: string; description: RTCSessionDescriptionInit }) => {
  io.to(payload.to).emit('sdp:answer', {
    from: socket.id,
    description: payload.description,
  });
});

socket.on('ice:candidate', (payload: { to: string; candidate: RTCIceCandidateInit }) => {
  io.to(payload.to).emit('ice:candidate', {
    from: socket.id,
    candidate: payload.candidate,
  });
});
```

### Pattern 5: Room Management with Socket.IO Rooms
**What:** Use Socket.IO's built-in room system for presence tracking
**When to use:** When users join/leave voice rooms
**Example:**
```typescript
// Server: user joins a room
socket.on('room:join', (roomId: number) => {
  // Leave any current room first
  for (const room of socket.rooms) {
    if (room !== socket.id && room.startsWith('room:')) {
      socket.leave(room);
      io.to(room).emit('system:message', {
        text: `${socket.data.displayName} left the room.`,
      });
    }
  }

  const roomKey = `room:${roomId}`;
  socket.join(roomKey);

  // Broadcast join to room members
  io.to(roomKey).emit('system:message', {
    text: `${socket.data.displayName} joined the room.`,
  });

  // Broadcast updated presence to all connected clients
  broadcastPresence(io);
});
```

### Anti-Patterns to Avoid
- **Storing SDP/ICE on the server:** The server is a relay only. Never persist signaling data in SQLite.
- **Using PeerJS for signaling:** PeerJS has its own signaling server (PeerServer). Since we already have Socket.IO, using PeerJS would create two signaling channels. Use raw RTCPeerConnection with Socket.IO relay instead.
- **Single RTCPeerConnection for multiple peers:** Each peer pair needs its own RTCPeerConnection instance. In a room of N users, each user maintains N-1 connections (full mesh).
- **Hardcoding caller/callee roles:** Perfect Negotiation eliminates this. Both sides run identical code; polite/impolite is determined by socket.id comparison.
- **Blocking on ICE gathering:** Use trickle ICE (send candidates as they arrive) rather than waiting for all candidates before sending the offer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NAT traversal | Custom STUN/TURN server | Google STUN + Metered.ca Open Relay TURN | STUN/TURN protocols are complex; public servers are free and maintained |
| Reconnection logic | Custom WebSocket retry | Socket.IO built-in reconnection | Handles exponential backoff, jitter, transport fallback automatically |
| Token generation | Custom random strings | `crypto.randomBytes(24).toString('base64url')` | CSPRNG prevents token guessing; base64url is URL-safe without encoding |
| Signaling collision handling | Manual caller/callee assignment | Perfect Negotiation pattern | W3C-recommended; handles all edge cases including simultaneous join |
| Room membership tracking | Custom in-memory maps | Socket.IO rooms (socket.join/leave) | Built-in, handles disconnect cleanup, supports broadcasting |
| Session description format | Custom SDP wrapper | RTCSessionDescriptionInit (Web API type) | Standard browser type; serializes to JSON naturally |

**Key insight:** The signaling server is intentionally thin -- it validates tokens and relays messages. All WebRTC intelligence (ICE gathering, DTLS, codec negotiation) happens in the browser/Electron renderer via RTCPeerConnection.

## Common Pitfalls

### Pitfall 1: Schema Mismatch -- invite_tokens.usedBy is Single-Use
**What goes wrong:** The existing `invite_tokens` schema has `usedBy integer` referencing a single user. User decisions require multi-use tokens with configurable limits.
**Why it happens:** Phase 1 created a forward-looking schema, but the multi-use requirement was decided during Phase 2 discussion.
**How to avoid:** Create a migration that:
1. Adds `maxUses integer` column to `invite_tokens` (null = unlimited)
2. Adds `useCount integer DEFAULT 0` column to `invite_tokens`
3. Drops the `usedBy` FK column (or keeps it for backward compat and ignores it)
4. Optionally creates an `invite_token_uses` join table to track which users used which token
**Warning signs:** Tests creating invites fail because they try to set maxUses on a column that doesn't exist.

### Pitfall 2: Socket.IO Client in Electron Renderer -- Transport Issues
**What goes wrong:** Socket.IO defaults to HTTP long-polling then upgrades to WebSocket. In Electron, the polling transport can cause delays because Chromium's network stack handles XMLHttpRequest differently than a regular browser.
**Why it happens:** Electron's renderer process has its own network stack; long-polling creates unnecessary HTTP requests.
**How to avoid:** Force WebSocket transport only:
```typescript
const socket = io(serverUrl, {
  transports: ['websocket'],
  auth: { token: inviteToken },
});
```
**Warning signs:** Connection takes 5-10 seconds; network tab shows multiple HTTP POST/GET requests before WebSocket upgrade.

### Pitfall 3: CORS Configuration for External Networks
**What goes wrong:** The current server has `cors: { origin: '*' }` which works for LAN. For cross-network access, the friend's Electron app connects to the host's public IP:port. CORS is actually not the issue (Socket.IO client is not a browser page served from a different origin), but Windows Firewall WILL block incoming connections on port 7432.
**Why it happens:** Windows Firewall blocks inbound TCP by default.
**How to avoid:** Phase 2 must include a step to guide users through Windows Firewall configuration OR the app should programmatically add a firewall rule (requires admin elevation). At minimum, document the manual step. Also, router port forwarding (NAT) is needed if the host is behind a router.
**Warning signs:** Friend gets "Connection refused" or timeout errors even though server is running.

### Pitfall 4: Full Mesh Scaling
**What goes wrong:** With N users in a room, each user has N-1 RTCPeerConnections. At 5 users, that's 10 total connections. This is fine for 2-5 friends but doesn't scale.
**Why it happens:** Mesh topology is the simplest WebRTC architecture.
**How to avoid:** For 2-5 friends (the target), full mesh is fine. Do NOT prematurely optimize with an SFU. Just be aware of the O(n^2) connection count.
**Warning signs:** CPU/bandwidth issues with 5+ simultaneous users (unlikely for this app's target audience).

### Pitfall 5: Missing ICE Candidate Race Condition
**What goes wrong:** ICE candidates arrive before remote description is set, causing `addIceCandidate` to throw.
**Why it happens:** Network timing; candidates can arrive faster than the SDP offer/answer exchange completes.
**How to avoid:** Queue incoming ICE candidates until `setRemoteDescription` has been called:
```typescript
const pendingCandidates: RTCIceCandidateInit[] = [];
// In the ICE candidate handler:
if (pc.remoteDescription) {
  await pc.addIceCandidate(candidate);
} else {
  pendingCandidates.push(candidate);
}
// After setRemoteDescription:
for (const c of pendingCandidates) {
  await pc.addIceCandidate(c);
}
pendingCandidates.length = 0;
```
**Warning signs:** Console errors "Failed to execute 'addIceCandidate' on 'RTCPeerConnection': Error processing ICE candidate".

### Pitfall 6: Invite Token Timing -- Clock Skew
**What goes wrong:** Token expiry comparison fails because server and client clocks differ.
**Why it happens:** The host's PC clock and the friend's PC clock may be minutes or hours apart.
**How to avoid:** ALL expiry checks happen server-side only. The server generates the token with `expiresAt` based on its own clock and validates against its own clock. Never trust client-reported time for token validation.
**Warning signs:** Tokens expire early or don't expire when they should.

## Code Examples

### Invite Token Generation
```typescript
// src/server/invite.ts
import crypto from 'node:crypto';
import { db } from './db/client';
import { inviteTokens } from './db/schema';

interface CreateInviteOptions {
  expiresInMs: number | null;  // null = never
  maxUses: number | null;      // null = unlimited
}

export function createInviteToken(options: CreateInviteOptions): string {
  // 24 bytes = 32 chars in base64url, cryptographically secure
  const token = crypto.randomBytes(24).toString('base64url');

  const expiresAt = options.expiresInMs
    ? new Date(Date.now() + options.expiresInMs)
    : null;

  db.insert(inviteTokens).values({
    token,
    expiresAt,
    maxUses: options.maxUses,
    useCount: 0,
  }).run();

  return token;
}
```

### Invite String Format
```typescript
// Format: host:port/token
// Example: "192.168.1.100:7432/abc123def456..."
// The friend pastes this into the "Join Server" input

function buildInviteString(hostAddress: string, port: number, token: string): string {
  return `${hostAddress}:${port}/${token}`;
}

function parseInviteString(invite: string): { host: string; port: number; token: string } | null {
  const match = invite.match(/^([^:]+):(\d+)\/(.+)$/);
  if (!match) return null;
  return {
    host: match[1],
    port: parseInt(match[2], 10),
    token: match[3],
  };
}
```

### Socket.IO Client Connection with Reconnection
```typescript
// src/renderer/hooks/useSocket.ts
import { io, Socket } from 'socket.io-client';

function createSocket(serverAddress: string, token: string): Socket {
  return io(`http://${serverAddress}`, {
    transports: ['websocket'],       // Skip long-polling (Electron optimization)
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,   // Never give up (user can manually disconnect)
    reconnectionDelay: 1000,          // Start at 1s
    reconnectionDelayMax: 10000,      // Cap at 10s
    randomizationFactor: 0.5,         // Jitter to prevent thundering herd
    timeout: 10000,                   // Connection timeout
  });
}
```

### Host Address Detection for Invite
```typescript
// src/main.ts -- IPC handler to get host's LAN/external IP
import { networkInterfaces } from 'node:os';

function getLocalIPAddress(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      // Skip internal (127.0.0.1) and non-IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // Fallback
}

// For cross-network: host must know their public IP or use a service
// This is a UX concern -- host pastes their public IP or uses whatismyip.com
```

### Metered.ca Open Relay TURN Configuration
```typescript
// src/shared/iceConfig.ts
// Source: https://www.metered.ca/tools/openrelay/

// Static credentials from Open Relay Project
// These are publicly available and free (500MB TURN/month)
export const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: 'stun:stun.l.google.com:19302',
  },
  {
    urls: 'stun:stun1.l.google.com:19302',
  },
  {
    urls: 'turn:a.relay.metered.ca:80',
    username: 'e8dd65b92af8fdd2bdc0b5b6',
    credential: '4V5MlXaGiXFMaIwH',
  },
  {
    urls: 'turn:a.relay.metered.ca:80?transport=tcp',
    username: 'e8dd65b92af8fdd2bdc0b5b6',
    credential: '4V5MlXaGiXFMaIwH',
  },
  {
    urls: 'turn:a.relay.metered.ca:443',
    username: 'e8dd65b92af8fdd2bdc0b5b6',
    credential: '4V5MlXaGiXFMaIwH',
  },
  {
    urls: 'turns:a.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65b92af8fdd2bdc0b5b6',
    credential: '4V5MlXaGiXFMaIwH',
  },
];

// NOTE: The above credentials are from the Open Relay Project public documentation.
// For production, sign up at metered.ca for your own API key and fetch dynamic credentials.
// For a 2-5 friend group, the public credentials and 500MB free tier are sufficient.
```

**IMPORTANT:** The Open Relay credentials above are example/public credentials from their documentation. During implementation, verify the current credentials by fetching from `https://sexdungeon.metered.live/api/v1/turn/credentials?apiKey=YOUR_KEY` after signing up for a free account, OR use the static auth credentials from the Open Relay docs page.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual caller/callee roles | Perfect Negotiation pattern | Chrome 87+ (2020), now universal | Eliminates glare race conditions; symmetric code |
| Gathering all ICE candidates then sending | Trickle ICE (send as they arrive) | Standard since 2018 | Faster connection setup; lower time-to-first-media |
| Self-hosted coturn | Managed TURN (Metered.ca, Twilio) | 2022+ trend | Zero ops for small projects; free tiers adequate |
| `setLocalDescription(offer)` explicit | `setLocalDescription()` implicit | Chrome 80+ | Browser creates correct offer/answer based on state |

**Deprecated/outdated:**
- `createOffer()` + `setLocalDescription(offer)` two-step: Replaced by just `setLocalDescription()` which auto-creates the correct SDP
- `RTCPeerConnection.createOffer({ offerToReceiveAudio: true })`: Use `addTransceiver()` instead for explicit track management
- PeerJS: While functional, it wraps RTCPeerConnection and adds its own signaling. Since we already have Socket.IO, using raw WebRTC API is cleaner and avoids dual signaling channels

## Open Questions

1. **Windows Firewall Automation**
   - What we know: Port 7432 must be open for inbound TCP for friends to connect from external networks
   - What's unclear: Can Electron programmatically add a Windows Firewall rule without admin elevation? Or should we prompt the user?
   - Recommendation: Add a "First time setup" check that detects if the port is blocked and guides the user through opening it. Use `netsh advfirewall` via child_process if admin rights are available. Fallback: show manual instructions.

2. **Router Port Forwarding (NAT)**
   - What we know: Friends on different networks need to reach the host's public IP. The host's router must forward port 7432 to the host's LAN IP.
   - What's unclear: This is a manual step that varies by router. UPnP could automate it but has security concerns.
   - Recommendation: Document the manual port forwarding requirement. Consider adding a UPnP library (like `nat-api` or `node-nat-upnp`) in a future phase. For Phase 2, just document the requirement and verify it works.

3. **Public IP Discovery for Host**
   - What we know: Host needs to know their public IP to share in the invite string
   - What's unclear: Should the app auto-detect via an external service (like api.ipify.org)?
   - Recommendation: Auto-detect the public IP via `https://api.ipify.org?format=json` and show it in the invite panel. Let the host manually override if they use a custom domain or VPN.

4. **Open Relay Credential Stability**
   - What we know: Metered.ca Open Relay credentials are publicly documented and free
   - What's unclear: Could they change or be rate-limited without notice?
   - Recommendation: Use static credentials for now (sufficient for 2-5 users). Add a config option to supply custom TURN credentials. If Open Relay goes down, users can sign up for free Metered.ca account and use their own API key.

## Schema Migration Required

The existing `invite_tokens` table needs modification for multi-use support:

```sql
-- New migration: add maxUses and useCount columns
ALTER TABLE invite_tokens ADD COLUMN maxUses integer;  -- null = unlimited
ALTER TABLE invite_tokens ADD COLUMN useCount integer DEFAULT 0 NOT NULL;
-- usedBy column becomes unused but keep for backward compat (SQLite can't drop columns easily)
```

Update the Drizzle schema accordingly:
```typescript
export const inviteTokens = sqliteTable('invite_tokens', {
  id: integer().primaryKey({ autoIncrement: true }),
  token: text().notNull().unique(),
  maxUses: integer(),           // null = unlimited
  useCount: integer().notNull().default(0),
  createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  expiresAt: integer({ mode: 'timestamp' }),
  isRevoked: integer({ mode: 'boolean' }).notNull().default(false),
  // usedBy removed -- replaced by maxUses/useCount pattern
});
```

## STUN/TURN Recommendation (Claude's Discretion)

**Decision: Google STUN + Metered.ca Open Relay TURN**

Rationale:
1. **coturn rejected:** Requires Docker Desktop + WSL2 on the host's Windows machine. This contradicts INFR-01 ("zero external paid services") in spirit by adding significant operational complexity to a hobbyist project for 2-5 friends. STATE.md flagged this as a blocker.
2. **Metered.ca Open Relay chosen:** Free, zero-setup, 500MB TURN/month (more than enough for signaling -- actual media goes P2P via STUN). Runs on ports 80/443 to bypass corporate firewalls. Supports TURNS (TLS) for deep packet inspection environments.
3. **Google STUN as primary:** Free, highly reliable, handles ~85% of NAT types without TURN. TURN is only needed for symmetric NAT (rare in residential networks).

## Socket.IO Reconnection Strategy (Claude's Discretion)

**Decision:**
- `reconnection: true`
- `reconnectionAttempts: Infinity` (never give up -- user explicitly disconnects)
- `reconnectionDelay: 1000` (1 second initial)
- `reconnectionDelayMax: 10000` (10 second cap)
- `randomizationFactor: 0.5`
- Show "Reconnecting..." toast only after 3 seconds of failed reconnection (per user decision)

## Invite Token Format (Claude's Discretion)

**Decision:** `crypto.randomBytes(24).toString('base64url')` producing 32-character URL-safe tokens.

Rationale:
- 192 bits of entropy (24 bytes) -- cryptographically secure, unguessable
- `base64url` encoding is URL-safe without percent-encoding (no `+`, `/`, `=`)
- Invite string format: `host:port/token` (e.g., `203.0.113.5:7432/abc123def456ghi789jkl012mno345pq`)
- Simple to parse: split on last `/` for token, remainder is address

## Sources

### Primary (HIGH confidence)
- [MDN WebRTC Perfect Negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) - Complete pattern with code examples
- [Socket.IO v4 TypeScript](https://socket.io/docs/v4/typescript/) - Typed event interfaces for server/client
- [Socket.IO v4 Middlewares](https://socket.io/docs/v4/middlewares/) - Auth middleware pattern with handshake.auth
- [Socket.IO v4 Client Options](https://socket.io/docs/v4/client-options/) - Reconnection parameters
- [Metered.ca Open Relay Project](https://www.metered.ca/tools/openrelay/) - Free TURN server credentials and configuration
- [MDN RTCConfiguration.iceServers](https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration/iceServers) - ICE server configuration format

### Secondary (MEDIUM confidence)
- [WebRTC Samples - Perfect Negotiation](https://webrtc.github.io/samples/src/content/peerconnection/perfect-negotiation/) - Working demo of the pattern
- [Coturn Alternative Migration Guide (Jan 2026)](https://medium.com/@jamesbordane57/coturn-alternative-how-to-migrate-from-self-hosted-coturn-to-a-managed-turn-service-f9890db7b008) - Confirms managed TURN trend
- [Socket.IO WebRTC Signaling Patterns](https://videosdk.live/developer-hub/socketio/socket-io-webrtc) - Integration patterns
- [Google STUN Server List](https://dev.to/alakkadshaw/google-stun-server-list-21n4) - Free STUN server URLs
- [Node.js crypto.randomBytes](https://thelinuxcode.com/nodejs-cryptorandombytes-secure-random-tokens-salts-and-key-material-in-real-projects/) - Secure token best practices

### Tertiary (LOW confidence)
- Open Relay Project 500MB free limit may vary -- verify current limits at signup
- Static auth credentials from docs page may change -- should be verified during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Socket.IO 4.8.3 already installed; socket.io-client is the only new dependency; WebRTC is a browser API
- Architecture: HIGH - Signaling relay + Perfect Negotiation is the canonical WebRTC pattern with W3C documentation
- Pitfalls: HIGH - ICE candidate queuing, Electron transport issues, schema migration, and firewall requirements are well-documented issues
- STUN/TURN: MEDIUM - Open Relay credentials from public docs; free tier limits should be verified at implementation time

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days -- WebRTC and Socket.IO APIs are stable)
