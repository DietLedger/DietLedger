# Implementation Plan: Server-First Migration

## Overview

5 phases, 42 tasks. Migrates DietLedger from client-first (IndexedDB + Prisma/SQLite) to server-first (Go API + PostgreSQL) with optional local-only mode.

**Constraint:** No existing users. Fresh start. Old data is irrelevant.

## Architecture Decisions

- **Go 1.24+** with `pgx/v5` for PostgreSQL, `modernc.org/sqlite` for local fallback
- **JWT (RS256)** for auth — access tokens (24h) + refresh tokens (30d)
- **Prisma** only used in `DIETLEDGER_LOCAL_ONLY` mode (SQLite)
- **All official data shared/read-only** — USDA, seed data, community items
- **User data scoped to authenticated user** — no cross-user access except shared items
- **Clean break from IndexedDB** — replaced by `api-client.ts` + `write-queue.ts` + `read-cache.ts`
- **Fresh deployment** — no migration scripts, no backwards compatibility with old sync server

## Task List

### Phase 1: Go Server Foundation (PostgreSQL + Store Interface)

---

#### Task 1: Bump Go version and update go.mod

**Description:** Update `sync-server/go.mod` to Go 1.24. Update existing dependencies to latest versions.

**Acceptance criteria:**
- [ ] `go.mod` specifies Go 1.24
- [ ] `modernc.org/sqlite` updated to latest
- [ ] `golang.org/x/crypto` updated to latest
- [ ] `go mod tidy` passes
- [ ] `go build` succeeds

**Verification:** `cd sync-server && go build`

**Dependencies:** None

**Files likely touched:**
- `sync-server/go.mod` (MODIFY)
- `sync-server/go.sum` (MODIFY — auto)

**Estimated scope:** S (2 files)

---

#### Task 2: Add PostgreSQL and JWT dependencies

**Description:** Add `github.com/jackc/pgx/v5`, `github.com/golang-jwt/jwt/v5`, and `golang.org/x/time/rate` to go.mod.

**Acceptance criteria:**
- [ ] `pgx/v5/stdlib` registered as database driver
- [ ] `golang-jwt/jwt/v5` importable
- [ ] `golang.org/x/time/rate` importable
- [ ] `go mod tidy` passes

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 1

**Files likely touched:**
- `sync-server/go.mod` (MODIFY)
- `sync-server/go.sum` (MODIFY — auto)

**Estimated scope:** S (2 files)

---

#### Task 3: Define the Store interface

**Description:** Create `sync-server/repository.go` with the full `Store` interface from the spec. This is the contract both PostgreSQL and SQLite implementations must satisfy.

**Acceptance criteria:**
- [ ] `Store` interface defined with all methods from spec
- [ ] Includes `Close() error`
- [ ] All method signatures use model types from `models.go`
- [ ] Interface compiles

**Verification:** `cd sync-server && go build`

**Dependencies:** None

**Files likely touched:**
- `sync-server/repository.go` (NEW)

**Estimated scope:** S (1 file)

---

#### Task 4: Extend Go models for all entities

**Description:** Add Go structs for all Prisma models to `models.go`: Recipe, Ingredient, FoodItem, PersonProfile, FoodLogEntry, WeightEntry, MealPlan, DayPlanEntry, MealGroup, RecipeBook, Chapter, ChapterRecipe, ChapterPage, Category, RecipeCategory, CustomFood, GroceryChecklist, BookPage, ApiKey. Add `UserID` fields where needed for multi-tenancy. Add `SharedWithCommunity` field to CustomFood and FoodLogEntry.

**Acceptance criteria:**
- [ ] All 18+ Prisma models have corresponding Go structs with JSON tags
- [ ] User-owned models include `UserID string` field
- [ ] CustomFood has `SharedWithCommunity bool` field
- [ ] Request/response types for all CRUD operations (e.g., `CreateRecipeRequest`)
- [ ] Pagination types (`PaginationRequest`, `PaginatedResponse`)
- [ ] All models compile

**Verification:** `cd sync-server && go build`

**Dependencies:** None

**Files likely touched:**
- `sync-server/models.go` (EXTEND — major)

**Estimated scope:** M (1 large file)

---

#### Task 5: Create PostgreSQL migration files

**Description:** Create SQL migration files in `sync-server/migrations/` that create all tables matching the Prisma schema, plus user-scoping columns and shared-community flags.

**Acceptance criteria:**
- [ ] `000001_init.up.sql` / `.down.sql` — users, devices, API keys
- [ ] `000002_recipes.up.sql` / `.down.sql` — recipes, ingredients (with user_id)
- [ ] `000003_foods.up.sql` / `.down.sql` — food_items (shared, no user_id), custom_foods (user_id + shared_with_community)
- [ ] `000004_nutrition.up.sql` / `.down.sql` — person_profiles, food_log_entries (user_id + shared_with_community), weight_entries
- [ ] `000005_meal_plans.up.sql` / `.down.sql` — meal_plans, day_plan_entries, meal_groups
- [ ] `000006_books.up.sql` / `.down.sql` — recipe_books, chapters, chapter_recipes, chapter_pages, categories, recipe_categories
- [ ] `000007_sharing.up.sql` / `.down.sql` — shared_recipes, recipe_ratings, community_categories, book_pages, grocery_checklists
- [ ] `000008_fts.up.sql` / `.down.sql` — tsvector index on food_items.description, GIN index
- [ ] All foreign keys, indexes, and constraints match Prisma schema
- [ ] All user-owned tables have `user_id` column with FK to users
- [ ] `enum` types use PostgreSQL native enums or CHECK constraints

