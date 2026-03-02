# Technology Stack

**Analysis Date:** 2026-03-02

## Languages

**Primary:**
- TypeScript ^5.9.3 - All source code (`src/**/*.ts`, `src/**/*.tsx`)
- Target: ESNext, Module: CommonJS, JSX: react-jsx
- Strict mode enabled (`tsconfig.json`: `strict: true`, `noImplicitAny: true`)

**Secondary:**
- SQL - Drizzle migration files (`drizzle/*.sql`)

## Runtime

**Environment:**
- Electron 40.6.1 (Chromium-based, bundles its own Node.js)
- No `.nvmrc` or `.node-version` file - Node version governed by Electron

**Package Manager:**
- npm (inferred from `package-lock.json`)
- Lockfile: present

## Frameworks

**Core:**
- React ^19.2.4 - UI framework (`src/renderer/`, `src/App.tsx`)
- React DOM ^19.2.4 - DOM rendering (`src/renderer.ts` via `createRoot`)
- Express ^5.2.1 - HTTP server for file uploads and static serving (`src/server/index.ts`)
- Socket.IO ^4.8.3 - Server-side real-time messaging (`src/server/index.ts`, `src/server/signaling.ts`)
- Socket.IO Client ^4.8.3 - Client-side real-time messaging (`src/renderer/hooks/useSocket.ts`)

**ORM / Database:**
- Drizzle ORM ^0.45.1 - Type-safe SQLite ORM (`src/server/db/`)
- Drizzle Kit ^0.31.9 - Migration generation and push tool (dev)
- better-sqlite3 ^12.6.2 - Native SQLite driver (`src/server/db/client.ts`)

**Build / Dev:**
- Electron Forge ^7.11.1 - Build, package, and make pipeline
- Vite ^5.4.21 - Bundler for main, preload, and renderer processes
- @vitejs/plugin-react ^5.1.4 - React fast refresh and JSX transform

**Linting / Formatting:**
- ESLint ^9.39.3 + typescript-eslint ^8.56.1 (`eslint.config.mjs`)
- Prettier ^3.8.1

## Key Dependencies

**Critical (runtime):**
- `better-sqlite3` ^12.6.2 - Native SQLite binding; requires `electron-rebuild` post-install. Marked external in `vite.main.config.ts` so it loads via `require()` at runtime.
- `drizzle-orm` ^0.45.1 - Type-safe query builder and schema definition (`src/server/db/schema.ts`)
- `socket.io` ^4.8.3 / `socket.io-client` ^4.8.3 - Signaling transport and real-time events
- `express` ^5.2.1 - HTTP layer for file upload endpoint and static file serving
- `multer` ^2.1.0 - Multipart form-data handling for file uploads (`src/server/upload.ts`)
- `electron-squirrel-startup` ^1.0.1 - Windows installer shortcut handling

**UI:**
- `@fontsource/inter` ^5.2.8 - Self-hosted Inter font (400, 500, 600, 700 weights imported in `src/renderer.ts`)

**Type definitions (in dependencies, should likely be devDependencies):**
- `@types/multer` ^2.0.0
- `@types/better-sqlite3` ^7.6.13 (devDependencies)
- `@types/express` ^5.0.6 (devDependencies)
- `@types/react` ^19.2.14 (devDependencies)
- `@types/react-dom` ^19.2.3 (devDependencies)

## Build System

**Electron Forge** orchestrates the entire build pipeline:

**Entry points** (`forge.config.ts`):
- Main process: `src/main.ts` -> `vite.main.config.ts`
- Preload script: `src/preload.ts` -> `vite.preload.config.ts`
- Renderer: `index.html` -> `vite.renderer.config.mts`

**Vite configurations:**
- `vite.main.config.ts` - Externals: `better-sqlite3`, `bufferutil`, `utf-8-validate`
- `vite.preload.config.ts` - Externals: `electron`
- `vite.renderer.config.mts` - React plugin only, no externals

**Packaging** (`forge.config.ts`):
- Maker: MakerSquirrel (Windows `.exe` installer only)
- Output directory: `C:/temp/sex-dungeon-build`
- ASAR: enabled with unpacked native modules (`better-sqlite3`, `bindings`, `file-uri-to-path`, `prebuild-install`)
- Extra resources: `drizzle/` migrations and `resources/` (tray icon) bundled via `extraResources`
- Custom `packageAfterCopy` hook copies native modules into packaged app's `node_modules/`

**Electron Fuses** (security hardening):
- `RunAsNode`: false
- `EnableCookieEncryption`: true
- `EnableNodeOptionsEnvironmentVariable`: false
- `EnableNodeCliInspectArguments`: false

## Database

**Engine:** SQLite via better-sqlite3

**Location:**
- Production: `{userData}/sex-dungeon.db` (Windows: `%APPDATA%/sex-dungeon/`)
- Development: `{userData}/sex-dungeon.dev.db`

**Configuration** (`src/server/db/client.ts`):
- WAL journal mode for concurrent read performance
- Foreign keys enforced (`PRAGMA foreign_keys = ON`)
- Lazy initialization via Proxy pattern - DB opens on first access

**Schema** (`src/server/db/schema.ts`):
- 4 tables: `users`, `rooms`, `messages`, `invite_tokens`
- Timestamps stored as unix epoch integers with Drizzle `mode: 'timestamp'`
- Auto-increment integer primary keys throughout

**Migrations** (`drizzle/`):
- 3 migration files present
- Config: `drizzle.config.ts` (dialect: sqlite, schema path: `./src/server/db/schema.ts`, output: `./drizzle`)
- Run at server startup via `runMigrations()` in `src/server/db/migrate.ts`

## Configuration

**Environment:**
- No `.env` files - application is self-contained with no external API keys
- No environment variables required for development or production
- STUN/TURN server credentials are hardcoded in `src/shared/iceConfig.ts` (public free services)

**TypeScript** (`tsconfig.json`):
- Target: ESNext, Module: CommonJS
- Strict mode, source maps, ESM interop enabled
- Base URL: project root, output dir: `dist/`
- Includes: `src/**/*` and `forge.env.d.ts`

**ESLint** (`eslint.config.mjs`):
- Flat config format (ESLint 9)
- Base: `eslint.configs.recommended` + `tseslint.configs.recommended`
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-require-imports`: off (needed for native modules)
- Ignores: `.vite/`, `out/`, `drizzle/`, `node_modules/`

## Scripts

```bash
npm start              # electron-forge start (dev mode with HMR)
npm run build          # electron-forge package
npm run package        # electron-forge package
npm run make           # electron-forge make (create distributable)
npm run lint           # eslint src
npm run format         # prettier --write src
npm run db:push        # drizzle-kit push (sync schema to DB)
npm run db:generate    # drizzle-kit generate (create migration)
npm run postinstall    # electron-rebuild (rebuild native modules)
```

## Platform Requirements

**Development:**
- Windows (primary target, MakerSquirrel only)
- Node.js compatible with Electron 40.6.1
- C++ build tools for `better-sqlite3` native compilation (`electron-rebuild`)

**Production:**
- Windows desktop only (Squirrel installer)
- Default server port: 7432 (hardcoded in `src/main.ts`)
- Network access required for STUN/TURN (WebRTC NAT traversal)

---

*Stack analysis: 2026-03-02*
