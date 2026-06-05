# System Architecture

**Package:** `dietledger` v1.0.0-beta.65
**Pattern:** Dual-mode monorepo — local-first (IndexedDB) and server-first (Go API + PostgreSQL) with an optional client-side sync engine.

---

## 1. Major Architectural Components

### A. Next.js Web Application (`src/`)

A React 19 application using Next.js 16 App Router. Serves HTML/JS/CSS to browsers, Tauri desktop shells, and Capacitor mobile shells. The application uses a page-based routing structure under `src/app/(app)/` for authenticated content and `src/app/(auth)/` for login/registration.

**Key architectural files:**
- `src/app/layout.tsx` — root layout
- `src/app/(app)/layout.tsx` — authenticated app layout
- `src/app/(auth)/layout.tsx` — auth layout
- `middleware.ts` → `src/proxy.ts` — API request routing (line 1-2)

### B. Zustand Stores (`src/lib/*-store.ts`)

Client-side state management. Each domain has its own Zustand store:
- `recipe-store.ts` — recipe data, CRUD operations, ingredient management
- `book-store.ts` — recipe book/chapter/page management
- `meal-plan-store.ts` — weekly meal planning
- `nutrition-store.ts` — nutrition profiles, food log, weight tracking
- `dietary-store.ts` — dietary restriction profiles and allergen rules
- `template-store.ts` — page/recipe templates
- `app-settings-store.ts` — application settings
- `sync-store.ts` — sync server configuration and sync orchestration

Stores interact with data through `ApiClient` (see section 6).

### C. Storage Layer (`src/lib/storage.ts`)

IndexedDB-backed persistence using the `idb` library (`src/lib/storage.ts:1`). Opens a database named `dietledger` with 13 versioned schema migrations (lines 496-607). Manages 22 object stores:

**Object stores** (from `src/lib/storage.ts:496-607`):
```
recipes, books, chapters, chapterRecipes, categories, recipeCategories,
chapterPages, bookPages, templates, mealPlans, dayPlanEntries, mealGroups,
groceryChecklists, seasonalFoods, pantryStaples, userLocation, customFoods,
nutritionProfiles, foodLogEntries, weightEntries, syncServers, syncChangeLog,
dietaryProfiles, allergenRules, sharedRecipeCache, brandKits, appSettings
```

### D. Sync Engine (`src/lib/sync-engine.ts`)

Client-side change-based synchronization. Pushes local IndexedDB changes to remote sync servers and pulls remote changes back. Supports three operations:
- `pushChanges` — sends unsynced local changes in batches of 100 (`src/lib/sync-engine.ts:62`)
- `pullChanges` — fetches changes since last sync timestamp (`src/lib/sync-engine.ts:133`)
- `fullDumpUpload` / `fullDumpDownload` — bulk sync for initial setup (`src/lib/sync-engine.ts:172`, `src/lib/sync-engine.ts:206`)

The sync engine communicates with a sync server at `/api/sync/push`, `/api/sync/pull`, and `/api/sync/full-dump`. These endpoints are NOT served by the Go API server defined in `sync-server/server.go` — they are served by a separate sync protocol that the client calls directly using `server.serverUrl` and `server.apiKey` credentials.

### E. API Clients (`src/lib/api-client*.ts`)

Three files implementing the `ApiClient` interface (`src/lib/api-client.ts:94`):

| File | Class | Purpose |
|---|---|---|
| `api-client.ts` | (interface + factory) | Defines `ApiClient` interface and `getApiClient()` factory |
| `api-client-local.ts` | `LocalApiClient` | Direct IndexedDB operations, no network. Auth methods throw errors. |
| `api-client-go.ts` | `GoApiClient` | HTTP client targeting the Go API server. Includes JWT auth, read caching, write queue. |

### F. Write Queue (`src/lib/write-queue.ts`)

An offline-first write queue for the `GoApiClient`. When a write request fails due to network errors (`TypeError` / "Failed to fetch"), the request is persisted to a separate IndexedDB database (`dietledger-write-queue`) and retried with exponential backoff (`src/lib/api-client-go.ts:108-119`, `src/lib/write-queue.ts:29-30`).

**Backoff schedule** (`src/lib/write-queue.ts:30`):
```
1s, 2s, 4s, 8s, 16s, 60s, 60s, 60s, 60s, 60s (max 10 retries)
```

### G. Go API Server (`sync-server/`)

A standalone Go HTTP server serving the REST API. Entry point: `sync-server/main.go`. Built around a `Server` struct (`sync-server/server.go:14`) that holds:
- `Store` — database interface (`sync-server/repository.go:3`)
- `AuthService` — JWT authentication (`sync-server/auth.go:17`)
- `RateLimiter` — per-IP rate limiting (`sync-server/ratelimit.go:10`)