**Verification:** `psql -f 000001_init.up.sql` against empty PostgreSQL database

**Dependencies:** Task 4

**Files likely touched:**
- `sync-server/migrations/` (NEW — 16 files)

**Estimated scope:** M (8 up + 8 down files)

---

#### Task 6: Implement PostgreSQL Store

**Description:** Create `sync-server/store_postgres.go` implementing the `Store` interface using `pgx/v5`. Start with auth-related methods (users, devices) and recipe CRUD.

**Acceptance criteria:**
- [ ] `NewPostgresStore(connString string) (*PostgresStore, error)` — connects to PostgreSQL
- [ ] All user/device methods implemented (CreateUser, GetUserByAPIKey, etc.)
- [ ] All recipe methods implemented (ListRecipes, GetRecipe, CreateRecipe, UpdateRecipe, DeleteRecipe)
- [ ] All ingredient methods implemented
- [ ] Proper error handling with `sql.ErrNoRows`
- [ ] Connection pooling via pgx pool
- [ ] All queries use parameterized SQL (no string interpolation)

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 3, Task 5

**Files likely touched:**
- `sync-server/store_postgres.go` (NEW — large)

**Estimated scope:** L (1 very large file)

---

#### Task 7: Implement remaining PostgreSQL Store methods

**Description:** Complete `store_postgres.go` with all remaining entity methods: FoodItem search (with tsvector), PersonProfile, FoodLogEntry, WeightEntry, MealPlan, DayPlanEntry, MealGroup, RecipeBook, Chapter, Category, CustomFood, GroceryChecklist, sharing.

**Acceptance criteria:**
- [ ] Food search uses `tsvector @@ plainto_tsquery` with GIN index
- [ ] All nutrition profile methods
- [ ] All food log and weight entry methods
- [ ] All meal plan methods
- [ ] All book/chapter/category methods
- [ ] All custom food methods including `ShareCustomFood` and `ListSharedCustomFoods`
- [ ] All grocery checklist methods
- [ ] All sharing methods (from existing store.go, adapted for PostgreSQL)
- [ ] Full `Store` interface satisfied

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 6

**Files likely touched:**
- `sync-server/store_postgres.go` (EXTEND)

**Estimated scope:** L (same file, more methods)

---

#### Task 8: Extract existing SQLite store to implement Store interface

**Description:** Refactor existing `store.go` to implement the `Store` interface. Rename `SQLiteStore` methods to match interface. Keep existing sync tables for backwards compat but add all CRUD methods.

**Acceptance criteria:**
- [ ] `SQLiteStore` implements full `Store` interface
- [ ] Existing sync methods preserved (register, push, pull, etc.)
- [ ] All new CRUD methods use SQLite-compatible SQL
- [ ] Food search uses SQLite FTS5 (virtual table or LIKE fallback)
- [ ] `go build` succeeds

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 3, Task 4

**Files likely touched:**
- `sync-server/store.go` (REFACTOR — major)
- `sync-server/store_sqlite.go` (NEW — extracted CRUD methods)

**Estimated scope:** L (2 files)

---

#### Task 9: Add JWT auth middleware

**Description:** Add JWT-based authentication to the Go server. `/api/auth/register` and `/api/auth/login` are public. All other routes require a valid JWT. Issue RS256-signed tokens.

**Acceptance criteria:**
- [ ] `POST /api/auth/register` — email + password → JWT access token (24h) + refresh token (30d)
- [ ] `POST /api/auth/login` — email + password → JWT tokens
- [ ] `POST /api/auth/refresh` — refresh token → new access token
- [ ] JWT payload: `{ sub: userID, email, exp, iat }`
- [ ] `requireAuth` middleware validates JWT from `Authorization: Bearer <token>` header
- [ ] Existing API key auth still works for programmatic access
- [ ] RSA key pair loaded from env vars or generated on first run
- [ ] Passwords hashed with bcrypt (existing pattern)

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 2, Task 6

**Files likely touched:**
- `sync-server/auth.go` (NEW)
- `sync-server/server.go` (MODIFY — add auth routes, update middleware)

**Estimated scope:** M (2 files)

---

#### Task 10: Add rate limiting middleware

**Description:** Add per-user rate limiting using `golang.org/x/time/rate`. Different limits for different endpoint categories.

**Acceptance criteria:**
- [ ] Global rate limiter: 100 req/min per IP
- [ ] Write endpoints (POST/PUT/DELETE): 30 req/min per user
- [ ] Auth endpoints: 10 req/min per IP (brute force protection)
- [ ] Returns `429 Too Many Requests` with `Retry-After` header
- [ ] Rate limiter state is in-memory (sufficient for single-instance deployment)

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 9

**Files likely touched:**
- `sync-server/ratelimit.go` (NEW)
- `sync-server/server.go` (MODIFY — wrap routes)

**Estimated scope:** S (2 files)

---

#### Task 11: Add input validation helpers

**Description:** Create validation utilities for common input patterns. All handler methods should validate before processing.

