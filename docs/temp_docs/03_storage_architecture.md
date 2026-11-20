# Storage Architecture

---

## 1. Storage Technologies

DietLedger uses five distinct storage mechanisms:

| Technology | Location | Database Name | Accessible By |
|---|---|---|---|
| **IndexedDB** | Browser / WebView | `dietledger-db` (v13) | `src/lib/storage.ts` via `idb` library |
| **IndexedDB (write queue)** | Browser / WebView | `dietledger-write-queue` (v1) | `src/lib/write-queue.ts` |
| **IndexedDB (read cache)** | Browser / WebView | `dietledger-read-cache` (v1) | `src/lib/read-cache.ts` |
| **SQLite** | Server filesystem | `custom.db` (local-only) / `sync.db` (Go tests) | Prisma (local) / `modernc.org/sqlite` (Go tests) |
| **PostgreSQL** | Docker container / host | `dietledger` (default) | `sync-server/store_postgres.go` via `pgx/v5` |

### Additional Data Sources (External, Not Owned)

| Source | Access | Data |
|---|---|---|
| **FDA FoodData Central API** | `src/lib/fda-client.ts` | 200K+ food items with nutrition data |
| **USDA datasets** | `src/lib/usda-datasets.ts` | Bulk food data import |

---

## 2. What Data Is Stored in Each

### IndexedDB — `dietledger-db` (26 object stores)

Defined in `src/lib/storage.ts:340-489` (`DietLedgerDB` interface). Schema evolution in `getDB()` at lines 496-607.

**Entity stores (18 — used by application):**

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `recipes` | `id: string` | `by-updatedAt` | Recipe records with embedded ingredients and ingredient groups |
| `books` | `id: string` | `by-updatedAt` | Recipe book collections |
| `chapters` | `id: string` | `by-bookId` | Book chapters (ordered within books) |
| `chapterRecipes` | `id: string` | `by-chapterId`, `by-recipeId` | Many-to-many: chapters ↔ recipes |
| `categories` | `id: string` | `by-parentId` | Hierarchical recipe categories |
| `recipeCategories` | `id: string` | `by-recipeId`, `by-categoryId` | Many-to-many: recipes ↔ categories |
| `chapterPages` | `id: string` | `by-chapterId` | Content pages within chapters |
| `bookPages` | `id: string` | `by-bookId` | Content pages within books |
| `templates` | `id: string` | `by-type` | Page/recipe templates |
| `mealPlans` | `id: string` | `by-weekStart` | Weekly meal plans |
| `dayPlanEntries` | `id: string` | `by-mealPlanId`, `by-date` | Daily meal slot assignments |
| `mealGroups` | `id: string` | `by-mealPlanId` | Named meal groups within plans |
| `groceryChecklists` | `id: string` | `by-weekStart` | Grocery list checked items |
| `customFoods` | `id: string` | `by-name` | User-created food items |
| `nutritionProfiles` | `id: string` | `by-updatedAt` | Nutrition tracking profiles |
| `foodLogEntries` | `id: string` | `by-profileId`, `by-date`, `by-profileId-date`, `by-sourceType-sourceId` | Daily food intake log |
| `weightEntries` | `id: string` | `by-profileId`, `by-date`, `by-profileId-date` | Weight tracking entries |
| `dietaryProfiles` | `id: string` | `by-updatedAt` | Dietary restriction profiles |
| `allergenRules` | `id: string` | `by-profileId` | Per-profile allergen detection rules |

**Infrastructure stores (3):**

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `syncServers` | `id: string` | — | Sync server connection configurations |
| `syncChangeLog` | `id: string` | `by-synced`, `by-storeName`, `by-timestamp` | Change log for sync engine |
| `appSettings` | `id: string` | — | Application-wide settings |

**Reference data stores (3):**

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `seasonalFoods` | `id: string` | `by-country-region-month` | Seasonal produce availability |
| `pantryStaples` | `id: string` | `by-name` | Pantry staple food items |
| `userLocation` | `id: string` | — | User's geographic location |

**Cache stores (2):**

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `sharedRecipeCache` | `id: string` | `by-recipeId`, `by-shareToken` | Cached shared recipe data |
| `brandKits` | `id: string` | `by-updatedAt` | Brand/kit theme data |

### IndexedDB — `dietledger-write-queue` (1 object store)

Defined in `src/lib/write-queue.ts:14-20` (`WriteQueueDB` interface).

| Store | Key | Purpose |
|---|---|---|
| `pendingWrites` | `number` (auto-increment) | Offline write requests pending retry |

Each entry stores: `method`, `path`, `body` (JSON string), `retries`, `status` (pending/in-flight/failed), timestamps. Max 10 retries with exponential backoff (`src/lib/write-queue.ts:29-30`).

### IndexedDB — `dietledger-read-cache` (1 object store)

Defined in `src/lib/read-cache.ts:11-16` (`ReadCacheDB` interface).

| Store | Key | Purpose |
|---|---|---|
| `readCache` | `key: string` | GoApiClient GET response cache |

Each entry stores: serialized JSON data, TTL expiry (default 5 min for lists, 60 min for items — `src/lib/read-cache.ts:22-23`), size in bytes. Max cache size: 50 MB (`src/lib/read-cache.ts:20`). LRU eviction by creation time (`src/lib/read-cache.ts:80-93`).

### PostgreSQL — 20 tables

Defined across 12 migration files in `sync-server/migrations/`:

