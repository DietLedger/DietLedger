# Spec: DietLedger Server-First Architecture Migration

## Objective

Migrate DietLedger from a client-first architecture (IndexedDB + Prisma/SQLite on the Next.js server, Go sync server as an optional add-on) to a **server-first architecture** where:

- **PostgreSQL** is the single source of truth for all user data
- **Go API server** is the single API gateway — it absorbs all CRUD logic currently scattered across Next.js API routes and the sync server
- **Next.js/React client** becomes a thin, stateless UI layer with no business logic or data persistence
- An **optional local-only mode** (`DIETLEDGER_LOCAL_ONLY=true`) preserves full functionality without Postgres or Go, using existing Next.js API routes + Prisma/SQLite

**User Stories:**
- As a user, my data lives on the server — I can access it from any device
- As a user, if I lose connectivity, my writes are queued locally and synced when I reconnect
- As a user, I can choose to run fully locally with no cloud dependency
- As a developer, the Go server is the single place to add/modify API logic
- As a developer, the client doesn't know or care which database backend is running

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js + React + TypeScript | 16 / 19 / 5.x |
| State | Zustand | 5.x |
| UI | Tailwind v4 + shadcn/ui | - |
| API Server | Go | 1.24+ |
| Primary DB | PostgreSQL | 17+ |
| Local DB | SQLite (via Prisma + Go modernc.org/sqlite) | - |
| ORM (Next.js) | Prisma | 6.x |
| ORM (Go) | database/sql + pgx v5 / modernc.org/sqlite | - |
| Auth | JWT (RS256, access + refresh tokens) | golang-jwt/jwt/v5 |
| Offline Cache | IndexedDB via `idb` | 8.x |
| Mobile | Capacitor | 8.x |

## Commands

```
Dev (server mode):   docker compose up postgres && cd sync-server && go run . && cd .. && npm run dev
Dev (local mode):    DIETLEDGER_LOCAL_ONLY=true npm run dev
Build:               npm run build
Build Go server:     cd sync-server && go build -o dietledger-api .
Lint:                npm run lint
Go tests:            cd sync-server && go test ./...
Go test (verbose):   cd sync-server && go test -v -count=1 ./...
DB Push (local):     npx prisma db push
DB Generate:         npx prisma generate
```

## Project Structure

```
sync-server/
  main.go              → Entry point (env parsing, DB init, server start)
  server.go            → HTTP routing, middleware, auth
  handlers.go          → Existing sync + sharing handlers (refactored)
  handlers_crud.go     → NEW: All CRUD handlers (recipes, food logs, etc.)
  handlers_food.go     → NEW: Food search, USDA proxy, seed endpoints
  store.go             → Existing sync store (refactored to interface)
  store_postgres.go    → NEW: PostgreSQL implementation of Store interface
  store_sqlite.go      → NEW: SQLite implementation (extracted from current store.go)
  models.go            → Existing models (extended with all CRUD models)
  migrations/          → NEW: SQL migration files for PostgreSQL
  repository.go        → NEW: Store interface definition
  go.mod               → Updated: add pgx, jwt-go, etc.
  Makefile             → Updated: add migrate, test targets

src/
  lib/
    api-client.ts      → NEW: Unified API client (auto-switches Go vs Next.js API)
    api-client-go.ts    → NEW: Go API client implementation
    api-client-local.ts → NEW: Local Next.js API client implementation
    write-queue.ts      → NEW: IndexedDB write queue for offline writes
    read-cache.ts       → NEW: IndexedDB read cache for offline reads
    sync-indicator.ts   → NEW: Sync status state (synced/pending/error)
    storage.ts          → DEPRECATED: Replaced by api-client + write-queue
    db.ts               → KEPT: Only used in local mode
    recipe-store.ts     → MODIFIED: Calls api-client instead of storage.ts
    nutrition-store.ts  → MODIFIED: Calls api-client instead of storage.ts
    meal-plan-store.ts  → MODIFIED: Calls api-client instead of storage.ts
    book-store.ts       → MODIFIED: Calls api-client instead of storage.ts
    dietary-store.ts    → MODIFIED: Calls api-client instead of storage.ts
    sync-engine.ts      → DEPRECATED: Sync is now server-side, replaced by write-queue
    sync-store.ts       → DEPRECATED: Same
    sync-conflict.ts    → DEPRECATED: Same
    types.ts            → EXTENDED: API response types, write queue types

  app/
    api/                → DELETED in server mode, KEPT for local mode
      (all routes)      → Conditional: only compiled when DIETLEDGER_LOCAL_ONLY=true

  components/
    sync-indicator.tsx  → NEW: Sync status badge (green/yellow/red)
    local-mode-banner.tsx → NEW: "Local mode" warning banner

prisma/
  schema.prisma         → MODIFIED: Support both sqlite and postgresql providers
  migrations/           → NEW: PostgreSQL migrations

docker-compose.yml      → MODIFIED: Add postgres service, update sync-server
```