**Acceptance criteria:**
- [ ] `validateEmail(email string) error`
- [ ] `validatePassword(password string) error` — min 8 chars, mixed case, number
- [ ] `validatePagination(page, perPage int) (int, int)`
- [ ] `validateRequired(fields map[string]string) error`
- [ ] `validateFloatRange(value, min, max float64, name string) error`
- [ ] `sanitizeString(s string) string` — trim whitespace, limit length

**Verification:** `cd sync-server && go build`

**Dependencies:** None

**Files likely touched:**
- `sync-server/validation.go` (NEW)

**Estimated scope:** S (1 file)

---

#### Task 12: Add CRUD handlers — recipes and ingredients

**Description:** Create `handlers_crud.go` with REST handlers for recipe and ingredient CRUD. Follow existing handler patterns.

**Acceptance criteria:**
- [ ] `GET /api/recipes` — list user's recipes with pagination
- [ ] `GET /api/recipes/:id` — get single recipe with ingredients
- [ ] `POST /api/recipes` — create recipe with ingredients (server-generated ID)
- [ ] `PUT /api/recipes/:id` — update recipe + ingredients (full replacement)
- [ ] `DELETE /api/recipes/:id` — cascade delete recipe + ingredients
- [ ] `GET /api/recipes/:id/ingredients` — list ingredients for recipe
- [ ] `POST /api/recipes/:id/ingredients` — add ingredient
- [ ] `PUT /api/recipes/:id/ingredients/:ingredientId` — update ingredient
- [ ] `DELETE /api/recipes/:id/ingredients/:ingredientId` — delete ingredient
- [ ] All endpoints require auth
- [ ] Input validation on all write endpoints
- [ ] Proper HTTP status codes (200, 201, 400, 401, 404, 500)

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 9, Task 11

**Files likely touched:**
- `sync-server/handlers_crud.go` (NEW)

**Estimated scope:** L (1 large file)

---

#### Task 13: Add CRUD handlers — nutrition (profiles, food logs, weight)

**Description:** Add handlers for PersonProfile, FoodLogEntry, WeightEntry CRUD.

**Acceptance criteria:**
- [ ] `GET /api/profiles` — list user's nutrition profiles
- [ ] `GET /api/profiles/:id` — get profile
- [ ] `POST /api/profiles` — create profile
- [ ] `PUT /api/profiles/:id` — update profile
- [ ] `DELETE /api/profiles/:id` — delete profile + cascade
- [ ] `GET /api/profiles/:id/log?date=YYYY-MM-DD` — food log entries for date
- [ ] `POST /api/profiles/:id/log` — create food log entry
- [ ] `PUT /api/log/:id` — update food log entry
- [ ] `DELETE /api/log/:id` — delete food log entry
- [ ] `GET /api/profiles/:id/weight?from=&to=` — weight entries in range
- [ ] `POST /api/profiles/:id/weight` — create weight entry
- [ ] `PUT /api/weight/:id` — update weight entry
- [ ] `DELETE /api/weight/:id` — delete weight entry

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 12

**Files likely touched:**
- `sync-server/handlers_crud.go` (EXTEND)

**Estimated scope:** M (same file, more handlers)

---

#### Task 14: Add CRUD handlers — meal plans, books, categories, custom foods, grocery

**Description:** Add handlers for remaining entities.

**Acceptance criteria:**
- [ ] Meal plans: full CRUD + day plan entries + meal groups
- [ ] Recipe books: full CRUD + chapters + chapter recipes + chapter pages
- [ ] Categories: full CRUD (global, not user-scoped)
- [ ] Custom foods: full CRUD + `POST /api/custom-foods/:id/share` flag for community
- [ ] `GET /api/custom-foods/community` — browse shared custom foods
- [ ] Grocery checklists: get/upsert by weekStart
- [ ] Book pages: full CRUD

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 13

**Files likely touched:**
- `sync-server/handlers_crud.go` (EXTEND)
- `sync-server/handlers_books.go` (NEW — if handlers_crud.go gets too large)

**Estimated scope:** L (many handlers)

---

#### Task 15: Add food search handlers

**Description:** Create `handlers_food.go` with food search (USDA proxy + local DB search), food item CRUD, and seed management.

**Acceptance criteria:**
- [ ] `GET /api/foods/search?q=&page=&perPage=` — search food_items via tsvector (Postgres) or FTS5/LIKE (SQLite)
- [ ] `GET /api/foods/:fdcId` — get food by FDC ID
- [ ] `GET /api/foods/upc/:gtinUpc` — get food by barcode
- [ ] `POST /api/foods` — create custom food item (admin or seed process)
- [ ] `POST /api/foods/seed` — seed from USDA data (bulk import)
- [ ] `GET /api/foods/seed/:jobId` — seed job status
- [ ] Results paginated with total count

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 12, Task 7

**Files likely touched:**
- `sync-server/handlers_food.go` (NEW)

**Estimated scope:** M (1 file)

---

#### Task 16: Refactor server.go routing

**Description:** Update `server.go` to use the `Store` interface, add all new CRUD routes, remove old sync-only routes (sync is now standard CRUD), keep sharing routes.

**Acceptance criteria:**
- [ ] `Server` struct holds `Store` interface (not `*SQLiteStore`)
- [ ] `NewServer` accepts `Store` interface
- [ ] All CRUD routes registered
- [ ] Auth routes (register, login, refresh) registered
- [ ] Old sync routes removed (push, pull, conflicts, full-dump) — replaced by CRUD
- [ ] Sharing routes kept (share, community)
- [ ] CORS middleware kept
- [ ] Rate limiting applied
- [ ] `go build` succeeds

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 14, Task 15, Task 10