| Migration | Tables Created |
|---|---|
| `000001_init.up.sql` | `users`, `devices`, `api_keys`, `refresh_tokens` |
| `000002_recipes.up.sql` | `recipes`, `ingredients` |
| `000003_foods.up.sql` | `food_items`, `custom_foods`, `seed_jobs` |
| `000004_nutrition.up.sql` | `person_profiles`, `food_log_entries`, `weight_entries` |
| `000005_meal_plans.up.sql` | `meal_plans`, `day_plan_entries`, `meal_groups`, `grocery_checklists` |
| `000006_books.up.sql` | `categories`, `recipe_books`, `chapters`, `chapter_recipes`, `chapter_pages`, `book_pages`, `recipe_categories` |
| `000007_sharing.up.sql` | `shared_recipes`, `recipe_ratings`, `community_categories` |
| `000008_fts.up.sql` | FTS trigger + `search_vector` column on `food_items` |
| `000009_meal_plans_unique_fix.up.sql` | Unique index fix |
| `000010_grocery_jsonb.up.sql` | Column type change to JSONB |
| `000011_ingredient_prep_storage.up.sql` | `prep_instructions`, `storage_location` columns on `ingredients` |
| `000012_ingredient_details_groups.up.sql` | `description`, `group_id`, `linked_recipe_id` on `ingredients`; `ingredient_groups` on `recipes` |

**Referential integrity:** Every user-scoped table has a `user_id` column with `REFERENCES users(id) ON DELETE CASCADE`. Key relationships:
- `recipes.user_id → users.id`
- `ingredients.recipe_id → recipes.id`
- `person_profiles.user_id → users.id`
- `food_log_entries.profile_id → person_profiles.id`
- `meal_plans.user_id → users.id`
- `day_plan_entries.meal_plan_id → meal_plans.id`
- `recipe_books.user_id → users.id`
- `chapters.book_id → recipe_books.id`
- `chapter_recipes.chapter_id → chapters.id`, `recipe_id → recipes.id`

### SQLite — Local-only mode

The `db/custom.db` file is referenced in `server.js:47-48` and `deploy/dietledger.service:18` as the default SQLite path. In local-only mode, this database is accessed via Prisma ORM through Next.js API routes in `src/app/api/`.

The `sync-server/sync.db` file is used for Go server testing with `DB_DRIVER=sqlite`.

The Prisma schema file is **not present** in the `prisma/` directory (only `migrations/` exists). The actual schema file location is UNKNOWN.

---

## 3. Source of Truth Today

**There is no single source of truth.** The architecture deliberately supports two mutually exclusive modes:

### Server Mode (`NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=false`)

PostgreSQL is the **authoritative source of truth** for all user data. Evidence:
- The Go API server is the sole writer to PostgreSQL (`sync-server/store_postgres.go`)
- All mutations go through `requireAuth()` middleware which scopes by `userID` (`sync-server/server.go:218-253`)
- The `GoApiClient` reads from and writes to the Go API, which writes to PostgreSQL
- The browser's IndexedDB acts as a **read cache** (via `ReadCache` in `src/lib/read-cache.ts`) and an **offline write buffer** (via `WriteQueue` in `src/lib/write-queue.ts`)
- The `GoApiClient` does NOT persist application data to IndexedDB — it only caches GET responses and queues failed writes

**Key evidence:** `GoApiClient.createRecipe()` at `src/lib/api-client-go.ts:207` calls `request('POST', '/api/recipes', ...)` which sends data to the Go API. There is no corresponding IndexedDB write in `GoApiClient`. The response is returned directly from the Go API.

### Local-Only Mode (`NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true`)

IndexedDB is the **sole source of truth**. Evidence:
- `LocalApiClient` at `src/lib/api-client-local.ts:30` implements all CRUD by calling `storage.ts` functions
- `storage.ts` functions read/write directly to IndexedDB (`src/lib/storage.ts:637-676`)
- No Go API, no PostgreSQL, no network communication for data operations
- Auth is unavailable (`src/lib/api-client-local.ts:33-43`)

### Sync-Enabled Local Mode

When sync servers are configured (stored in IndexedDB `syncServers` store), IndexedDB remains the local source of truth, with changes periodically pushed to remote sync servers via the sync engine (`src/lib/sync-engine.ts`). The sync engine treats remote servers as **peers**, not as an authority. It pushes local changes and pulls remote changes bidirectionally.

---

## 4. Intended Source of Truth

Based on the architecture:

1. **PostgreSQL is the intended multi-user source of truth** in server mode. The entire Go backend, auth system, and migration framework exist to serve this purpose. The `SYNC_STORE_NAMES` constant (`src/lib/types.ts:217-237`) lists 18 stores that participate in sync — these are the entities that the server manages.

2. **IndexedDB is the intended local-only source of truth** for Tauri desktop, Capacitor mobile, and standalone deployments. The Tauri shell comment at `src-tauri/src/lib.rs:2` states: *"All data is stored in the browser's IndexedDB (via the WebView)."*

3. **The sync engine treats local and remote as equals** — there is no concept of "server wins" or "client wins" in the sync protocol. The `pushChanges` response includes `conflicts[]` (`src/lib/sync-engine.ts:36-43`) which report both `localData` and `serverData`, leaving resolution to the caller.

---

## 5. IndexedDB Usage

### Library: `idb` v8 (`src/lib/storage.ts:1`)

A promise-based wrapper around the native IndexedDB API.

### Database: `dietledger-db`, Version 13

Opened in `getDB()` (`src/lib/storage.ts:496-608`). Schema migrations are additive — each version block checks `if (oldVersion < N)` and creates new stores/indexes without modifying existing ones.