## Architecture

### Data Flow: Server Mode

```
React Component
    ↓ (Zustand action)
api-client.ts → Go API Server → PostgreSQL
    ↓ (on write failure)
write-queue.ts → IndexedDB (pending writes)
    ↓ (retry with backoff)
Go API Server → PostgreSQL
```

### Data Flow: Local Mode

```
React Component
    ↓ (Zustand action)
api-client.ts → Next.js API Routes → Prisma → SQLite
```

### API Client Abstraction

```typescript
// src/lib/api-client.ts
export interface ApiClient {
  // Recipes
  getRecipes(): Promise<Recipe[]>
  getRecipe(id: string): Promise<Recipe>
  createRecipe(data: CreateRecipeInput): Promise<Recipe>
  updateRecipe(id: string, data: UpdateRecipeInput): Promise<Recipe>
  deleteRecipe(id: string): Promise<void>

  // Food logs
  getFoodLogEntries(profileId: string, date: string): Promise<FoodLogEntry[]>
  createFoodLogEntry(data: CreateFoodLogEntryInput): Promise<FoodLogEntry>
  updateFoodLogEntry(id: string, data: UpdateFoodLogEntryInput): Promise<FoodLogEntry>
  deleteFoodLogEntry(id: string): Promise<void>

  // ... same pattern for all entities

  // Food search
  searchFoods(query: string, page?: number): Promise<FoodSearchResult>
  getFoodByFdcId(fdcId: number): Promise<FoodItem | null>

  // Sync status
  getSyncStatus(): Promise<SyncStatus>
}

let client: ApiClient

export function getApiClient(): ApiClient {
  if (client) return client
  if (process.env.NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY === 'true') {
    client = new LocalApiClient() // calls /api/... routes
  } else {
    client = new GoApiClient(process.env.NEXT_PUBLIC_API_URL!) // calls Go server
  }
  return client
}
```

### Go Store Interface

