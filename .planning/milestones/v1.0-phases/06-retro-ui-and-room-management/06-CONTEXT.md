---
phase: 06-retro-ui-and-room-management
status: complete
created: "2026-03-01"
updated: "2026-03-01"
---

# Phase 6 Context: Retro UI and Room Management

## Visual Direction

**Style: Discord Dark Modern** — Clean dark mode with neon green accent. NOT pixel art, NOT arcade, NOT terminal. Modern, polished, Discord-inspired but with the project's own identity.

### Decisions
- **Font**: Inter (modern sans-serif) — replace monospace Courier New system-wide. Load from Google Fonts or bundle locally.
- **Accent color**: Keep `#7fff00` neon green as primary accent. No color change.
- **CRT/scanline effects**: NO. Clean screens, readability first.
- **Border radius**: Increase to 8px for modern rounded feel (currently 3-4px).
- **Overall vibe**: Dark, clean, Discord-like layout but with neon green personality instead of blurple.

### Color Palette (keep existing, refine)
```
Background:   #0d0d0d (darkest), #111111 (sidebar), #141414 (cards), #1a1a1a (inputs)
Text:         #e0e0e0 (primary), #b0b0b0 (secondary), #888 (muted), #555 (disabled)
Accent:       #7fff00 (primary green), #99ff33 (hover green)
Error:        #ff4444
Warning:      #ff8800
Borders:      #2a2a2a (subtle), #3a3a3a (inputs)
```

### What Changes Per Component
- JoinServer: Rounder buttons/inputs, Inter font, smoother card styling
- Lobby: Same 2-column layout, refined spacing and typography
- RoomList: Modern hover states, smoother transitions
- ChatPanel: Cleaner message bubbles, better spacing
- VoiceControls: Polished button styling
- RoomMembers: Better member card styling
- InvitePanel: Cleaner form styling
- VolumePopup: Rounded popup
- ConnectionToast: Refined toast styling

## Room Management

### Decisions
- **Who can create rooms**: Host only (server validates `socket.data` for host status)
- **Who can delete rooms**: Host only
- **Who can rename rooms**: Host only (not in v1 scope — keep simple)
- **Default rooms**: Keep `Dungeon`, `Arena`, `Tavern` as seeded defaults
- **Room creation UI**: "+" button in sidebar room list header area, opens inline input or small modal
- **Room deletion**: Simple delete button next to non-default rooms (host only)
- **Room limit**: No hard limit, reasonable max (e.g., 20 rooms)
- **Real-time propagation**: New/deleted rooms broadcast to all connected clients immediately

### Socket Events Needed
```typescript
// Client → Server
'room:create': (name: string) => void
'room:delete': (roomId: number) => void

// Server → Client (existing room:list already handles propagation)
```

## Code Context

### Styling Pattern (KEEP)
- Inline `React.CSSProperties` objects per component — do NOT switch to CSS modules or styled-components
- Update `src/index.css` for global font-face and base styles
- Each component's `styles` object gets updated in-place

### Integration Points
- `src/shared/types.ts`: Add room:create, room:delete to event maps
- `src/server/signaling.ts`: Add room:create and room:delete handlers with host validation
- `src/renderer/components/RoomList.tsx`: Add create room button (host-only), delete button
- `src/index.css`: Add Inter font-face import, update base font-family

### Existing Patterns to Follow
- Socket events typed in `ServerToClientEvents` / `ClientToServerEvents`
- `TypedIO` / `TypedSocket` aliases in signaling.ts
- `broadcastPresence(io)` for room list propagation
- `db.insert(rooms)` / `db.delete(rooms)` via Drizzle ORM

## Deferred Ideas

- Room renaming (keep for later)
- Room ordering / drag-and-drop
- Room categories / folders
- Room icons / emoji