### Schema Pattern

**Schemaless stores:** IndexedDB stores are schemaless (no column definitions). Records are stored as JavaScript objects with a `keyPath` primary key. The `DietLedgerDB` TypeScript interface (`src/lib/storage.ts:340-489`) provides type safety at compile time but does not enforce schema at runtime.

**Example — RecipeRecord** (`src/lib/storage.ts:39-50`):
```typescript
interface RecipeRecord {
  id: string;
  name: string;
  servings: number;
  servingName: string;
  instructions: string | null;
  ingredientGroups: IngredientGroup[];
  createdAt: string;
  updatedAt: string;
  ingredients: IngredientRecord[];  // embedded array (denormalized)
  leftoverStorage?: string;          // optional field added in later version
}
```

Ingredients are **embedded** in the recipe record as an array (`ingredients: IngredientRecord[]`). This is a denormalized design — ingredients do not have their own separate IndexedDB store.

### Change Tracking

Every write operation in `storage.ts` calls `logChange()` (`src/lib/storage.ts:2454-2467`):

```typescript
export async function logChange(storeName, recordId, action, data?) {
  try {
    const entry: SyncChangeLogEntry = {
      id: generateUUID(),
      storeName,
      recordId,
      action,           // 'upsert' or 'delete'
      timestamp: new Date().toISOString(),
      synced: false,
      data: data !== undefined ? JSON.stringify(data) : null,
    };
    await db.put('syncChangeLog', entry);
  } catch {}  // silently fails if sync log is unavailable
}
```

**Critical detail:** The `logChange` call is wrapped in `try/catch` with an empty catch block. If IndexedDB write fails, the change is silently lost from the sync log. This is called from every `create*`, `update*`, and `delete*` function (64 callers per codegraph trace).

### Delete Cascading

IndexedDB has no foreign key constraints. Cascading deletes are implemented manually in JavaScript. Example — `deleteRecipe` (`src/lib/storage.ts:678-702`):
```typescript
const tx = db.transaction(
  ['recipes', 'dayPlanEntries', 'chapterRecipes', 'recipeCategories'],
  'readwrite'
);
await tx.objectStore('recipes').delete(id);
// Manual cascade: iterate dayPlanEntries, chapterRecipes, recipeCategories
// and delete entries where recipeId matches
```

### Read Patterns

- `db.get(storeName, id)` — single record by primary key
- `db.getAll(storeName)` — all records in a store
- `index.getAll(key)` — all records matching an index value
- `index.getAll([key1, key2])` — compound index lookup (e.g., `by-profileId-date`)

### Write Patterns

- `db.put(storeName, record)` — upsert by primary key
- `db.delete(storeName, id)` — delete by primary key
- `db.transaction([stores], 'readwrite')` — multi-store atomic transactions

---

## 6. SQLite Usage

### Two Distinct SQLite Contexts

#### A. Local-Only Mode (Prisma)

**File:** `db/custom.db` (default path from `server.js:47-48`)
**Access:** Next.js API routes under `src/app/api/` via Prisma ORM
**Purpose:** Server-side data storage when no Go API is available
**Configuration:** `DATABASE_URL=sqlite:/opt/dietledger/db/custom.db` (`deploy/dietledger.service:18`)

The Prisma schema file is not present in the repository's `prisma/` directory (only `prisma/migrations/` exists). The actual Prisma schema location is UNKNOWN. Without the schema, the exact table structure managed by Prisma cannot be determined from code alone.

#### B. Go Server Testing/Development (modernc.org/sqlite)

**File:** `sync-server/sync.db` (default path from `sync-server/main.go:19`)
**Library:** `modernc.org/sqlite v1.34.5` — pure Go SQLite implementation (no CGO required)
**Access:** `SQLiteStore` struct (`sync-server/store_sqlite.go:15`)
**Schema:** Same SQL migrations as PostgreSQL (`sync-server/migrations/`), applied via `RunMigrations()` (`sync-server/migrate.go`)

The Go SQLite implementation uses the **same migration files** as PostgreSQL. This means the SQLite schema mirrors the PostgreSQL schema (all 20 tables with the same column definitions). Differences arise from:
- SQLite's type affinity system (e.g., `TIMESTAMPTZ` is stored as text)
- SQLite's limited `ALTER TABLE` support (some migrations may behave differently)
- No GIN indexes or `tsvector` (migration 000008 for FTS is PostgreSQL-specific)

---

## 7. PostgreSQL Usage

### Connection

- **Library:** `github.com/jackc/pgx/v5 v5.7.4` (`sync-server/go.mod:7`)
- **Access:** `PostgresStore` struct (`sync-server/store_postgres.go:17`)
- **Connection string:** `DATABASE_URL=postgres://user:pass@host:5432/dbname?sslmode=disable` (`docker-compose.yml:30`)

### Schema

20 tables across 12 migrations (see Section 2). Key design decisions:

**Text primary keys:** All tables use `TEXT PRIMARY KEY` with UUID values, not auto-incrementing integers (except `food_items.id SERIAL` and `seed_jobs.id SERIAL` which are server-managed data).

**Timestamps:** All tables use `TIMESTAMPTZ NOT NULL DEFAULT NOW()` for `created_at` and `updated_at`.

**Cascade deletes:** All foreign keys use `ON DELETE CASCADE` to ensure referential integrity when parent records are deleted.

**Normalization:** Ingredients are stored in a separate `ingredients` table with a foreign key to `recipes.id` (`000002_recipes.up.sql:17`). This contrasts with IndexedDB where ingredients are embedded in the recipe record.

