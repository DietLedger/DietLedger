# Zustand Store Analysis — DietLedger Simplification

> Generated: Phase 0 planning artifact
> Purpose: Classify each Zustand store for KEEP/SIMPLIFY/REMOVE, identify React Query replacement potential, quantify LOC savings

---

## 1. `useRecipeStore` (`src/lib/recipe-store.ts`, 945 LOC)

**State Owned:**

| Field | Type | Classification |
|-------|------|----------------|
| `recipes` | `Recipe[]` | Server state (fetched via `getApiClient().getRecipes()`) |
| `activeRecipe` | `Recipe \| null` | UI state (selection) + Server state (hydrated from API on select) |
| `isSearching` | `boolean` | UI state |
| `searchResults` | `FDAFood[]` | Server state (FDA API search results + custom foods) |
| `searchSource` | `'fda' \| 'fallback' \| 'local' \| null` | Derived state (where results came from) |
| `isLoading` | `boolean` | UI state |
| `error` | `string \| null` | UI state |
| `apiKey` | `string` | Client state (localStorage FDA key) |

**Could React Query replace it?** Partially. `recipes` and `activeRecipe` could be React Query cache. The store does optimistic updates after mutations (e.g., line 283-287: after `createRecipe`, it updates local state before server confirms). React Query handles this via `useMutation` + `queryClient.setQueryData` with `onSuccess` invalidation. The fetch-all-pages loop at lines 262-267 is exactly the kind of thing React Query's `useInfiniteQuery` handles.

**Could React useState replace it?** No. The store is shared across the recipe list page, the recipe editor page, the recipe renderer, nutrition label, and app-nav. At least 5 components read from it. `useState` cannot share state across components without prop drilling.

**What would be lost?** Recipe CRUD, ingredient management, food search, nutrition calculation, ingredient/instruction grouping and reordering, FDA key management — essentially the entire recipe editing experience.

**Verdict: SIMPLIFY** — Replace `recipes`/`activeRecipe` with React Query. Keep `apiKey` in localStorage directly. Keep `isSearching`/`searchResults`/`searchSource` as local component state or a dedicated search hook. The store's 945 LOC can shrink to ~300 LOC of React Query hooks + utilities.

---

## 2. `useBookStore` (`src/lib/book-store.ts`, 694 LOC)

**State Owned:**

| Field | Type | Classification |
|-------|------|----------------|
| `books` | `BookRecord[]` | Server state |
| `activeBook` | `BookWithChapters \| null` | Server state (deep: book + chapters + recipes + pages, all from API) |
| `categories` | `CategoryRecord[]` | Server state |
| `categoryTree` | `CategoryNode[]` | Derived state (computed from `categories` via `buildCategoryTree()`) |
| `recipeCategories` | `Map<string, RecipeCategoryRecord[]>` | Server state (per-recipe category assignments) |
| `isLoading` | `boolean` | UI state |
| `error` | `string \| null` | UI state |

**Could React Query replace it?** Yes, extensively. `books` → `useQuery(['books'])`. `activeBook` → `useQuery(['book', id], { enabled: !!id })` with the nested fetch at lines 117-124 as the query function. `categories` → `useQuery(['categories'])`. `categoryTree` → `useMemo` on categories. `recipeCategories` → `useQuery(['recipe-categories', recipeId])`. Every mutation already calls `getApiClient()` then manually updates local state — React Query handles this via cache invalidation.

**Could React useState replace it?** No. Shared across book list, book editor, book viewer, categories panel, category tree, and recipe pages.

**What would be lost?** Book CRUD, chapter management, page management, category CRUD, recipe-category assignment, drag-and-drop reordering of chapters/recipes/pages, move operations between chapters.

**Verdict: SIMPLIFY** — This store is 100% server-state management with a derived tree. React Query + useMemo could replace ~600 of the 694 LOC. The `buildCategoryTree` utility stays. The store shrinks to zero if converted to hooks.

---

## 3. `useNutritionStore` (`src/lib/nutrition-store.ts`, 314 LOC)

**State Owned:**