**Files likely touched:**
- `sync-server/server.go` (REWRITE)

**Estimated scope:** M (1 file, significant changes)

---

#### Task 17: Update main.go for dual DB support

**Description:** Update `main.go` to support both PostgreSQL and SQLite via env vars. Add migration runner.

**Acceptance criteria:**
- [ ] `DB_DRIVER` env var: `postgres` (default) or `sqlite`
- [ ] `DATABASE_URL` points to appropriate DB
- [ ] On startup with PostgreSQL: run migration files from `migrations/`
- [ ] On startup with SQLite: run existing `InitDB()` schema creation
- [ ] `JWT_SIGNING_KEY` or `JWT_SIGNING_KEY_PATH` env var for RSA key
- [ ] Clean shutdown preserved

**Verification:** `cd sync-server && go build`

**Dependencies:** Task 16, Task 9

**Files likely touched:**
- `sync-server/main.go` (MODIFY)
- `sync-server/migrate.go` (NEW — migration runner)

**Estimated scope:** M (2 files)

---

### Checkpoint: Go Server

- [ ] `cd sync-server && go build` succeeds
- [ ] Server starts with PostgreSQL backend
- [ ] Server starts with SQLite backend
- [ ] Auth endpoints work (register, login, refresh)
- [ ] All CRUD endpoints registered and compilable
- [ ] Sharing endpoints preserved

---

### Phase 2: Go Server Tests

---

#### Task 18: Write store contract tests

**Description:** Create `sync-server/store_test.go` with table-driven tests that validate the `Store` interface contract. These tests run against both PostgreSQL and SQLite implementations.

**Acceptance criteria:**
- [ ] Test helper that creates a test store (Postgres test DB or SQLite in-memory)
- [ ] User CRUD tests: Create, GetByID, GetByAPIKey, duplicate email handling
- [ ] Recipe CRUD tests: Create, List, Get, Update, Delete, user scoping
- [ ] Ingredient tests: Create, List, Update, Delete, cascade on recipe delete
- [ ] Profile tests: Create, List, Get, Update, Delete, cascade
- [ ] Food log tests: Create, List by date, Update, Delete
- [ ] Weight entry tests: Create, List by range, Update, Delete, unique date constraint
- [ ] All tests verify user-scoping (user A can't see user B's data)

**Verification:** `cd sync-server && go test -v -count=1 ./...`

**Dependencies:** Task 17

**Files likely touched:**
- `sync-server/store_test.go` (NEW)
- `sync-server/store_postgres_test.go` (NEW — PostgreSQL test setup)
- `sync-server/store_sqlite_test.go` (NEW — SQLite test setup)

**Estimated scope:** L (3 files, many test cases)

---

#### Task 19: Write handler tests

**Description:** Create `sync-server/handlers_test.go` with HTTP handler tests using `httptest`. Test all CRUD endpoints.

**Acceptance criteria:**
- [ ] Test helper: creates a server with in-memory SQLite store + test user + JWT
- [ ] Recipe handler tests: list, get, create, update, delete (happy path + error cases)
- [ ] Profile handler tests: full CRUD
- [ ] Food log handler tests: full CRUD + date filtering
- [ ] Weight entry handler tests: full CRUD + date range filtering
- [ ] Auth handler tests: register, login (success + failures), token refresh
- [ ] Auth middleware tests: missing token, expired token, invalid token
- [ ] Rate limiter tests: returns 429 when limit exceeded
- [ ] Input validation tests: missing fields, invalid data types, oversized payloads

**Verification:** `cd sync-server && go test -v -count=1 ./...`

**Dependencies:** Task 18

**Files likely touched:**
- `sync-server/handlers_test.go` (NEW — large)
- `sync-server/handlers_crud_test.go` (NEW)
- `sync-server/handlers_food_test.go` (NEW)
- `sync-server/auth_test.go` (NEW)

**Estimated scope:** L (4 files)

---

#### Task 20: Write food search tests

**Description:** Test food search functionality with both PostgreSQL tsvector and SQLite LIKE/FTS5.

**Acceptance criteria:**
- [ ] Seed test food items
- [ ] Search returns matching results ranked by relevance
- [ ] Pagination works correctly
- [ ] Empty query returns paginated results
- [ ] Special characters in query don't break search
- [ ] FDC ID lookup works
- [ ] UPC lookup works

**Verification:** `cd sync-server && go test -v -count=1 ./...`

**Dependencies:** Task 19

**Files likely touched:**
- `sync-server/handlers_food_test.go` (EXTEND)

**Estimated scope:** S (1 file)

---

### Checkpoint: Go Server Tests

- [ ] `cd sync-server && go test -count=1 ./...` passes
- [ ] All CRUD endpoints tested
- [ ] Auth tested
- [ ] Food search tested
- [ ] User scoping verified

---

### Phase 3: Client API Layer

---

#### Task 21: Create API client abstraction

**Description:** Create `src/lib/api-client.ts` with the `ApiClient` interface and provider switching logic.