### H. Database Layer (`sync-server/store_postgres.go` / `store_sqlite.go`)

Two implementations of the `Store` interface (`sync-server/repository.go:3`):
- `PostgresStore` (`sync-server/store_postgres.go:17`) — production, uses `pgx/v5`
- `SQLiteStore` (`sync-server/store_sqlite.go`) — testing/dev, uses `modernc.org/sqlite`

Schema managed by 12 numbered SQL migration files in `sync-server/migrations/`.

---

## 2. Communication Between Components

### Frontend → Backend (Server Mode)

```
Browser (React Component)
    │
    ▼
Zustand Store (e.g., recipe-store.ts)
    │
    ▼
getApiClient() [src/lib/api-client.ts:290]
    │
    ├── [local mode] ──▶ LocalApiClient ──▶ IndexedDB (via storage.ts)
    │
    └── [server mode] ──▶ GoApiClient.request() [src/lib/api-client-go.ts:58]
                              │
                              ▼ (browser fetch)
                         Next.js Middleware [middleware.ts]
                              │
                              ▼ (proxy if not local-only)
                         src/proxy.ts → Go API Server (port 8080)
```

The middleware proxy (`src/proxy.ts:31-38`) intercepts `/api/:path*` routes. If `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` is false, requests are forwarded to the Go API server at `API_URL` (default `http://localhost:8080`, `src/proxy.ts:4`).

### GoApiClient Write Path with Offline Queue

```
Zustand Store
    │
    ▼
GoApiClient.queuedWrite() [src/lib/api-client-go.ts:108]
    │
    ├── success ──▶ invalidate read cache
    │
    └── network failure (TypeError / "Failed to fetch")
              │
              ▼
         writeQueue.enqueue() [src/lib/write-queue.ts:56]
              │
              ▼ (persisted to IndexedDB)
         writeQueue.drain() [src/lib/write-queue.ts:71]
              │
              ▼ (retry with exponential backoff)
         writeQueue.sendWrite() [src/lib/write-queue.ts:140]
              │
              ▼ (successful) → delete from queue
```

### GoApiClient Authentication Flow

```
GoApiClient.request() [src/lib/api-client-go.ts:58]
    │
    ├── 200 OK ──▶ return JSON response
    │
    └── 401 Unauthorized ──▶ tryRefresh() [src/lib/api-client-go.ts:122]
                                  │
                                  ├── success ──▶ retry request once (no retry on 2nd 401)
                                  │
                                  └── failure ──▶ clearTokens()
                                                    dispatch 'dietledger:unauthorized' event
                                                    throw Error
```

### Sync Engine Communication

```
useSyncStore [src/lib/sync-store.ts:39]
    │
    ├── syncServer(id) ──▶ syncWithServer() [src/lib/sync-engine.ts:239]
    │                           │
    │                           ├── pushChanges() → POST /api/sync/push (to sync server URL)
    │                           │
    │                           └── pullChanges() → GET /api/sync/pull (to sync server URL)
    │
    └── initialSync(id) ──▶ fullDumpUpload() → POST /api/sync/full-dump
                            fullDumpDownload() → GET /api/sync/full-dump
```

The sync engine communicates **directly** with external sync servers, NOT through the Go API middleware proxy. It uses `server.serverUrl` and `server.apiKey` from `SyncServerConfig` records stored in IndexedDB (`src/lib/types.ts:176-191`).

### Auto-sync Timer

When auto-sync is enabled, `sync-store.ts` sets up interval timers (`src/lib/sync-store.ts:167-182`):
```
setupTimers() → for each enabled server with autoSync and syncIntervalMinutes > 0
                    → setInterval(syncServer(id), intervalMs)
```

Local changes trigger debounced sync via `notifyLocalChange()` (`src/lib/sync-store.ts:29-37`):
```
notifyLocalChange() → 500ms debounce → useSyncStore.getState().syncAll()
```

---

## 3. Data Flow Through the System

### Server Mode — Read Path

```
1. React Component renders → calls Zustand store getter
2. Zustand store calls getApiClient().getRecipes(page, perPage)
3. GoApiClient.cachedGet() checks read cache first (TTL-based)
4. On cache miss → GoApiClient.request('GET', '/api/recipes?page=1&perPage=20')
5. JWT token attached via Authorization header
6. Browser fetch → Next.js middleware (middleware.ts)
7. proxy.ts forwards to http://localhost:8080/api/recipes?page=1&perPage=20
8. Go API Server routes to recipesRouter (sync-server/handlers_crud.go:76)
9. Server.requireAuth() validates JWT or API key (sync-server/server.go:218-253)
10. Store.ListRecipes() queries PostgreSQL
11. JSON response returned through the chain
12. GoApiClient caches result via readCache
13. Zustand store updates React state → component re-renders
```

