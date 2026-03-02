---
status: testing
phase: 03-voice-chat
source: [03-01-SUMMARY.md, 03-02 commits (5f7d303, 99ab105)]
started: 2026-03-01T12:30:00Z
updated: 2026-03-01T12:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: App launches without errors
expected: |
  Running `npm start` opens the Electron app window. No crash or white screen. The JoinServer or Lobby view is visible.
awaiting: user response

## Tests

### 1. App launches without errors
expected: Running `npm start` opens the Electron app window. No crash or white screen. The JoinServer or Lobby view is visible.
result: [pending]

### 2. Join a voice room
expected: In the Lobby, click a room name in the sidebar (Dungeon, Arena, or Tavern). You should join instantly — no loading screen or manual connect button. Your name appears in the room's member list with a green dot.
result: [pending]

### 3. Bidirectional audio works
expected: Two users in the same room can hear each other speak through their microphones. Audio should be clear with no significant delay.
result: [pending]

### 4. Mute toggle
expected: Click the mic icon in the bottom bar at the bottom of the sidebar. The icon should change to show a red slash (muted state). Other users can no longer hear you. Click again to unmute — audio resumes.
result: [pending]

### 5. Deafen toggle
expected: Click the headphone icon in the bottom bar. You stop hearing all remote audio. Your mic also auto-mutes. The icon shows a red slash. Click again to undeafen — audio from others resumes and your mic unmutes.
result: [pending]

### 6. Push-to-talk mode
expected: Click the PTT toggle in the bottom bar to switch from "OPEN MIC" to "PTT: Insert". Your mic is muted by default. Hold the Insert key — a pulsing green dot appears and you transmit audio. Release the key — transmission stops. PTT works even when the app window is not focused (minimized to tray).
result: [pending]

### 7. Speaking indicator (green glow)
expected: When a user in the room speaks, a green glow (#7fff00) appears around their name in the member list. The glow fades smoothly when they stop talking (~0.3s fade-out).
result: [pending]

### 8. Voice state icons on members
expected: When a user mutes or deafens, small red mic-slash or headphone-slash icons appear next to their name in the member list, visible to all room members.
result: [pending]

### 9. Per-user volume control
expected: Right-click a member in the room list. A floating popup appears with a volume slider (0-200%). Dragging the slider changes that specific user's volume in real-time. Other users' volumes are unaffected.
result: [pending]

### 10. Auto-reconnect after WiFi drop
expected: While in a voice room, briefly disable WiFi (or disconnect network). After re-enabling WiFi, voice connection automatically recovers without any manual action — you hear others again and they hear you.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0

## Gaps

[none yet]