**JSON storage:** Some fields use JSON/JSONB:
- `recipes.ingredient_groups` — TEXT (migration 000012)
- `ingredients.prep_instructions` — TEXT (migration 000011)
- `grocery_checklists.checked_items` — JSONB (migration 000010)

**Full-text search:** PostgreSQL-specific FTS using `tsvector` on `food_items.description` and `food_items.brand_owner` (migration 000008). This is a PostgreSQL-only feature not available in SQLite.

**Constraints:** CHECK constraints enforce allowed values:
- `person_profiles.sex IN ('male', 'female')` (migration 000004)
- `person_profiles.activity_level IN ('sedentary', 'light', 'moderate', 'active', 'veryActive')` (migration 000004)
- `food_log_entries.meal_slot IN ('morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night', 'snack')` (migration 000004)
- `day_plan_entries.slot IN ('morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night')` (migration 000005)

**Unique constraints:**
- `meal_plans(user_id, week_start)` — one meal plan per user per week (migration 000009)
- `grocery_checklists(user_id, week_start)` — one grocery list per user per week (migration 000005)
- `weight_entries(profile_id, date)` — one weight entry per profile per day (migration 000004)
- `chapter_recipes(chapter_id, recipe_id)` — no duplicate recipe in a chapter (migration 000006)
- `recipe_categories(recipe_id, category_id)` — no duplicate category assignment (migration 000006)

---

## 8. Trace: Recipe from Creation to Persistence

### Local-Only Mode

```
1. User clicks "Create Recipe" in UI
   → React component calls recipe-store setter

2. Zustand recipe-store calls:
   getApiClient().createRecipe("My Recipe")
   [src/lib/api-client.ts:290]

3. getApiClient() returns LocalApiClient
   [src/lib/api-client.ts:298-300]

4. LocalApiClient.createRecipe("My Recipe")
   → storage.createRecipe("My Recipe")
   [src/lib/api-client-local.ts:60-62]

5. storage.createRecipe("My Recipe")
   [src/lib/storage.ts:637-653]:
   a. db = await getDB()  — opens/returns IndexedDB connection
   b. recipe = { id: generateUUID(), name: "My Recipe", servings: 1, ... }
   c. await db.put('recipes', recipe)  — persists to IndexedDB
   d. await logChange('recipes', recipe.id, 'upsert', recipe)
      → creates SyncChangeLogEntry in 'syncChangeLog' store with synced: false

6. Recipe is now in IndexedDB and visible to the UI
```

### Server Mode (Online)

```
1. User clicks "Create Recipe" in UI
   → React component calls recipe-store setter

2. Zustand recipe-store calls:
   getApiClient().createRecipe("My Recipe")
   [src/lib/api-client.ts:290]

3. getApiClient() returns GoApiClient
   [src/lib/api-client.ts:301-303]

4. GoApiClient.createRecipe("My Recipe")
   [src/lib/api-client-go.ts:207]:
   → queuedWrite('POST', '/api/recipes', { name: "My Recipe" })

5. GoApiClient.queuedWrite()
   [src/lib/api-client-go.ts:108-119]:
   a. await request('POST', '/api/recipes', body)
   b. On success → readCache.invalidate('recipes')
   c. On network failure → writeQueue.enqueue('POST', '/api/recipes', body)

6. GoApiClient.request('POST', '/api/recipes', body)
   [src/lib/api-client-go.ts:58-93]:
   a. Headers: Content-Type + Authorization: Bearer <JWT>
   b. fetch('http://localhost:8080/api/recipes', { method: 'POST', body })
   c. On 401 → tryRefresh(), retry once, then clearTokens()

7. Next.js middleware intercepts /api/recipes
   [middleware.ts → src/proxy.ts:31-63]:
   a. shouldProxy('/api/recipes') → true (matches PROXY_ROUTES)
   b. Forwards to http://localhost:8080/api/recipes

8. Go API Server receives POST /api/recipes
   [sync-server/server.go:43 → handlers_crud.go:158]:
   a. requireAuth() → validates JWT → extracts user context
   b. createRecipe handler → calls store.CreateRecipe(userID, req)

9. PostgresStore.CreateRecipe(userID, req)
   [sync-server/store_postgres.go:162-184]:
   a. id = uuid.New().String()
   b. INSERT INTO recipes (id, user_id, name, ...) VALUES ($1, $2, ...)
   c. For each ingredient in req.Ingredients:
      → CreateIngredient(id, &ing) → INSERT INTO ingredients (...)
   d. Returns &Recipe{...}

10. Response flows back: Go API → proxy → GoApiClient → Zustand store → UI renders
```

### Server Mode (Offline)

```
Steps 1-4 same as above.

5. GoApiClient.queuedWrite()
   a. request() throws TypeError (network unavailable)
   b. writeQueue.enqueue('POST', '/api/recipes', body)
      [src/lib/write-queue.ts:56-68]:
      - Persists { method, path, body, retries: 0, status: 'pending' }
      - to 'pendingWrites' store in 'dietledger-write-queue' IndexedDB
      - Calls scheduleDrain() if navigator.onLine

6. WriteQueue does NOT retry immediately (navigator.onLine is false)
   - Request sits in queue until connectivity returns

7. On connectivity restore:
   [src/lib/write-queue.ts:168]:
   a. writeQueue.drain() processes pending writes
   b. For each write → sendWrite() → fetch() to Go API
   c. Success → delete from queue
   d. Failure → increment retries, exponential backoff
   e. After MAX_RETRIES (10) → status = 'failed', stops retrying
```

