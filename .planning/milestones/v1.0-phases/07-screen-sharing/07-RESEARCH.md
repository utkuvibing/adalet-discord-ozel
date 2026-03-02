# Phase 7: Screen Sharing - Research

**Researched:** 2026-03-02
**Domain:** Electron desktopCapturer, WebRTC video track management, system audio loopback
**Confidence:** MEDIUM

## Summary

Screen sharing in Electron requires a two-layer approach: the main process uses `desktopCapturer.getSources()` to enumerate available screens and windows (with thumbnails), then the renderer acquires the media stream via `navigator.mediaDevices.getDisplayMedia()` -- gated by `session.defaultSession.setDisplayMediaRequestHandler()` in the main process. This is the modern recommended approach for Electron 40.x; the older pattern of calling `getUserMedia` with `chromeMediaSource: 'desktop'` constraints directly is deprecated for audio capture and causes renderer crashes on Windows 11 with recent Electron versions (35+).

The existing codebase has audio-only WebRTC peer connections. Adding a screen share video track requires `RTCPeerConnection.addTrack()` which triggers renegotiation via the existing Perfect Negotiation pattern -- this is already implemented and will handle the new track naturally. When the user stops sharing, `RTCRtpSender.replaceTrack(null)` followed by `removeTrack()` cleanly stops transmission. System audio capture on Windows is supported via the `audio: 'loopback'` parameter in `setDisplayMediaRequestHandler`, though echo issues exist when the sharer's own speakers feed back into the capture. The documented Electron bug #23254 (5-6fps cap) is a Chromium-level issue related to WebRTC CPU throttling and VP9's `contentHint='detail'` mode; the fix involves explicit frameRate constraints in `getDisplayMedia`, setting `contentHint='motion'` on the video track, and optionally applying `app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '100')`.

**Primary recommendation:** Use `setDisplayMediaRequestHandler` + `getDisplayMedia` (not raw `getUserMedia` with `chromeMediaSource`), build a custom IPC-based source picker with thumbnails, add the screen share as a new video track on existing peer connections (leveraging Perfect Negotiation for renegotiation), and enforce explicit `frameRate: { ideal: 30, max: 30 }` constraints with `contentHint='motion'` to avoid the fps cap.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCRN-01 | User can share their screen or a specific window with a picker UI | `desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true })` provides source list with thumbnails; IPC bridge sends sources to renderer for custom picker modal; selected source ID passed back to main process for `setDisplayMediaRequestHandler` callback |
| SCRN-02 | Screen share runs at gaming-optimized quality (up to 1080p/30fps) with no artificial paywall | `getDisplayMedia` constraints with `video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }`; `contentHint='motion'` on video track; `setParameters` on sender for bandwidth control; no tier/paywall logic exists in this self-hosted app |
| SCRN-03 | User can capture and share system audio (game sounds) alongside screen share | `setDisplayMediaRequestHandler` callback with `audio: 'loopback'` on Windows; renderer receives audio track from `getDisplayMedia({ audio: true, video: true })` and adds it to peer connections alongside the video track |
</phase_requirements>

## Standard Stack

### Core

| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| `desktopCapturer` (Electron) | 40.6.1 (built-in) | Enumerate screens/windows with thumbnails | Only way to get source list with thumbnails in Electron; `getDisplayMedia` alone does not provide a picker in Electron |
| `setDisplayMediaRequestHandler` (Electron Session) | 40.6.1 (built-in) | Gate `getDisplayMedia` calls, provide source + loopback audio | Modern Electron approach; avoids deprecated `chromeMediaSource` audio constraints that crash on Windows |
| `navigator.mediaDevices.getDisplayMedia` (Web API) | Chromium 132+ (in Electron 40) | Acquire screen capture MediaStream in renderer | Standard Web API, works when `setDisplayMediaRequestHandler` is registered in main process |
| `RTCPeerConnection.addTrack` / `removeTrack` (Web API) | Chromium 132+ | Add/remove video track on existing peer connections | Standard WebRTC; triggers renegotiation handled by existing Perfect Negotiation |
| `RTCRtpSender.setParameters` (Web API) | Chromium 132+ | Control bitrate/bandwidth for screen share track | Allows capping maxBitrate to prevent bandwidth saturation on LAN |

