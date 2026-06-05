Now I have the complete picture. Here is the brutal assessment.
Architecture Review: storage.ts — God Object Confirmed
File: src/lib/storage.ts | 2,567 lines | 140 exports | 33 inline types | DB version 13
1. Responsibilities
The file contains every responsibility for the entire application. Grouped by concern:
Data Models (lines 5–338, ~333 lines)
- 25 inline interface/type definitions covering every domain concept
- Examples: RecipeRecord, BookRecord, MealPlanRecord, FoodLogEntryRecord, WeightEntryRecord, NutritionProfileRecord, TemplateSectionRecord, TemplateLayoutRecord, TemplateThemeRecord, etc.
- Also: union types like DaySlot, ActivityLevel, MealSlot, FoodSourceType, BmrEquation
DB Schema Definition (lines 340–489, ~149 lines)
- The entire DietLedgerDB extends DBSchema — 24 object stores with indexes
- This is the single source of truth for the IndexedDB schema
Migration Logic (lines 499–605, ~106 lines)
- 13 version branches in the upgrade() callback
- Version 12 is a no-op comment: // IndexedDB object stores are schemaless, so no structural change needed — this is a smell that the migration system has already been misused
CRUD Operations — 8 separate domain aggregates:
Domain	Lines	Functions
Recipe	613–711	getAllRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe
Ingredient	715–791	addIngredient, removeIngredient, updateIngredient
Book	795–869	getAllBooks, getBook, createBook, updateBook, deleteBook
Chapter	873–948	getChaptersByBook, createChapter, updateChapter, deleteChapter, reorderChapters
ChapterRecipe	952–999	getChapterRecipes, addRecipeToChapter, removeRecipeFromChapter, reorderChapterRecipes
ChapterPage	1003–1066	CRUD + getMaxChapterItemPosition
BookPage	1070–1190	CRUD + reorderBookLevelItems, reorderChapterItems, moveRecipeBetweenChapters, convertChapterPageToBookPage, convertBookPageToChapterPage
Category	1280–1407	CRUD + cascade delete + getCategoryDescendants (BFS tree traversal)
Template	1411–1680	CRUD + hardcoded seed data (buildSeedTemplates() at ~180 lines) + deduplication logic
MealPlan	1684–1747	CRUD
DayPlanEntry	1751–1855	CRUD
MealGroup	1859–1904	CRUD
GroceryChecklist	1908–1930	CRUD
CustomFoods	2065–2097	CRUD
NutritionProfile	2101–2148	CRUD with cascading delete
FoodLogEntry	2152–2201	CRUD + range queries
WeightEntry	2205–2263	CRUD + upsert-by-date logic
DietaryProfile	2267–2312	CRUD with cascading delete
AllergenRule	2316–2349	CRUD
SharedRecipeCache	2353–2378	Cache management
BrandKit	2382–2420	CRUD
AppSettings	2559–2567	get/put
Inline Data Migration (lines 628–635, 1754–1757)
- migrateRecipe() mutates records in-place on read
- getDayEntriesByMealPlanId() patches isLeftover and sourceType fields on read
Sync Change Logging (lines 2454–2499)
- logChange(), getUnsyncedChanges(), markChangesSynced(), clearSyncChangeLog()
- Called from every write operation throughout the file
Sync Server Config (lines 2501–2514)
- CRUD for sync server configuration
Generic Store Access (lines 2516–2557)
- getAllStoreData, putStoreData, deleteStoreRecord — stringly-typed generic accessors that bypass type safety with as never
localStorage Access (lines 1934–1948)
- getStoredApiKey, setStoredApiKey — completely different storage mechanism mixed in
Seed Data (lines 2022–2061)
- seedSeasonalFoodsIfNeeded, seedPantryStaplesIfNeeded — dynamic imports of external data
SRP Violation Count: The file has at least 15 distinct responsibilities. A reasonable target would be 1 (persistence coordination).
2. Layering Analysis
Layer	Present?	Examples
Data Models	YES — mixed inline	RecipeRecord (line 39), FoodLogEntryRecord (line 287) — 25 interfaces defined alongside persistence code
Persistence	YES — raw IDB	getDB() at line 496 directly opens IndexedDB; openDB() called directly
Repository Logic	YES — no abstraction	Every function is const db = await getDB(); db.put(...) — no repository interface
Synchronization	YES	logChange() at line 2454 called from every write; sync server CRUD at line 2501; change log queries at line 2470
Validation	MINIMAL	Only name.trim() and 'not found' errors — no real validation layer
Business Logic	YES — leaked in	deleteRecipe (line 678) cascades into dayPlanEntries, chapterRecipes, recipeCategories — this is business logic about referential integrity
Migration Logic	YES — inline	13-version upgrade function (line 499), migrateRecipe() (line 628), field patching on read (line 1754)
Caching	PARTIALLY	sharedRecipeCache store (line 2375), seedPromise memo (line 1579), dbPromise singleton (line 494)
Seed Data	YES	180 lines of hardcoded template definitions (line 1436), plus dynamic imports for seasonal foods and pantry staples
The file is every layer simultaneously. There is no separation between "what is stored" and "how it's stored" and "when it's synced."
3. Coupling
Direct problems:
1. Recipe knows about MealPlan, Book, and Category — deleteRecipe (line 680) opens a transaction across ['recipes', 'dayPlanEntries', 'chapterRecipes', 'recipeCategories']. A recipe repository should not know that meal plans or books exist.
2. Book knows about ChapterRecipes and ChapterPages — deleteBook (line 856) cascades through chapters, chapter recipes, and chapter pages. The book layer is coupled to the chapter's internal relationships.
3. NutritionProfile knows about FoodLog and Weight — deleteNutritionProfile (line 2140) cascades into foodLogEntries and weightEntries.
4. DietaryProfile knows about AllergenRules — deleteDietaryProfile (line 2306) cascades into allergenRules.
5. Category knows about RecipeCategory — deleteCategoryCascade (line 1337) is a recursive function that knows about the join table.
6. Everything knows about Sync — Every single write operation calls logChange(). The sync concern is woven into every function. There is no way to write data without triggering sync logging.
7. localStorage mixed with IndexedDB — getStoredApiKey() / setStoredApiKey() (line 1936) use localStorage while everything else uses IndexedDB. Two completely different storage APIs in one file.
8. Generic accessors bypass type safety — getAllStoreData/putStoreData/deleteStoreRecord (lines 2516–2557) use as never casts and string-matched store names. This exists to support sync but creates a hole in the type system.
9. Consumer coupling surface — Only 8 files import from storage.ts, but they import types that should be in a domain layer (e.g., recipe-synergy.ts imports RecipeRecord, nutrition-calcs.ts imports ActivityLevel). Domain logic depends on the storage file for type definitions.
4. Testability
Why this file is nearly impossible to unit test:
1. No dependency injection — getDB() is a module-level singleton. You cannot inject a mock database without monkeypatching the module.
2. No interfaces/seams — Every function is a concrete async function hitting real IndexedDB. There is no IRecipeRepository or IStorageAdapter.
3. Side effects everywhere — Every write calls logChange() which writes to another store. You cannot test createRecipe without also testing the sync change log.
4. Browser-only — IndexedDB requires a browser environment (or a heavy fake-indexeddb dependency). getStoredApiKey() checks typeof window. No function can run in Node.js without polyfills.
5. No pure functions — Even buildSeedTemplates() calls generateUUID() and new Date(), making assertions on exact values impossible.
6. Implicit migrations on read — getAllRecipes() calls migrateRecipe() which mutates records. Tests would need to account for migration behavior when testing read operations.
Recommended seams:
interface IStorageAdapter {
  getAll<T>(storeName: string): Promise<T[]>;
  get<T>(storeName: string, key: string): Promise<T | undefined>;
  put<T>(storeName: string, value: T): Promise<void>;
  delete(storeName: string, key: string): Promise<void>;
  getAllFromIndex<T>(storeName: string, indexName: string, query: IDBValidKey): Promise<T[]>;
  transaction(storeNames: string[], mode: IDBTransactionMode): ITransaction;
}