```go
// sync-server/repository.go
type Store interface {
    // Users & Auth
    CreateUser(email, password, displayName string) (*User, error)
    GetUserByAPIKey(apiKey string) (*User, error)
    GetUserByID(id string) (*User, error)

    // Recipes
    ListRecipes(userID string, page, perPage int) ([]Recipe, error)
    GetRecipe(userID, id string) (*Recipe, error)
    CreateRecipe(userID string, r *Recipe) (*Recipe, error)
    UpdateRecipe(userID, id string, r *Recipe) (*Recipe, error)
    DeleteRecipe(userID, id string) error

    // Ingredients
    ListIngredients(recipeID string) ([]Ingredient, error)
    CreateIngredient(recipeID string, ing *Ingredient) (*Ingredient, error)
    UpdateIngredient(id string, ing *Ingredient) (*Ingredient, error)
    DeleteIngredient(id string) error

    // Food Items (USDA)
    SearchFoods(query string, page, perPage int) ([]FoodItem, int, error)
    GetFoodByFdcId(fdcId int) (*FoodItem, error)
    CreateFoodItem(f *FoodItem) (*FoodItem, error)

    // Nutrition profiles
    ListProfiles(userID string) ([]PersonProfile, error)
    GetProfile(userID, id string) (*PersonProfile, error)
    CreateProfile(userID string, p *PersonProfile) (*PersonProfile, error)
    UpdateProfile(userID, id string, p *PersonProfile) (*PersonProfile, error)
    DeleteProfile(userID, id string) error

    // Food log entries
    ListFoodLogEntries(profileID, date string) ([]FoodLogEntry, error)
    CreateFoodLogEntry(profileID string, e *FoodLogEntry) (*FoodLogEntry, error)
    UpdateFoodLogEntry(id string, e *FoodLogEntry) (*FoodLogEntry, error)
    DeleteFoodLogEntry(id string) error

    // Weight entries
    ListWeightEntries(profileID string, from, to string) ([]WeightEntry, error)
    CreateWeightEntry(profileID string, e *WeightEntry) (*WeightEntry, error)
    UpdateWeightEntry(id string, e *WeightEntry) (*WeightEntry, error)
    DeleteWeightEntry(id string) error

    // Meal plans
    ListMealPlans(userID string) ([]MealPlan, error)
    GetMealPlan(userID, id string) (*MealPlan, error)
    CreateMealPlan(userID string, m *MealPlan) (*MealPlan, error)
    UpdateMealPlan(userID, id string, m *MealPlan) (*MealPlan, error)
    DeleteMealPlan(userID, id string) error

    // Day plan entries
    ListDayPlanEntries(mealPlanID string) ([]DayPlanEntry, error)
    CreateDayPlanEntry(mealPlanID string, e *DayPlanEntry) (*DayPlanEntry, error)
    UpdateDayPlanEntry(id string, e *DayPlanEntry) (*DayPlanEntry, error)
    DeleteDayPlanEntry(id string) error

    // Recipe books
    ListBooks(userID string) ([]RecipeBook, error)
    GetBook(userID, id string) (*RecipeBook, error)
    CreateBook(userID string, b *RecipeBook) (*RecipeBook, error)
    UpdateBook(userID, id string, b *RecipeBook) (*RecipeBook, error)
    DeleteBook(userID, id string) error

    // Chapters
    ListChapters(bookID string) ([]Chapter, error)
    CreateChapter(bookID string, c *Chapter) (*Chapter, error)
    UpdateChapter(id string, c *Chapter) (*Chapter, error)
    DeleteChapter(id string) error
    ReorderChapters(bookID string, chapterIDs []string) error

    // Categories
    ListCategories() ([]Category, error)
    CreateCategory(c *Category) (*Category, error)
    UpdateCategory(id string, c *Category) (*Category, error)
    DeleteCategory(id string) error

    // Custom foods
    ListCustomFoods(userID string) ([]CustomFood, error)
    CreateCustomFood(userID string, f *CustomFood) (*CustomFood, error)
    UpdateCustomFood(id string, f *CustomFood) (*CustomFood, error)
    DeleteCustomFood(id string) error
    ShareCustomFood(id string) error                               // flag for community sharing
    ListSharedCustomFoods(page, perPage int) ([]CustomFood, error) // browse community custom foods

    // Grocery checklists
    GetGroceryChecklist(weekStart string) (*GroceryChecklist, error)
    UpsertGroceryChecklist(g *GroceryChecklist) (*GroceryChecklist, error)

    // Sharing (existing, kept)
    CreateSharedRecipe(userID, recipeID, title, description, category, tags, recipeData string, isPublic bool) (*SharedRecipe, error)
    GetSharedRecipeByToken(shareToken string) (*SharedRecipe, error)
    GetSharedRecipesByUser(userID string) ([]SharedRecipe, error)
    DeleteSharedRecipe(id string) error
    SearchCommunityRecipes(query, category, sort string, page, perPage int) ([]SharedRecipe, error)
    GetCommunityCategories() ([]CommunityCategory, error)
    UpsertRecipeRating(recipeID, userID string, rating int) error

    Close() error
}
```

### Write Queue (Offline Support)

