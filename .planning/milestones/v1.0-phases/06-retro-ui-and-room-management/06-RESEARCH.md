# Phase 6: Discord Dark Modern UI and Room Management - Research

**Researched:** 2026-03-01
**Domain:** UI theming (CSS/fonts), Socket.IO room CRUD, Drizzle ORM
**Confidence:** HIGH

## Summary

Phase 6 has two distinct workstreams: (1) a visual refresh of all existing components from monospace/retro to Discord Dark Modern with Inter font, neon green accent, and 8px border radius, and (2) host-only room creation and deletion via Socket.IO events backed by Drizzle ORM. Both workstreams are well-scoped and use technologies already in the project.

The visual refresh is a systematic find-and-replace of inline `React.CSSProperties` style objects across 9 components plus `src/index.css`. No new libraries are needed beyond `@fontsource/inter` for bundling the Inter font locally (critical for Electron -- no external network dependency for fonts). The room management feature adds two socket events (`room:create`, `room:delete`), server-side host validation via the existing `isLocalhost` pattern, and minor UI additions to `RoomList.tsx`.

**Primary recommendation:** Install `@fontsource/inter`, import it in the renderer entry point, then systematically update each component's `styles` object in-place. For room management, add `isHost` flag to `SocketData`, validate it server-side, and use the existing `broadcastPresence` pattern to propagate changes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Font**: Inter (modern sans-serif) -- replace monospace Courier New system-wide. Load from Google Fonts or bundle locally.
- **Accent color**: Keep `#7fff00` neon green as primary accent. No color change.
- **CRT/scanline effects**: NO. Clean screens, readability first.
- **Border radius**: Increase to 8px for modern rounded feel (currently 3-4px).
- **Overall vibe**: Dark, clean, Discord-like layout but with neon green personality instead of blurple.
- **Styling pattern**: Inline `React.CSSProperties` objects per component -- do NOT switch to CSS modules or styled-components.
- **Who can create rooms**: Host only (server validates `socket.data` for host status)
- **Who can delete rooms**: Host only
- **Default rooms**: Keep `Dungeon`, `Arena`, `Tavern` as seeded defaults
- **Room creation UI**: "+" button in sidebar room list header area, opens inline input or small modal
- **Room deletion**: Simple delete button next to non-default rooms (host only)
- **Room limit**: No hard limit, reasonable max (e.g., 20 rooms)
- **Real-time propagation**: New/deleted rooms broadcast to all connected clients immediately
- **Socket events**: `room:create` (name: string), `room:delete` (roomId: number)

### Color Palette (keep existing, refine)
```
Background:   #0d0d0d (darkest), #111111 (sidebar), #141414 (cards), #1a1a1a (inputs)
Text:         #e0e0e0 (primary), #b0b0b0 (secondary), #888 (muted), #555 (disabled)
Accent:       #7fff00 (primary green), #99ff33 (hover green)
Error:        #ff4444
Warning:      #ff8800
Borders:      #2a2a2a (subtle), #3a3a3a (inputs)
```

### Claude's Discretion
- Specific spacing values, typography sizes, padding adjustments
- Transition/animation refinements
- Component-level layout tweaks for polish
- How to structure the theme constants (shared object vs per-component)
- Room name validation rules (min/max length, allowed characters)
- Exact room limit number

### Deferred Ideas (OUT OF SCOPE)
- Room renaming (keep for later)
- Room ordering / drag-and-drop
- Room categories / folders
- Room icons / emoji
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | App has a retro/gaming aesthetic (pixel art, neon colors, arcade-style elements) | Corrected to Discord Dark Modern per discuss-phase. Inter font via @fontsource/inter, color palette already defined, 8px border-radius, inline CSSProperties pattern documented. |
| UI-02 | Host can create and name custom voice rooms | Socket events room:create/room:delete, server-side isHost validation via SocketData, Drizzle ORM insert/delete, broadcastPresence propagation pattern all documented. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fontsource/inter | latest (5.x) | Bundle Inter font locally for Electron | Self-hosted fonts are mandatory for Electron (no network dependency). Fontsource is the standard npm-based font distribution. |
| React (existing) | 19.x | UI framework | Already in project |
| Socket.IO (existing) | 4.8.x | Real-time events for room CRUD | Already in project, typed event maps established |
| Drizzle ORM (existing) | 0.45.x | Room insert/delete in SQLite | Already in project, schema for `rooms` table exists |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All supporting needs covered by existing stack |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fontsource/inter | Google Fonts CDN link | CDN requires network; Electron app must work offline. Use fontsource. |
| @fontsource/inter | Manual woff2 download | Manual download works but fontsource is cleaner (npm managed, includes CSS). |
| @fontsource-variable/inter | @fontsource/inter (static) | Variable font supports all weights 100-900 in one file. Static requires separate files per weight. Variable is slightly larger (~300KB vs ~100KB for single weight) but more flexible. Use static with weights 400 + 500 + 600 + 700 since only those are needed. |
| Inline CSSProperties | CSS Modules / styled-components | User locked decision: keep inline CSSProperties. Do not switch. |