### Supporting

| Library/API | Version | Purpose | When to Use |
|-------------|---------|---------|-------------|
| `MediaStreamTrack.contentHint` | Web standard | Optimize encoding for screen content vs motion | Set to `'motion'` for gaming screen shares to avoid VP9 5fps cap |
| `RTCRtpSender.replaceTrack` | Web standard | Swap screen share track or stop it without renegotiation | Use when stopping share (pass `null`) or switching source |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `setDisplayMediaRequestHandler` + `getDisplayMedia` | `getUserMedia` with `chromeMediaSource: 'desktop'` | Older approach; audio capture crashes renderer on Windows 11 with Electron 35+ (Error 263); avoid |
| `addTrack` (renegotiation) | `replaceTrack` on a pre-allocated sender | Would avoid renegotiation, but requires a dummy video sender to exist before screen share starts; adds complexity for no benefit since Perfect Negotiation already handles renegotiation |
| Custom system audio via virtual cables | `audio: 'loopback'` in setDisplayMediaRequestHandler | Virtual cables require user to install external software; loopback is built-in on Windows |

**Installation:**
```bash
# No new packages needed -- all APIs are built into Electron 40.x and WebRTC
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── main.ts                           # Add setDisplayMediaRequestHandler + IPC handlers for getSources
├── preload.ts                        # Add getScreenSources + screen share IPC channels
├── shared/
│   └── types.ts                      # Add ScreenSource interface, ScreenShareState, Socket events
├── renderer/
│   ├── hooks/
│   │   └── useScreenShare.ts         # NEW: Screen share lifecycle hook
│   ├── components/
│   │   ├── ScreenSharePicker.tsx     # NEW: Source picker modal with thumbnails
│   │   ├── ScreenShareViewer.tsx     # NEW: Video element for viewing remote screen share
│   │   └── VoiceControls.tsx         # Add screen share toggle button
│   └── ...
└── server/
    └── signaling.ts                  # Add screen:start / screen:stop relay events
```