---

## 9. Trace: Nutrition Log Entry from Creation to Persistence

### Local-Only Mode

```
1. User adds food to nutrition log (e.g., logs a meal)
   → React component calls nutrition-store

2. nutrition-store calls:
   getApiClient().createFoodLogEntry(data)
   [src/lib/api-client.ts:290]

3. LocalApiClient.createFoodLogEntry(data)
   [src/lib/api-client-local.ts:363-367]:
   → storage.createFoodLogEntry(data)

4. storage.createFoodLogEntry(data)
   [src/lib/storage.ts:2162-2173]:
   a. db = await getDB()
   b. record: FoodLogEntryRecord = {
        id: generateUUID(),
        profileId: data.profileId,
        date: data.date,
        mealSlot: data.mealSlot,
        sourceType: data.sourceType,    // 'recipe' | 'customFood' | 'manual'
        sourceId: data.sourceId,
        name: data.name,
        servings: data.servings,
        calories: data.calories,
        // ... 15 nutrition fields ...
        createdAt: now,
        updatedAt: now,
      }
   c. await db.put('foodLogEntries', record)
   d. await logChange('foodLogEntries', record.id, 'upsert', record)

5. Entry stored in IndexedDB 'foodLogEntries' store
   Indexed via: by-profileId, by-date, by-profileId-date, by-sourceType-sourceId
```

### Server Mode

```
1-3. Same flow → GoApiClient.createFoodLogEntry(data)
   [src/lib/api-client-go.ts:708]:
   → queuedWrite('POST', '/api/nutrition/...', data)

4-6. Same proxy/auth chain as recipe creation

7. Go API → handlers_crud.go → store.CreateFoodLogEntry(userID, profileID, req)

8. PostgresStore.CreateFoodLogEntry(userID, profileID, req)
   [sync-server/store_postgres.go:668-680]:
   INSERT INTO food_log_entries (id, user_id, profile_id, date, time,
     meal_slot, source_type, source_id, name, servings, serving_amount,
     serving_unit, calories, total_fat, ..., potassium, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ..., $28, $28)
```

### Key Difference: Denormalized Nutrition Data

The `FoodLogEntryRecord` in IndexedDB (`src/lib/storage.ts:287-317`) **stores the full nutrition snapshot** (calories, totalFat, etc.) at the time of logging. This data is denormalized — it's copied from the source (recipe, custom food, or manual entry) and never updated if the source changes. The `sourceType` and `sourceId` fields provide the link back to the source, but there is no automatic recalculation mechanism visible in the codebase.

In PostgreSQL, the same denormalized pattern exists (`food_log_entries` table in migration 000004 stores all nutrition columns directly).

---

## 10. Duplication of Data

### A. Ingredients: Embedded (IndexedDB) vs Normalized (PostgreSQL)

**IndexedDB** (`src/lib/storage.ts:39-50`): Ingredients are an embedded array inside `RecipeRecord.ingredients`:
```typescript
interface RecipeRecord {
  ingredients: IngredientRecord[];  // embedded
  ingredientGroups: IngredientGroup[];  // embedded
}
```

**PostgreSQL** (`000002_recipes.up.sql:15-38`): Ingredients are a separate `ingredients` table with foreign key to `recipes.id`:
```sql
CREATE TABLE ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ...
);
```

This means the Go API must join `recipes` and `ingredients` tables on read, then serialize ingredients as a JSON array in the response. The Go `Recipe` struct (`sync-server/models.go:27-39`) has `Ingredients []Ingredient` as a JSON field.

### B. Recipe Model Divergence

There are **three different Recipe type definitions**:

| Type | Location | Notes |
|---|---|---|
| `RecipeRecord` (interface) | `src/lib/storage.ts:39-50` | IndexedDB shape. `instructions: string \| null`. `ingredientGroups: IngredientGroup[]`. |
| `Recipe` (interface) | `src/lib/recipe-store.ts:87-98` | Zustand store shape. `instructionSteps: InstructionStep[]`, `instructionGroups: InstructionGroup[]`. Different structure for instructions. |
| `Recipe` (struct) | `sync-server/models.go:27-39` | Go/PostgreSQL shape. `Instructions: *string`. `IngredientGroupsJSON: string`. `Ingredients: []Ingredient` (JSON). |

The `Recipe` interface in `recipe-store.ts:87-98` transforms the `instructions` string into structured `instructionSteps` and `instructionGroups`. This is a client-side parsing layer that does not exist in the server.

### C. Nutrition Data Denormalization

Food log entries store a **snapshot** of nutrition values at log time. The same nutrition data exists in:
1. The source recipe's ingredients (from which calories are calculated)
2. The food log entry itself (copied values)
3. If from a custom food: the custom food record

There is no mechanism to recalculate food log nutrition if a recipe's ingredients change.

### D. Read Cache Duplication

The `GoApiClient` caches GET responses in a separate IndexedDB database (`dietledger-read-cache`). This means the same data exists in:
1. The Go API server's memory / PostgreSQL
2. The browser's read cache (for TTL duration)
3. Potentially in React Query's in-memory cache (if used by consuming components)

### E. Sync Change Log Duplication

Every write to IndexedDB generates a `SyncChangeLogEntry` in the `syncChangeLog` store (`src/lib/storage.ts:2454-2467`). This entry contains a full JSON copy of the record data (`data: JSON.stringify(data)`). For large records (recipes with many ingredients), this effectively doubles the storage per write.

### F. Categories in Both Storage Layers

