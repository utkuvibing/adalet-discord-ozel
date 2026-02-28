# Pitfalls Research

**Domain:** Self-hosted WebRTC voice chat / Discord alternative (Electron + Node.js + WebRTC)
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH (critical pitfalls verified via multiple sources; some edge cases LOW confidence)

---

## Critical Pitfalls

### Pitfall 1: Assuming STUN Is Enough — Symmetric NAT Will Silently Fail for ~20% of Users

**What goes wrong:**
The app works perfectly on your own LAN and in local testing. You configure Google's public STUN server, connections appear to succeed in demos, you ship — then one friend can't connect at all. They have a symmetric NAT router (common with many ISPs, CGNAT, and carrier-grade setups). STUN cannot penetrate symmetric NAT. The P2P connection silently fails with an ICE failure, and there is no graceful fallback. The user sees "connecting..." indefinitely or a crash.

**Why it happens:**
Developers test with 2 browser tabs on the same machine or same LAN, where STUN always works because no real NAT traversal is needed. Approximately 20% of real-world users are behind symmetric NATs. The failure is invisible during development.

**How to avoid:**
Deploy a self-hosted coturn server (free, open-source) on the same home PC or a free-tier VPS. Configure it as both STUN and TURN. Always include TURN credentials in your `iceServers` config alongside STUN. Test explicitly from a mobile hotspot or different network — not from a second tab on the same machine. Use the trickle-ice tool (https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) to verify your ICE configuration works from real external networks.

```javascript
// Wrong — STUN only, will fail for symmetric NAT users
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

// Correct — STUN + TURN fallback
const iceServers = [
  { urls: 'stun:your-server:3478' },
  {
    urls: 'turn:your-server:3478',
    username: 'user',
    credential: 'secret'
  }
];
```

**Warning signs:**
- App works on LAN but fails over internet for specific users
- ICE state reaches "failed" or "disconnected" after ~30 seconds
- Works for some friends but not others (different ISPs/routers)
- WebRTC internals (`chrome://webrtc-internals`) shows only `host` candidates, no `srflx` or `relay` candidates

**Phase to address:** Signaling & Connection phase (before any voice features). Validate real-world NAT traversal with actual external network before building higher-level features on top.

---

### Pitfall 2: Testing Only on Localhost — "Works on My Machine" Is Guaranteed

**What goes wrong:**
WebRTC connections between two tabs on the same machine use loopback. No STUN is needed, no NAT is traversed, latency is 0ms. Everything looks perfect. The moment you test across real internet (different home networks, mobile hotspot), ICE negotiation takes 5-15 seconds, connections fail for certain NAT types, and audio quality degrades because the network isn't as clean. You've built a feature set on a false foundation.

**Why it happens:**
It's the path of least resistance. Running two instances locally is much faster for iteration than coordinating cross-network tests. The WebRTC spec acknowledges this gap between local and production behavior explicitly.

**How to avoid:**
From day one, establish a cross-network testing ritual: test from your phone's 4G hotspot to the server PC. Use two physical machines on different networks for any connection test. Never validate a "connection works" claim from same-machine tabs.

**Warning signs:**
- All tests run within the same LAN
- No cross-ISP testing has ever been done
- Voice latency feels impossibly low in testing

**Phase to address:** Signaling & Connection phase. Make real cross-network testing a hard requirement for the "connection established" milestone.

---

### Pitfall 3: Electron Screen Sharing Requires desktopCapturer, Not getDisplayMedia

**What goes wrong:**
You write standard browser-style screen sharing using `navigator.mediaDevices.getDisplayMedia()`. It works in Chrome. In Electron, it either fails silently, throws errors, or shows a blank picker with no sources. Electron does not implement `getDisplayMedia` the same way browsers do — it requires a custom `getUserMedia` call fed by `desktopCapturer.getSources()`.

**Why it happens:**
Developers assume Electron = Chromium = same Web APIs. This is wrong for screen capture. Electron exposes `desktopCapturer` as a main-process or preload API specifically because the browser implementation is intentionally disabled. Additionally, `desktopCapturer` can only enumerate sources after a `BrowserWindow` has been created — it does not work in headless or pre-window contexts.

**How to avoid:**
Use Electron's `desktopCapturer.getSources()` in the main process (or via preload IPC), pass the source ID back to the renderer, and call `getUserMedia` with `chromeMediaSource: 'desktop'` constraint:

```javascript
// Renderer process (after getting sourceId from main via IPC)
const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
      maxWidth: 1920,
      maxHeight: 1080
    }
  }
});
```

Also expect low frame rates (5-6 fps is a known bug in some Electron versions) and test with the `frameRate` constraint explicitly set. Gaming screen share at 30fps needs codec tuning — VP8/VP9 default settings will produce blurry motion; use higher bitrate constraints.

**Warning signs:**
- Screen share code copied from a browser tutorial
- `getDisplayMedia()` used directly in renderer without `desktopCapturer`
- Picker shows no sources or blank list
- Frame rate capped at 5-6 fps despite screen activity

**Phase to address:** Screen Sharing phase. Do not build screen share UI until the desktopCapturer → getUserMedia pipeline is confirmed working end-to-end on all target OS platforms.

---

### Pitfall 4: No Reconnection Logic — Network Blip = Silent Dead Session

**What goes wrong:**
A user's WiFi drops for 3 seconds. The WebRTC `iceConnectionState` transitions to `disconnected`, then to `failed`. No code handles this. The user's mic icon still shows as connected in the UI, they keep talking, nothing goes through. Everyone else still sees them as "in room." The session is dead but nothing tells anyone. The only recovery is manually rejoining.

**Why it happens:**
Happy-path development. WebRTC connections are established, it works, developers move on. Connection state change handlers are not wired up. ICE restart (the mechanism to recover a failed connection without full reconnect) is not implemented. The `RTCPeerConnection` events `oniceconnectionstatechange` and `onconnectionstatechange` are ignored.