### Pattern 1: IPC Pipeline for Source Enumeration
**What:** Main process enumerates sources via `desktopCapturer.getSources()`, sends thumbnails as data URLs to renderer via IPC
**When to use:** Every time user opens the screen share picker
**Example:**
```typescript
// Main process (main.ts)
ipcMain.handle('screen:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon?.toDataURL() ?? null,
  }));
});
```
Source: [Electron desktopCapturer docs](https://www.electronjs.org/docs/latest/api/desktop-capturer)

### Pattern 2: setDisplayMediaRequestHandler for Stream Acquisition
**What:** Main process registers a handler that fulfills `getDisplayMedia` requests from the renderer with the user-selected source
**When to use:** Set up once at app startup; triggered each time renderer calls `getDisplayMedia`
**Example:**
```typescript
// Main process (main.ts) -- called once at startup
let pendingSourceId: string | null = null;
let includeSystemAudio = false;

ipcMain.handle('screen:select-source', (_event, sourceId: string, withAudio: boolean) => {
  pendingSourceId = sourceId;
  includeSystemAudio = withAudio;
});

session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  if (!pendingSourceId) {
    callback({}); // Cancel
    return;
  }
  desktopCapturer.getSources({ types: ['screen', 'window'] }).then(sources => {
    const source = sources.find(s => s.id === pendingSourceId);
    if (!source) {
      callback({});
      return;
    }
    const streamConfig: Record<string, unknown> = { video: source };
    if (includeSystemAudio) {
      streamConfig.audio = 'loopback'; // Windows only
    }
    callback(streamConfig);
    pendingSourceId = null;
  });
});
```
Source: [Electron session docs](https://www.electronjs.org/docs/latest/api/session)

### Pattern 3: addTrack on Existing Peer Connections
**What:** When screen share starts, add video track (and optional audio track) to all existing peer connections; Perfect Negotiation handles renegotiation automatically
**When to use:** After `getDisplayMedia` returns a MediaStream
**Example:**
```typescript
// Renderer: useScreenShare hook
async function startScreenShare(peerConnections: Map<string, RTCPeerConnection>) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: true, // Will get system audio if setDisplayMediaRequestHandler provides it
  });

  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.contentHint = 'motion'; // Avoid VP9 5fps cap for gaming content
  }

  // Add tracks to all peer connections
  for (const [peerId, pc] of peerConnections) {
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });
  }

  // Listen for track ended (user clicks "Stop sharing" in OS UI)
  videoTrack.onended = () => stopScreenShare(peerConnections);
}
```
Source: [MDN RTCPeerConnection.addTrack](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack)

### Pattern 4: Clean Track Removal on Stop
**What:** Remove screen share tracks from all peer connections without disrupting existing audio
**When to use:** When user stops screen sharing
**Example:**
```typescript
function stopScreenShare(
  peerConnections: Map<string, RTCPeerConnection>,
  screenStream: MediaStream
) {
  // Stop all tracks on the captured stream
  screenStream.getTracks().forEach(track => track.stop());

  // Remove senders for screen share tracks from each peer connection
  for (const [, pc] of peerConnections) {
    const senders = pc.getSenders();
    for (const sender of senders) {
      if (sender.track && screenStream.getTracks().includes(sender.track)) {
        pc.removeTrack(sender);
      }
    }
  }
  // Renegotiation happens automatically via onnegotiationneeded -> Perfect Negotiation
}
```
Source: [MDN RTCRtpSender.replaceTrack](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/replaceTrack)

### Anti-Patterns to Avoid
- **Using `getUserMedia` with `chromeMediaSource: 'desktop'` for audio:** Crashes the renderer on Windows 11 with Electron 35+ (Error 263 bad IPC message). Use `setDisplayMediaRequestHandler` with `audio: 'loopback'` instead.
- **Not setting `contentHint` on screen share video track:** VP9 defaults to `contentHint='detail'` for screen content, which caps framerate at 5fps. Always set `contentHint='motion'` for gaming content.
- **Calling `getDisplayMedia` without registering `setDisplayMediaRequestHandler` first:** In Electron, `getDisplayMedia` does not show a native picker dialog like in Chrome. Without the handler, the call may fail silently or show an empty picker.
- **Replacing audio tracks during screen share:** Do not touch the existing audio (microphone) senders. Screen share adds NEW tracks; it must not replace or interfere with the voice audio track.
- **Forgetting to handle `track.onended`:** The OS-level "Stop sharing" button fires `onended` on the video track. If not handled, peers keep expecting a video stream that is no longer producing frames.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Source enumeration with thumbnails | Custom window enumeration | `desktopCapturer.getSources()` | Handles cross-platform differences, provides NativeImage thumbnails |
| System audio capture | Virtual audio driver integration | `setDisplayMediaRequestHandler` with `audio: 'loopback'` | Built into Electron on Windows, no external dependencies |
| WebRTC renegotiation after adding video track | Manual SDP offer/answer exchange | Perfect Negotiation pattern (already implemented in `useWebRTC.ts`) | Existing implementation handles glare, ICE candidates, and all edge cases |
| Bandwidth control for screen share | Manual SDP munging (bitrate in SDP) | `RTCRtpSender.setParameters({ encodings: [{ maxBitrate }] })` | SDP munging is fragile and non-standard; setParameters is the proper API |

**Key insight:** The project already has the hardest WebRTC infrastructure built (Perfect Negotiation, peer connection lifecycle, ICE handling). Screen sharing is primarily about acquiring the right MediaStream via Electron APIs and adding tracks to the existing connections. The WebRTC layer handles renegotiation automatically.

## Common Pitfalls

### Pitfall 1: 5fps Frame Rate Cap (VP9 + contentHint='detail')
**What goes wrong:** Screen share appears to work but framerate is capped at 5-6fps, making it unusable for gaming.
**Why it happens:** Chromium's VP9 encoder in "screen content coding" mode (triggered by `contentHint='detail'`, which is the default for screen captures) caps framerate at 5fps to prioritize quality over motion. This is the root cause of Electron bug #23254.
**How to avoid:** Set `videoTrack.contentHint = 'motion'` immediately after acquiring the stream. Also add `frameRate: { ideal: 30, max: 30 }` to `getDisplayMedia` constraints.
**Warning signs:** `chrome://webrtc-internals` shows framesPerSecond at 5 despite source running at 30+fps.

### Pitfall 2: Renderer Crash on Windows with chromeMediaSource Audio
**What goes wrong:** Renderer process terminates with Error 263 (DESKTOP_CAPTURER_INVALID_OR_UNKNOWN_ID) when using `getUserMedia` with `chromeMediaSource: 'desktop'` for audio capture.
**Why it happens:** Direct `getUserMedia` with `chromeMediaSource` for desktop audio has a known bug in Electron 35+ on Windows 11. The IPC message is rejected as invalid by the main process.
**How to avoid:** Use `setDisplayMediaRequestHandler` with `audio: 'loopback'` instead of direct `getUserMedia` for audio capture. This is the officially supported path.
**Warning signs:** Renderer process crashes silently; only visible in terminal output as "bad IPC message, reason 263".

### Pitfall 3: Screen Share Disrupting Voice Audio
**What goes wrong:** Starting or stopping a screen share disconnects or mutes the voice audio for one or more peers.
**Why it happens:** Accidentally removing or replacing the audio sender instead of adding a new video sender. Or calling `removeAllPeers()` / `removeTrack()` on the wrong sender.
**How to avoid:** Track screen share senders separately from voice audio senders. When stopping screen share, only remove senders whose track belongs to the screen share MediaStream, not the mic MediaStream.
**Warning signs:** Voice drops out when screen share starts or stops.

### Pitfall 4: Echo When System Audio Is Enabled
**What goes wrong:** Peers hear their own audio echoed back through the screen share system audio.
**Why it happens:** System audio loopback captures ALL system audio output, including audio coming from WebRTC peers playing through speakers.
**How to avoid:** This is a fundamental limitation of system audio loopback. Document clearly that system audio should be used with headphones. Alternatively, `audio: 'loopbackWithMute'` mutes local playback during capture (but mutes ALL system audio for the sharer, not just peer audio).
**Warning signs:** Peers report hearing themselves with a delay.

### Pitfall 5: getDisplayMedia Failing Without Handler
**What goes wrong:** `navigator.mediaDevices.getDisplayMedia()` rejects with an error or shows an empty/broken picker.
**Why it happens:** In Electron, `getDisplayMedia` does not work like in Chrome. Without `setDisplayMediaRequestHandler` registered, there is no source to fulfill the request.
**How to avoid:** Register `setDisplayMediaRequestHandler` in main process before renderer ever calls `getDisplayMedia`. The handler must call `callback()` exactly once and never throw.
**Warning signs:** Promise rejection with NotAllowedError or NotSupportedError.

### Pitfall 6: New Peers Not Receiving Active Screen Share
**What goes wrong:** A user joins the room while another user is screen sharing, but the new joiner does not see the screen share.
**Why it happens:** `addTrack` was only called on peer connections that existed at the time screen share started. New peers created after that point do not automatically get the screen share track.
**How to avoid:** When a new peer is created via `addPeer`, check if a screen share is active and add the screen share tracks to the new peer connection as well. Store the active screen share MediaStream in a ref accessible to `useWebRTC`.
**Warning signs:** Late joiners see no screen share; existing members see it fine.

## Code Examples

Verified patterns from official sources:

### Acquiring Screen Sources with Thumbnails (Main Process IPC)
```typescript
// Source: https://www.electronjs.org/docs/latest/api/desktop-capturer
import { desktopCapturer, ipcMain } from 'electron';

// In registerIpcHandlers():
ipcMain.handle('screen:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon?.toDataURL() ?? null,
    display_id: source.display_id, // Non-empty for screens, empty for windows
  }));
});
```

### Preload Bridge for Screen Sharing
```typescript
// Source: Project pattern from src/preload.ts
// Add to contextBridge.exposeInMainWorld('electronAPI', { ... }):
getScreenSources: (): Promise<ScreenSource[]> =>
  ipcRenderer.invoke('screen:get-sources'),
selectScreenSource: (sourceId: string, withAudio: boolean): Promise<void> =>
  ipcRenderer.invoke('screen:select-source', sourceId, withAudio),
```

### Acquiring Stream in Renderer via getDisplayMedia
```typescript
// Source: https://www.electronjs.org/docs/latest/api/desktop-capturer
// Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

// Step 1: User selects source in custom picker -> IPC tells main process
await window.electronAPI.selectScreenSource(sourceId, includeAudio);

// Step 2: getDisplayMedia triggers setDisplayMediaRequestHandler in main process
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: true,
});

// Step 3: Set contentHint to avoid VP9 5fps cap
const videoTrack = stream.getVideoTracks()[0];
if (videoTrack) {
  videoTrack.contentHint = 'motion';
}
```

### Adding Screen Share Track to All Peers
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack
function addScreenShareToPeers(
  stream: MediaStream,
  peerConnections: Map<string, RTCPeerConnection>
): Map<string, RTCRtpSender[]> {
  const senderMap = new Map<string, RTCRtpSender[]>();

  for (const [peerId, pc] of peerConnections) {
    const senders: RTCRtpSender[] = [];
    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);
      senders.push(sender);
    }
    senderMap.set(peerId, senders);
  }

  return senderMap; // Store for cleanup on stop
}
```

### Bandwidth Control via setParameters
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters
async function setScreenShareBitrate(
  pc: RTCPeerConnection,
  maxBitrateBps: number // e.g., 4_000_000 for 4 Mbps
) {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
  if (!sender) return;

  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.encodings[0].maxBitrate = maxBitrateBps;
  await sender.setParameters(params);
}
```