### Server Mode — Write Path (Online)

```
1. User edits recipe → calls Zustand store setter
2. Zustand store calls getApiClient().updateRecipe(id, data)
3. GoApiClient.queuedWrite('PUT', '/api/recipes/{id}', data)
4. GoApiClient.request() sends PUT with JWT to Go API
5. Same proxy path as read → Go API handler
6. Store.UpdateRecipe() writes to PostgreSQL
7. Read cache invalidated for affected cache prefix
8. Response updates Zustand state
```

### Server Mode — Write Path (Offline)

```
1. User edits recipe → calls Zustand store setter
2. GoApiClient.queuedWrite('PUT', '/api/recipes/{id}', data)
3. fetch() throws TypeError (no network)
4. writeQueue.enqueue(method, path, body) → persists to IndexedDB
5. User sees data in local state (optimistic or cached)
6. Network returns → writeQueue.attachConnectivityListeners fires
7. writeQueue.drain() processes queue → sendWrite() for each pending write
8. On success → remove from queue. On failure → increment retries, backoff.
```

### Local-Only Mode — All Operations

```
1. React Component → Zustand store → getApiClient()
2. getApiClient() returns LocalApiClient (src/lib/api-client.ts:298-300)
3. LocalApiClient methods call storage.ts functions directly
4. storage.ts reads/writes IndexedDB
5. Auth methods throw Error('Auth not available in local mode')
6. No network requests, no Go API, no PostgreSQL
```

### Sync Data Flow

```
Local IndexedDB → getAllUnsyncedChanges() → pushChanges()
    → POST /api/sync/push with deviceId, changes[]
    → response: { accepted[], conflicts[] }
    → markChangesSynced(acceptedIds)

Remote Sync Server → pullChanges()
    → GET /api/sync/pull?deviceId=...&since=...
    → response: { changes[] }
    → apply each change to local IndexedDB (put/delete)
```

---

## 4. Startup Sequence

### Docker Production Startup

```
1. docker compose up
2. postgres container starts → healthcheck: pg_isready
3. api container starts (depends_on postgres healthy)
   a. sync-server/main.go:main()
   b. Read env vars: PORT, DB_DRIVER, DATABASE_URL, CORS_ORIGIN, HMAC_SECRET
   c. Switch DB_DRIVER:
      - "sqlite" → NewSQLiteStore(dbPath) → InitDB() → SeedCategories()
      - "postgres" → NewPostgresStore(databaseURL) → RunMigrations() → SeedCategories()
   d. NewAuthService(store, jwtKeyPath)
   e. NewRateLimiter()
   f. NewServer(store, auth, corsOrigin, maxBodyMB, rl)
   g. startSeedProcessor()
   h. http.Server{Addr: ":8080", Handler: server.Routes()}
   i. ListenAndServe → log "DietLedger API Server starting on :8080"
4. web container starts (depends_on api healthy)
   a. docker-entrypoint.sh runs
   b. node server.js (server.js:1)
   c. Read BUILD_VERSION, set DATABASE_URL default if missing
   d. Resolve serverRoot (.next/standalone/)
   e. Create symlinks for .next/static/ and public/
   f. Load Next.js config from required-server-files.json
   g. new NextServer({hostname, port, dir, dev:false, conf})
   h. http.createServer → listen on PORT (default 3000)
   i. Log "Production server running at http://0.0.0.0:3000"
```

### Tauri Desktop Startup

```
1. Tauri binary launches (src-tauri/src/main.rs)
2. nutrilabel_lib::run() (src-tauri/src/lib.rs:26)
3. tauri::Builder::default()
   a. plugin(tauri_plugin_opener::init())
   b. setup() — no-op ("Nothing to start — the frontend is a static site")
   c. invoke_handler: get_app_version, get_data_dir
4. Tauri creates WebView window (1280x900)
5. WebView loads static files from ../out/ directory
6. All logic runs in WebView (JavaScript):
   a. React app initializes
   b. getDB() opens IndexedDB
   c. getApiClient() → LocalApiClient (local-only, no server bundled)
   d. Zustand stores hydrate from IndexedDB
```

### Development Startup

```
1. bun run dev (package.json:6) → next dev -p 3000
2. Next.js dev server starts
3. Browser loads http://localhost:3000
4. getApiClient() checks NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY
   - true → LocalApiClient (IndexedDB only)
   - false → GoApiClient targeting http://localhost:8080
5. [If server mode] Go API must be running separately:
   - cd sync-server && go run . (or make run)
   - Listens on :8080
6. Middleware proxy intercepts /api/* → forwards to Go API
```

