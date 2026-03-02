# Coding Conventions

**Analysis Date:** 2026-03-02

## Naming Patterns

**Files:**
- Components: PascalCase `.tsx` -- `ChatPanel.tsx`, `VoiceControls.tsx`, `JoinServer.tsx`
- Hooks: camelCase prefixed with `use` -- `useSocket.ts`, `useWebRTC.ts`, `useAudio.ts`
- Server modules: camelCase `.ts` -- `signaling.ts`, `invite.ts`, `user.ts`, `upload.ts`
- Shared modules: camelCase `.ts` -- `types.ts`, `events.ts`, `avatars.ts`, `iceConfig.ts`
- Context: PascalCase `.tsx` -- `SocketContext.tsx`

**Functions:**
- React components: PascalCase named exports -- `export function ChatPanel()`
- Hooks: camelCase with `use` prefix -- `export function useSocket()`
- Server helpers: camelCase -- `broadcastPresence()`, `leaveAllVoiceRooms()`, `createInviteToken()`
- Utility functions: camelCase -- `formatFileSize()`, `formatTime()`, `getAvatarEmoji()`
- Registration functions: `register` prefix pattern -- `registerAuthMiddleware()`, `registerSignalingHandlers()`, `registerUploadRoutes()`

**Variables:**
- camelCase throughout -- `activeRoomId`, `connectionState`, `peerConnections`
- Constants: UPPER_SNAKE_CASE -- `ROOM_PREFIX`, `DEFAULT_VOICE_STATE`, `VAD_THRESHOLD`, `ICE_RESTART_TIMEOUT_MS`
- Refs: camelCase with `Ref` suffix -- `socketRef`, `localStreamRef`, `messagesEndRef`, `pttCleanupRef`

**Types:**
- Interfaces: PascalCase -- `User`, `Room`, `ChatMessage`, `VoiceState`
- Props interfaces: PascalCase with `Props` suffix -- `ChatPanelProps`, `LobbyProps`, `VoiceControlsProps`
- Return type interfaces: PascalCase with `Return` suffix -- `UseSocketReturn`, `UseWebRTCReturn`, `UseAudioReturn`
- Type aliases: PascalCase -- `TypedSocket`, `TypedIO`, `ConnectionState`, `FeedItem`
- Prefer `interface` for object shapes; use `type` for unions, mapped types, and aliases

## Code Style

**Formatting (Prettier):**
- Config: `.prettierrc`
- Semicolons: always
- Quotes: single quotes
- Tab width: 2 spaces
- Trailing commas: ES5 style (objects, arrays, params)
- Print width: 100 characters
- Run via `npm run format`

**Linting (ESLint):**
- Config: `eslint.config.mjs` (flat config format)
- Base: `eslint.configs.recommended` + `tseslint.configs.recommended`
- `@typescript-eslint/no-explicit-any`: warn (not error)
- `@typescript-eslint/no-require-imports`: off
- Ignores: `.vite/`, `out/`, `drizzle/`, `node_modules/`
- Run via `npm run lint`

## TypeScript Configuration

**Strictness:**
- `strict: true` in `tsconfig.json`
- `noImplicitAny: true`
- Target: ESNext
- Module: CommonJS
- JSX: react-jsx (automatic runtime)
- `skipLibCheck: true`

**Patterns:**
- Use `interface` for data models and props, `type` for unions and aliases
- Typed Socket.IO event maps in `src/shared/types.ts` -- `ServerToClientEvents`, `ClientToServerEvents`
- Global `Window` augmentation for `electronAPI` in `src/shared/types.ts`
- Explicit return types on exported functions; implicit on callbacks and handlers
- `as const` assertions for constant objects -- `SocketEvents`, `theme`, `AVATARS`

## Import Organization

**Order (consistent across codebase):**
1. Node built-ins -- `import path from 'node:path'`
2. External packages -- `import React from 'react'`, `import { io } from 'socket.io-client'`
3. Internal shared types -- `import type { ChatMessage } from '../../shared/types'`
4. Internal modules -- `import { useSocketContext } from '../context/SocketContext'`
5. Relative siblings -- `import { RoomMembers } from './RoomMembers'`

**Type imports:**
- Use `import type` for type-only imports -- `import type { VoiceState } from '../../shared/types'`
- Mixed imports when both values and types needed -- `import { eq, desc, count } from 'drizzle-orm'`

**Path Aliases:**
- None configured. All imports use relative paths with `../` and `../../`

## React Patterns

**Components:**
- All functional components -- no class components
- Named exports (not default) for all components except `App` in `src/App.tsx`
- Explicit return type `React.JSX.Element` on all components
- Props defined as interfaces immediately above the component

**Hooks:**
- Custom hooks return typed objects (not tuples)
- `useCallback` for all event handlers passed to children or used in effects
- `useRef` for mutable state that should not trigger re-renders (peer connections, timers, AudioContext)
- `useState` only for values that drive UI rendering
- Effect cleanup: always return cleanup functions from `useEffect` when registering listeners
- Socket listener pattern: register in `useEffect`, return cleanup that calls `socket.off()`