interface IRecipeRepository {
  getAll(): Promise<RecipeRecord[]>;
  getById(id: string): Promise<RecipeRecord | undefined>;
  create(name: string): Promise<RecipeRecord>;
  update(id: string, data: Partial<RecipeRecord>): Promise<RecipeRecord>;
  delete(id: string): Promise<void>;
}

interface ISyncChangeLog {
  log(storeName: string, recordId: string, action: 'upsert' | 'delete', data?: unknown): Promise<void>;
  getUnsynced(): Promise<SyncChangeLogEntry[]>;
  markSynced(ids: string[]): Promise<void>;
}
5. Scalability
At 10x growth:
1. The file will exceed 25,000 lines. It is already 2,567 lines with 24 stores. Adding features like meal prep automation, recipe scaling, shopping list intelligence, social features, or analytics would each add hundreds of lines.
2. Merge conflicts will be constant. Any two developers touching storage will conflict on the same file. The DB_VERSION constant (line 492) alone will be a bottleneck — every schema change increments it, and only one PR can do so at a time.
3. Schema evolution becomes catastrophic. The upgrade() function (line 499) is a linear chain of if (oldVersion < N) blocks. At DB_VERSION 13 it's already 106 lines. At version 30+ it will be unmanageable. There is no rollback strategy.
4. No adapter abstraction means adding SQLite for mobile requires rewriting every function. Adding PostgreSQL sync requires the same. The Go sync service will need to replicate the exact same schema.
5. The logChange() silent catch at line 2467 (catch {}) means sync failures are silently swallowed. At scale, this will cause silent data loss during sync.
6. Stringly-typed generic accessors (getAllStoreData, putStoreData) have hardcoded allowlists that must be manually kept in sync with the schema. Lines 2518–2524 and 2531–2537 and 2548–2554 are three copies of the same list.
With additional developers:
1. No clear ownership boundaries. A developer working on nutrition features must understand and risk breaking book/chapter logic.
2. Review burden. Any PR touching storage.ts requires a reviewer who understands all 24 stores, all 13 migrations, sync semantics, and cascade logic.
3. No enforced contracts. The generic accessors and as never casts mean TypeScript cannot catch store name typos or shape mismatches.
6. Refactoring Strategy
Phase 0: Extract Types (1-2 days, zero risk)
src/lib/models/
  recipe.types.ts     — RecipeRecord, IngredientRecord, IngredientGroup
  book.types.ts       — BookRecord, ChapterRecord, ChapterRecipeRecord, ChapterPageRecord, BookPageRecord
  meal-plan.types.ts  — MealPlanRecord, DayPlanEntryRecord, MealGroupRecord, DaySlot
  nutrition.types.ts  — NutritionProfileRecord, FoodLogEntryRecord, WeightEntryRecord, DietaryProfileRecord
  template.types.ts   — TemplateRecord, TemplateLayoutRecord, TemplateSectionRecord, TemplateThemeRecord
  grocery.types.ts    — GroceryChecklistRecord, SeasonalFoodsRecord, PantryStapleRecord, CustomFoodRecord
  sync.types.ts       — SyncChangeLogEntry, SyncServerConfig
  settings.types.ts   — AppSettingsRecord, UserLocationRecord
  shared.types.ts     — CategoryRecord, RecipeCategoryRecord, BrandKit, SharedRecipeRecord