| Field | Type | Classification |
|-------|------|----------------|
| `profiles` | `NutritionProfileRecord[]` | Server state |
| `activeProfileId` | `string \| null` | UI state (selection) |
| `foodLog` | `FoodLogEntryRecord[]` | Server state |
| `weights` | `WeightEntryRecord[]` | Server state |
| `isLoading` | `boolean` | UI state |
| `error` | `string \| null` | UI state |

**Special note:** Lines 215-267 contain `syncToServer()` and `syncFromServer()` methods that POST to `/api/nutrition/sync`. Lines 277-313 contain `syncSingleProfile()`, `syncSingleFoodLog()`, `syncSingleWeight()` called after every mutation. This is **redundant** — the store already calls `getApiClient()` for CRUD, which hits the Go API. The sync calls are an artifact of the old dual-write pattern (write to IndexedDB + sync to server). In server-only mode, these are no-ops or double-writes.

**Could React Query replace it?** Yes, fully. `profiles` → `useQuery(['nutrition-profiles'])`. `foodLog` → `useQuery(['food-log', profileId, dateRange])`. `weights` → `useQuery(['weights', profileId])`. `activeProfileId` → `useState` or URL param. The sync methods (lines 215-313) would be entirely removed.

**Could React useState replace it?** No. Shared across nutrition dashboard, profile pages, food log, weight tracking, charts, reports.

**What would be lost?** Profile CRUD, food log CRUD, weight tracking, the redundant sync methods.

**Verdict: SIMPLIFY** — Remove `syncToServer`/`syncFromServer`/`syncSingle*` methods (100 LOC of dead sync code). Replace with React Query. Keep `activeProfileId` as URL state or localStorage.

---

## 4. `useMealPlanStore` (`src/lib/meal-plan-store.ts`, 288 LOC)

**State Owned:**

| Field | Type | Classification |
|-------|------|----------------|
| `mealPlans` | `MealPlanRecord[]` | Server state |
| `activeMealPlan` | `MealPlanRecord \| null` | Server state + UI selection |
| `dayEntries` | `DayPlanEntryRecord[]` | Server state |
| `mealGroups` | `MealGroupRecord[]` | Server state |
| `isLoading` | `boolean` | UI state |
| `error` | `string \| null` | UI state |

**Could React Query replace it?** Yes. `mealPlans` → `useQuery(['meal-plans'])`. `activeMealPlan` + `dayEntries` + `mealGroups` → `useQuery(['week-plan', weekStart])` with the combined fetch at lines 81-88. All mutations already call `getApiClient()`, then manually update state — React Query handles this via invalidation.

**Could React useState replace it?** No. Shared across meal plan list, week view, grocery list, meal group management.

**What would be lost?** Meal plan CRUD, slot assignment, recipe-to-slot, food-to-slot, group management, reordering, leftover toggling.

**Verdict: SIMPLIFY** — Pure server-state store. React Query replaces all state management. The store's logic (reordering, grouping) stays as hook utilities.

---

## 5. `useTemplateStore` (`src/lib/template-store.ts`, 93 LOC)

**State Owned:**

| Field | Type | Classification |
|-------|------|----------------|
| `templates` | `TemplateRecord[]` | Server state (currently via `LocalApiClient`→IndexedDB, needs migration) |
| `isLoading` | `boolean` | UI state |
| `error` | `string \| null` | UI state |

**Could React Query replace it?** Yes, trivially. `templates` → `useQuery(['templates'])`. The store is 93 LOC of fetch + CRUD with simple state updates.

**Could React useState replace it?** Yes, if the component tree using templates is shallow. But templates are used in cookbook export, recipe renderer, template editor, and book editor — at least 4 consumers. useState would require prop drilling or context.

**What would be lost?** Template CRUD, duplication. Templates control how recipes and books are rendered for print/export.

**Verdict: SIMPLIFY** — Smallest store. Easiest React Query conversion. One `useQuery` + three `useMutation` hooks.

---

## 6. `useDietaryStore` (`src/lib/dietary-store.ts`, 155 LOC)

**State Owned:**