### Signaling Screen Share State via Socket.IO
```typescript
// Types to add to shared/types.ts:
export interface ScreenShareState {
  sharing: boolean;
  sourceId?: string;
  sourceName?: string;
}

// Events to add to ClientToServerEvents:
'screen:start': (state: { sourceName: string }) => void;
'screen:stop': () => void;

// Events to add to ServerToClientEvents:
'screen:started': (payload: { socketId: string; sourceName: string }) => void;
'screen:stopped': (payload: { socketId: string }) => void;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getUserMedia` with `chromeMediaSource: 'desktop'` for audio | `setDisplayMediaRequestHandler` with `audio: 'loopback'` | Electron 35+ (2024) | Old approach crashes renderer on Windows 11 |
| Manual SDP offer/answer for adding screen share | `addTrack` triggers renegotiation via Perfect Negotiation | Already implemented | No extra signaling code needed for track exchange |
| No `contentHint` setting | Set `contentHint='motion'` on screen share tracks | Chrome 92+ (2021) | Prevents VP9 5fps cap for screen shares with motion |
| SDP munging for bitrate control | `RTCRtpSender.setParameters()` | Chrome 69+ (2018) | Standard, non-fragile bitrate control |

**Deprecated/outdated:**
- `getUserMedia` with `mandatory: { chromeMediaSource: 'desktop' }` for audio capture: Crashes on Windows with recent Electron. Use `setDisplayMediaRequestHandler` instead.
- `navigator.webkitGetUserMedia`: Removed long ago. Use `navigator.mediaDevices.getUserMedia` or `getDisplayMedia`.

