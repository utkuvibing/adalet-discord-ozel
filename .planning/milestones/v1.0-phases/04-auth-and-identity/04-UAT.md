---
status: testing
phase: 04-auth-and-identity
source: [04-01-SUMMARY.md]
started: 2026-03-01T13:00:00Z
updated: 2026-03-01T13:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: App launches without errors
expected: |
  Running `npm start` opens the Electron app window. No crash or white screen. Either the JoinServer form (if first launch) or the Lobby (if returning user) is visible.
awaiting: user response

## Tests

### 1. App launches without errors
expected: Running `npm start` opens the Electron app window. No crash or white screen. Either the JoinServer form (if first launch) or the Lobby (if returning user) is visible.
result: [pending]

### 2. Avatar picker visible on join form
expected: The JoinServer form shows a grid of 12 emoji avatars (skull, dragon, sword, shield, crown, ghost, alien, robot, wizard, fire, lightning, gem). One avatar is pre-selected with a green (#7fff00) border. You can click different avatars to select them.
result: [pending]

### 3. Join with display name and avatar
expected: Enter a display name, select an avatar, paste an invite link, and click Connect. You join the lobby successfully. Your chosen avatar emoji appears next to your name in the topbar area.
result: [pending]

### 4. Avatar shown in room member list
expected: After joining a room, your avatar emoji appears next to your name in the room member list (instead of a plain green dot). Other members also show their chosen avatar emojis.
result: [pending]

### 5. Host first-launch identity form
expected: On the host's first launch (clear localStorage if needed), the JoinServer form appears with display name and avatar picker but NO invite link field. After picking a name and avatar, you enter the lobby as the host.
result: [pending]

### 6. Session persistence (returning user)
expected: After joining once, close the app completely and reopen it. You should auto-reconnect to the server without seeing the join form — your display name and avatar are preserved from the previous session.
result: [pending]

### 7. Session cleared on invalid token
expected: If you manually corrupt the saved session (e.g., clear the server's DB but keep the client session), reopening the app should show the JoinServer form again instead of endlessly retrying to connect.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
