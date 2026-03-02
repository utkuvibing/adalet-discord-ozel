# Testing Patterns

**Analysis Date:** 2026-03-02

## Test Framework

**Runner:** None configured

There is no test framework installed or configured in this project. No test runner, assertion library, or testing utilities exist in `devDependencies`.

**Missing from `package.json`:**
- No Jest, Vitest, Mocha, or any test runner
- No `@testing-library/react` or similar
- No Playwright or Cypress for E2E
- No test-related npm scripts (no `test`, `test:unit`, `test:e2e`, etc.)

**No configuration files:**
- No `jest.config.*`, `vitest.config.*`, or `.mocharc.*` found
- No `playwright.config.*` or `cypress.config.*` found

## Test File Organization

**Location:** No test files exist anywhere in `src/`.

A search for `*.test.*` and `*.spec.*` files found results only inside `node_modules/` (from third-party packages). Zero test files exist in the project source code.

## Test Coverage

**Coverage:** 0% -- no tests exist

**No coverage tooling:**
- No `c8`, `istanbul`, `nyc`, or similar coverage tools configured
- No coverage thresholds or CI enforcement

## What Is NOT Tested

Every module in the project lacks test coverage. Key untested areas:

**Server-side (highest risk):**
- `src/server/middleware/auth.ts` -- Authentication middleware with 3 auth flows (session restore, invite token, host bypass)
- `src/server/signaling.ts` -- All Socket.IO event handlers (room join/leave, SDP/ICE relay, chat messages, room CRUD)
- `src/server/invite.ts` -- Invite token creation, validation, expiry, and use-count logic
- `src/server/user.ts` -- User creation, session lookup, identity update
- `src/server/upload.ts` -- File upload processing, size limits, DB persistence
- `src/server/db/schema.ts` -- Drizzle schema (no migration tests)
- `src/server/db/migrate.ts` -- Migration runner
- `src/server/db/seed.ts` -- Default room seeding

**Client-side (medium risk):**
- `src/renderer/hooks/useSocket.ts` -- Socket connection management, error mapping, session persistence
- `src/renderer/hooks/useWebRTC.ts` -- Perfect Negotiation WebRTC implementation, peer lifecycle
- `src/renderer/hooks/useAudio.ts` -- Audio pipeline, voice activity detection, volume control
- `src/renderer/context/SocketContext.tsx` -- Context provider
- All components (`ChatPanel`, `Lobby`, `VoiceControls`, `RoomList`, `JoinServer`, etc.)

**Shared (low risk but important):**
- `src/shared/types.ts` -- Type definitions (TypeScript compiler validates these)
- `src/shared/events.ts` -- Event name constants
- `src/shared/avatars.ts` -- Avatar data and lookup function
- `src/shared/iceConfig.ts` -- ICE server configuration

**Electron main process:**
- `src/main.ts` -- Window management, IPC handlers, tray, single-instance lock, PTT shortcut registration
- `src/preload.ts` -- Context bridge API

## Testing Gaps and Recommendations

### Priority 1: Server Auth and Invite Logic (Unit Tests)

The authentication middleware (`src/server/middleware/auth.ts`) and invite token system (`src/server/invite.ts`) are the security boundary of the application. These are pure functions operating on a SQLite database and are highly testable.

**Recommended approach:**
- Use Vitest (aligns with existing Vite build tooling)
- Create in-memory SQLite database for test isolation
- Test the 3 auth flows: session restore, invite token, host bypass
- Test token expiry, max uses, revocation edge cases

```bash
# Suggested setup
npm install -D vitest
```

```typescript
// Example: src/server/invite.test.ts
import { describe, it, expect } from 'vitest';
import { createInviteToken, findValidInviteToken } from './invite';

describe('findValidInviteToken', () => {
  it('returns null for nonexistent token', () => {
    expect(findValidInviteToken('nonexistent')).toBeNull();
  });
});
```

### Priority 2: Signaling Logic (Integration Tests)

`src/server/signaling.ts` contains room management, chat message persistence, and SDP/ICE relay logic. Testing with a real Socket.IO server instance and in-memory DB would catch regressions.

### Priority 3: Client Hooks (Unit Tests)

`useSocket`, `useWebRTC`, and `useAudio` contain complex state machines. Testing with `@testing-library/react` + `renderHook` would validate state transitions.

### Priority 4: Component Rendering (Component Tests)

Components are thin UI layers that could benefit from snapshot or smoke tests, but are lower priority than business logic.

### Not Recommended: E2E Tests

Given the 2-5 user scope, Electron packaging, and WebRTC dependency, full E2E tests would have poor cost/benefit ratio. Focus on unit and integration tests for server logic.

## Vitest Configuration (If Adding Tests)

Vitest is the recommended test runner because:
1. The project already uses Vite for building (`@electron-forge/plugin-vite`)
2. Vitest shares the same config format and transform pipeline
3. Zero additional bundler configuration needed

**Suggested config:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // For server tests
    include: ['src/**/*.test.ts'],
  },
});
```

**Suggested `package.json` scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Test file naming convention (to match codebase style):**
- Co-located: `src/server/invite.test.ts` next to `src/server/invite.ts`
- Hooks: `src/renderer/hooks/useSocket.test.ts`

---

*Testing analysis: 2026-03-02*