**Installation:**
```bash
npm install @fontsource/inter
```

## Architecture Patterns

### Recommended Project Structure
No new directories needed. All changes go into existing files:
```
src/
├── index.css                          # Add Inter font import, update base font-family
├── renderer/
│   ├── components/
│   │   ├── JoinServer.tsx             # Update styles object
│   │   ├── Lobby.tsx                  # Update styles object
│   │   ├── RoomList.tsx               # Update styles + add create/delete room UI
│   │   ├── ChatPanel.tsx              # Update styles object
│   │   ├── VoiceControls.tsx          # Update styles object
│   │   ├── RoomMembers.tsx            # Update styles object
│   │   ├── InvitePanel.tsx            # Update styles object
│   │   ├── VolumePopup.tsx            # Update styles object
│   │   └── ConnectionToast.tsx        # Update styles object
│   └── app.tsx or index.tsx           # Import @fontsource/inter CSS
├── shared/
│   └── types.ts                       # Add room:create, room:delete to event maps, isHost to SocketData
└── server/
    ├── signaling.ts                   # Add room:create, room:delete handlers with host validation
    └── middleware/auth.ts             # Set socket.data.isHost = true for localhost connections
```

### Pattern 1: Theme Constants Object
**What:** A shared constants object for colors, spacing, and typography values used across all component `styles` objects.
**When to use:** To ensure consistency and avoid magic strings scattered across 9 components.
**Example:**
```typescript
// src/renderer/theme.ts (new file, small)
export const theme = {
  colors: {
    bgDarkest: '#0d0d0d',
    bgSidebar: '#111111',
    bgCard: '#141414',
    bgInput: '#1a1a1a',
    textPrimary: '#e0e0e0',
    textSecondary: '#b0b0b0',
    textMuted: '#888',
    textDisabled: '#555',
    accent: '#7fff00',
    accentHover: '#99ff33',
    error: '#ff4444',
    warning: '#ff8800',
    borderSubtle: '#2a2a2a',
    borderInput: '#3a3a3a',
  },
  font: {
    family: "'Inter', sans-serif",
    sizeXs: '0.7rem',
    sizeSm: '0.8rem',
    sizeMd: '0.9rem',
    sizeLg: '1rem',
    sizeXl: '1.2rem',
    sizeTitle: '1.8rem',
  },
  radius: '8px',
  radiusSm: '6px',
} as const;
```
**Recommendation:** Create this small theme file. Each component's `styles` object references `theme.colors.accent` instead of hard-coded `'#7fff00'`. This makes the refresh systematic and maintainable. The locked decision is inline CSSProperties -- a theme constants file does NOT violate that; it just centralizes values.

### Pattern 2: Host Validation via SocketData Flag
**What:** Add `isHost: boolean` to `SocketData` interface, set it during auth middleware, check it in room:create/room:delete handlers.
**When to use:** For all host-only operations.
**Example:**
```typescript
// In middleware/auth.ts -- set during authentication
socket.data.isHost = isLocalhost;

// In signaling.ts -- check in handler
socket.on('room:create', (name: string) => {
  if (!socket.data.isHost) {
    socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can create rooms.' });
    return;
  }
  // ... insert room
});
```

### Pattern 3: Room CRUD with broadcastPresence
**What:** After inserting or deleting a room in the DB, call the existing `broadcastPresence(io)` to push the updated room list to all clients.
**When to use:** Every room:create and room:delete handler.
**Example:**
```typescript
socket.on('room:create', (name: string) => {
  if (!socket.data.isHost) return;

  // Validate name
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    socket.emit('error', { code: 'INVALID_ROOM_NAME', message: 'Room name must be 1-50 characters.' });
    return;
  }

  // Check room limit
  const roomCount = db.select({ total: count() }).from(rooms).all()[0]?.total ?? 0;
  if (roomCount >= 20) {
    socket.emit('error', { code: 'ROOM_LIMIT', message: 'Maximum 20 rooms allowed.' });
    return;
  }

  // Check duplicate name
  const existing = db.select().from(rooms).where(eq(rooms.name, trimmed)).all();
  if (existing.length > 0) {
    socket.emit('error', { code: 'DUPLICATE_ROOM', message: 'A room with that name already exists.' });
    return;
  }

  db.insert(rooms).values({ name: trimmed, isDefault: false }).run();
  broadcastPresence(io);
});
```