**State Management:**
- React Context for socket connection -- `SocketContext.tsx` wraps `useSocket` hook
- Component-local state via `useState` for UI state
- `useRef` for mutable non-rendering state (WebRTC peers, audio nodes, timers)
- `localStorage` for session persistence only
- No external state library (no Redux, Zustand, etc.)

**Common effect pattern:**
```typescript
useEffect(() => {
  if (!socket) return;
  const handler = (data: SomeType) => { /* ... */ };
  socket.on('event:name', handler);
  return () => { socket.off('event:name', handler); };
}, [socket]);
```

## Error Handling

**Renderer (client):**
- `try/catch` around async operations (localStorage parse, fetch, IPC calls)
- Empty `catch` blocks with comments explaining why errors are ignored (`// Corrupt data -- ignore`)
- Error state managed via `useState<string | null>` -- displayed inline in UI
- User-friendly error messages mapped from server error codes in `src/renderer/hooks/useSocket.ts`
- Timed auto-dismiss for transient errors (`setTimeout(() => setError(null), 4000)`)

**Server:**
- Socket.IO errors emitted as structured objects: `{ code: string; message: string }`
- Error codes: `EXPIRED_TOKEN`, `INVALID_TOKEN`, `TOKEN_LIMIT_REACHED`, `MISSING_TOKEN`, `INVALID_SESSION`, `NOT_HOST`, `INVALID_ROOM_NAME`, `ROOM_LIMIT`, `DUPLICATE_ROOM`, `CANNOT_DELETE_DEFAULT`
- Auth middleware uses `next(new Error('CODE'))` pattern
- Express routes use try/catch with appropriate HTTP status codes
- Server-side `console.error()` and `console.warn()` for debugging

**WebRTC:**
- `console.warn()` for non-fatal errors (ICE candidate failures, connection state changes)
- `console.error()` for critical failures (SDP negotiation errors)
- ICE restart on connection failure with timeout watchdog

## CSS/Styling Approach

**Primary approach: Inline styles via `React.CSSProperties` objects**
- Every component defines a `const styles: Record<string, React.CSSProperties>` at the bottom of the file
- No CSS modules, no styled-components, no Tailwind
- Dynamic styles via object spread: `style={{ ...styles.base, ...(isActive ? styles.active : {}) }}`

**Global CSS:**
- Single global stylesheet: `src/index.css`
- Provides base resets (box-sizing, margin, scrollbar styling, input/button defaults)
- Global `@keyframes pulse` animation
- Font: Inter (imported via `@fontsource/inter`)

**Theme system:**
- Centralized theme object in `src/renderer/theme.ts` with colors, fonts, and radii
- Theme is exported as `const theme = { ... } as const` but NOT consistently used across components
- Many components hardcode hex colors directly (e.g., `'#7fff00'`, `'#0d0d0d'`, `'#2a2a2a'`)
- Color palette: dark theme only -- `#0d0d0d` (darkest bg), `#111111` (sidebar), `#7fff00` (accent/chartreuse)

**When adding new components:** Define inline styles as `Record<string, React.CSSProperties>` at bottom of file. Use theme colors from `src/renderer/theme.ts` when possible, but match existing hardcoded values for consistency with neighboring components.

## Logging

**Framework:** `console` (no external logging library)

**Patterns:**
- Server logs use bracket prefix: `console.log('[server] message')`, `console.log('[signaling] message')`
- Client logs use bracket prefix: `console.log('[webrtc] message')`, `console.log('[audio] message')`
- WebRTC has verbose debug logging for ICE candidates, connection states, track info
- `console.warn()` for recoverable issues, `console.error()` for failures

## Comments

**When to comment:**
- JSDoc on exported functions and hooks (brief single-line `/** ... */`)
- Section dividers in large files using `// ---------------------------------------------------------------------------`
- Inline comments explaining "why" not "what" -- `// LAN-only -- acceptable for Phase 2`
- Phase annotations marking when features were added -- `// Phase 2: Invite management`, `// Phase 3: Voice State Types`
- Rule annotations in shared modules -- `// RULE: No imports from 'electron', 'better-sqlite3', or 'node:*'`

**Documentation comments on App.tsx:**
- Multi-line JSDoc with behavioral descriptions for complex component logic (session restore flow, etc.)

## Module Design

**Exports:**
- Named exports throughout -- `export function`, `export interface`, `export const`
- Single default export: `src/App.tsx`
- No barrel files (`index.ts` re-exports) in the project

**Server module pattern:**
- Each module exports a `register*` function that takes the Socket.IO server or Express app
- DB operations happen inside the module, not passed in
- Typed IO aliases defined locally: `type TypedIO = Server<...>` in each server file

**Shared module rules:**
- `src/shared/` files must not import from `electron`, `better-sqlite3`, or `node:*`
- Shared types serve as the contract between server and renderer

---

*Convention analysis: 2026-03-02*
