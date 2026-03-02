---
status: testing
phase: 06-retro-ui-and-room-management
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md]
started: "2026-03-01"
updated: "2026-03-01"
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Inter font across all screens
expected: |
  Every screen (Join Server, Lobby, Room view) uses a clean sans-serif font (Inter) instead of monospace/Courier New. Text should look modern and proportional, not like a terminal.
awaiting: user response

## Tests

### 1. Inter font across all screens
expected: Every screen (Join Server, Lobby, Room view) uses a clean sans-serif font (Inter) instead of monospace/Courier New. Text should look modern and proportional, not like a terminal.
result: [pending]

### 2. Rounded modern UI elements
expected: All buttons, inputs, cards, and panels have smooth rounded corners (8px radius). No sharp 3-4px corners remain. The app should feel polished and Discord-like.
result: [pending]

### 3. Dark modern aesthetic with neon green accent
expected: The app has a dark background (#0d0d0d/#111111/#141414), clean layout, and neon green (#7fff00) accent color on buttons and interactive elements. No CRT/scanline effects, no pixel art borders. Looks like a modern Discord-style app with green personality.
result: [pending]

### 4. Host sees room creation button
expected: As the host (running the server), you see a "+" button in the room list header area. Non-host users should NOT see this button.
result: [pending]

### 5. Create a new room
expected: Clicking the "+" button opens an inline text input in the room list. Type a room name (e.g., "Test Room") and press Enter. The new room immediately appears in the room list for all connected users.
result: [pending]

### 6. Delete a custom room
expected: Custom rooms (not Dungeon/Arena/Tavern) show an "x" delete button visible only to the host. Clicking it removes the room from the list for all users. Default rooms (Dungeon, Arena, Tavern) do NOT have a delete button.
result: [pending]

### 7. Room creation limits and validation
expected: Empty room names are rejected. Room names longer than 50 characters are rejected. You cannot create more than 20 rooms total. Duplicate room names are handled gracefully (no crash).
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
