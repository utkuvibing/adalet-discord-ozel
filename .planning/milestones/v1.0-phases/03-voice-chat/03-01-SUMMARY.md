---
phase: 03-voice-chat
plan: 01
subsystem: voice
tags: [webrtc, webaudio, getUserMedia, ptt, electron-globalShortcut]

# Dependency graph
requires:
  - phase: 02-signaling-and-nat-traversal
    provides: "WebRTC signaling (SDP/ICE relay), room management, Socket.IO typed events"
provides:
  - "useAudio hook: getUserMedia capture, Web Audio API routing, voice state management"
  - "WebRTC ontrack handler for remote audio streams"
  - "VoiceState/VoiceStatePayload types and voice:state-change event"
  - "PTT IPC pipeline (main process globalShortcut <-> preload <-> renderer)"
  - "Mute/deafen controls in Lobby UI"
  - "Socket reconnect watchdog re-joins active room"
affects: [03-voice-chat, 04-presence-and-ui, 07-screen-share]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-ref-pattern-between-hooks, web-audio-api-per-peer-routing, repeat-detection-keyup]

key-files:
  created:
    - src/renderer/hooks/useAudio.ts
  modified:
    - src/shared/types.ts
    - src/shared/events.ts
    - src/server/signaling.ts
    - src/preload.ts
    - src/main.ts
    - src/renderer/hooks/useWebRTC.ts
    - src/renderer/components/Lobby.tsx

key-decisions:
  - "Shared refs pattern: localStreamRef and onTrackRef created in Lobby, passed to both useWebRTC and useAudio to break circular dependency"
  - "Repeat-detection approach for PTT keyup: globalShortcut fires repeatedly while held, 50ms interval detects >150ms gap as key release"
  - "Web Audio API routing per peer: source -> GainNode -> AnalyserNode -> destination (GainNode for per-user volume, AnalyserNode prepared for speaking detection)"
  - "Data channel kept as fallback only when no local stream exists for negotiation trigger"

patterns-established:
  - "Shared ref pattern: when two hooks need bidirectional data, create refs at component level and pass to both"
  - "Web Audio per-peer pipeline: AudioContext singleton, per-peer GainNode + AnalyserNode chain"
  - "Voice state sync: local changes emit to server, server relays to room peers, peers update voiceStates map"

requirements-completed: [VOIC-01, VOIC-07, VOIC-08]

# Metrics
duration: 6min
completed: 2026-03-01
---

# Phase 3 Plan 1: WebRTC Audio Mesh Summary

**WebRTC audio mesh with getUserMedia mic capture, Web Audio API per-peer routing (GainNode + AnalyserNode), voice state sync, and PTT IPC pipeline via globalShortcut**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T09:12:39Z
- **Completed:** 2026-03-01T09:18:13Z
- **Tasks:** 2
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- Bidirectional audio pipeline: getUserMedia captures mic with echo cancellation/noise suppression, addTrack injects into all peer connections, ontrack routes remote audio through Web Audio API
- Voice state management: mute toggles local track enabled, deafen zeros all remote GainNodes (with volume restore on undeafen), speaking state synced via server relay
- PTT IPC pipeline wired end-to-end: main process globalShortcut with repeat-detection keyup, preload IPC wrappers, ElectronAPI types
- Reconnect resilience: ICE restart on connection failure, socket reconnect automatically re-joins active room via room:join re-emit

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend shared types, events, and server signaling for voice state** - `f521e3e` (feat)
2. **Task 2: Create useAudio hook and wire WebRTC audio pipeline into Lobby** - `ab83fbb` (feat)

## Files Created/Modified
- `src/renderer/hooks/useAudio.ts` - Core audio pipeline hook: mic capture, Web Audio routing, voice state, reconnect watchdog (417 lines)
- `src/shared/types.ts` - VoiceState, VoiceStatePayload interfaces; voice:state-change in event maps; PTT methods in ElectronAPI
- `src/shared/events.ts` - VOICE_STATE_CHANGE constant added to SocketEvents
- `src/server/signaling.ts` - voice:state-change relay handler broadcasts to room peers
- `src/preload.ts` - PTT IPC wrappers (registerPTTShortcut, unregisterPTTShortcut, onPTTStateChange)
- `src/main.ts` - PTT globalShortcut handlers with repeat-detection keyup approach
- `src/renderer/hooks/useWebRTC.ts` - Extended with ontrack handler, localStreamRef injection, ICE restart on failure
- `src/renderer/components/Lobby.tsx` - useAudio integration with shared refs, mute/deafen buttons, socket reconnect room re-join

## Decisions Made
- **Shared refs pattern for hook communication:** useAudio and useWebRTC need bidirectional data (localStreamRef from audio to webrtc, onTrackRef callback from webrtc to audio). Solution: create both refs in Lobby and pass to both hooks, avoiding circular dependency.
- **Repeat-detection for PTT keyup:** Electron globalShortcut has no keyup event. Used repeat-fire detection: globalShortcut fires repeatedly while key held, 50ms polling interval detects >150ms gap as release. Avoids new npm dependencies (uIOhook).
- **Data channel fallback:** Kept keepalive data channel creation only when no local audio stream exists. When audio tracks are available, they trigger onnegotiationneeded naturally.
- **Web Audio per-peer chain:** source -> GainNode -> AnalyserNode -> destination. GainNode enables per-user volume control. AnalyserNode is pre-wired for Plan 03-02 speaking detection.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Audio mesh complete -- Plan 03-02 can build mute/PTT/volume controls on top of useAudio's exposed API
- AnalyserNode per peer is pre-wired for speaking indicator detection
- VoiceState sync infrastructure ready for UI visualization
- Pre-existing TypeScript error in main.ts (window-all-closed handler type) is not related to Phase 3 changes

## Self-Check: PASSED

All 8 files verified present. Both task commits (f521e3e, ab83fbb) verified in git log.

---
*Phase: 03-voice-chat*
*Completed: 2026-03-01*