---

## 5. Major Boundaries

### Boundary 1: Local-Only vs Server Mode

**Decision point:** `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` environment variable.

**Location:** `src/lib/api-client.ts:293-306` (`getApiClient()` factory).

```
NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true
    → LocalApiClient → storage.ts → IndexedDB
    → No auth, no network, no Go API

NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=false (default)
    → GoApiClient → HTTP → Next.js proxy → Go API → PostgreSQL
    → Auth required, offline writes queued
```

**Proxy boundary:** `src/proxy.ts:42-46`. The proxy is a separate gate — even in server mode, if `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` is set, proxy passes through (Next.js API routes handle requests directly via Prisma/SQLite).

### Boundary 2: Browser vs Server (Runtime)

The React application runs in three distinct runtime environments:

| Runtime | Auth | Storage | Network |
|---|---|---|---|
| Browser (web) | JWT / API key via GoApiClient | IndexedDB | HTTP via proxy or direct fetch |
| Tauri Desktop (WebView) | N/A (local-only) | IndexedDB (WebView) | FDA API direct |
| Capacitor Mobile (WebView) | N/A (local-only) | IndexedDB (WebView) | FDA API direct |

**Tauri/Capacitor run local-only** because they load the static export (`out/` directory) which has no server-side Next.js. The `GoApiClient` could still be used if pointing to a remote Go API, but the middleware proxy is unavailable (no Next.js server process).

### Boundary 3: Client Sync Protocol vs Go API Protocol

Two distinct API protocols exist:

| Protocol | Endpoints | Auth | Served by |
|---|---|---|---|
| Go REST API | `/api/recipes`, `/api/foods`, `/api/auth/*`, etc. | JWT Bearer token | `sync-server/server.go` |
| Client Sync | `/api/sync/push`, `/api/sync/pull`, `/api/sync/full-dump` | API key (Bearer) | External sync server (URL configurable per-server) |

The sync endpoints (`/api/sync/*`) are NOT registered in `sync-server/server.go:32-77`. The sync engine in `src/lib/sync-engine.ts` calls remote servers directly at `server.serverUrl`, bypassing the Next.js proxy entirely.

### Boundary 4: Frontend API Routes vs Go API Routes

In server mode, the Next.js middleware proxy (`src/proxy.ts:31-38`) intercepts API routes matching `PROXY_ROUTES` (`src/proxy.ts:6-29`) and forwards to the Go server. In local-only mode, Next.js API routes under `src/app/api/` handle requests directly (via Prisma/SQLite).

The `src/app/api/` routes exist **only for local-only mode** — they are never reached in server mode because the middleware proxies all matching routes before they reach the Next.js API route handlers.

---

## 6. Component Responsibilities

### Frontend (`src/app/`, `src/components/`)

**Responsibilities:**
- Render UI using React Server Components and Client Components
- Handle user interaction (forms, navigation, drag-and-drop)
- Display nutrition labels, recipes, meal plans, grocery lists
- Route management via Next.js App Router

**NOT responsible for:**
- Data persistence (delegated to stores → API client → storage)
- Authentication logic (delegated to `use-auth.tsx` → API client)
- API communication (delegated to API clients)

### Zustand Stores (`src/lib/*-store.ts`)

**Responsibilities:**
- Hold reactive state for UI rendering
- Orchestrate CRUD operations via `ApiClient`
- Transform server responses into UI-friendly shapes
- Manage loading/error states

**Pattern:** Stores are singletons created with `zustand/create`. They call `getApiClient()` lazily. For example, `recipe-store.ts` uses `useRecipeStore` (Zustand hook).

### Storage Layer (`src/lib/storage.ts`)

**Responsibilities:**
- Open and version IndexedDB database (13 schema versions)
- Provide typed CRUD functions for every entity (recipes, books, chapters, etc.)
- Manage IndexedDB indexes for querying (e.g., `by-bookId`, `by-date`, `by-profileId-date`)
- Track sync change log entries (upsert/delete with `synced` flag)
- Manage sync server configurations

**Key pattern:** Every write operation (`create*`, `update*`, `delete*`) also writes a `SyncChangeLogEntry` to the `syncChangeLog` store when sync servers are configured. This enables the sync engine to push changes later.

### Sync Engine (`src/lib/sync-engine.ts`)

**Responsibilities:**
- Push unsynced IndexedDB changes to remote sync servers
- Pull remote changes into local IndexedDB
- Handle conflict detection (server reports conflicts with local/remote data + version numbers)
- Perform full dump uploads/downloads for initial sync
- Enforce HTTPS for non-localhost connections (`secureUrl()`, line 13)