## Open Questions

1. **System audio echo mitigation**
   - What we know: `audio: 'loopback'` captures ALL system audio including audio from WebRTC peers. `audio: 'loopbackWithMute'` mutes all local playback.
   - What's unclear: Whether there is a way to capture system audio but exclude WebRTC peer audio specifically. Web Audio API routing might help if the screen share audio can be separated from peer audio output.
   - Recommendation: Document that system audio works best with headphones. Use `'loopback'` (not `'loopbackWithMute'`) so the sharer can still hear their game. Accept echo as a known limitation for speaker users.

2. **VP9 vs VP8 codec for screen share performance**
   - What we know: VP9 with `contentHint='detail'` caps at 5fps. Setting `contentHint='motion'` removes the cap. VP8 does not have this issue but has worse compression.
   - What's unclear: Whether Chromium in Electron 40 defaults to VP8 or VP9 for screen shares. Whether codec preference can be set without SDP munging.
   - Recommendation: Set `contentHint='motion'` regardless of codec (it is harmless on VP8 and fixes VP9). Test actual fps in `chrome://webrtc-internals` during development.

3. **`webrtc-max-cpu-consumption-percentage` effectiveness in Electron 40**
   - What we know: This command-line switch was suggested as a fix for low fps in Electron bug #23254. Reports indicate it worked in Electron 8 but not in 10+. No confirmation for Electron 40.
   - What's unclear: Whether this switch has any effect in Electron 40 (Chromium 132).
   - Recommendation: Add the switch as a defensive measure (`app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '100')`). It is harmless if ineffective. Primary fix should be `contentHint='motion'` + explicit frameRate constraints.