Re-export from storage.ts for backward compatibility.
Phase 1: Define Repository Interfaces (2-3 days, zero risk)
// src/lib/repositories/interfaces.ts
interface IRepository<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

interface IRecipeRepository extends IRepository<RecipeRecord> { ... }
interface IBookRepository extends IRepository<BookRecord> { ... }
// etc.
Phase 2: Extract Storage Adapter (2-3 days, low risk)
// src/lib/adapters/idb-adapter.ts
class IndexedDbAdapter implements IStorageAdapter {
  private db: IDBPDatabase<DietLedgerDB>;
  async getAll<T>(store: string): Promise<T[]>;
  async get<T>(store: string, key: string): Promise<T | undefined>;
  async put<T>(store: string, value: T): Promise<void>;
  async delete(store: string, key: string): Promise<void>;
  // ... transaction support
}
Phase 3: Extract Repositories (5-7 days, medium risk)
src/lib/repositories/
  recipe.repository.ts   — RecipeRepository (extract lines 613–791)
  book.repository.ts     — BookRepository (extract lines 795–1276)
  category.repository.ts — CategoryRepository (extract lines 1280–1407)
  template.repository.ts — TemplateRepository + seed logic (extract lines 1411–1680)
  meal-plan.repository.ts — MealPlanRepository (extract lines 1684–1930)
  nutrition.repository.ts — NutritionRepository (extract lines 2099–2349)
  custom-food.repository.ts — CustomFoodRepository (extract lines 2065–2097)
  grocery.repository.ts  — GroceryRepository (extract lines 1950–2061)
  brand-kit.repository.ts — BrandKitRepository (extract lines 2382–2420)
  shared-recipe.repository.ts — SharedRecipeCache (extract lines 2353–2378)
  settings.repository.ts — AppSettings + UserLocation (extract lines 2004–2018, 2559–2567)