```typescript
// src/lib/write-queue.ts
interface PendingWrite {
  id: string
  method: 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: string
  createdAt: number
  retryCount: number
  lastError?: string
}

// Uses IndexedDB store 'pendingWrites' — lightweight, single-table
// On app load: drain queue, retry with exponential backoff
// On write: try API first, on failure push to queue
// Sync indicator subscribes to queue state
```

### Prisma Schema Switching

```prisma
// prisma/schema.prisma
datasource db {
  provider = env("PRISMA_PROVIDER")  // "sqlite" or "postgresql"
  url      = env("DATABASE_URL")
}
```

In local mode: `PRISMA_PROVIDER=sqlite`, `DATABASE_URL=file:.../dev.db`
In server mode: `PRISMA_PROVIDER=postgresql`, `DATABASE_URL=postgresql://...`

Note: Some schema features differ between SQLite and PostgreSQL:
- `@id @default(autoincrement())` works on both but maps differently
- `@id @default(cuid())` works on both
- Enum types: PostgreSQL supports native enums; SQLite stores as strings
- Full-text search: PostgreSQL uses `tsvector`; SQLite uses FTS5 virtual tables

### Go PostgreSQL Migrations

SQL migration files in `sync-server/migrations/`:

```
000001_init_users.up.sql
000001_init_users.down.sql
000002_recipes.up.sql
000002_recipes.down.sql
000003_nutrition.up.sql
000003_nutrition.down.sql
000004_meal_plans.up.sql
000004_meal_plans.down.sql
000005_books.up.sql
000005_books.down.sql
000006_sharing.up.sql
000006_sharing.down.sql
000007_food_fts.up.sql          -- tsvector index + trigger
000007_food_fts.down.sql
```

### Sync Indicator UI

A small badge in the app header:
- **Green check**: All writes synced. Queue empty.
- **Yellow spinner**: N pending writes. Retrying...
- **Red retry icon**: Last sync failed. Click to retry.

In local mode: indicator is hidden (no sync concept).

### Local Mode Banner

When `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true`, a persistent banner:

> "Local mode — data is stored on this device only. Export regularly."

With an **Export** button that downloads all data as JSON, and an **Import** button that restores from JSON.

## Code Style

### Go (following existing patterns in sync-server)

```go
// Handler pattern (from existing handlers.go)
func (s *Server) listRecipes(w http.ResponseWriter, r *http.Request) {
    user := getUserFromContext(r)
    page, perPage := paginationFromQuery(r)

    recipes, err := s.store.ListRecipes(user.ID, page, perPage)
    if err != nil {
        log.Printf("Error listing recipes: %v", err)
        writeError(w, http.StatusInternalServerError, "failed to list recipes")
        return
    }
    if recipes == nil {
        recipes = []Recipe{}
    }
    writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: recipes})
}
```

### TypeScript (following existing patterns)

```typescript
// Zustand store calling API client (modified from existing stores)
import { getApiClient } from './api-client'

export const useRecipeStore = create<RecipeState & RecipeActions>((set, get) => ({
  recipes: [],
  loading: false,

  loadRecipes: async () => {
    set({ loading: true })
    try {
      const api = getApiClient()
      const recipes = await api.getRecipes()
      set({ recipes, loading: false })
    } catch (error) {
      set({ loading: false, error: String(error) })
    }
  },

  addRecipe: async (data) => {
    const api = getApiClient()
    const recipe = await api.createRecipe(data)
    set(state => ({ recipes: [...state.recipes, recipe] }))
    return recipe
  },
}))
```

## Testing Strategy

### Go Server Tests (primary focus)

```
sync-server/
  store_test.go         → Store interface contract tests
  store_postgres_test.go → PostgreSQL-specific tests (uses test container or test DB)
  store_sqlite_test.go   → SQLite-specific tests
  handlers_test.go       → HTTP handler tests (httptest)
  handlers_crud_test.go  → CRUD handler tests
  handlers_food_test.go  → Food search handler tests
  integration_test.go    → Full server integration tests
```

**Framework:** Go standard `testing` package + `net/http/httptest`