Categories exist in:
1. IndexedDB `categories` store (`src/lib/storage.ts:361-365`)
2. PostgreSQL `categories` table (`000006_books.up.sql:1-8`)
3. PostgreSQL has a `SeedCategories()` function that auto-creates default categories (`sync-server/store_postgres.go:1569`)

In local-only mode, there is no equivalent seeding mechanism for IndexedDB. Categories would need to be created manually.

---

## 11. Synchronization Assumptions

### Assumption 1: Clocks Are Loosely Synchronized

The sync engine uses `timestamp` strings (ISO 8601) for ordering changes (`src/lib/sync-engine.ts:136`: `since=...`). There is no vector clock or Lamport timestamp mechanism. The `pushChanges` response includes `serverVersion: number` and conflicts contain version numbers (`src/lib/sync-engine.ts:36-45`), but the client-side `SyncChangeLogEntry` only has `timestamp: string` and `synced: boolean` — no version counter.

### Assumption 2: Sync Servers Are Not the Go API

The sync endpoints (`/api/sync/push`, `/api/sync/pull`, `/api/sync/full-dump`) called in `src/lib/sync-engine.ts:100, 136, 188, 208` are **not registered** in the Go API server's route table (`sync-server/server.go:32-77`). They point to an external URL from `SyncServerConfig.serverUrl` (`src/lib/types.ts:179`). The Go API server and sync servers are separate services with separate protocols.

### Assumption 3: Single-Device Writes Between Syncs

The sync engine pushes changes and pulls changes sequentially (`syncWithServer` at `src/lib/sync-engine.ts:239-253`: push first, then pull). Conflict detection is server-side (the server compares pushed data against its current state). There is no client-side conflict pre-detection — the client blindly pushes all unsynced changes and relies on the server to report conflicts.

### Assumption 4: 18 Stores Participate in Sync

Only the stores listed in `SYNC_STORE_NAMES` (`src/lib/types.ts:217-237`) participate in sync. The following IndexedDB stores are explicitly excluded:
- `seasonalFoods` — reference data
- `pantryStaples` — reference data
- `userLocation` — device-specific
- `syncServers` — sync configuration itself (meta-data)
- `syncChangeLog` — the change log itself
- `sharedRecipeCache` — cache
- `brandKits` — UI data
- `appSettings` — local preferences

### Assumption 5: Sync Change Log Grows Unboundedly

`logChange()` appends entries to `syncChangeLog` but there is no cleanup mechanism for old synced entries. `markChangesSynced()` only sets `synced: true` (`src/lib/storage.ts:2481-2491`) — it never deletes. Over time, this store grows indefinitely. The `getAllUnsyncedChanges()` function (`src/lib/storage.ts:2475-2478`) reads ALL entries and filters by `!e.synced`, which becomes increasingly expensive.

### Assumption 6: Write Queue Has Finite Retry

The write queue (`src/lib/write-queue.ts:29-30`) has `MAX_RETRIES = 10` with backoff up to 60 seconds. After 10 failures, the write is marked `status: 'failed'` and permanently abandoned. There is no user-visible notification for permanently failed writes (the `getStatus()` method reports `failed` count, but no UI component was found that displays this).

### Assumption 7: Bulk Sync Overwrites Without Merging

`fullDumpUpload` (`src/lib/sync-engine.ts:172-203`) uploads ALL data from ALL sync stores to the server. `fullDumpDownload` (`src/lib/sync-engine.ts:206-237`) downloads ALL data from the server and overwrites local IndexedDB stores via `putStoreData()`. There is no merge logic — the full dump is a "last write wins" operation.

### Assumption 8: Auth Tokens Are Browser-Session-Scoped

`GoApiClient` stores JWT tokens in module-level variables (`src/lib/api-client-go.ts:41-52`), not in IndexedDB or localStorage. This means tokens are lost on page refresh in a standard browser (though Next.js may preserve module state in some cases). The `GoApiClient` also dispatches a `dietledger:unauthorized` event on 401 (`src/lib/api-client-go.ts:83`) but there is no automatic token refresh on app load.

---

## 12. Storage Architecture Diagrams

### Local-Only Mode Storage

```
┌──────── Browser / WebView ──────────────────────────────────┐
│                                                             │
│  ┌── React Components ──┐                                  │
│  │  (UI reads/writes)    │                                  │
│  └────────┬─────────────┘                                  │
│           │                                                 │
│  ┌────────▼─────────────┐                                  │
│  │  Zustand Stores       │                                  │
│  │  (reactive state)     │                                  │
│  └────────┬─────────────┘                                  │
│           │                                                 │
│  ┌────────▼─────────────┐                                  │
│  │  LocalApiClient      │                                  │
│  │  (no network calls)  │                                  │
│  └────────┬─────────────┘                                  │
│           │                                                 │
│  ┌────────▼─────────────────────────────────────────────┐   │
│  │  storage.ts (CRUD functions)                         │   │
│  │                                                      │   │
│  │  createRecipe() ──→ db.put('recipes', ...)           │   │
│  │                   ──→ logChange('recipes', ...,    │   │
│  │                         'upsert', recipe)           │   │
│  └────────┬────────────────────────────────────────────┘   │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  IndexedDB: "dietledger-db" (v13)                    │   │
│  │                                                      │   │
│  │  ┌─ recipes ─────────────┐  ┌─ syncChangeLog ────┐ │   │
│  │  │ id (PK)               │  │ id (PK)            │ │   │
│  │  │ name, servings, ...    │  │ storeName          │ │   │
│  │  │ ingredients[] (embed)  │  │ recordId           │ │   │
│  │  │ ingredientGroups[]     │  │ action: upsert/del  │ │   │
│  │  │ createdAt, updatedAt   │  │ timestamp           │ │   │
│  │  │ idx: by-updatedAt      │  │ synced: false       │ │   │
│  │  └────────────────────────┘  │ data: JSON snapshot  │ │   │
│  │                              └─────────────────────┘ │   │
│  │  ┌─ foodLogEntries ──────┐                           │   │
│  │  │ id (PK)               │                           │   │
│  │  │ profileId, date       │                           │   │
│  │  │ mealSlot, sourceType  │                           │   │
│  │  │ name, servings        │                           │   │
│  │  │ calories, fat, ...    │  (+ 22 other stores)     │   │
│  │  │ idx: by-profileId     │                           │   │
│  │  │ idx: by-date          │                           │   │
│  │  │ idx: by-profileId-date│                           │   │
│  │  └──────────────────────┘                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [No Go API]  [No PostgreSQL]  [No write queue]              │
└─────────────────────────────────────────────────────────────┘
```