## Sources

### Primary (HIGH confidence)
- [Electron desktopCapturer docs](https://www.electronjs.org/docs/latest/api/desktop-capturer) - API for getSources, thumbnails, DesktopCapturerSource structure
- [Electron session docs (setDisplayMediaRequestHandler)](https://www.electronjs.org/docs/latest/api/session) - Handler registration, audio: 'loopback', callback signature
- [MDN RTCRtpSender.replaceTrack](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/replaceTrack) - Track replacement without renegotiation, null to stop
- [MDN RTCPeerConnection.addTrack](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTrack) - Adding tracks triggers renegotiation
- [MDN RTCRtpSender.setParameters](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters) - Bandwidth control via maxBitrate

### Secondary (MEDIUM confidence)
- [Electron issue #23254](https://github.com/electron/electron/issues/23254) - Low framerate with WebRTC desktop capture; command-line switch workaround
- [Electron issue #42765](https://github.com/electron/electron/issues/42765) - getUserMedia audio crash on Windows (Error 263); confirms need for setDisplayMediaRequestHandler
- [Electron issue #46369](https://github.com/electron/electron/issues/46369) - Renderer crash with chromeMediaSourceId audio on Windows 11; confirms Error 263 on Electron 35
- [Electron issue #48446](https://github.com/electron/electron/issues/48446) - Echo issue with screen sharing audio track
- [WebRTC issue #42223195](https://issues.webrtc.org/issues/42223195) - contentHint='detail' limits framerate to 5fps with VP9

### Tertiary (LOW confidence)
- [Electron issue #41524](https://github.com/electron/electron/issues/41524) - Window capture low fps (closed without resolution)
- `webrtc-max-cpu-consumption-percentage` switch effectiveness in Electron 40 - Multiple contradictory reports across versions; needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All APIs are built into Electron 40 and WebRTC; no third-party dependencies needed; verified against official Electron and MDN docs
- Architecture: HIGH - Pattern follows established codebase conventions (IPC pipeline, hooks, Socket.IO events); addTrack/Perfect Negotiation already proven in Phase 3
- Pitfalls: MEDIUM - The fps cap issue is well-documented with a clear fix (contentHint='motion'); the audio crash is confirmed with a clear alternative (setDisplayMediaRequestHandler); echo mitigation is a known limitation without a perfect solution

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (30 days -- Electron APIs are stable, WebRTC APIs are mature)