**How to avoid:**
Wire up state change handlers from the start. Implement ICE restart on `disconnected` state (don't wait for `failed`). Use a watchdog timer: if `disconnected` state persists for >5 seconds, trigger reconnect. On `failed`, tear down the peer connection and re-negotiate via signaling. Reflect connection state visually in the UI so users can see when they're actually connected vs. not.

```javascript
pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'disconnected') {
    // Start watchdog — attempt ICE restart after 5s
    reconnectTimer = setTimeout(() => attemptIceRestart(pc), 5000);
  }
  if (pc.connectionState === 'failed') {
    // Full reconnect via signaling
    teardownAndReconnect(peerId);
  }
  if (pc.connectionState === 'connected') {
    clearTimeout(reconnectTimer);
  }
};
```

**Warning signs:**
- `oniceconnectionstatechange` / `onconnectionstatechange` handlers not implemented
- UI does not reflect real connection state
- Users report needing to refresh to fix audio
- No reconnect logic in signaling server message handlers

**Phase to address:** Signaling & Connection phase. Reconnection is not an enhancement — it is a baseline requirement for a voice app. Build it before building any voice features.

---

### Pitfall 5: Signaling Race Conditions — "Glare" and Offer/Answer State Machine Bugs

**What goes wrong:**
Two peers both try to initiate a connection at the same time (glare). Or a peer sends an `answer` before it has fully processed the `offer`. Or ICE candidates arrive before `setRemoteDescription` has been called. The RTCPeerConnection state machine enters an invalid state, throws an exception, and the connection fails. These bugs are nearly impossible to reproduce consistently because they are timing-dependent.

**Why it happens:**
WebRTC signaling is stateful and order-dependent. The JSEP specification requires offers and answers to be exchanged in a defined sequence. When multiple users join simultaneously, or when reconnection triggers while a negotiation is in progress, race conditions are inevitable without explicit handling. Most tutorials show the happy path with no concurrent join handling.

**How to avoid:**
Implement the "Perfect Negotiation" pattern (standardized and documented on MDN). Assign each peer connection a `polite` or `impolite` role (based on user ID comparison). The polite peer rolls back its pending offer when it receives an offer from the remote. Queue ICE candidates that arrive before `setRemoteDescription` completes, then drain the queue after.

```javascript
// Perfect negotiation — polite peer rollback
pc.onnegotiationneeded = async () => {
  try {
    makingOffer = true;
    await pc.setLocalDescription();
    signaling.send({ description: pc.localDescription });
  } finally {
    makingOffer = false;
  }
};

signaling.onmessage = async ({ description, candidate }) => {
  if (description) {
    const offerCollision = description.type === 'offer' &&
      (makingOffer || pc.signalingState !== 'stable');
    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) return;
    if (offerCollision) await pc.setLocalDescription({ type: 'rollback' });
    await pc.setRemoteDescription(description);
    if (description.type === 'offer') {
      await pc.setLocalDescription();
      signaling.send({ description: pc.localDescription });
    }
  } else if (candidate) {
    // Queue candidates if remote description not yet set
    try { await pc.addIceCandidate(candidate); }
    catch (e) { if (!ignoreOffer) throw e; }
  }
};
```

**Warning signs:**
- `InvalidStateError` in WebRTC logs during connection setup
- Connections fail when 2+ users join simultaneously
- Reconnection after network drop triggers new failures
- No explicit `polite`/`impolite` peer role logic

**Phase to address:** Signaling & Connection phase. Implement perfect negotiation before building multi-user room logic.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use Google's public STUN only | Zero setup | ~20% of users can't connect; reliability is at Google's mercy | Never — coturn takes 30 mins to set up |
| Skip reconnection logic | Faster to ship | Dead sessions with no recovery; users rage-quit | Never for a voice app |
| `nodeIntegration: true` in Electron | Skip preload IPC boilerplate | XSS becomes RCE; full Node access from renderer | Never — use contextIsolation + preload |
| Single signaling server, no reconnect | Simpler code | Server restart kills all sessions, no recovery | Acceptable in MVP if clients auto-rejoin |
| Full mesh for all N peers | No media server needed | At 4-5 users with screen share: CPU/bandwidth saturation | Acceptable only up to 4 users without screen share |
| Hard-coded ICE server credentials | No credential management | Credentials in source code / git history | Never — use environment config |
| Skip ICE candidate queueing | Simpler signaling code | Race conditions on simultaneous joins | Never — implement queueing from the start |

---

## Integration Gotchas

Common mistakes when connecting components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Electron + desktopCapturer | Calling `getDisplayMedia()` directly in renderer | Use `desktopCapturer.getSources()` in main process via IPC, pass sourceId to renderer |
| Electron + contextIsolation | Setting `nodeIntegration: true` for convenience | Use `contextBridge.exposeInMainWorld()` in preload to expose only needed APIs |
| Socket.io + WebRTC signaling | Sending ICE candidates before `setRemoteDescription` | Queue candidates; drain after remote description is set |
| coturn + home NAT | Not setting `--external-ip` in coturn config | Always set `--external-ip=<your-public-ip>` when coturn is behind NAT |
| coturn + Windows Firewall | Opening only port 3478 | Also open UDP range 49152-65535 for relay ports |
| simple-peer + data send | Calling `peer.send()` before `connect` event | Always wait for `peer.on('connect')` before sending data |
| WebRTC + Electron audio | Adding `echoCancellation`/`noiseSuppression` constraints | Test constraints carefully; some combinations cause `getUserMedia` failure in Electron |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full mesh P2P with screen sharing | CPU at 90%+, stream stutters at 30fps, audio glitches | Cap mesh at 4 peers; lower screen share bitrate; consider SFU for video | At 4+ users with screen sharing enabled simultaneously |
| Unthrottled screen capture bitrate | Upstream bandwidth saturated; audio drops due to congestion | Set explicit `maxWidth`, `maxHeight`, bitrate constraints; prefer VP9 over VP8 for screen content | At any resolution >1080p or frameRate >15 for gaming streams |
| No bandwidth estimation | Stream quality cliff-drop when network changes | Use WebRTC's built-in bandwidth estimation; implement adaptive bitrate | When any peer's connection quality changes |
| Memory leak in desktopCapturer MediaRecorder | Memory grows unbounded during long sessions | Stop and recreate streams instead of leaving them open; known Electron bug with MediaRecorder + desktop capture | After 30-60 minutes of screen sharing |
| Signaling server no heartbeat | Phantom connected users who actually disconnected | Implement Socket.io heartbeat/ping-pong; clean up peer state on socket disconnect | Immediately after any unexpected disconnection |

---

## Security Mistakes

Domain-specific security issues for a self-hosted app exposed to the internet.

| Mistake | Risk | Prevention |
|---------|------|------------|
| `nodeIntegration: true` in Electron renderer | XSS in any loaded content becomes full OS command execution (RCE) | Always use `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`; expose only needed APIs via preload `contextBridge` |
| Open TURN server (no credentials) | Anyone on internet uses your bandwidth as a free relay | Always configure coturn with username/credential authentication; use time-limited HMAC credentials |
| TURN server with no IP whitelist | TURN relay used to port-scan or attack internal network | Set `denied-peer-ip` ranges in coturn to block RFC1918 addresses (10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12) |
| Invite link with no expiry | Shared link gives permanent server access | Implement token expiry; rotate invite links |
| Signaling server with no auth | Anyone who discovers the signaling URL can join rooms | Validate invite tokens on socket connection; reject unauthenticated connections before any room state is shared |
| Exposing full internal IP in ICE candidates | Reveals home network topology | Acceptable tradeoff for a private friend group; document that home IP is shared among invited users |

---

## UX Pitfalls

Common user experience mistakes in voice chat apps.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual audio level indicator | Users don't know if their mic is working | Show real-time audio level meter in UI using Web Audio API `AnalyserNode` |
| No connection state feedback | Users don't know if they're actually connected or in dead session | Show explicit connection state: connecting / connected / reconnecting / failed |
| Audio starts immediately on room join | Surprises users, may broadcast private conversation before ready | Mute mic by default on join; require user action to unmute |
| No echo cancellation on by default | Horrible feedback loops when speaker audio bleeds into mic | Enable `echoCancellation: true` in getUserMedia constraints (default in WebRTC, but verify in Electron) |
| Instant disconnect on window close | No graceful goodbye — peers see abrupt stream cut | Handle `beforeunload` / Electron `before-quit` to send leave signal before closing |
| No audio device selection | If default device changes, audio breaks silently | Expose device picker; listen for `devicechange` event and offer to switch |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Voice chat "works":** Tested only on LAN. Verify from external network (4G hotspot) with TURN relay path confirmed via `chrome://webrtc-internals` showing `relay` candidates.
- [ ] **Screen sharing "works":** Tested only on same machine. Verify frame rate is actually 15-30fps (not 5fps Electron bug) and that games (not just desktop) are captured.
- [ ] **Room join "works":** Tested with 2 users sequential join. Verify simultaneous join by 3+ users with perfect negotiation (no `InvalidStateError` in console).
- [ ] **Disconnect "works":** Tested only clean tab close. Verify: WiFi drop recovery (ICE restart), server restart (auto-rejoin), peer crash (room state cleaned up).
- [ ] **Audio "works":** Tested with one audio device. Verify: hot-plug headset during call, echo cancellation active, no audio leak after extended runtime (known Electron memory issue).
- [ ] **TURN "works":** coturn server running locally. Verify: `--external-ip` set to public IP, UDP relay ports 49152-65535 open in Windows Firewall, tested from real external network.
- [ ] **Security "works":** Invite link lets friends in. Verify: unauthenticated socket connections are rejected before room state is shared; TURN server requires credentials.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| STUN-only, symmetric NAT users blocked | MEDIUM | Add coturn (30-60 min setup); update ICE server config in client; redeploy |
| Signaling race conditions causing failed connections | HIGH | Implement perfect negotiation pattern — requires rewriting signaling state machine; test with simultaneous joins |
| Electron screen share broken (getDisplayMedia) | LOW | Replace with desktopCapturer IPC pattern; 2-4 hours of refactoring |
| No reconnection, sessions silently die | MEDIUM | Add `onconnectionstatechange` handler + ICE restart + UI state feedback; testable in isolation |
| Memory leak (desktopCapturer + MediaRecorder) | LOW | Implement stream lifecycle management; stop/recreate streams rather than leaving open |
| Open TURN server abused | MEDIUM | Add authentication; rotate credentials; add IP deny list in coturn config |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| STUN-only / symmetric NAT failure | Signaling & NAT Traversal phase | trickle-ice test from external network shows `relay` candidates succeeding |
| Localhost-only testing | Signaling & NAT Traversal phase | Cross-network test ritual documented; at least one test from mobile hotspot |
| Electron desktopCapturer required | Screen Sharing phase | Screen share works in packaged Electron app (not just dev mode) at 15+ fps |
| No reconnection logic | Signaling & NAT Traversal phase | Simulate network drop; confirm audio recovers without user action within 10 seconds |
| Signaling race conditions | Signaling & NAT Traversal phase | 3 clients join simultaneously 10 times; zero `InvalidStateError` in logs |
| nodeIntegration / Electron security | App Skeleton / Foundation phase | Security audit: contextIsolation on, nodeIntegration off, preload uses contextBridge only |
| Full mesh bandwidth at 5 users | Architecture decision (pre-build) | Explicit decision: this app is 2-5 users, mesh is acceptable; document the limit |
| No audio device change handling | Voice & Audio phase | Hot-plug test: unplug/replug headset during active call |
| coturn misconfig (no external-ip) | Infrastructure / Self-hosting phase | TURN connectivity test from external network confirms relay path |
| Open TURN credentials | Infrastructure / Self-hosting phase | coturn configured with HMAC credentials; no anonymous relay possible |

---

## Sources

- [WebRTC TURN: Why you NEED it and when you DON'T](https://bloggeek.me/webrtc-turn/) — MEDIUM confidence (authoritative WebRTC blog, Tsahi Levent-Levi)
- [Common WebRTC Beginner Mistakes — BlogGeek.me](https://bloggeek.me/common-beginner-mistakes-in-webrtc/) — MEDIUM confidence
- [How to Set Up Self-Hosted STUN/TURN Servers for WebRTC — WebRTC.ventures (Jan 2025)](https://webrtc.ventures/2025/01/how-to-set-up-self-hosted-stun-turn-servers-for-webrtc-applications/) — HIGH confidence (dated 2025)
- [WebRTC Troubleshooting — Expert Solutions](https://moldstud.com/articles/p-webrtc-troubleshooting-expert-solutions-to-common-developer-issues) — MEDIUM confidence
- [Electron Bug: Screen Share Low Framerate #23254](https://github.com/electron/electron/issues/23254) — HIGH confidence (official GitHub issue tracker)
- [Electron Bug: desktopCapturer requires mainWindow #31182](https://github.com/electron/electron/issues/31182) — HIGH confidence (official GitHub issue tracker)
- [Electron Bug: WebRTC stops inbound audio after multiple calls #36736](https://github.com/electron/electron/issues/36736) — HIGH confidence (official GitHub issue tracker)
- [Electron Bug: getUserMedia memory leak with MediaRecorder #41123](https://github.com/electron/electron/issues/41123) — HIGH confidence (official GitHub issue tracker)
- [Perfect Negotiation in WebRTC — Mozilla Blog](https://blog.mozilla.org/webrtc/perfect-negotiation-in-webrtc/) — HIGH confidence (official Mozilla engineering)
- [MDN: Perfect Negotiation Pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) — HIGH confidence (official MDN docs)
- [WebRTC P2P Mesh Scalability — BlogGeek.me](https://bloggeek.me/webrtc-p2p-mesh/) — MEDIUM confidence
- [WebRTC Mesh Topology: CPU at 93% at 4 peers](https://dev.to/christosalexiou/the-multiple-faces-of-webrtc-n-peer-calling-mesh-mcu-and-sfu-39dg) — MEDIUM confidence
- [Am I behind a Symmetric NAT? — webrtcHacks](https://webrtchacks.com/symmetric-nat/) — MEDIUM confidence
- [Electron Security — Official Docs](https://www.electronjs.org/docs/latest/tutorial/security) — HIGH confidence (official Electron docs)
- [coturn TURN Server — GitHub](https://github.com/coturn/coturn) — HIGH confidence (official repo)
- [WebRTC Video Optimization: Bitrate vs Frame Rate — WebRTC.ventures (Aug 2024)](https://webrtc.ventures/2024/08/webrtc-video-optimization-the-crucial-balance-between-bitrate-and-frame-rate/) — HIGH confidence (dated 2024)
- [Implementing Reconnection for WebRTC — WebRTC.ventures (Jun 2023)](https://webrtc.ventures/2023/06/implementing-a-reconnection-mechanism-for-webrtc-mobile-applications/) — MEDIUM confidence
- [WebRTC Ports: 2025 Guide — VideoSDK](https://www.videosdk.live/developer-hub/webrtc/webrtc-ports) — MEDIUM confidence

---
*Pitfalls research for: self-hosted WebRTC voice chat / Discord alternative (Electron + Node.js)*
*Researched: 2026-03-01*
