# DietLedger Architecture Simplification Plan

> Document ID: 14
> Status: ANALYSIS ONLY — no code changes
> Date: 2026-06-05

---

# Current Architecture

DietLedger is a multi-platform recipe and nutrition application built on an **offline-first, IndexedDB-centric** architecture with optional server synchronization.

## Components

### Frontend (Next.js)

- **Next.js 16** web application with React 19
- Uses `src/lib/storage.ts` as the primary data layer — an IndexedDB wrapper managing 22 object stores across 13 schema versions
- **Zustand stores** (`recipe-store`, `template-store`, `dietary-store`, `sync-store`, `app-settings-store`, `nutrition-store`, `book-store`, `meal-plan-store`) mediate between UI and data layer
- All stores call `getApiClient()` which routes to either `GoApiClient` or `LocalApiClient`

### API Client Layer

- `src/lib/api-client.ts:94-286` — defines `ApiClient` interface and factory function `getApiClient()`
- `src/lib/api-client.ts:290-307` — factory checks `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` env var
  - If `true` → instantiates `LocalApiClient` (reads/writes directly to IndexedDB)
  - If `false` → instantiates `GoApiClient` (HTTP calls to Go API server)
- `src/lib/api-client-go.ts:33-888` — `GoApiClient` wraps HTTP calls to Go API, uses:
  - `write-queue.ts` — IndexedDB-backed offline write queue with retry logic
  - `read-cache.ts` — IndexedDB-backed response cache with TTL and eviction
  - Falls back to `LocalApiClient` for templates and dietary profiles (line 838-887)
- `src/lib/api-client-local.ts:30-495` — `LocalApiClient` delegates all CRUD to `storage.ts`

### Sync Engine

- `src/lib/sync-engine.ts:1-253` — push/pull sync protocol
  - `pushChanges()` — reads unsynced entries from IndexedDB `syncChangeLog` store, sends batches to `/api/sync/push`
  - `pullChanges()` — fetches changes from `/api/sync/pull`, writes into IndexedDB stores
  - `fullDumpUpload()` / `fullDumpDownload()` — bulk sync for initial setup
- `src/lib/sync-conflict.ts:1-81` — checksum computation, conflict detection, auto-resolution, field-level merge
- `src/lib/sync-store.ts:1-183` — Zustand store managing sync server configs, periodic auto-sync via `setInterval`

### Storage Layer (IndexedDB)

- `src/lib/storage.ts:1-2299` — the largest file in the frontend codebase
  - Defines `DietLedgerDB` schema with 22 object stores (lines 340-489)
  - Full CRUD for: recipes, ingredients, books, chapters, chapterRecipes, categories, recipeCategories, chapterPages, bookPages, templates, mealPlans, dayPlanEntries, mealGroups, groceryChecklists, seasonalFoods, pantryStaples, userLocation, customFoods, nutritionProfiles, foodLogEntries, weightEntries, syncServers, syncChangeLog, dietaryProfiles, allergenRules, sharedRecipeCache, brandKits, appSettings
  - Every write operation calls `logChange()` to populate the `syncChangeLog` store

### Proxy Layer

- `src/proxy.ts:1-76` — Next.js middleware that intercepts `/api/*` requests
  - If `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` is NOT set → proxies requests to Go API server (line 46-73)
  - If `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` IS set → calls `NextResponse.next()` to let Next.js API routes handle locally
- `middleware.ts:1-7` — Next.js middleware entry point, delegates to `proxy()`

### Next.js API Routes

- `src/app/api/` contains route handlers for: books, categories, community, fda, foods, nutrition, recipes, share
- These routes only execute when `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true` (proxy bypasses them otherwise)

### Go API Server

- `sync-server/` — Go HTTP server (~4,500 LOC excluding tests and binaries)
  - `main.go:17-71` — supports `DB_DRIVER=postgres` or `DB_DRIVER=sqlite`
  - `server.go:32-83` — routes: auth, recipes, profiles, foods, meal-plans, books, categories, custom-foods, grocery, sharing, community
  - `store_postgres.go:1-1005+` — PostgreSQL implementation of `Store` interface
  - `store_sqlite.go:1-938+` — SQLite implementation (dual backend)
  - `models.go:1-624` — data models
  - `handlers_crud.go:1-1277` — HTTP handlers
  - `auth.go:1-182` — JWT-based auth
  - `repository.go:1-127` — `Store` interface definition
  - `migrations/` — 12 PostgreSQL migration files

### Platform Wrappers

- **Tauri** (`src-tauri/`) — Desktop wrapper, 261 LOC total
  - `tauri.conf.json` — configures window, build, bundle settings
  - `Cargo.toml` — Rust dependencies
  - `src/` — minimal Rust entry point
- **Capacitor** (`capacitor.config.ts`) — Mobile wrapper, 18 LOC
  - Configures `com.dietledger.app` for Android/iOS

### UI Components for Offline/Local Mode

- `src/components/local-mode-banner.tsx:1-106` — amber banner shown when `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true`
  - Provides export/import JSON functionality
- `src/components/sync-indicator.tsx:1-78` — shows write queue status (idle/pending/failed) in navbar

### Auth

- `src/hooks/use-auth.tsx:78-81` — `isLocalOnly` check makes `isAuthenticated` always `true` in local mode
- `src/app/(app)/layout.tsx:14-18` — redirects unauthenticated users to `/login`