| Field | Type | Classification |
|-------|------|----------------|
| `profiles` | `DietaryProfileRecord[]` | Server state (currently via `LocalApiClient`→IndexedDB, needs migration) |
| `activeProfileId` | `string \| null` | UI state (selection) |
| `allergenRules` | `AllergenRuleRecord[]` | Server state (per-profile) |
| `isLoading` | `boolean` | UI state |
| `error` | `string \| null` | UI state |

**Could React Query replace it?** Yes. `profiles` → `useQuery(['dietary-profiles'])`. `allergenRules` → `useQuery(['allergen-rules', profileId])`. `activeProfileId` → URL state or localStorage.

**Could React useState replace it?** No. Shared across dietary filters, compliance reports, allergen panel.

**What would be lost?** Dietary profile CRUD, allergen rule management, dietary tag management, nutrient threshold management.

**Verdict: SIMPLIFY** — Pure server state. Same pattern as template-store. Note: currently delegates to `LocalApiClient` (line 39: `getApiClient().getDietaryProfiles()`), so it needs server API endpoints or localStorage migration first.

---

## 7. `useAppSettingsStore` (`src/lib/app-settings-store.ts`, 48 LOC)

**State Owned:**

| Field | Type | Classification |
|-------|------|----------------|
| `defaultMealSlotTimes` | `MealSlotTimes` | Client state (persisted in IndexedDB via `storage.ts`) |
| `isLoading` | `boolean` | UI state |

**Could React Query replace it?** No. This is not server data. It's a user preference stored in IndexedDB.

**Could React useState replace it?** Yes, with `useSyncExternalStore` or a custom hook backed by localStorage. The store is 48 LOC with only 2 operations: read and write a single JSON object.

**What would be lost?** Meal slot time customization (7:30 morning, 12:00 noon, etc.).

**Verdict: SIMPLIFY** — Replace IndexedDB persistence with localStorage. The store can become a 20-line custom hook: `useMealSlotTimes()` that reads/writes a single localStorage key.

---

## 8. `useSyncStore` (`src/lib/sync-store.ts`, 183 LOC)

**State Owned:**

| Field | Type | Classification |
|-------|------|----------------|
| `servers` | `SyncServerConfig[]` | Client state (sync server configs, stored in IndexedDB) |
| `isLoading` | `boolean` | UI state |
| `syncingServerId` | `string \| null` | UI state |
| `error` | `string \| null` | UI state |

**Could React Query replace it?** No, and it shouldn't. This entire store manages the sync engine which is being removed.

**Could React useState replace it?** Irrelevant.

**What would be lost?** Nothing — sync is being removed per the simplification plan.

**Verdict: REMOVE** — No consumers in current UI (the sync components at `src/components/sync/` have no layout imports). The store is dead code.

---

## Summary Table

| Store | LOC | State Owned | Can Remove? | Replacement | Classification |
|-------|-----|-------------|-------------|-------------|----------------|
| `useRecipeStore` | 945 | `recipes`, `activeRecipe`, `searchResults`, `apiKey`, `isSearching`, `isLoading`, `error` | No | React Query for server state, useState for search UI, localStorage for API key | **SIMPLIFY** |
| `useBookStore` | 694 | `books`, `activeBook`, `categories`, `categoryTree`, `recipeCategories`, `isLoading`, `error` | No | React Query for all server state, useMemo for categoryTree | **SIMPLIFY** |
| `useNutritionStore` | 314 | `profiles`, `activeProfileId`, `foodLog`, `weights`, `isLoading`, `error` | No | React Query for server state, URL param or localStorage for activeProfileId. Delete sync methods (100 LOC). | **SIMPLIFY** |
| `useMealPlanStore` | 288 | `mealPlans`, `activeMealPlan`, `dayEntries`, `mealGroups`, `isLoading`, `error` | No | React Query for all server state | **SIMPLIFY** |
| `useTemplateStore` | 93 | `templates`, `isLoading`, `error` | No | React Query (needs server API endpoint first) or localStorage | **SIMPLIFY** |
| `useDietaryStore` | 155 | `profiles`, `activeProfileId`, `allergenRules`, `isLoading`, `error` | No | React Query (needs server API endpoint first) or localStorage | **SIMPLIFY** |
| `useAppSettingsStore` | 48 | `defaultMealSlotTimes`, `isLoading` | Yes | useState + localStorage (single JSON object) | **SIMPLIFY** |
| `useSyncStore` | 183 | `servers`, `syncingServerId`, `isLoading`, `error` | Yes | Delete entirely | **REMOVE** |