**Acceptance criteria:**
- [ ] `ApiClient` interface defined with all methods from spec
- [ ] `getApiClient()` returns Go or Local implementation based on `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY`
- [ ] Environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY`
- [ ] TypeScript types for all API request/response shapes
- [ ] Singleton pattern — single client instance per mode

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** None (can start in parallel with Phase 1/2)

**Files likely touched:**
- `src/lib/api-client.ts` (NEW)

**Estimated scope:** M (1 file, large interface)

---

#### Task 22: Implement Go API client

**Description:** Create `src/lib/api-client-go.ts` implementing `ApiClient` by calling the Go server's REST API.

**Acceptance criteria:**
- [ ] All `ApiClient` methods implemented as fetch calls to Go server
- [ ] JWT token management: stored in localStorage, attached to all requests
- [ ] Auto-refresh on 401 response (try refresh token, then redirect to login)
- [ ] Proper error handling: network errors, 4xx, 5xx
- [ ] Request/response type safety
- [ ] Base URL from `NEXT_PUBLIC_API_URL`

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** Task 21

**Files likely touched:**
- `src/lib/api-client-go.ts` (NEW — large)

**Estimated scope:** L (1 very large file)

---

#### Task 23: Implement Local API client

**Description:** Create `src/lib/api-client-local.ts` implementing `ApiClient` by calling existing Next.js API routes (`/api/...`).

**Acceptance criteria:**
- [ ] All `ApiClient` methods implemented as fetch calls to `/api/...` routes
- [ ] No auth tokens needed (local mode, single user)
- [ ] Same request/response shapes as Go client
- [ ] Uses existing Prisma-backed API routes unchanged

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** Task 21

**Files likely touched:**
- `src/lib/api-client-local.ts` (NEW — large)

**Estimated scope:** L (1 large file, mirrors existing API route shapes)

---

#### Task 24: Implement write queue (offline support)

**Description:** Create `src/lib/write-queue.ts` — IndexedDB-backed queue for pending writes when API is unreachable.

**Acceptance criteria:**
- [ ] IndexedDB store `pendingWrites` with auto-increment ID
- [ ] `enqueue(method, path, body)` — adds to queue
- [ ] `drain()` — processes all pending writes sequentially, removes on success
- [ ] Exponential backoff: 1s, 2s, 4s, 8s, 16s, 60s max
- [ ] Max retry count: 10, then mark as permanently failed
- [ ] `getStatus()` — returns `{ pending: number, failed: number }`
- [ ] `onStatusChange` callback for UI sync indicator
- [ ] Auto-drain on connectivity change (`navigator.onLine` + `online`/`offline` events)
- [ ] `clear()` — remove all pending/failed writes

**Verification:** `npm run lint` passes

**Dependencies:** Task 21

**Files likely touched:**
- `src/lib/write-queue.ts` (NEW)

**Estimated scope:** M (1 file)

---

#### Task 25: Implement read cache

**Description:** Create `src/lib/read-cache.ts` — lightweight IndexedDB cache for last-known-good data. Used when offline.

**Acceptance criteria:**
- [ ] IndexedDB store `readCache` with composite key (path)
- [ ] `set(key, data, ttlMs)` — cache response with TTL
- [ ] `get(key)` — return cached data if not expired
- [ ] `invalidate(prefix?)` — remove entries by prefix or all
- [ ] Default TTL: 5 minutes for lists, 1 hour for individual items
- [ ] Max cache size: 50MB (evict oldest when exceeded)

**Verification:** `npm run lint` passes

**Dependencies:** None

**Files likely touched:**
- `src/lib/read-cache.ts` (NEW)

**Estimated scope:** S (1 file)

---

#### Task 26: Wire write queue into Go API client

**Description:** Modify `api-client-go.ts` to use write queue: try API first, on failure enqueue. Use read cache for offline reads.

**Acceptance criteria:**
- [ ] Write operations (POST/PUT/DELETE): try API, on network failure enqueue to write queue
- [ ] Read operations (GET): try API first, on failure fall back to read cache
- [ ] After successful API write: invalidate relevant cache entries
- [ ] Sync indicator state exposed via `getSyncStatus()`
- [ ] Only active in Go client mode (not local mode)

**Verification:** `npm run lint` passes

**Dependencies:** Task 22, Task 24, Task 25

**Files likely touched:**
- `src/lib/api-client-go.ts` (MODIFY — integrate queue + cache)

**Estimated scope:** M (1 file)

---

#### Task 27: Write queue and read cache tests

**Description:** Write unit tests for write queue and read cache logic using Bun test runner or Vitest.

**Acceptance criteria:**
- [ ] Write queue: enqueue → drain → verify all calls made
- [ ] Write queue: enqueue → fail → verify retry with backoff
- [ ] Write queue: enqueue → max retries → mark as failed
- [ ] Write queue: clear removes all entries
- [ ] Read cache: set → get → hit
- [ ] Read cache: set → get after TTL → miss
- [ ] Read cache: invalidate by prefix removes correct entries
- [ ] Read cache: size eviction works

**Verification:** Test runner passes

**Dependencies:** Task 24, Task 25

**Files likely touched:**
- `src/lib/write-queue.test.ts` (NEW)
- `src/lib/read-cache.test.ts` (NEW)

**Estimated scope:** M (2 files)

---

### Checkpoint: Client API Layer

- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] API client switches between Go and Local modes
- [ ] Write queue drains successfully
- [ ] Read cache hits/misses correctly
- [ ] Go client integrates queue + cache

---

### Phase 4: Wire Frontend to API Client

---

#### Task 28: Migrate recipe-store to use API client

**Description:** Modify `src/lib/recipe-store.ts` to call `getApiClient()` instead of IndexedDB `storage.ts` functions.

**Acceptance criteria:**
- [ ] `loadRecipes()` calls `api.getRecipes()`
- [ ] `addRecipe()` calls `api.createRecipe()`
- [ ] `updateRecipe()` calls `api.updateRecipe()`
- [ ] `deleteRecipe()` calls `api.deleteRecipe()`
- [ ] Ingredient operations routed through API
- [ ] Store interface unchanged (same actions, same state shape)
- [ ] All direct `storage.ts` imports removed from this file

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** Task 21, Task 22, Task 23

**Files likely touched:**
- `src/lib/recipe-store.ts` (REWRITE internals)

**Estimated scope:** M (1 file, significant changes)

---

#### Task 29: Migrate nutrition-store to use API client

**Description:** Modify `src/lib/nutrition-store.ts` to use API client for profiles, food logs, weight entries.

**Acceptance criteria:**
- [ ] Profile CRUD through API
- [ ] Food log CRUD through API (with date filtering)
- [ ] Weight entry CRUD through API (with date range filtering)
- [ ] All `storage.ts` imports removed
- [ ] Store interface unchanged

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** Task 21, Task 22, Task 23

**Files likely touched:**
- `src/lib/nutrition-store.ts` (REWRITE internals)

**Estimated scope:** M (1 file)

---

#### Task 30: Migrate meal-plan-store to use API client

**Description:** Modify `src/lib/meal-plan-store.ts` to use API client.

**Acceptance criteria:**
- [ ] Meal plan CRUD through API
- [ ] Day plan entry CRUD through API
- [ ] Meal group CRUD through API
- [ ] Grocery checklist through API
- [ ] All `storage.ts` imports removed
- [ ] Store interface unchanged

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** Task 21, Task 22, Task 23

**Files likely touched:**
- `src/lib/meal-plan-store.ts` (REWRITE internals)

**Estimated scope:** M (1 file)

---

#### Task 31: Migrate book-store and dietary-store to use API client

**Description:** Modify `src/lib/book-store.ts` and `src/lib/dietary-store.ts` to use API client.

**Acceptance criteria:**
- [ ] Book/chapter/chapter-recipe/chapter-page CRUD through API
- [ ] Category CRUD through API
- [ ] Dietary profile CRUD through API
- [ ] Allergen rule CRUD through API
- [ ] All `storage.ts` imports removed from both files

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** Task 21, Task 22, Task 23

**Files likely touched:**
- `src/lib/book-store.ts` (REWRITE internals)
- `src/lib/dietary-store.ts` (REWRITE internals)

**Estimated scope:** M (2 files)

---

#### Task 32: Migrate template-store to use API client

**Description:** Modify `src/lib/template-store.ts` to use API client for template CRUD.

**Acceptance criteria:**
- [ ] Template CRUD through API (or determine if templates are client-only)
- [ ] All `storage.ts` imports removed

**Verification:** `npm run lint` passes

**Dependencies:** Task 21, Task 22, Task 23

**Files likely touched:**
- `src/lib/template-store.ts` (MODIFY)

**Estimated scope:** S (1 file)

---

#### Task 33: Add sync indicator component

**Description:** Create `src/components/sync-indicator.tsx` — small badge showing sync status.

**Acceptance criteria:**
- [ ] Green check icon when queue is empty
- [ ] Yellow spinner with count when N writes pending
- [ ] Red retry icon when writes permanently failed
- [ ] Click on red to retry failed writes
- [ ] Subscribes to write queue status changes
- [ ] Hidden in local mode

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** Task 24, Task 26

**Files likely touched:**
- `src/components/sync-indicator.tsx` (NEW)

**Estimated scope:** S (1 file)

---

#### Task 34: Add local mode banner component

**Description:** Create `src/components/local-mode-banner.tsx` — persistent warning banner for local-only mode.

**Acceptance criteria:**
- [ ] Shows "Local mode — data is stored on this device only. Export regularly."
- [ ] Only visible when `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true`
- [ ] Export button triggers JSON download of all user data
- [ ] Import button accepts JSON file and restores data
- [ ] Dismissible per session but reappears on reload

**Verification:** `npm run lint` passes, `npm run build` succeeds

**Dependencies:** Task 21, Task 23

**Files likely touched:**
- `src/components/local-mode-banner.tsx` (NEW)
- `src/lib/export-import.ts` (NEW — export/import logic)

**Estimated scope:** M (2 files)

---

#### Task 35: Remove deprecated files

**Description:** Delete or mark as deprecated: `storage.ts` (the old 2538-line IndexedDB module), `sync-engine.ts`, `sync-store.ts`, `sync-conflict.ts`.

**Acceptance criteria:**
- [ ] `src/lib/storage.ts` — deleted (or gutted to only write-queue schema setup)
- [ ] `src/lib/sync-engine.ts` — deleted
- [ ] `src/lib/sync-store.ts` — deleted
- [ ] `src/lib/sync-conflict.ts` — deleted
- [ ] No remaining imports of these files anywhere in the codebase
- [ ] `npm run build` succeeds after removal

**Verification:** `npm run lint` passes, `npm run build` succeeds, grep for removed imports

**Dependencies:** Task 28, Task 29, Task 30, Task 31, Task 32

**Files likely touched:**
- `src/lib/storage.ts` (DELETE or GUT)
- `src/lib/sync-engine.ts` (DELETE)
- `src/lib/sync-store.ts` (DELETE)
- `src/lib/sync-conflict.ts` (DELETE)

**Estimated scope:** M (4 files deleted)

---

#### Task 36: Delete Next.js API routes (server mode)

**Description:** In server mode, the Next.js API routes under `src/app/api/` are not needed (except for local mode). Add conditional compilation or routing.

**Acceptance criteria:**
- [ ] API routes under `src/app/api/` only activate when `DIETLEDGER_LOCAL_ONLY=true`
- [ ] In server mode, `/api/*` requests are not handled by Next.js
- [ ] Or: API routes return 404 with message "Running in server mode. Use the API server."
- [ ] `npm run build` succeeds in both modes

**Verification:** `npm run build` with and without `DIETLEDGER_LOCAL_ONLY`

**Dependencies:** Task 28, Task 29, Task 30, Task 31, Task 32

**Files likely touched:**
- `src/app/api/` (MODIFY — add guard to all routes)
- `src/app/api/route.ts` (MODIFY — status endpoint reports mode)

**Estimated scope:** M (modify route.ts files or add middleware guard)

---

### Checkpoint: Frontend Wired

- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] All Zustand stores use API client
- [ ] No remaining `storage.ts` imports
- [ ] Sync indicator visible in server mode
- [ ] Local mode banner visible in local mode
- [ ] App renders and loads data from API

---

### Phase 5: Docker, Config, and Polish

---

#### Task 37: Update docker-compose.yml

**Description:** Update Docker Compose to include PostgreSQL service, update Go server image, configure networking.

**Acceptance criteria:**
- [ ] `postgres` service: PostgreSQL 17, named volume for data persistence
- [ ] `api` service: Go API server, depends on postgres, env vars for DB connection
- [ ] `web` service: Next.js frontend, env vars for API URL
- [ ] All services on same Docker network
- [ ] Health checks for all services
- [ ] `.env.docker` example file with all required env vars
- [ ] `docker compose up` starts everything

**Verification:** `docker compose up` (if Docker available)

**Dependencies:** Task 17

**Files likely touched:**
- `docker-compose.yml` (REWRITE)
- `.env.docker` (NEW — example env file)
- `sync-server/Dockerfile` (MODIFY — add migration step)

**Estimated scope:** M (3 files)

---

#### Task 38: Update Dockerfile for Go server

**Description:** Update `sync-server/Dockerfile` to support PostgreSQL driver, migration files, and proper build.

**Acceptance criteria:**
- [ ] Multi-stage build: builder → runtime
- [ ] Migration files copied into image
- [ ] `DB_DRIVER` and `DATABASE_URL` env vars expected
- [ ] Health check endpoint `/api/health`
- [ ] Non-root user for runtime

**Verification:** `docker build -t dietledger-api ./sync-server`

**Dependencies:** Task 17

**Files likely touched:**
- `sync-server/Dockerfile` (MODIFY)

**Estimated scope:** S (1 file)

---

#### Task 39: Update main Dockerfile for Next.js

**Description:** Update root `Dockerfile` to support mode switching via env vars.

**Acceptance criteria:**
- [ ] `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` build arg
- [ ] `NEXT_PUBLIC_API_URL` build arg
- [ ] In local mode: Prisma SQLite setup, no Go server dependency
- [ ] In server mode: API URL configured, no Prisma DB setup needed

**Verification:** `docker build --build-arg NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true .`

**Dependencies:** Task 36

**Files likely touched:**
- `Dockerfile` (MODIFY)

**Estimated scope:** S (1 file)

---

#### Task 40: Add .env.example for server mode

**Description:** Update `.env.example` to document all new env vars.

**Acceptance criteria:**
- [ ] `DATABASE_URL` (PostgreSQL connection string)
- [ ] `DB_DRIVER` (postgres or sqlite)
- [ ] `JWT_SIGNING_KEY` or `JWT_SIGNING_KEY_PATH`
- [ ] `NEXT_PUBLIC_API_URL` (Go server URL)
- [ ] `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` (true/false)
- [ ] `FDA_API_KEY` (kept from existing)
- [ ] All vars documented with descriptions

**Verification:** File exists and is readable

**Dependencies:** None

**Files likely touched:**
- `.env.example` (REWRITE)

**Estimated scope:** S (1 file)

---

#### Task 41: Update next.config.ts for API proxy in dev

**Description:** Add a dev proxy so the Next.js dev server proxies `/api/*` to the Go server when in server mode (avoids CORS issues during development).

**Acceptance criteria:**
- [ ] `next.config.ts` rewrites `/api/*` to Go server URL in dev mode (when `DIETLEDGER_LOCAL_ONLY` is not set)
- [ ] In local mode, no proxy — Next.js handles its own API routes
- [ ] Works with `npm run dev`

**Verification:** `npm run dev` with Go server running

**Dependencies:** Task 36

**Files likely touched:**
- `next.config.ts` (MODIFY)

**Estimated scope:** S (1 file)

---

#### Task 42: Final integration test — full stack

**Description:** Manual integration test of the complete system. Document the test procedure.

**Acceptance criteria:**
- [ ] Start PostgreSQL + Go server + Next.js
- [ ] Register a new user via Go API
- [ ] Login and get JWT
- [ ] Create a recipe via Go API
- [ ] View recipe in Next.js frontend
- [ ] Create a food log entry
- [ ] Stop Go server, create another food log entry (should queue)
- [ ] Restart Go server, verify queued entry syncs
- [ ] Switch to local mode, verify app works with SQLite
- [ ] Export data in local mode
- [ ] All existing features work (dietary compliance, PDF export, QR sharing)

**Verification:** Manual walkthrough documented

**Dependencies:** All previous tasks

**Files likely touched:**
- None (verification only)

**Estimated scope:** S (no code)

---

## Dependency Graph

```
Phase 1: Go Server Foundation
  Task 1 (bump Go) ──────────┐
  Task 2 (add deps) ─────────┤ ← T1
  Task 3 (Store interface) ──┤
  Task 4 (models) ───────────┤
  Task 5 (migrations) ───────┤ ← T4
  Task 6 (PG store core) ────┤ ← T3, T5
  Task 7 (PG store rest) ────┤ ← T6
  Task 8 (SQLite store) ─────┤ ← T3, T4
  Task 9 (JWT auth) ─────────┤ ← T2, T6
  Task 10 (rate limit) ──────┤ ← T9
  Task 11 (validation) ──────┤
  Task 12 (handlers: recipes) ┤ ← T9, T11
  Task 13 (handlers: nutrition)┤ ← T12
  Task 14 (handlers: rest) ──┤ ← T13
  Task 15 (handlers: food) ──┤ ← T12, T7
  Task 16 (routing) ─────────┤ ← T14, T15, T10
  Task 17 (main.go) ─────────┘ ← T16, T9

Phase 2: Tests
  Task 18 (store tests) ─────┐ ← T17
  Task 19 (handler tests) ───┤ ← T18
  Task 20 (food search tests)┘ ← T19

Phase 3: Client (parallel with Phase 2)
  Task 21 (API client iface) ─┐
  Task 22 (Go client) ────────┤ ← T21
  Task 23 (Local client) ─────┤ ← T21
  Task 24 (write queue) ──────┤ ← T21
  Task 25 (read cache) ───────┤
  Task 26 (wire queue to Go) ─┤ ← T22, T24, T25
  Task 27 (queue/cache tests) ┘ ← T24, T25

Phase 4: Wire Frontend
  Task 28 (recipe-store) ─────┐ ← T21, T22, T23
  Task 29 (nutrition-store) ──┤ ← T21, T22, T23
  Task 30 (meal-plan-store) ──┤ ← T21, T22, T23
  Task 31 (book/dietary-store)┤ ← T21, T22, T23
  Task 32 (template-store) ───┤ ← T21, T22, T23
  Task 33 (sync indicator) ───┤ ← T24, T26
  Task 34 (local mode banner) ┤ ← T21, T23
  Task 35 (remove deprecated) ┤ ← T28-T32
  Task 36 (delete API routes) ┘ ← T28-T32

Phase 5: Docker + Polish
  Task 37 (docker-compose) ───┐ ← T17
  Task 38 (Go Dockerfile) ────┤ ← T17
  Task 39 (Next Dockerfile) ──┤ ← T36
  Task 40 (.env.example) ─────┤
  Task 41 (next.config proxy) ┤ ← T36
  Task 42 (integration test) ─┘ ← All
```

## Parallelization Opportunities

| Stream | Tasks | Rationale |
|--------|-------|-----------|
| Go server | 1→2→3+4→5→6→7, 8 (parallel) | Core backend, sequential |
| Go tests | 18→19→20 (after Phase 1) | Depends on complete server |
| Client | 21→22/23/24/25 (parallel)→26→27 | Independent of Go tests |
| Frontend wire | 28-32 (parallel)→33/34→35→36 | Depends on client layer |
| Docker/polish | 37-41 (after Phase 1 + 4) | Infrastructure |

**Recommended parallel streams:**
1. Stream A: Tasks 1→2→3+4→5→6→7→8→9→10→11→12→13→14→15→16→17 (Go server)
2. Stream B: Tasks 21→22+23+24+25→26→27 (Client, starts immediately)
3. Stream C: Tasks 28→29→30→31→32→33+34→35→36 (Frontend wire, after Stream B)
4. Stream D: Tasks 18→19→20 (Go tests, after Stream A)
5. Stream E: Tasks 37→38→39→40→41→42 (Docker, after Streams A+C)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prisma schema ↔ Go schema mismatch | High | Go migrations derived from Prisma schema; type comparison test |
| IndexedDB removal breaks features | High | Store-by-store migration; each store verified independently |
| JWT key management in production | Medium | Auto-generate on first run; document key rotation |
| PostgreSQL migration ordering | Medium | Numbered migration files; test against clean DB |
| Capacitor app can't reach Go server | Medium | `NEXT_PUBLIC_API_URL` must be publicly accessible; document config |
| Next.js API routes guard breaks local mode | Medium | Explicit `DIETLEDGER_LOCAL_ONLY` env check in middleware |
| Food search quality regression (FTS5 → tsvector) | Low | Test same queries against both; tsvector is more capable |

## New Dependencies to Install

**Go (sync-server):**
```
go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/stdlib
go get github.com/golang-jwt/jwt/v5
go get golang.org/x/time
```

**Node.js (already present):**
- `idb` v8 — already installed, used for write queue
- No new npm dependencies needed

**Version bumps:**
- Go: 1.18 → 1.24+
- All npm packages: latest compatible via `npm update`