### Pattern 4: Fontsource Import in Renderer Entry
**What:** Import `@fontsource/inter` in the renderer entry point so Vite bundles the font files.
**When to use:** Once, in the renderer entry.
**Example:**
```typescript
// In renderer entry (e.g., src/renderer.ts or src/index.tsx)
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
```
Then in `src/index.css`:
```css
body {
  font-family: 'Inter', sans-serif;
}
```

### Anti-Patterns to Avoid
- **Switching to CSS Modules or styled-components:** User locked decision. Keep inline CSSProperties.
- **Loading Inter from Google Fonts CDN:** Electron apps may not have internet access. Always bundle locally.
- **Client-side room creation without server validation:** Never trust the client. Always validate isHost on server.
- **Deleting default rooms:** Default rooms (isDefault: true) should never be deletable. Guard in server handler.
- **Not calling broadcastPresence after room changes:** All clients must see room changes immediately.
- **Using fontFamily: 'monospace' in individual component styles after the migration:** The migration should be complete. Every `fontFamily: 'monospace'` or `fontFamily: "'Courier New', Courier, monospace"` must be replaced.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Font bundling | Manual woff2 download and @font-face declarations | `@fontsource/inter` npm package | Handles font file bundling, CSS generation, proper format declarations. One npm install + import. |
| Room list propagation | Custom diff-based room list sync | Existing `broadcastPresence(io)` | Already built and tested. Sends full room+member snapshot on every change. No need for incremental updates at this scale (max 20 rooms). |
| Host detection | Custom token-based host role system | `socket.handshake.address` localhost check (already in auth.ts) | The auth middleware already knows if a connection is localhost. Just persist that as `socket.data.isHost`. |
| Room name uniqueness check | Application-level dedup logic | SQLite `UNIQUE` constraint on `rooms.name` column (already in schema) | The schema already has `name: text().notNull().unique()`. Drizzle will throw on duplicate insert. Catch the error. |

**Key insight:** This phase adds very little new infrastructure. The UI refresh is mechanical (update style objects), and room CRUD piggybacks entirely on existing patterns (Drizzle schema, Socket.IO typed events, broadcastPresence). The only new dependency is `@fontsource/inter`.

## Common Pitfalls

### Pitfall 1: Missing fontFamily References After Migration
**What goes wrong:** Some components still show monospace/Courier after the font migration because a few `fontFamily: 'monospace'` references were missed.
**Why it happens:** There are 30+ occurrences of `fontFamily: 'monospace'` or `fontFamily: "'Courier New'"` spread across 9 components plus index.css.
**How to avoid:** Do a project-wide search for `monospace`, `Courier`, and `font-family` after migration. Every occurrence in component style objects should reference the Inter font or be removed (since `body` sets it globally).
**Warning signs:** Any text in the app rendering in a monospace font after the migration.

### Pitfall 2: Border Radius Inconsistency
**What goes wrong:** Some elements have old `borderRadius: '3px'` or `borderRadius: '4px'` while others have the new `8px`, creating a visually jarring mix.
**Why it happens:** Selective updating -- some components get updated but others are missed, or sub-elements within a component are overlooked.
**How to avoid:** Use the theme constants object with `theme.radius` (8px) and `theme.radiusSm` (6px for small elements like tags/badges). Search for all `borderRadius` occurrences after migration.
**Warning signs:** Visual inconsistency between rounded and sharp-cornered elements.

### Pitfall 3: Room Deletion While Users Are Inside
**What goes wrong:** Host deletes a room that has active users in it. Those users' clients still show the room as active, but the room no longer exists in the DB.
**Why it happens:** No handling of the edge case where users are in a room being deleted.
**How to avoid:** Before deleting a room, kick all users out of that Socket.IO room first. For each socket in the room, call `socket.leave(roomKey)` and emit a system message. Then delete from DB and broadcastPresence.
**Warning signs:** Users stuck in a "ghost" room with no way to interact.

### Pitfall 4: Not Passing isHost to RoomList
**What goes wrong:** The "+" create button and delete buttons appear for all users, not just the host.
**Why it happens:** `isHost` prop not threaded through from `Lobby` -> `RoomList`.
**How to avoid:** Add `isHost` to `RoomListProps`, pass it from `Lobby`, conditionally render create/delete UI.
**Warning signs:** Non-host users seeing room management controls.