**Approach:**
- Store tests: table-driven tests against both PostgreSQL and SQLite implementations
- Handler tests: use `httptest.NewServer` with a test store
- Integration tests: start full server, hit all endpoints with real HTTP requests
- Test PostgreSQL via `pgx` with a test database (created/dropped per test run)
- Test SQLite via in-memory `:memory:` databases

**Coverage targets:**
- All CRUD endpoints: happy path + error cases
- Write queue retry logic
- Auth middleware
- Food search with tsvector
- Local mode vs server mode provider switching

### TypeScript Tests (secondary)

```
src/lib/
  api-client.test.ts    → API client switching logic
  write-queue.test.ts   → Write queue enqueue/retry/drain
  read-cache.test.ts    → Cache hit/miss/expiry
```

**Framework:** Vitest or Bun test runner

### No GUI/E2E tests in this migration

## Boundaries

- **Always:**
  - Run `go test ./...` after Go changes
  - Run `npm run lint` after frontend changes
  - Run `npm run build` to verify compilation
  - Each commit leaves the app in a working state
  - Preserve all existing features — if it works now, it works after migration
  - Preserve USDA food data search, dietary compliance engine, PDF/print studio, QR sharing
  - Keep existing Zustand store interface signatures — only change internal implementation

- **Ask first:**
  - Adding new npm dependencies
  - Changing Prisma schema for existing models
  - Changing Go module dependencies
  - Modifying existing API response shapes
  - Changing auth token format

- **Never:**
  - Delete existing features to simplify migration
  - Commit `.env` files or secrets
  - Remove local-only mode support
  - Change existing sharing/community endpoints without migration
  - Use `any` types in TypeScript

## Success Criteria

1. **PostgreSQL is the primary store** — All user data (recipes, food logs, meals, books, profiles, weight entries) is stored in PostgreSQL
2. **Go server handles all CRUD** — Every entity has REST endpoints in Go for list/get/create/update/delete
3. **Client is stateless** — No business logic or persistence decisions in the React frontend; all data access goes through `api-client.ts`
4. **Offline writes work** — When API is unreachable, writes queue in IndexedDB and retry with exponential backoff
5. **Sync indicator works** — UI shows sync status (green/yellow/red)
6. **Local mode works** — With `DIETLEDGER_LOCAL_ONLY=true`, app works with SQLite, no Go server, no Postgres
7. **Local mode banner** — "Local mode — data stored on this device only" banner shown
8. **Export/Import** — Local mode users can export all data as JSON and import it back
9. **Food search preserved** — USDA food search works via PostgreSQL tsvector (server) or SQLite FTS5 (local)
10. **Existing features preserved** — Dietary compliance, PDF/print, QR sharing, meal plans, books, nutrition tracking all still work
11. **All Go tests pass** — `go test ./...` passes with >80% coverage on handlers and store
12. **Docker Compose works** — `docker compose up` starts Postgres + Go server + Next.js frontend
13. **User-contributed data sharing** — Custom foods and food log entries can be flagged for community sharing
14. **Fresh start** — No migration from old data; clean deployment

## Resolved Decisions

1. **Auth: JWT tokens** — JWT is more secure than API keys for thin client usage. Issue JWTs on login (email/password). JWTs carry `userID` claims, expire after 24h, refreshed via refresh token. Existing API key mechanism kept for programmatic access only.
2. **Multi-tenancy: user-scoped** — All CRUD queries are scoped to the authenticated user. No cross-user data access except for explicitly shared resources.
3. **Official data sources: shared, read-only** — USDA FoodData, seed data, and any official reference data lives in shared tables. Users can read but not modify these. Custom foods/entries created by users can be flagged as `sharedWithCommunity: true` to appear in the community pool.
4. **Prisma: local mode only** — Prisma + SQLite is only used in `DIETLEDGER_LOCAL_ONLY` mode. Go server handles all PostgreSQL access directly via `pgx`. No provider switching in a single schema.
5. **Version bumps: latest stable** — Go 1.24+, all npm dependencies to latest compatible versions, pgx v5, modern tooling throughout.
6. **No data migration** — No existing users. Fresh start, no migration scripts needed. Old sync server SQLite DB is irrelevant.
