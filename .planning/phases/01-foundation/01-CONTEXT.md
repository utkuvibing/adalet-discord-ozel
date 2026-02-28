# Phase 1: Foundation - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Bootstrapped Electron app with shared types, SQLite schema, and secure contextBridge preload. This phase delivers the skeleton that all features build on — no user-facing features, but correct security and architecture from day one.

</domain>

<decisions>
## Implementation Decisions

### App Structure
- Host runs the server AND uses the app in the same window — no separate server process
- Server auto-starts when the host opens the app — no manual "Start Server" button
- Close button minimizes to system tray (like Discord) — app runs in background
- First-time users see a login/connect screen (enter server address + invite code), returning users go straight to the lobby

### Room Defaults
- Pre-made rooms on first server start — gaming-themed names that fit the retro aesthetic (e.g., "Dungeon", "Arena", "Tavern")
- Host can create, rename, and delete rooms later (Phase 6 delivers the UI for this)
- Room schema should support custom names from the start

### Data & Storage
- Chat history kept forever — no auto-deletion (it's their own server, disk is cheap)
- Shared files stored in app data folder (AppData on Windows) — clean, out of sight
- No artificial file size limit — self-hosted advantage
- SQLite database in the same app data directory

### Server Access
- Friends connect via invite link that encodes server address + auth token
- Server runs on a configurable port (default picked by Claude)
- The invite link should work as a URL that opens the app directly if installed

### Claude's Discretion
- Exact default port number
- System tray icon design (can be placeholder for v1)
- SQLite schema details beyond what's specified in requirements
- ESLint/Prettier configuration details
- Exact folder structure and file organization
- Splash screen timing and animation (if any)

</decisions>

<specifics>
## Specific Ideas

- The app name is "Sex Dungeon" — all branding, window titles, tray tooltips should use this name
- Retro/gaming aesthetic is Phase 6, but the window should at least have a dark background from the start (not default white Electron)
- The host PC is Windows 11 — ensure all paths and behaviors work on Windows

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — this phase establishes them. Choices here lock in patterns for all future phases:
  - IPC communication pattern (contextBridge API surface)
  - Database access pattern (Drizzle + better-sqlite3)
  - State management approach
  - Project file structure

### Integration Points
- Server process will be used by Phase 2 (Signaling) — must be extensible
- SQLite schema will be used by Phases 4 (Auth) and 5 (Text Chat) — design for expansion
- contextBridge API will be extended in every subsequent phase — start narrow, add methods per phase

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-01*