### Pitfall 5: Fontsource CSS Not Processed by Vite
**What goes wrong:** Inter font files not found at runtime. The CSS import from `@fontsource/inter` isn't picked up by the Vite build.
**Why it happens:** The import is placed in the wrong entry point (e.g., main process instead of renderer), or the Vite config doesn't process CSS from node_modules.
**How to avoid:** Import `@fontsource/inter/*.css` in the renderer entry file (the same file that imports React and renders the app). Vite's default config handles CSS imports from node_modules automatically.
**Warning signs:** Network errors for font files, or text rendering in system default sans-serif instead of Inter.

### Pitfall 6: Room Name Validation Missing on Client
**What goes wrong:** User submits empty or excessively long room names, gets confusing server errors.
**Why it happens:** Only server-side validation, no client-side feedback.
**How to avoid:** Validate name length (1-50 chars) on client before emitting `room:create`. Trim whitespace. Show inline error if invalid.
**Warning signs:** Poor UX when entering bad room names.

## Code Examples

Verified patterns from official sources and existing codebase:

### Fontsource Import (from fontsource.org/fonts/inter/install)
```typescript
// In renderer entry file
import '@fontsource/inter/400.css';  // Regular
import '@fontsource/inter/500.css';  // Medium
import '@fontsource/inter/600.css';  // Semi-bold
import '@fontsource/inter/700.css';  // Bold
```

### Updated index.css Base Styles
```css
body {
  margin: 0;
  padding: 0;
  background-color: #0d0d0d;
  color: #e0e0e0;
  font-family: 'Inter', sans-serif;
  overflow: hidden;
}

input[type="text"],
input[type="number"],
input[type="password"] {
  background-color: #1a1a1a;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  color: #e0e0e0;
  font-family: 'Inter', sans-serif;
  font-size: 0.9rem;
  padding: 0.5rem 0.7rem;
  outline: none;
  transition: border-color 0.2s;
}

button {
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
}
```

### Component Style Migration Example (RoomList header)
```typescript
// BEFORE
header: {
  color: '#7fff00',
  fontSize: '0.9rem',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  padding: '0.8rem 0.8rem 0.4rem',
  margin: 0,
},

// AFTER
header: {
  color: '#7fff00',
  fontSize: '0.85rem',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  padding: '0.8rem 0.8rem 0.4rem',
  margin: 0,
},
```
Note: `fontFamily` removed because `body` sets Inter globally. All component-level `fontFamily: 'monospace'` references should be removed.

### Room Create Socket Event Types (add to types.ts)
```typescript
// Add to ClientToServerEvents
'room:create': (name: string) => void;
'room:delete': (roomId: number) => void;
```

### Room Create Server Handler
```typescript
import { count } from 'drizzle-orm';

socket.on('room:create', (name: string) => {
  if (!socket.data.isHost) {
    socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can create rooms.' });
    return;
  }

  const trimmed = (typeof name === 'string' ? name : '').trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    socket.emit('error', { code: 'INVALID_ROOM_NAME', message: 'Room name must be 1-50 characters.' });
    return;
  }

  // Check room count limit
  const total = db.select({ total: count() }).from(rooms).all()[0]?.total ?? 0;
  if (total >= 20) {
    socket.emit('error', { code: 'ROOM_LIMIT', message: 'Maximum 20 rooms reached.' });
    return;
  }

  try {
    db.insert(rooms).values({ name: trimmed, isDefault: false }).run();
  } catch (err) {
    // UNIQUE constraint violation = duplicate name
    socket.emit('error', { code: 'DUPLICATE_ROOM', message: 'A room with that name already exists.' });
    return;
  }

  broadcastPresence(io);
});
```

### Room Delete Server Handler
```typescript
socket.on('room:delete', (roomId: number) => {
  if (!socket.data.isHost) {
    socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can delete rooms.' });
    return;
  }

  // Prevent deleting default rooms
  const room = db.select().from(rooms).where(eq(rooms.id, roomId)).all()[0];
  if (!room) return;
  if (room.isDefault) {
    socket.emit('error', { code: 'CANNOT_DELETE_DEFAULT', message: 'Cannot delete default rooms.' });
    return;
  }

  // Kick users out of the room before deleting
  const roomKey = `${ROOM_PREFIX}${roomId}`;
  const memberIds = io.sockets.adapter.rooms.get(roomKey);
  if (memberIds) {
    for (const memberId of memberIds) {
      const memberSocket = io.sockets.sockets.get(memberId);
      if (memberSocket) {
        memberSocket.leave(roomKey);
        memberSocket.emit('system:message', {
          text: `Room "${room.name}" was deleted by the host.`,
          roomId,
          timestamp: Date.now(),
        });
      }
    }
  }

  db.delete(rooms).where(eq(rooms.id, roomId)).run();
  broadcastPresence(io);
});
```