**NOT responsible for:**
- Scheduling sync (delegated to `sync-store.ts` timers)
- Resolving conflicts (conflict data is returned; resolution UI is elsewhere)
- Managing sync server configuration (delegated to `sync-store.ts`)

### API Clients (`src/lib/api-client*.ts`)

**Responsibilities:**

`ApiClient` interface (`src/lib/api-client.ts:94-286`):
- Define the complete API contract (every entity's CRUD operations)
- Serve as the abstraction boundary between stores and data sources

`LocalApiClient` (`src/lib/api-client-local.ts:30`):
- Implement all CRUD methods by calling `storage.ts` functions directly
- Auth methods throw `Error('Auth not available in local mode')`
- Template/Dietary profile methods always use IndexedDB (even in server mode — marked as "client-only" in the interface, lines 269-285)

`GoApiClient` (`src/lib/api-client-go.ts:33`):
- Implement all CRUD methods via HTTP to the Go API server
- JWT token management (get/set/clear/refresh)
- Read caching with TTL (`cachedGet`, line 96)
- Write queue with offline fallback (`queuedWrite`, line 108)
- 401 retry with token refresh (`request`, line 78)
- Authenticated endpoint failure → dispatch `dietledger:unauthorized` event for global logout

### Go Sync Server (`sync-server/`)

**Responsibilities:**

`Server` (`sync-server/server.go:14`):
- HTTP routing for all API endpoints (30 routes, `sync-server/server.go:32-77`)
- CORS middleware (`sync-server/server.go:255-283`)
- Auth middleware (`sync-server/server.go:218-253`) — validates JWT or API key
- Request body size limiting (`maxBodyBytes`)

`AuthService` (`sync-server/auth.go:17`):
- User registration with bcrypt password hashing
- Login with credential verification
- JWT access token + refresh token generation/validation
- HMAC-S256 signing (configurable via `HMAC_SECRET` env var or file path)

`Store` interface (`sync-server/repository.go:3-149`):
- All database operations for every entity
- User management, recipes, ingredients, books, chapters, pages, categories, meal plans, food log, weight, custom foods, grocery checklists, sharing, API keys

`RateLimiter` (`sync-server/ratelimit.go:10`):
- Per-IP rate limiting using token bucket algorithm

### PostgreSQL

**Responsibilities:**
- Persistent storage for all user data in server mode
- Schema evolution via 12 numbered SQL migrations (`sync-server/migrations/`)
- Multi-user isolation (all queries scoped by `userID`)
- Referential integrity between entities (recipes, ingredients, books, chapters, etc.)

---

## 7. Component Diagrams

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER / WEBVIEW                          │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   React UI   │◄──▶│  Zustand     │◄──▶│  getApiClient()      │  │
│  │  Components  │    │  Stores      │    │  (Factory)           │  │
│  │  (src/app/)  │    │  (*-store)   │    │  api-client.ts:290   │  │
│  │  (src/comp/) │    │              │    └──────┬───────┬──────┘  │
│  └──────────────┘    └──────────────┘           │       │         │
│                                                    │       │         │
│                              ┌─────────────────────┘       │         │
│                              ▼ NEXT_PUBLIC_DIETLEDGER_      │         │
│                        LOCAL_ONLY = true                     │         │
│                              │                               │         │
│                    ┌─────────▼─────────┐       NEXT_PUBLIC_   │         │
│                    │  LocalApiClient    │       DIETLEDGER_    │         │
│                    │  api-client-      │       LOCAL_ONLY=    │         │
│                    │  local.ts:30      │       false          │         │
│                    └────────┬──────────┘              │         │
│                             │                          │         │
│                    ┌────────▼──────────┐    ┌─────────▼───────┐│  │
│                    │    storage.ts     │    │  GoApiClient    ││  │
│                    │  IndexedDB CRUD   │    │  api-client-    ││  │
│                    │  (22 stores)      │    │  go.ts:33       ││  │
│                    └────────┬──────────┘    └──┬─────────────┘│  │
│                             │                  │              │  │
│              ┌──────────────┘         ┌────────┴──────────┐  │  │
│              ▼                        │ read-cache.ts     │  │  │
│     ┌─────────────────┐              │ write-queue.ts    │  │  │
│     │   IndexedDB      │              └───────────────────┘  │  │
│     │   "dietledger"   │                                    │  │
│     └─────────────────┘                                    │  │
│                                                             │  │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │  │
│  │  Sync Engine     │    │  Sync Store (Zustand)         │  │  │
│  │  sync-engine.ts  │◄──│  sync-store.ts:39              │  │  │
│  │  push/pull/dump  │    │  timers, debounce             │  │  │
│  └────────┬─────────┘    └──────────────────────────────┘  │  │
│           │                                                │  │
└───────────┼────────────────────────────────────────────────┼──┘
            │ HTTP (direct to external sync server)         │
            ▼                                                │
   ┌────────────────┐                                        │
   │ Sync Server    │ (External, URL from SyncServerConfig)  │
   │ /api/sync/*    │                                        │
   └────────────────┘                                        │
                                                             │
                    HTTP via Next.js proxy                    │
                    (middleware.ts → proxy.ts)                │
                              │                              │
└─────────────────────────────┼──────────────────────────────┘
                              ▼
              ┌───────────────────────────┐
              │     Go API Server        │
              │     sync-server/main.go  │
              │     Port 8080            │
              │                          │
              │  ┌───────────────────┐   │
              │  │   Server          │   │
              │  │   server.go:14    │   │
              │  │   Routes + Auth   │   │
              │  └────────┬──────────┘   │
              │           │              │
              │  ┌────────▼──────────┐   │
              │  │  Store Interface  │   │
              │  │  repository.go:3  │   │
              │  └────────┬──────────┘   │
              │           │              │
              │  ┌────────┴──────────┐   │
              │  │ PostgresStore     │   │
              │  │ store_postgres.go │   │
              │  └───────────────────┘   │
              └─────────────┬────────────┘
                            │
                            ▼
              ┌───────────────────────┐
              │     PostgreSQL 17     │
              │     (Docker or host)  │
              └───────────────────────┘
```

### Local-Only Mode (Simplified)

```
┌─────────────────────────────────────────┐
│           BROWSER / WEBVIEW              │
│                                         │
│  ┌──────────┐   ┌──────────┐           │
│  │ React UI │◄─▶│ Zustand  │           │
│  └──────────┘   │ Stores   │           │
│                 └────┬─────┘           │
│                      │                  │
│             getApiClient()              │
│          → LocalApiClient               │
│                      │                  │
│              ┌───────▼───────┐          │
│              │  storage.ts  │          │
│              │  IndexedDB   │          │
│              └───────┬───────┘          │
│                      │                  │
│              ┌───────▼───────┐          │
│              │   IndexedDB   │          │
│              │  "dietledger" │          │
│              └───────────────┘          │
│                                         │
│  (No Go API, no PostgreSQL, no proxy)   │
│  (No auth — login/register throw Error)│
│  (Optional: sync to external server)    │
└─────────────────────────────────────────┘
```

### Sync Protocol Architecture

```
┌───────────────────────────────────────────────────────┐
│  Client (Browser)                                     │
│                                                       │
│  IndexedDB (dietledger)                              │
│  ┌─────────────┐    ┌─────────────┐                   │
│  │  Data Stores │    │ syncChange  │                   │
│  │  (18 stores)  │    │ Log (store) │                   │
│  └──────┬──────┘    └──────┬──────┘                   │
│         │                  │                           │
│  sync-engine.ts:                                   │
│  ┌──────▼──────────────────▼────────────────────┐   │
│  │ pushChanges()                                  │   │
│  │   getAllUnsyncedChanges()                       │   │
│  │   batch POST /api/sync/push (100 per batch)     │   │
│  │   markChangesSynced(acceptedIds)               │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │ pullChanges()                                  │   │
│  │   GET /api/sync/pull?deviceId=...&since=...    │   │
│  │   apply changes to IndexedDB (put/delete)      │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  sync-store.ts:                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │ auto-sync timers (per server config)           │   │
│  │ notifyLocalChange() → 500ms debounce → syncAll │   │
│  └────────────────────────────────────────────────┘   │
└───────────────────────┬───────────────────────────────┘
                        │ HTTPS (direct)
                        ▼
┌───────────────────────────────────────┐
│  External Sync Server                │
│  URL from SyncServerConfig.serverUrl │
│  Auth: Bearer apiKey                  │
│                                       │
│  /api/sync/push    ← client changes  │
│  /api/sync/pull    → server changes  │
│  /api/sync/full-dump ←→ bulk sync    │
└───────────────────────────────────────┘
```

---

## 8. Runtime Sequence Diagrams

### Recipe Read (Server Mode)

```
Component     Store        getApiClient    GoApiClient     Proxy      Go API      PostgreSQL
    │             │              │              │           │           │              │
    │──get───▶    │              │              │           │           │              │
    │             │──getApiClient()──────────▶  │           │           │              │
    │             │              │              │           │           │              │
    │             │              │◀─GoApiClient │           │           │              │
    │             │              │              │           │           │              │
    │             │──getRecipes()─────────────▶│           │           │              │
    │             │              │              │           │           │              │
    │             │              │         cachedGet()    │           │              │
    │             │              │         [cache miss]    │           │              │
    │             │              │              │           │           │              │
    │             │              │              │──GET /api/recipes──▶│              │
    │             │              │              │           │──requireAuth()─▶│          │
    │             │              │              │           │◀─────user ctx──│          │
    │             │              │              │           │──ListRecipes()─▶│          │
    │             │              │              │           │                │──SQL────▶│
    │             │              │              │           │◀──rows────────│◀─────────│
    │             │              │              │◀──200 JSON──────────│           │      │
    │             │              │◀─JSON────────│           │           │              │
    │             │              │         [cache write]   │           │              │
    │             │◀─data────────│              │           │           │              │
    │◀─re-render──│              │              │           │           │              │
```

### Recipe Write (Server Mode, Offline)

```
Component     Store        GoApiClient     WriteQueue     IndexedDB
    │             │              │              │              │
    │──save───▶   │              │              │              │
    │             │──updateRecipe()─────────▶│              │              │
    │             │              │         queuedWrite()     │              │
    │             │              │              │              │              │
    │             │              │         request('PUT',..)  │              │
    │             │              │              │              │              │
    │             │              │              │──fetch()──▶  │              │
    │             │              │              │◀─TypeError──  │              │
    │             │              │              │  (no net)    │              │
    │             │              │              │              │              │
    │             │              │              │ enqueue()────────────▶│              │
    │             │              │              │              │ [pendingWrite]│
    │             │              │◀─no throw───│              │              │
    │             │◀─success────│              │              │              │
    │◀─optimistic─│              │              │              │              │
    │  update     │              │              │              │              │
    │             │              │              │              │              │
    │             │              │         ...network returns...              │
    │             │              │              │              │              │
    │             │              │         drain()            │              │
    │             │              │              │──getPending──▶│              │
    │             │              │              │◀─[write]────│              │
    │             │              │              │ sendWrite()  │              │
    │             │              │              │──fetch()──▶ │              │
    │             │              │              │◀─200 OK──── │              │
    │             │              │              │──delete─────▶│              │
    │             │              │              │              │ [removed]    │
```

### Sync Cycle (Auto-triggered)

```
LocalChange    sync-store.ts    sync-engine.ts    RemoteSyncServer    IndexedDB
    │                │                  │                    │               │
    │──data change──▶│                  │                    │               │
    │                │                  │                    │               │
    │   notifyLocalChange()              │                    │               │
    │   [500ms debounce]                │                    │               │
    │                │                  │                    │               │
    │                │──syncAll()──────▶│                    │               │
    │                │                  │                    │               │
    │                │         syncWithServer(server)         │               │
    │                │                  │                    │               │
    │                │            pushChanges()                │               │
    │                │                  │──getAllUnsynced────▶│               │
    │                │                  │◀─changes[]────────│               │
    │                │                  │                    │               │
    │                │                  │ POST /api/sync/push──────────────▶│
    │                │                  │◀──{accepted[],conflicts[]}───────│
    │                │                  │                    │               │
    │                │                  │──markSynced(accepted)──────────▶│
    │                │                  │                    │ [synced=true]│
    │                │                  │                    │               │
    │                │            pullChanges()                │               │
    │                │                  │ GET /api/sync/pull───────────────▶│
    │                │                  │◀──{changes[]}───────────────────│
    │                │                  │                    │               │
    │                │                  │ apply changes──▶  │               │
    │                │                  │ [put/delete each]─▶│               │
    │                │                  │                    │               │
    │                │◀─{pushed,pulled,conflicts}──────────│               │
    │                │ update server config (lastSyncedAt)   │               │
```

### Authentication Flow (Server Mode)

```
LoginPage    use-auth.tsx    GoApiClient    Go API Server    PostgreSQL
    │              │                │              │              │
    │──login()────▶│                │              │              │
    │              │                │              │              │
    │              │──login(email,pw)──────────▶│              │              │
    │              │                │  request()  │              │              │
    │              │                │──POST /api/auth/login──▶│              │
    │              │                │              │──Login()────▶│
    │              │                │              │  bcrypt check│
    │              │                │              │──GetUserByEmail()─▶│     │
    │              │                │              │◀─user────────│◀──────│
    │              │                │              │──generateTokens()     │
    │              │                │              │              │      │
    │              │                │◀─{accessToken,refreshToken,user}─│    │
    │              │                │              │              │      │
    │              │◀─tokens───────│              │              │      │
    │              │ setTokens(access, refresh)    │              │      │
    │◀─redirect────│                │              │              │      │
    │  to app      │                │              │              │      │
```

---

## 9. Deployment Diagrams

### Docker Deployment (Production)

```
┌──────────────── Docker Network ────────────────────┐
│                                                       │
│  ┌─────────────────┐  Port 3000  ┌───────────────┐  │
│  │ dietledger-web  │◀───────────│   Browser     │  │
│  │ (Next.js)        │            │   Clients     │  │
│  │                  │            └───────────────┘  │
│  │ server.js        │                                │
│  │ Port 3000        │                                │
│  └────────┬─────────┘                                │
│           │ proxy /api/* → http://dietledger-api:8080│
│           │                                          │
│  ┌────────▼─────────┐  Port 8080                     │
│  │ dietledger-api   │                                │
│  │ (Go binary)       │                                │
│  │ sync-server/main  │                                │
│  └────────┬──────────┘                                │
│           │ postgres://dietledger:***@postgres:5432   │
│           │                                          │
│  ┌────────▼─────────┐                                │
│  │ dietledger-      │                                │
│  │ postgres         │                                │
│  │ PostgreSQL 17    │                                │
│  │ pg-data volume   │                                │
│  └──────────────────┘                                │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Standalone Deployment (PM2 / systemd)

```
┌──────────────── Host ─────────────────────┐
│                                             │
│  PM2 / systemd                              │
│  ┌──────────────────────────────────────┐  │
│  │ dietledger process                    │  │
│  │ server.js (Node.js)                   │  │
│  │ Port 3000                             │  │
│  │ /opt/dietledger/                      │  │
│  │                                       │  │
│  │ ┌──────────────────┐                 │  │
│  │ │ .next/standalone/ │                │  │
│  │ └──────────────────┘                 │  │
│  │ ┌──────────────────┐                 │  │
│  │ │ db/custom.db     │ ← SQLite      │  │
│  │ └──────────────────┘                 │  │
│  └──────────────────┬───────────────────┘  │
│                     │ Port 3000            │
│                     ▼                      │
│              Browser Clients              │
└───────────────────────────────────────────┘

Note: ecosystem.config.cjs:12 sets DATABASE_URL=sqlite:/opt/dietledger/db/custom.db
      deploy/dietledger.service:18 sets same SQLite path
      In this mode the app operates as local-only (no Go API, no PostgreSQL).
```

### Tauri Desktop Deployment

```
┌──────────────── Desktop OS ────────────────────┐
│                                                    │
│  ┌────────────────────────────────────────────┐  │
│  │  DietLedger.exe / DietLedger.app / AppImage │  │
│  │                                              │  │
│  │  ┌──── Tauri Shell (Rust) ────────────────┐ │  │
│  │  │  lib.rs — window 1280x900               │ │  │
│  │  │  Commands: get_app_version, get_data_dir│ │  │
│  │  └───────────────────┬────────────────────┘ │  │
│  │                      │                        │  │
│  │  ┌──── WebView (Chromium) ───────────────┐ │  │
│  │  │                                        │ │  │
│  │  │  Static files from out/ directory      │ │  │
│  │  │  React App (Next.js static export)      │ │  │
│  │  │                                        │ │  │
│  │  │  LocalApiClient → storage.ts             │ │  │
│  │  │         → IndexedDB (browser)           │ │  │
│  │  │                                        │ │  │
│  │  │  [Optional] Sync Engine                 │ │  │
│  │  │    → External sync server (HTTPS)       │ │  │
│  │  │                                        │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

### Full Hybrid Deployment (All Components)

```
┌─────────── Internet / LAN ────────────────────────────────────┐
│                                                                │
│  ┌── Browser ──────────────────────────────────────────────┐  │
│  │  http://host:3000                                       │  │
│  │  → Next.js proxy → Go API → PostgreSQL                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌── Tauri Desktop ─────────────────────────────────────────┐  │
│  │  Static export, local-only (IndexedDB)                   │  │
│  │  Optional: sync to external sync server                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌── Capacitor Mobile ─────────────────────────────────────┐  │
│  │  Static export, local-only (IndexedDB)                   │  │
│  │  Optional: sync to external sync server                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌── Docker Host ──────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  ┌── dietledger-postgres ──┐  ┌── dietledger-api ──────┐ │  │
│  │  │  PostgreSQL 17          │  │  Go binary :8080       │ │  │
│  │  │  pg-data volume        │◄─│  sync-server/main.go   │ │  │
│  │  └────────────────────────┘  └────────────────────────┘ │  │
│  │                                                           │  │
│  │  ┌── dietledger-web ──────────────────────────────────┐   │  │
│  │  │  Next.js standalone :3000                         │   │  │
│  │  │  Proxies /api/* → dietledger-api:8080              │   │  │
│  │  └───────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```