Phase 4: Extract Sync Layer (3-5 days, medium risk)
// src/lib/sync/sync-change-log.ts
class SyncChangeLog implements ISyncChangeLog { ... }

// src/lib/sync/sync-engine.ts
class SyncEngine {
  constructor(changeLog: ISyncChangeLog, serverConfig: ISyncServerRepository) { ... }
}
Move logChange() calls out of repositories via an event bus or decorator pattern so sync is opt-in, not mandatory.
Phase 5: Extract Migrations (2-3 days, low risk)
// src/lib/migrations/
  v1.ts, v2.ts, ... v13.ts
  index.ts — composes all migrations

// src/lib/migrations/migrate-recipe.ts
export function migrateRecipe(recipe: RecipeRecord): void { ... }
Phase 6: Extract Seed Data (1-2 days, low risk)
// src/data/seed-templates.ts  — buildSeedTemplates()
// src/data/seasonal-produce.ts (already exists)
// src/data/pantry-staples.ts (already exists)
Target Architecture:
src/lib/
  models/              # Pure type definitions
  adapters/
    idb-adapter.ts     # IndexedDB implementation
    sqlite-adapter.ts  # Future: React Native / Electron
    memory-adapter.ts  # For testing
  repositories/
    interfaces.ts      # All repository contracts
    recipe.repository.ts
    book.repository.ts
    meal-plan.repository.ts
    nutrition.repository.ts
    ...
  sync/
    sync-change-log.ts
    sync-engine.ts
    sync-server.repository.ts
  migrations/
    index.ts
    v1.ts ... v13.ts
  seeds/
    templates.ts
    seasonal.ts
    pantry.ts
7. Risk Assessment
Metric	Score	Justification
Risk Level	HIGH	Every feature in the app funnels through one file. A single bad migration or regression breaks everything.
Technical Debt	8/10	2,567 lines, 140 exports, 25 inline types, 8 concerns mixed, no abstractions, silent error swallowing, three copies of the same store name list.
Maintainability	2/10	No developer can understand this file in one sitting. Adding a new store requires changes in 5+ scattered locations (interface, schema, migration, CRUD, generic accessors allowlist ×3).
Testability	1/10	Zero test seams. No DI. No interfaces. Browser-only. Side effects on every write.
Refactor Priority	CRITICAL	This file is the foundation of the app. Every future feature (offline sync, PostgreSQL, SQLite, Go service, open-source contributions) depends on this being decomposed first. Delaying this means every new feature adds to the debt.
Top 3 Immediate Risks:
1. logChange() silently catches all errors (line 2467: catch {}) — sync failures are invisible. Users will lose data without knowing.
2. No migration rollback — if DB_VERSION 14 introduces a bug, users cannot downgrade. Their data is locked into the broken schema.
3. Three copies of the store name allowlist (lines 2518, 2531, 2548) — adding a new store requires updating all three. Miss one and the generic accessors silently do nothing.
Verdict: This is a textbook God Object. It should be the #1 refactoring priority before any new feature work.