### Server Mode Storage

```
┌──────── Browser ────────────────────────────────────────────────────────┐
│                                                                         │
│  React → Zustand → GoApiClient                                         │
│                                                                         │
│  ┌─ Read Path ────────────────────────────────────────────────────┐    │
│  │  GoApiClient.cachedGet(path)                                    │    │
│  │    ├─ readCache.get(key) → HIT: return cached data             │    │
│  │    └─ MISS: request() → Go API → PostgreSQL                    │    │
│  │         └─ readCache.set(key, data, TTL)                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─ Write Path (online) ──────────────────────────────────────────┐    │
│  │  GoApiClient.queuedWrite(method, path, body)                  │    │
│  │    └─ request() → Go API → PostgreSQL → 200 OK                  │    │
│  │         └─ readCache.invalidate(prefix)                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─ Write Path (offline) ─────────────────────────────────────────┐    │
│  │  GoApiClient.queuedWrite(method, path, body)                  │    │
│  │    └─ request() → TypeError (no network)                       │    │
│  │         └─ writeQueue.enqueue(method, path, body)              │    │
│  │              └─ persisted to IndexedDB                          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌── IndexedDB: "dietledger-read-cache" (v1) ─────────────────────┐     │
│  │  readCache store                                              │     │
│  │  key → { data (JSON), expiresAt, sizeBytes }                  │     │
│  │  TTL: 5min (lists) / 60min (items)                            │     │
│  │  Max: 50MB, LRU eviction                                     │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ┌── IndexedDB: "dietledger-write-queue" (v1) ──────────────────┐     │
│  │  pendingWrites store                                          │     │
│  │  auto-increment → { method, path, body, retries, status }    │     │
│  │  Max retries: 10, backoff: 1s→2s→4s→...→60s                   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────┬─────────────────────────────────────────┘
                              │ HTTP (via Next.js proxy)
                              ▼
┌──────── Next.js Server ──────┼─────────────────────────────────────────┐
│  middleware.ts → proxy.ts     │                                         │
│  Forwards /api/* to :8080    │                                         │
└──────────────────────────────┼────────────────────────────────────────┘
                               ▼
┌──────── Go API Server ──────────────────────────────────────────────────┐
│                                                                         │
│  requireAuth() → user context                                           │
│  handlers_crud.go → store.CreateRecipe(userID, req)                     │
│                                                                         │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ pgx/v5
                               ▼
┌──────── PostgreSQL ────────────────────────────────────────────────────┐
│                                                                         │
│  users ← devices, api_keys, refresh_tokens                              │
│  recipes ← ingredients (normalized FK)                                 │
│  person_profiles ← food_log_entries, weight_entries                     │
│  meal_plans ← day_plan_entries, meal_groups, grocery_checklists        │
│  recipe_books ← chapters ← chapter_recipes, chapter_pages, book_pages  │
│  categories ← recipe_categories                                        │
│  food_items (USDA, FTS)                                                │
│  custom_foods                                                           │
│  shared_recipes ← recipe_ratings                                        │
│  community_categories                                                   │
│  seed_jobs                                                              │
│                                                                         │
│  20 tables, 12 migrations, CASCADE deletes, TEXT PKs (UUID)            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Sync Data Flow Through Storage

```
┌── IndexedDB: "dietledger-db" ──────────────────────────────────────┐
│                                                                      │
│  Data Store Layer:                Sync Infrastructure:                 │
│  ┌─────────────────────┐         ┌──────────────────────┐          │
│  │ recipes             │         │ syncServers           │          │
│  │ books               │  ┌───▶  │   (connection configs)│          │
│  │ chapters            │  │      └──────────────────────┘          │
│  │ chapterRecipes      │  │                                         │
│  │ categories          │  │      ┌──────────────────────┐          │
│  │ recipeCategories    │  │      │ syncChangeLog         │          │
│  │ chapterPages        │  │      │   id, storeName,       │          │
│  │ bookPages           │  │      │   recordId, action,    │          │
│  │ templates           │  │      │   timestamp, synced,    │          │
│  │ mealPlans           │  │      │   data (JSON snapshot)  │          │
│  │ dayPlanEntries      │  │      │                        │          │
│  │ mealGroups          │  │      │ Written by: logChange()│          │
│  │ groceryChecklists   │  │      │ Read by: pushChanges()│          │
│  │ customFoods         │  │      └──────────┬───────────┘          │
│  │ nutritionProfiles   │  │                 │                       │
│  │ foodLogEntries      │  │                 │                       │
│  │ weightEntries       │  │                 │                       │
│  │ dietaryProfiles     │  │                 │                       │
│  │ allergenRules       │──┘                 │                       │
│  └─────────────────────┘                    │                       │
│         │                                   │                       │
│         │ SYNC_STORE_NAMES                  │ getAllUnsyncedChanges()│
│         │ (18 stores, src/lib/types.ts:217) │ markChangesSynced()   │
│         │                                   │                       │
└─────────┼───────────────────────────────────┼───────────────────────┘
          │                                   │
          │    ┌──────────────────────────────┘
          │    │ sync-engine.ts
          ▼    ▼
     pushChanges()              pullChanges()
     POST /api/sync/push         GET /api/sync/pull
          │                           │
          │  getAllUnsyncedChanges()    │  since=lastSyncedAt
          │  → batch of changes        │
          │                           │
          ▼                           ▼
     ┌─────────────────────────────────────┐
     │  External Sync Server                 │
     │  (NOT the Go API server)             │
     │  URL from SyncServerConfig.serverUrl  │
     │  Auth: Bearer apiKey                  │
     └─────────────────────────────────────┘