**Total LOC in stores: 2,720**
**Total LOC after simplification (estimated): ~500-700** (React Query hooks + utilities)
**Net savings: ~2,000-2,200 LOC**

---

## Key Observations

1. **Every store is already server-first.** All 7 non-sync stores call `getApiClient()` exclusively. None read from IndexedDB directly (the `storage.ts` imports in `recipe-store.ts` are only for `getStoredApiKey`/`setStoredApiKey` — a localStorage helper).

2. **The stores are thin wrappers over API calls.** The median store is ~300 LOC of: call API → update local array/map. React Query replaces this pattern.

3. **`nutrition-store.ts` has dead sync code.** Lines 215-313 (100 LOC) implement `syncToServer`/`syncFromServer`/`syncSingle*` that POST to `/api/nutrition/sync` after every mutation. Since mutations already go through `getApiClient()` (which hits the Go API), these sync calls are redundant double-writes. They can be deleted immediately.

4. **Optimistic updates are rare.** Only `recipe-store.ts` does optimistic updates (e.g., reorder operations at lines 706-729 update state immediately, then fire API calls). Most stores wait for API response before updating state. This makes React Query migration straightforward — mutations invalidate caches on success.

5. **`activeX` selection state is the trickiest part.** Each domain store has an `activeRecipe`, `activeBook`, `activeMealPlan`, `activeProfileId`. These are UI selections, not server state. In a React Query world, these become URL params (`/recipes/[id]`) or localStorage values, with the actual data fetched via `useQuery(['recipe', id])`.

6. **The stores couple server state with UI state.** `isLoading` and `error` are duplicated across all 7 stores. React Query provides `isLoading`, `isError`, `error` for free via `useQuery`/`useMutation` return values.

---

## Detailed React Query Migration Map

| Store | React Query Keys | Mutations Needed |
|-------|-----------------|------------------|
| RecipeStore | `['recipes']`, `['recipe', id]` | create, update, delete, addIngredient, removeIngredient, updateIngredient |
| BookStore | `['books']`, `['book', id]`, `['categories']`, `['recipe-categories', recipeId]` | ~15 mutations for books, chapters, pages, categories |
| NutritionStore | `['nutrition-profiles']`, `['food-log', profileId, date]`, `['weights', profileId]` | create/update/delete profile, food log entry, weight entry |
| MealPlanStore | `['meal-plans']`, `['week-plan', weekStart]` | ~10 mutations for plans, entries, groups |
| TemplateStore | `['templates']` | create, update, delete |
| DietaryStore | `['dietary-profiles']`, `['allergen-rules', profileId]` | create/update/delete profile, allergen rules |
| AppSettingsStore | (not server state) | N/A — replace with `useSyncExternalStore` + localStorage |

---

## Open Questions

### Q1: Brand Kits Storage
Brand kits (`src/components/brand-kit-editor.tsx`) currently store data in IndexedDB via `storage.ts`. In Phase 1 server-only mode:
- **Option A**: Migrate to localStorage (simple, immediate, limited to ~5MB)
- **Option B**: Create Go API endpoints + PostgreSQL table (proper, requires backend work)
- **Option C**: Postpone brand kit feature entirely until Phase 2

### Q2: Pantry Staples Storage
Pantry staples (`src/components/pantry-staples-panel.tsx`) currently store data in IndexedDB via `storage.ts`:
- **Option A**: Migrate to localStorage
- **Option B**: Create Go API endpoints + PostgreSQL table
- **Option C**: Postpone pantry staples feature entirely until Phase 2

### Q3: User Location Storage
User location (`src/components/location-panel.tsx`) currently stores in IndexedDB via `storage.ts`:
- **Option A**: Migrate to localStorage (simplest — location is a single lat/lng pair)
- **Option B**: Create Go API endpoint + PostgreSQL column on user settings
- **Option C**: Postpone location feature entirely until Phase 2
