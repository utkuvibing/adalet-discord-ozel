---
status: testing
phase: 07-screen-sharing
source: 07-01-SUMMARY.md, 07-02-SUMMARY.md
started: 2026-03-02T19:15:00Z
updated: 2026-03-02T19:15:00Z
---

## Current Test

number: 1
name: Open Screen Share Picker
expected: |
  Click the screen share button (monitor icon) in the VoiceControls bar.
  A modal opens showing thumbnails of all available screens and application windows,
  separated into "Screens" and "Windows" sections. A "Include system audio" checkbox is visible.
awaiting: user response

## Tests

### 1. Open Screen Share Picker
expected: Click the screen share button (monitor icon) in the VoiceControls bar. A modal opens showing thumbnails of all available screens and application windows, separated into "Screens" and "Windows" sections. A "Include system audio" checkbox is visible.
result: [pending]

### 2. Select Source and Start Sharing
expected: Click a screen or window thumbnail in the picker. The picker closes, the share button turns red, and screen sharing begins. You should see a ScreenShareViewer showing your own screen content with a "Stop" button.
result: [pending]

### 3. Remote Peer Sees Screen Share
expected: On a second client connected to the same room, the shared screen appears automatically in a viewer component. The sharer's display name is shown in the viewer header.
result: [pending]

### 4. Stop Screen Share
expected: Click the Stop button on the viewer (or click the red share button again). The share stops for all peers, the viewer disappears on remote clients, and the share button returns to its default color. Voice audio continues uninterrupted.
result: [pending]

### 5. System Audio Capture
expected: Check the "Include system audio" checkbox before selecting a source. Start sharing while a game or video is playing. Remote peers should hear the system audio (game sounds) alongside the screen share.
result: [pending]

### 6. Late-Joiner Receives Share
expected: While one user is actively sharing their screen, a second user joins the room. The new joiner should automatically see the active screen share in the viewer without any action from the sharer.
result: [pending]

### 7. Voice Continuity During Share
expected: While in a voice call, start and stop a screen share multiple times. Voice audio should never cut out, stutter, or disconnect during screen share start/stop transitions.
result: [pending]

### 8. Frame Rate Quality
expected: While sharing a game or video, the stream should run smoothly at approximately 30fps. No visible stuttering, freezing, or single-digit frame rate cap.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0

## Gaps

[none yet]