### SocketData Extension
```typescript
// Add to SocketData interface in types.ts
export interface SocketData {
  inviteTokenId: number;
  displayName: string;
  avatarId: string;
  userId: number;
  sessionToken: string;
  isHost: boolean;  // NEW: true for localhost connections
}
```

### Auth Middleware Host Flag
```typescript
// In middleware/auth.ts, add to all three auth flows:
socket.data.isHost = isLocalhost;
```

### Create Room UI in RoomList
```typescript
// Inline input pattern for room creation
const [creating, setCreating] = useState(false);
const [newRoomName, setNewRoomName] = useState('');

// In JSX (header area):
<div style={styles.headerRow}>
  <h3 style={styles.header}>Rooms</h3>
  {isHost && (
    <button style={styles.addBtn} onClick={() => setCreating(true)} title="Create room">
      +
    </button>
  )}
</div>
{creating && (
  <div style={styles.createRow}>
    <input
      type="text"
      value={newRoomName}
      onChange={(e) => setNewRoomName(e.target.value)}
      placeholder="Room name"
      maxLength={50}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          socket?.emit('room:create', newRoomName);
          setCreating(false);
          setNewRoomName('');
        }
        if (e.key === 'Escape') {
          setCreating(false);
          setNewRoomName('');
        }
      }}
      style={styles.createInput}
    />
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Google Fonts CDN in HTML `<link>` | npm-bundled fonts via @fontsource | 2022+ (fontsource mature) | Fonts bundled in app, no network dependency, GDPR compliant |
| CSS Modules or styled-components for React | Inline styles, Tailwind, or CSS Modules depending on project | Ongoing debate | This project uses inline CSSProperties -- locked decision, no change needed |
| Per-component hard-coded color strings | Shared theme constants object | Best practice | Centralizes palette, makes future theming possible |

**Deprecated/outdated:**
- `typeface-*` packages (predecessor to @fontsource): Unmaintained. Use @fontsource instead.
- `fontsource-inter` (old package name): Replaced by `@fontsource/inter` scoped package.

## Open Questions

1. **Renderer entry file location**
   - What we know: The project uses Electron Forge with Vite. The renderer entry is likely `src/renderer.ts` or referenced in the Vite renderer config.
   - What's unclear: Exact file path for the fontsource CSS import.
   - Recommendation: Grep for `createRoot` or `ReactDOM` to find the renderer entry and import there. If index.css is already imported there, the fontsource imports go alongside it.

2. **Room deletion and message orphaning**
   - What we know: Messages table has a foreign key `roomId` referencing `rooms.id`. Deleting a room without handling messages will either fail (if FK constraints are enforced) or orphan messages.
   - What's unclear: Whether `PRAGMA foreign_keys = ON` with CASCADE or RESTRICT is set.
   - Recommendation: Either add `ON DELETE CASCADE` to the messages FK (requires migration), or delete messages for the room before deleting the room. The simpler approach is to delete messages first: `db.delete(messages).where(eq(messages.roomId, roomId)).run()` before `db.delete(rooms)`.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: All 9 components read, style patterns documented, Socket.IO typed events verified
- `@fontsource/inter` official install page (fontsource.org/fonts/inter/install) - installation and import patterns
- Socket.IO v4 official docs (socket.io/docs/v4/) - socket.data, rooms, server API
- Drizzle ORM existing schema (src/server/db/schema.ts) - rooms table structure, unique constraint

### Secondary (MEDIUM confidence)
- WebSearch: Electron + Vite font bundling patterns - multiple sources confirm fontsource approach works with Vite
- WebSearch: Socket.IO room management best practices - server-side validation emphasis confirmed by official docs

### Tertiary (LOW confidence)
- None. All findings verified with primary sources or codebase analysis.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Only one new package (@fontsource/inter), everything else is existing
- Architecture: HIGH - All patterns are extensions of existing codebase patterns (broadcastPresence, typed events, inline styles)
- Pitfalls: HIGH - Based on direct codebase analysis of all 30+ fontFamily occurrences and the rooms FK relationship

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable domain, no fast-moving concerns)