## Diagram: Current Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                         │
│                                                              │
│  ┌─────────┐   ┌──────────────┐   ┌────────────────────┐   │
│  │ React   │──>│ Zustand      │──>│ getApiClient()     │   │
│  │ UI      │   │ Stores       │   │                    │   │
│  └─────────┘   └──────────────┘   └────────┬───────────┘   │
│                                             │                │
│                              ┌──────────────┴──────────┐     │
│                              │ NEXT_PUBLIC_            │     │
│                              │ DIETLEDGER_LOCAL_ONLY?  │     │
│                              └──┬──────────────────┬───┘     │
│                                 │ true             │ false   │
│                          ┌──────▼──────┐   ┌───────▼──────┐  │
│                          │LocalApiClient│   │ GoApiClient  │  │
│                          │(storage.ts) │   │              │  │
│                          └──────┬──────┘   │ ┌──────────┐ │  │
│                                 │          │ │WriteQueue│ │  │
│                        ┌────────▼───┐     │ │(IndexedDB)│ │  │
│                        │ IndexedDB  │◄────│ └──────────┘ │  │
│                        │ (22 stores)│     │ ┌──────────┐ │  │
│                        │            │◄────│ │ReadCache │ │  │
│                        │            │     │ │(IndexedDB)│ │  │
│                        └────────────┘     │ └──────────┘ │  │
│                                           │    │local    │  │
│                                           │    │fallback │  │
│                                           │    ▼         │  │
│                                           │ LocalApi-    │  │
│                                           │ Client       │  │
│                                           └──────┬───────┘  │
│                                                  │          │
│  ┌───────────────────────┐                      │          │
│  │ Sync Engine           │                      │          │
│  │ sync-engine.ts        │                      │          │
│  │ sync-conflict.ts      │                      │          │
│  │ sync-store.ts         │                      │          │
│  │ (reads syncChangeLog  │                      │          │
│  │  from IndexedDB)      │                      │          │
│  └──────────┬────────────┘                      │          │
│             │                                   │          │
│  ┌──────────▼──────────┐     ┌──────────────────┘          │
│  │ Next.js Middleware   │     │                             │
│  │ (proxy.ts)           │◄────┘  (when not local-only)      │
│  │ /api/* → Go server   │                                   │
│  └──────────┬───────────┘                                   │
└─────────────┼───────────────────────────────────────────────┘
              │ HTTP
┌─────────────▼───────────────────────────────────────────────┐
│              Go API Server (sync-server/)                    │
│                                                              │
│  ┌──────────────────┐   ┌──────────────────┐                │
│  │ PostgreSQL Store  │   │ SQLite Store      │               │
│  │ (DB_DRIVER=       │   │ (DB_DRIVER=       │               │
│  │  postgres)        │   │  sqlite)          │               │
│  └────────┬─────────┘   └────────┬─────────┘               │
│           └──────────┬───────────┘                           │
│                      ▼                                       │
│              Store Interface                                 │
│                                                              │
│  Routes: /api/auth/*, /api/recipes/*, /api/books/*,         │
│          /api/profiles/*, /api/foods/*, /api/meal-plans/*,   │
│          /api/categories/*, /api/custom-foods/*,             │
│          /api/sync/*, /api/share/*, /api/community/*         │
└──────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│ Tauri       │    │ Capacitor    │    │ Docker           │
│ (Desktop)   │    │ (Mobile)     │    │ (Deployment)     │
│ src-tauri/  │    │ capacitor.   │    │ Dockerfile       │
│ 261 LOC     │    │ config.ts    │    │ docker-compose   │
└─────────────┘    └──────────────┘    └──────────────────┘
```

---

# Target Architecture

A server-first hosted web application with PostgreSQL as the sole source of truth.

## Diagram: Target Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                      │
│                                                          │
│  ┌─────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ React   │──>│ Zustand      │──>│ GoApiClient      │  │
│  │ UI      │   │ Stores       │   │ (direct fetch)   │  │
│  └─────────┘   └──────────────┘   └────────┬─────────┘  │
│                                                  │        │
│  ┌───────────────────────────────────────────────┘        │
│  │ Next.js Middleware (proxy.ts)                          │
│  │ /api/* → Go server (always, no local-only bypass)     │
│  └────────────────────┬──────────────────────────────────┘
│                       │ HTTP                              │
└───────────────────────┼──────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────┐
│              Go API Server (sync-server/)                 │
│                                                           │
│  ┌──────────────────┐                                    │
│  │ PostgreSQL Store  │  (sole source of truth)           │
│  │ (DB_DRIVER=       │                                   │
│  │  postgres)        │                                   │
│  └──────────────────┘                                    │
│                                                           │
│  Routes: /api/auth/*, /api/recipes/*, /api/books/*,      │
│          /api/profiles/*, /api/foods/*, /api/meal-plans/*,│
│          /api/categories/*, /api/custom-foods/*,          │
│          /api/share/*, /api/community/*                   │
└──────────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────┐
│              Docker Compose                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ web      │  │ api      │  │ postgres │               │
│  │ :3000    │  │ :8080    │  │ :5432    │               │
│  │ Next.js  │  │ Go       │  │ PG 17    │               │
│  └──────────┘  └──────────┘  └──────────┘               │
└──────────────────────────────────────────────────────────┘
```

## Key Changes from Current to Target

1. **IndexedDB** no longer a primary datastore — can be removed entirely or reduced to optional template storage
2. **LocalApiClient** removed — all requests go through GoApiClient
3. **Sync engine** removed — no local data to sync
4. **Write queue** removed — online-only, server returns errors directly
5. **Read cache** removed — server responses are authoritative
6. **SQLite backend** in Go server removed — PostgreSQL only
7. **`NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY`** flag removed
8. **Next.js API routes** removed — proxy handles all `/api/*`
9. **Tauri** directory postponed
10. **Capacitor** config postponed
11. **Local mode banner** and **sync indicator** UI removed

---

# Feature Inventory

## KEEP

| Subsystem | Evidence |
|-----------|----------|
| **GoApiClient** | `src/lib/api-client-go.ts` — the server-first API client. Production path for hosted web app. Every Zustand store calls `getApiClient()` which should always resolve to `GoApiClient`. |
| **Go API Server** | `sync-server/` — handles all business logic, auth, data persistence. Routes in `server.go:32-83`. PostgreSQL store in `store_postgres.go`. |
| **PostgreSQL Store** | `sync-server/store_postgres.go:1-1005+` — the sole persistence layer for the target architecture. |
| **Next.js Web App** | `src/app/` — React UI with layout, routing, pages. Core product. |
| **Zustand Stores** | `src/lib/recipe-store.ts`, `nutrition-store.ts`, `book-store.ts`, `meal-plan-store.ts` — state management for UI. These call `getApiClient()` and need minimal changes. |
| **Proxy Layer** | `src/proxy.ts` + `middleware.ts` — forwards `/api/*` to Go server. Essential for hosted deployment. |
| **Auth Hook** | `src/hooks/use-auth.tsx` — manages JWT tokens and user state. Remove local-only bypass at line 78-81. |
| **Docker Compose** | `docker-compose.yml` — defines postgres, api, web services. Already correctly structured. |
| **Dockerfile** | `Dockerfile` — multi-stage Next.js build. Remove `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` arg. |
| **UI Components** | `src/components/` (non-sync, non-local-mode) — recipe editors, nutrition charts, book renderer, meal planner, etc. |
| **Data Files** | `src/data/` — static reference data (allergen keywords, glycemic index, pantry staples, etc.). |
| **Utility Libraries** | `src/lib/nutrition-calcs.ts`, `recipe-scaling.ts`, `format.ts`, `unit-conversion.ts`, `glycemic-load.ts`, `nutrient-map.ts`, `recipe-synergy.ts`, `dietary-rules.ts`, `usda-datasets.ts`, `utils.ts` — pure functions, no storage dependency. |

## SIMPLIFY

| Subsystem | Evidence | Action |
|-----------|----------|--------|
| **api-client.ts** | `src/lib/api-client.ts:288-311` — factory with `localOnly` branch and `require()` calls. | Remove factory logic, always return `GoApiClient`. Remove `LocalApiClient` import. Remove `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` check. |
| **GoApiClient** | `src/lib/api-client-go.ts:108-120` — `queuedWrite()` uses write-queue for offline; `localFallback()` at line 838 delegates templates/dietary to LocalApiClient. | Remove `writeQueue` and `readCache` usage. Remove `localFallback()` — templates and dietary profiles should be server-side. Add direct server endpoints or keep minimal IndexedDB for client-only templates. |
| **use-auth.tsx** | `src/hooks/use-auth.tsx:78-81` — `isAuthenticated: isLocalOnly \|\| !!user` bypasses auth in local mode. | Remove `isLocalOnly` check. Auth always required. |
| **app-settings-store.ts** | `src/lib/app-settings-store.ts:1-48` — stores settings in IndexedDB via `storage.ts`. | Move settings to Go API, or keep as minimal localStorage. |
| **template-store.ts** | `src/lib/template-store.ts:1-93` — delegates to `getApiClient().getTemplates()` which falls back to LocalApiClient→IndexedDB. | Add template CRUD endpoints to Go API server, or keep as client-only feature with minimal localStorage. |
| **dietary-store.ts** | `src/lib/dietary-store.ts:1-155` — delegates to `getApiClient().getDietaryProfiles()` which falls back to LocalApiClient→IndexedDB. | Add dietary profile endpoints to Go API server, or keep as client-only feature. |
| **Dockerfile** | `Dockerfile:4,13,28,32` — `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` build arg. | Remove the build arg. Always build in server mode. |
| **docker-compose.yml** | `docker-compose.yml:56` — `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` env var. | Remove the env var. |

## POSTPONE

| Subsystem | Evidence | Action |
|-----------|----------|--------|
| **Tauri** | `src-tauri/` — 261 LOC desktop wrapper. `package.json` scripts `tauri:dev` and `tauri:build` at lines 11-12. | Postpone to Phase 6 (Desktop). Do not remove — exclude from build. |
| **Capacitor** | `capacitor.config.ts` — 18 LOC mobile config. `package.json` scripts at lines 13-18. `@capacitor/*` dependencies at lines 21-24. | Postpone to Phase 2-5 (Mobile). Do not remove — exclude from build. |
| **Offline Sync (client→server)** | `src/lib/sync-engine.ts`, `sync-conflict.ts`, `sync-store.ts`. | Postpone to Phase 3/5 (Offline support). The sync engine is designed for IndexedDB→server sync and would need significant rework for mobile offline anyway. |
| **Offline Write Queue** | `src/lib/write-queue.ts` — IndexedDB-backed retry queue. | Postpone alongside offline sync. |

## REMOVE

| Subsystem | Evidence | Rationale |
|-----------|----------|-----------|
| **storage.ts (IndexedDB)** | `src/lib/storage.ts:1-2299` — 2299 LOC, 22 IndexedDB object stores. Every write calls `logChange()` for sync. | No longer a primary datastore. PostgreSQL is sole source of truth. `logChange()` infrastructure (lines 652, 674, etc.) only exists for sync. |
| **LocalApiClient** | `src/lib/api-client-local.ts:1-496` — wraps storage.ts for local-only mode. | Local-only mode is no longer a product goal. All clients use GoApiClient. |
| **Sync Engine** | `src/lib/sync-engine.ts:1-253` — push/pull/full-dump sync between IndexedDB and server. | IndexedDB is removed. No local data to sync. |
| **Sync Conflict Resolution** | `src/lib/sync-conflict.ts:1-81` — checksum, conflict detection, merge. | Dependent on sync engine. No sync → no conflicts. |
| **Sync Store** | `src/lib/sync-store.ts:1-183` — Zustand store managing sync server configs and periodic sync. | Dependent on sync engine. |
| **Write Queue** | `src/lib/write-queue.ts:1-178` — IndexedDB-backed offline write queue. | Offline support postponed. All writes are online. |
| **Read Cache** | `src/lib/read-cache.ts:1-97` — IndexedDB-backed HTTP response cache. | Server responses are authoritative. React Query already handles caching. |
| **Local Mode Banner** | `src/components/local-mode-banner.tsx:1-106` — amber banner with export/import for local-only mode. | Local-only mode removed. |
| **Sync Indicator** | `src/components/sync-indicator.tsx:1-78` — shows write queue status in navbar. | Write queue removed. |
| **SQLite Store (Go)** | `sync-server/store_sqlite.go:1-938+` — SQLite backend for Go API server. `sync-server/store_sqlite_test.go:29`. | PostgreSQL is sole database. Dual-backend complexity removed. |
| **`NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY`** | Referenced in `api-client.ts:295`, `proxy.ts:43`, `use-auth.tsx:80`, `local-mode-banner.tsx:11`, `Dockerfile:4,13,28,32`, `docker-compose.yml:56`. | Local-only mode no longer a product goal. |
| **Next.js API Routes** | `src/app/api/` — route handlers for books, categories, community, fda, foods, nutrition, recipes, share. These only execute when proxy bypasses to them (local-only mode). | All API traffic goes to Go server via proxy. These routes are dead code in server mode. |
| **Prisma Directory** | `prisma/migrations/` — Prisma migrations exist but Prisma is not in `package.json` dependencies. | Not used. Dead infrastructure. |
| **Sync-related types** | `src/lib/types.ts:174-239` — `SyncStatus`, `SyncServerConfig`, `SyncChangeLogEntry`, `SyncConflictRecord`, `SYNC_STORE_NAMES`. | Dependent on removed sync engine. |
| **`idb` dependency** | `package.json:70` — `"idb": "^8.0.3"`. Used by `storage.ts`, `write-queue.ts`, `read-cache.ts`. | All IndexedDB consumers are removed. |
| **Export/Import (local)** | `src/lib/export-import.ts:1-114` — exports all data from API client. Used by `local-mode-banner.tsx`. | Dependent on local-mode banner. Could keep server-side backup/restore but current implementation is local-mode specific. |

---

# Code Removal Candidates

## HIGH IMPACT — Core Data Layer

### 1. `src/lib/storage.ts`
- **Path:** `src/lib/storage.ts`
- **Estimated LOC:** 2,299
- **Dependencies:** `idb` (package), `./types`, `./utils`
- **Dependents:** `api-client-local.ts`, `sync-engine.ts`, `sync-store.ts`, `export-import.ts`, `app-settings-store.ts`
- **Risk Level:** **HIGH** — most referenced file in the offline layer. Must migrate template/dietary/app-settings storage before removal.

### 2. `src/lib/api-client-local.ts`
- **Path:** `src/lib/api-client-local.ts`
- **Estimated LOC:** 496
- **Dependencies:** `./storage`, `./utils`
- **Dependents:** `api-client.ts` (factory), `api-client-go.ts` (localFallback at line 838)
- **Risk Level:** **MEDIUM** — removing requires updating both the factory and the GoApiClient's localFallback for templates/dietary.

### 3. `src/lib/api-client-go.ts` (simplify)
- **Path:** `src/lib/api-client-go.ts`
- **Estimated LOC:** 888 (reduce to ~600)
- **Dependencies:** `./write-queue`, `./read-cache`
- **Dependents:** `api-client.ts` (factory)
- **Risk Level:** **MEDIUM** — changes here affect all API calls. Must be done carefully.

### 4. `src/lib/api-client.ts` (simplify)
- **Path:** `src/lib/api-client.ts`
- **Estimated LOC:** 315 (reduce to ~50)
- **Dependencies:** none (removes `require('./api-client-local')` and `require('./api-client-go')`)
- **Dependents:** every Zustand store
- **Risk Level:** **MEDIUM** — core routing file. Simplification is straightforward but touches all stores.

## MEDIUM IMPACT — Sync Infrastructure

### 5. `src/lib/sync-engine.ts`
- **Path:** `src/lib/sync-engine.ts`
- **Estimated LOC:** 253
- **Dependencies:** `./types`, `./storage`, `./sync-conflict`
- **Dependents:** `sync-store.ts`
- **Risk Level:** **LOW** — self-contained, only used by sync-store.

### 6. `src/lib/sync-conflict.ts`
- **Path:** `src/lib/sync-conflict.ts`
- **Estimated LOC:** 81
- **Dependencies:** none
- **Dependents:** `sync-engine.ts`
- **Risk Level:** **LOW** — leaf dependency.

### 7. `src/lib/sync-store.ts`
- **Path:** `src/lib/sync-store.ts`
- **Estimated LOC:** 183
- **Dependencies:** `zustand`, `./storage`, `./sync-engine`, `./types`
- **Dependents:** none directly (was likely used in sync settings UI, currently not imported in any layout)
- **Risk Level:** **LOW** — appears unused in current UI.

### 8. `src/lib/write-queue.ts`
- **Path:** `src/lib/write-queue.ts`
- **Estimated LOC:** 178
- **Dependencies:** `idb`
- **Dependents:** `api-client-go.ts`
- **Risk Level:** **MEDIUM** — used by GoApiClient. Must remove GoApiClient's `queuedWrite()` pattern first.

### 9. `src/lib/read-cache.ts`
- **Path:** `src/lib/read-cache.ts`
- **Estimated LOC:** 97
- **Dependencies:** `idb`
- **Dependents:** `api-client-go.ts`
- **Risk Level:** **MEDIUM** — used by GoApiClient. Must remove `cachedGet()` pattern first.

## LOW IMPACT — UI Components

### 10. `src/components/sync-indicator.tsx`
- **Path:** `src/components/sync-indicator.tsx`
- **Estimated LOC:** 78
- **Dependencies:** `./write-queue`
- **Dependents:** `app-nav.tsx` (line 43)
- **Risk Level:** **LOW** — simple component, remove import from app-nav.

### 11. `src/components/local-mode-banner.tsx`
- **Path:** `src/components/local-mode-banner.tsx`
- **Estimated LOC:** 106
- **Dependencies:** `./export-import`
- **Dependents:** app layout (likely `src/app/layout.tsx`)
- **Risk Level:** **LOW** — conditional component, remove import.

### 12. `src/lib/export-import.ts`
- **Path:** `src/lib/export-import.ts`
- **Estimated LOC:** 114
- **Dependencies:** `./api-client`
- **Dependents:** `local-mode-banner.tsx`
- **Risk Level:** **LOW** — only used by local-mode banner.

## PLATFORM — Postponed

### 13. `src-tauri/` (entire directory)
- **Path:** `src-tauri/`
- **Estimated LOC:** 261
- **Dependencies:** `@tauri-apps/*` (via Cargo.toml)
- **Risk Level:** **LOW** — isolated directory, no web imports. Can be git-ignored or branched.

### 14. `capacitor.config.ts`
- **Path:** `capacitor.config.ts`
- **Estimated LOC:** 18
- **Dependencies:** `@capacitor/cli`
- **Risk Level:** **LOW** — isolated config file.

## SERVER-SIDE — SQLite Removal

### 15. `sync-server/store_sqlite.go`
- **Path:** `sync-server/store_sqlite.go`
- **Estimated LOC:** 938+
- **Dependencies:** `modernc.org/sqlite` (go.mod)
- **Risk Level:** **MEDIUM** — must verify no production deployments use SQLite. Must update `main.go` to remove `case "sqlite"`.

### 16. `sync-server/store_sqlite_test.go`
- **Path:** `sync-server/store_sqlite_test.go`
- **Estimated LOC:** 29
- **Risk Level:** **LOW** — test file for removed code.

### 17. `sync-server/store_old.go.bak` + `handlers_old.go.bak`
- **Path:** `sync-server/store_old.go.bak`, `sync-server/handlers_old.go.bak`
- **Estimated LOC:** 1,161
- **Risk Level:** **LOW** — already `.bak` files.

## INFRASTRUCTURE

### 18. `src/app/api/` (Next.js API routes)
- **Path:** `src/app/api/`
- **Estimated LOC:** ~500 (estimated, access denied to count precisely)
- **Risk Level:** **MEDIUM** — must verify proxy layer is complete and handles all routes. Currently proxy handles all needed routes (`proxy.ts:6-29`).

### 19. `prisma/` directory
- **Path:** `prisma/`
- **Risk Level:** **LOW** — Prisma not in dependencies, appears unused.

## SUMMARY

| Category | Files | Estimated LOC Removed |
|----------|-------|----------------------|
| IndexedDB storage layer | 1 | 2,299 |
| Local API client | 1 | 496 |
| Sync engine + conflict + store | 3 | 517 |
| Write queue + read cache | 2 | 275 |
| UI (sync indicator, local banner, export/import) | 3 | 298 |
| Next.js API routes | ~8 dirs | ~500 |
| Go SQLite store + tests + bak files | 4 | 2,151 |
| Sync-related types (partial) | 0 (inline) | ~65 |
| **TOTAL ESTIMATED REMOVAL** | | **~6,601** |

| Category | Files | Estimated LOC Simplified |
|----------|-------|-------------------------|
| api-client.ts | 1 | -265 (from 315 to ~50) |
| api-client-go.ts | 1 | -288 (from 888 to ~600) |
| use-auth.tsx | 1 | -5 |
| Dockerfile | 1 | -4 |
| docker-compose.yml | 1 | -1 |
| package.json | 1 | -6 (remove cap deps) |
| **TOTAL ESTIMATED SIMPLIFICATION** | | **~569** |

---

# Migration Plan

## Phase A: Disable Features (No Removal)

**Goal:** Make the application work exclusively in server mode without removing any code.

### A.1. Hard-code `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=false`
- Set in `.env`, `Dockerfile`, `docker-compose.yml`
- Verify: application no longer enters local-only code paths

### A.2. Remove `localFallback()` calls from `GoApiClient`
- File: `src/lib/api-client-go.ts:838-887`
- Replace with server calls or temporary stubs
- Templates and dietary profiles must either:
  - (a) Get server API endpoints in Go server, or
  - (b) Use localStorage instead of IndexedDB for client-only storage

### A.3. Disable sync UI
- Remove `<SyncIndicator />` from `src/components/app-nav.tsx`
- Remove `<LocalModeBanner />` from root layout

### A.4. Remove `isLocalOnly` bypass in auth
- File: `src/hooks/use-auth.tsx:78-81`
- Change: `isAuthenticated: !!user` (always require auth)

### A.5. Verify proxy handles all routes
- Compare `src/proxy.ts:6-29` PROXY_ROUTES with Go server routes
- Ensure no `/api/*` route is missed

### A.6. Test
- Deploy with Docker Compose
- Verify all CRUD operations work through proxy → Go → PostgreSQL
- Verify auth flow works (register, login, refresh)
- Verify no IndexedDB writes occur (check DevTools)

---

## Phase B: Remove Unused Code

**Goal:** Delete all code that is no longer executed.

### B.1. Remove `src/lib/storage.ts`
- Prerequisite: Phase A.2 complete (no more LocalApiClient usage)
- Delete: `src/lib/storage.ts` (2,299 LOC)

### B.2. Remove `src/lib/api-client-local.ts`
- Prerequisite: Phase B.1
- Delete: `src/lib/api-client-local.ts` (496 LOC)

### B.3. Remove sync infrastructure
- Delete: `src/lib/sync-engine.ts` (253 LOC)
- Delete: `src/lib/sync-conflict.ts` (81 LOC)
- Delete: `src/lib/sync-store.ts` (183 LOC)

### B.4. Remove offline infrastructure
- Delete: `src/lib/write-queue.ts` (178 LOC)
- Delete: `src/lib/read-cache.ts` (97 LOC)

### B.5. Remove offline UI components
- Delete: `src/components/sync-indicator.tsx` (78 LOC)
- Delete: `src/components/local-mode-banner.tsx` (106 LOC)
- Delete: `src/lib/export-import.ts` (114 LOC)

### B.6. Simplify `api-client.ts`
- Remove factory logic, `LocalApiClient` branch
- Remove `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` check
- Export `GoApiClient` directly
- Remove `resetApiClient()` and `setApiClient()` if unused

### B.7. Simplify `api-client-go.ts`
- Remove `writeQueue.init()` and `readCache.init()` from constructor
- Remove `cachedGet()` method, replace with direct `this.request()`
- Remove `queuedWrite()` method, replace with direct `this.request()`
- Remove `localFallback()` and all template/dietary delegation methods
- Add direct server calls for templates/dietary OR move to minimal localStorage

### B.8. Clean up `src/lib/types.ts`
- Remove `SyncStatus`, `SyncServerConfig`, `SyncChangeLogEntry`, `SyncConflictRecord`, `SYNC_STORE_NAMES` (lines 174-239)

### B.9. Remove sync-related IndexedDB stores from schema
- Already handled by removing `storage.ts`, but verify no other files reference `syncChangeLog`, `syncServers` stores

### B.10. Remove Next.js API routes
- Delete: `src/app/api/books/`
- Delete: `src/app/api/categories/`
- Delete: `src/app/api/community/`
- Delete: `src/app/api/fda/`
- Delete: `src/app/api/foods/`
- Delete: `src/app/api/nutrition/`
- Delete: `src/app/api/recipes/`
- Delete: `src/app/api/share/`
- Verify: proxy.ts handles all needed routes

### B.11. Remove `prisma/` directory
- Not in dependencies, appears unused

### B.12. Remove Go SQLite backend
- Delete: `sync-server/store_sqlite.go`
- Delete: `sync-server/store_sqlite_test.go`
- Delete: `sync-server/store_old.go.bak`
- Delete: `sync-server/handlers_old.go.bak`
- Update: `sync-server/main.go` — remove `case "sqlite"` branch (lines 31-46)
- Update: `sync-server/repository.go` — remove `SQLiteStore` references

---

## Phase C: Remove Obsolete Dependencies

### C.1. npm dependencies
- Remove `"idb": "^8.0.3"` (package.json:70) — only used by storage.ts, write-queue.ts, read-cache.ts
- Remove `"@capacitor/android": "^8.3.1"` (package.json:21)
- Remove `"@capacitor/cli": "^8.3.1"` (package.json:22)
- Remove `"@capacitor/core": "^8.3.1"` (package.json:23)
- Remove `"@capacitor/ios": "^8.3.1"` (package.json:24)
- Run `npm install` to update lock file

### C.2. npm scripts
- Remove `"tauri:dev"` (package.json:11)
- Remove `"tauri:build"` (package.json:12)
- Remove `"cap:init"` (package.json:13)
- Remove `"cap:add:android"` (package.json:14)
- Remove `"cap:add:ios"` (package.json:15)
- Remove `"cap:sync"` (package.json:16)
- Remove `"cap:open:android"` (package.json:17)
- Remove `"cap:open:ios"` (package.json:18)

### C.3. Go dependencies
- Remove `modernc.org/sqlite` from `sync-server/go.mod`
- Run `go mod tidy`

### C.4. Remove `capacitor.config.ts`
- File no longer needed

---

## Phase D: Remove Obsolete Infrastructure

### D.1. Remove `src-tauri/` directory
- Postpone to Phase 6 — do not remove yet, but exclude from CI builds

### D.2. Remove Docker build arg
- `Dockerfile` — remove `ARG NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` and related env vars
- `docker-compose.yml` — remove `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` env vars

### D.3. Remove `.env` local-only settings
- Remove `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` from `.env` and `.env.example`

### D.4. Clean up build scripts
- Review `scripts/` for local-only or sync-related build steps
- Remove `build-all.bat`, `build-all.sh` if they reference Tauri/Capacitor builds

### D.5. Remove obsolete documentation
- `DATA_STORE.MD` — likely documents IndexedDB architecture
- `PLAN-server-first.md`, `PLAN.md` — superseded by this plan
- `spec.md`, `../specs/` — review for relevance

---

# Dependency Analysis

## What breaks if IndexedDB disappeared?

**Direct consumers of `idb` library:**
- `src/lib/storage.ts` — 100% dependent on IndexedDB. All 2,299 LOC become dead code.
- `src/lib/write-queue.ts` — creates `dietledger-write-queue` database. Offline writes fail.
- `src/lib/read-cache.ts` — creates `dietledger-read-cache` database. Cache reads return null (graceful degradation already coded).

**Consumers of `storage.ts`:**
- `src/lib/api-client-local.ts` — entirely dependent on `storage.ts`. All 496 LOC dead.
- `src/lib/sync-engine.ts` — calls `getAllUnsyncedChanges()`, `markChangesSynced()`, `getAllStoreData()`, `putStoreData()`, `deleteStoreRecord()`, `getDB()`.
- `src/lib/sync-store.ts` — calls `getAllSyncServers()`, `putSyncServer()`, `deleteSyncServer()`.
- `src/lib/app-settings-store.ts` — calls `getAppSettings()`, `putAppSettings()`.

**Consumers of `api-client-local.ts`:**
- `src/lib/api-client.ts:299` — factory creates `LocalApiClient` in local-only mode
- `src/lib/api-client-go.ts:838-841` — `localFallback()` creates `LocalApiClient` for templates/dietary

**Template and Dietary stores:**
- `src/lib/template-store.ts` — calls `getApiClient().getTemplates()` which may route to `LocalApiClient`
- `src/lib/dietary-store.ts` — calls `getApiClient().getDietaryProfiles()` which may route to `LocalApiClient`

**UI components:**
- `src/components/sync-indicator.tsx` — uses `writeQueue.onStatusChange()`, `writeQueue.getStatus()`, `writeQueue.drain()`
- `src/components/local-mode-banner.tsx` — uses `exportAllData()`, `importFromJson()` which call `getApiClient()` → `LocalApiClient`

**Sync Change Log:**
- `storage.ts` lines 652, 674, 709, 819, 838, 869, 910, 946, 997, 1029, 1046, 1096, 1141, 1309, 1374, 1386 — every write operation calls `logChange()` which writes to IndexedDB `syncChangeLog` store.

**Impact: SEVERE** — IndexedDB is the backbone of the offline-first architecture. Removing it requires removing or replacing all above consumers.

## What breaks if SQLite disappeared?

**Direct consumers:**
- `sync-server/store_sqlite.go:1-938+` — entire SQLite store implementation
- `sync-server/store_sqlite_test.go:1-29` — SQLite-specific tests
- `sync-server/main.go:31-46` — `case "sqlite"` initialization

**Impact: LOW for production** — docker-compose.yml already uses `DB_DRIVER=postgres`. SQLite is only used for local development. Removing SQLite support means developers must run PostgreSQL locally or via Docker.

## What breaks if LocalApiClient disappeared?

**Direct consumers:**
- `src/lib/api-client.ts:299` — factory instantiates `LocalApiClient` when `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true`
- `src/lib/api-client-go.ts:838-887` — `localFallback()` creates `LocalApiClient` for templates and dietary profiles

**Impact: MEDIUM** — removing LocalApiClient requires:
1. Ensuring `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` is never `true`
2. Providing server-side API endpoints for templates and dietary profiles (or alternative client-side storage)

## What breaks if Tauri disappeared?

**Direct consumers:**
- `src-tauri/` — entirely self-contained
- `package.json:11-12` — `tauri:dev` and `tauri:build` scripts

**Impact: NONE on web** — Tauri is a desktop wrapper. The web application has no imports from `src-tauri/`. Removing Tauri does not affect web functionality.

## What breaks if Capacitor disappeared?

**Direct consumers:**
- `capacitor.config.ts` — configuration file
- `package.json:13-18` — cap:* scripts
- `package.json:21-24` — `@capacitor/*` dependencies

**Impact: NONE on web** — Capacitor is a mobile wrapper. No web code imports from Capacitor.

## What breaks if Sync Engine disappeared?

**Direct consumers:**
- `src/lib/sync-store.ts` — calls `syncWithServer()`, `fullDumpUpload()`, `fullDumpDownload()`
- `storage.ts` — `logChange()` populates `syncChangeLog` store; `getAllUnsyncedChanges()`, `markChangesSynced()` exposed for sync

**Impact: NONE on server-mode operation** — sync engine only executes when sync servers are configured and enabled. In pure server mode, no sync servers exist. The `logChange()` calls in `storage.ts` write to IndexedDB but have no effect when sync is not active. However, if `storage.ts` is removed along with the sync engine, there is no impact.

---

# Recommended End State

## Minimal Architecture for Phase 1

```
┌────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│ React UI ──> Zustand Stores ──> GoApiClient (fetch only)   │
│                                                             │
│ Next.js Middleware: /api/* ──> proxy to Go server           │
└────────────────────────────┬───────────────────────────────┘
                             │ HTTP (JSON)
┌────────────────────────────▼───────────────────────────────┐
│ Go API Server (sync-server/)                                │
│                                                             │
│ • JWT Auth (register, login, refresh)                      │
│ • Full CRUD for all domain entities                         │
│ • FDA food search proxy                                     │
│ • Community/sharing features                                │
│ • Rate limiting                                             │
│                                                             │
│ ┌──────────────────┐                                        │
│ │ PostgreSQL       │  Sole source of truth                  │
│ │ (pgx driver)     │                                        │
│ └──────────────────┘                                        │
└────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────┐
│ Docker Compose                                              │
│                                                             │
│ ┌──────────┐  ┌──────────────┐  ┌──────────────┐          │
│ │ web      │  │ api          │  │ postgres     │          │
│ │ :3000    │  │ :8080        │  │ :5432        │          │
│ │ Next.js  │  │ Go           │  │ PG 17        │          │
│ │          │──│              │──│              │          │
│ └──────────┘  └──────────────┘  └──────────────┘          │
│                                                             │
│ Volumes: pg-data (persistent)                               │
└────────────────────────────────────────────────────────────┘
```

## What Remains in `src/lib/`

| File | Purpose | Changes |
|------|---------|---------|
| `api-client.ts` | `ApiClient` interface + `GoApiClient` export | Simplified: remove factory, export GoApiClient directly |
| `api-client-go.ts` | HTTP client to Go API | Simplified: remove write-queue, read-cache, localFallback |
| `types.ts` | Shared TypeScript types | Reduced: remove sync-related types |
| `recipe-store.ts` | Recipe state management | Minimal: update import path |
| `book-store.ts` | Book state management | Minimal: update import path |
| `meal-plan-store.ts` | Meal plan state management | Minimal: update import path |
| `nutrition-store.ts` | Nutrition state management | Minimal: update import path |
| `template-store.ts` | Template state management | Decision needed: server API or localStorage |
| `dietary-store.ts` | Dietary profile state management | Decision needed: server API or localStorage |
| `app-settings-store.ts` | App settings | Decision needed: server API or localStorage |
| `nutrition-calcs.ts` | Pure calculation functions | No changes |
| `recipe-scaling.ts` | Pure scaling functions | No changes |
| `format.ts` | Formatting utilities | No changes |
| `unit-conversion.ts` | Unit conversion utilities | No changes |
| `glycemic-load.ts` | Glycemic calculations | No changes |
| `nutrient-map.ts` | Nutrient mapping data | No changes |
| `recipe-synergy.ts` | Food synergy data | No changes |
| `dietary-rules.ts` | Dietary rule matching | No changes |
| `usda-datasets.ts` | USDA dataset metadata | No changes |
| `fallback-foods.ts` | Fallback food data | No changes |
| `fda-client.ts` | FDA API client | No changes |
| `utils.ts` | General utilities | No changes |
| `themes.ts` | Theme definitions | No changes |
| `pdf-export.ts` | PDF generation | No changes |
| `recipe-store.ts` | Recipe scaling | No changes |

## What Remains in `sync-server/`

| File | Purpose |
|------|---------|
| `main.go` | Server entry (remove sqlite branch) |
| `server.go` | HTTP routing and middleware |
| `store_postgres.go` | PostgreSQL data access |
| `models.go` | Data models |
| `handlers_crud.go` | CRUD HTTP handlers |
| `handlers_food.go` | Food search handlers |
| `handlers_sharing.go` | Sharing handlers |
| `auth.go` | JWT auth service |
| `repository.go` | Store interface (remove SQLite refs) |
| `validation.go` | Input validation |
| `ratelimit.go` | Rate limiter |
| `migrate.go` | Database migrations |
| `seed.go` | Category seeding |
| `migrations/` | SQL migration files |

## Files Removed from `src/lib/`

| File | LOC |
|------|-----|
| `storage.ts` | 2,299 |
| `api-client-local.ts` | 496 |
| `sync-engine.ts` | 253 |
| `sync-conflict.ts` | 81 |
| `sync-store.ts` | 183 |
| `write-queue.ts` | 178 |
| `read-cache.ts` | 97 |
| `export-import.ts` | 114 |
| **Total** | **~3,701** |

## Files Removed from `sync-server/`

| File | LOC |
|------|-----|
| `store_sqlite.go` | 938 |
| `store_sqlite_test.go` | 29 |
| `store_old.go.bak` | 623 |
| `handlers_old.go.bak` | 538 |
| **Total** | **~2,128** |

## Net Reduction

- **Frontend TypeScript:** ~3,701 LOC removed, ~569 LOC simplified = **~4,270 LOC net reduction**
- **Backend Go:** ~2,128 LOC removed = **~2,128 LOC net reduction**
- **Total:** **~6,398 LOC removed or simplified**
- **IndexedDB databases eliminated:** 3 (`dietledger-db`, `dietledger-write-queue`, `dietledger-read-cache`)
- **npm packages eliminated:** 5 (`idb`, `@capacitor/android`, `@capacitor/cli`, `@capacitor/core`, `@capacitor/ios`)
- **Go module eliminated:** `modernc.org/sqlite`

---

# Risk Assessment

## HIGH-RISK Removals

### 1. `src/lib/storage.ts` removal
- **Risk:** Template and dietary profile data currently stored in IndexedDB has no server-side equivalent
- **Mitigation:** Before removal, either:
  - (a) Add template/dietary CRUD endpoints to Go API server with PostgreSQL storage, OR
  - (b) Migrate to localStorage with JSON serialization (simpler, but limited to ~5MB)
- **Code References:** `api-client-go.ts:838-887` (localFallback), `template-store.ts:25-93`, `dietary-store.ts:36-155`

### 2. `GoApiClient` offline resilience removal
- **Risk:** Removing write-queue and read-cache means any network interruption causes immediate data loss (unsaved changes) or error
- **Mitigation:** For Phase 1 (hosted web app), users are expected to have stable connections. Add React Query retry logic. Consider adding `window.onbeforeunload` warning for unsaved changes.
- **Code References:** `api-client-go.ts:108-120` (queuedWrite), `api-client-go.ts:96-106` (cachedGet)

### 3. `app-settings-store.ts` IndexedDB dependency
- **Risk:** App settings (meal slot times) currently stored in IndexedDB via `storage.ts`. Removing `storage.ts` breaks settings.
- **Mitigation:** Migrate to localStorage or add server-side settings endpoint.
- **Code References:** `app-settings-store.ts:2` (imports from storage), `app-settings-store.ts:21-22` (getAppSettings)

## MEDIUM-RISK Removals

### 4. Next.js API routes removal
- **Risk:** Some routes may contain business logic not yet replicated in Go server
- **Mitigation:** Audit each route handler against Go server endpoints. Verify 1:1 feature parity.
- **Code References:** `src/app/api/` directory, `proxy.ts:6-29` (PROXY_ROUTES)

### 5. Go SQLite backend removal
- **Risk:** Some developers may rely on SQLite for local development without Docker
- **Mitigation:** Provide Docker Compose as the standard development environment. Document PostgreSQL setup.
- **Code References:** `sync-server/main.go:31-46`

### 6. `export-import.ts` removal
- **Risk:** Users lose the ability to export/import their data as JSON backup
- **Mitigation:** Add server-side backup/restore endpoints in Go API. Or add a new simplified export using `GoApiClient` data.
- **Code References:** `export-import.ts:17-42` (exportAllData)

## LOW-RISK Removals

### 7. Sync engine removal
- **Risk:** None — sync engine is only active when sync servers are configured
- **Code References:** `sync-engine.ts`, `sync-store.ts`, `sync-conflict.ts`

### 8. Write queue and read cache removal
- **Risk:** Low — these are performance/reliability layers for offline mode
- **Code References:** `write-queue.ts`, `read-cache.ts`

### 9. Local mode banner and sync indicator removal
- **Risk:** None — purely UI components
- **Code References:** `local-mode-banner.tsx`, `sync-indicator.tsx`

### 10. Tauri and Capacitor postponement
- **Risk:** None — these are isolated platform wrappers with no web code dependencies
- **Code References:** `src-tauri/`, `capacitor.config.ts`

### 11. Prisma directory removal
- **Risk:** None — Prisma is not in `package.json` dependencies
- **Code References:** `prisma/`

### 12. `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` flag removal
- **Risk:** Low — feature flag for a mode that is no longer supported
- **Code References:** Multiple files (see Feature Inventory: REMOVE table)

### 13. `.bak` files in sync-server
- **Risk:** None — already backup files
- **Code References:** `sync-server/store_old.go.bak`, `sync-server/handlers_old.go.bak`

---

# Open Decisions Required Before Implementation

1. **Template storage:** Should templates move to PostgreSQL (server-side) or localStorage (client-side)?
   - Server-side: enables cross-device template sync, but requires Go API endpoints
   - Client-side: simpler, keeps templates user-local, limited storage

2. **Dietary profile storage:** Same question as templates.
   - Currently client-only via LocalApiClient/IndexedDB
   - Server-side would enable cross-device consistency

3. **App settings storage:** Meal slot times and preferences.
   - Currently in IndexedDB
   - Simplest: migrate to localStorage

4. **Offline resilience strategy:** Should any offline capability be preserved for Phase 1?
   - Recommendation: No. Phase 1 is a hosted web app. Offline is Phase 3/5.

5. **Developer experience without SQLite:**
   - Require Docker for all development?
   - Or keep SQLite as a development-only option?