```

### Data Model Divergence: IndexedDB vs PostgreSQL

```
INDEXEDDB (dietledger-db)              POSTGRESQL (dietledger)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

recipes store (schemaless object):    recipes table (relational):
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ id: string (PK)              │       │ id: TEXT PRIMARY KEY         │
│ name: string                 │       │ user_id: TEXT → users(id)    │
│ servings: number              │       │ name: TEXT NOT NULL           │
│ servingName: string           │       │ servings: INT                 │
│ instructions: string | null   │       │ serving_name: TEXT            │
│ ingredientGroups: Array       │  ◄──► │ ingredient_groups: TEXT (JSON)│
│ ingredients: Array ──────┐   │       │ created_at: TIMESTAMPTZ       │
│   [{id, recipeId, name,  │   │       │ updated_at: TIMESTAMPTZ       │
│    amount, unit, calories, │   │       └──────────────┬───────────────┘
│    ...}]                   │   │                      │
│ createdAt: string (ISO)    │   │       ingredients table:
│ updatedAt: string (ISO)    │   │       ┌──────────────────────────────┐
└────────────────────────────┘   │       │ id: TEXT PK → recipes(id)   │
                                 │       │ recipe_id: TEXT FK           │
  INGREDIENTS EMBEDDED           │       │ fdc_id: INT                  │
  in recipe record               │       │ name, amount, unit, ...     │
                                 │       │ group_id, linked_recipe_id    │
                                 │       │ prep_instructions, storage   │
                                 │       └──────────────────────────────┘

  INGREDIENTS NORMALIZED         │
  in separate table              │
```

---

## 13. Recommendations

### R1: Sync Change Log Cleanup

The `syncChangeLog` store grows without bound. `markChangesSynced()` only sets `synced: true` but never deletes entries. `getAllUnsyncedChanges()` at `src/lib/storage.ts:2475-2478` reads ALL entries every sync cycle. For long-running applications, this will degrade performance.

**Recommendation:** Add a cleanup function that deletes `syncChangeLog` entries where `synced: true` and `timestamp` is older than a configurable retention period (e.g., 7 days).

### R2: Unified Recipe Type

Three different `Recipe` types exist (`RecipeRecord` in storage.ts, `Recipe` in recipe-store.ts, `Recipe` struct in models.go). The transformation between `instructions: string` and `instructionSteps[]` / `instructionGroups[]` happens in `recipe-store.ts` but is not documented or consistently applied.

**Recommendation:** Define a single canonical Recipe type and make transformations explicit at a single boundary point.

### R3: Failed Write Notification

The write queue marks writes as `status: 'failed'` after 10 retries (`src/lib/write-queue.ts:29-30`) but there is no user-visible notification. Data silently fails to persist.

**Recommendation:** Surface failed writes to the user via a persistent notification or an unsynced changes indicator.

### R4: Token Persistence

`GoApiClient` stores JWT tokens in module-level variables (`src/lib/api-client-go.ts:41-52`), not in persistent storage. Tokens are lost on page refresh.

**Recommendation:** Persist access and refresh tokens in IndexedDB or localStorage and restore them on app load.

### R5: Food Log Recalculation

Food log entries store a denormalized snapshot of nutrition data. If a recipe's ingredients change, previously logged meals retain stale nutrition values. No recalculation mechanism exists.

**Recommendation:** Either (a) store only `sourceType` + `sourceId` + `servings` in food log entries and calculate nutrition on-the-fly from the source, or (b) implement a background recalculation job when source recipes/foods are modified.

### R6: Prisma Schema

The Prisma schema file is not present in the repository. The local-only SQLite mode depends on it.

**Recommendation:** Ensure the Prisma schema file is committed to the repository.

### R7: Sync Server Protocol Documentation

The sync protocol (`/api/sync/push`, `/api/sync/pull`, `/api/sync/full-dump`) is called from `sync-engine.ts` but has no server-side implementation in this repository. The protocol contract (request/response shapes, conflict resolution rules, versioning) is implicit.

**Recommendation:** Document the sync protocol specification and identify the sync server implementation (if it exists elsewhere) or mark it as a planned component.

### R8: SQLite/PostgreSQL Migration Parity

Migration 000008 (PostgreSQL FTS with `tsvector`) is PostgreSQL-specific and will fail on SQLite. The Go server's `RunMigrations()` function applies the same migration files to both backends.

**Recommendation:** Add SQLite-specific migration handling (skip or provide alternative implementation for FTS migrations).
