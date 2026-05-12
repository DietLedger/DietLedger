# Implementation Plan: Food Synergies, Seasonal Foods & Storage Locations

## Overview
Four interconnected features:

1. **Food Synergies Panel** — Two-panel sidebar on the meal plan weekly view. Top: in-season foods. Bottom: recipe suggestions by shared ingredients (no minimum — 1 non-staple match qualifies, sorted most→least shared, lazy-loaded 20 at a time, searchable). Slot selection via inline `Select` dropdown.
2. **Seasonal Foods & Location** — Country + region selection (not ZIP). USA populated first via scrape script targeting seasonalfoodguide.org's embedded data (173 produce items, 50 states + DC, 24 bi-monthly periods). Other countries extensible.
3. **Storage Location** — `storageLocation` field on ingredients (Pantry/Refrigerator/Freezer/Countertop). Shown on grocery list. Editable in recipe editor. Separate `leftoverStorage` field on recipes (stays recipe-level only).
4. **Pantry Staples** — Manageable in Settings, seeded with ~50 defaults, used for synergy filtering.

## Architecture Decisions

- **Country + Region, not ZIP**: `userLocation` stores `{ country: string, region: string }`. For USA, regions are: Northeast, Southeast, Midwest, Southwest, West (matching the source data's 5 regions). Other countries can define their own region breakdown later.
- **Scrape script**: A one-time Node.js script that downloads the seasonalfoodguide.org JS bundle, extracts the embedded JSON produce array (webpack module 6907), aggregates state→region mappings, and outputs `src/data/seasonal-produce.ts`. The script is kept in `scripts/` for future re-runs.
- **Season encoding**: Source uses 24 bi-monthly periods (1=Early Jan, 24=Late Dec). Script converts to 12 months — a produce item is "in season" for a month if any bi-monthly period in that month has data.
- **IndexedDB v7**: Four new stores (`seasonalFoods`, `pantryStaples`, `userLocation`, `produceItems`) plus `storageLocation` on `IngredientRecord` and `leftoverStorage` on `RecipeRecord`.
- **Recipe-level `leftoverStorage` does NOT propagate** to ingredient-level. These are independent fields.
- **Lazy loading**: 20 items displayed, loads 20 more on scroll near bottom.
- **No minimum synergy threshold**: 1+ non-staple shared ingredient qualifies.

## Task List

### Phase 1: Scrape Script & Seed Data

- [x] **Task 1: Create seasonal produce scrape script**
  Create `scripts/scrape-seasonal-produce.mjs`:
  1. Download `https://www.seasonalfoodguide.org/js/app.e1ba7d08.js` (or fetch current bundle URL)
  2. Extract JSON from webpack module 6907 (the `JSON.parse('...')` call)
  3. Parse the 173 produce items
  4. Map each state code to one of 5 USA regions using the source's own region mapping:
     - **Northeast**: CT, DE, DC, ME, MD, MA, NH, NJ, NY, PA, RI, VT
     - **Southeast**: AL, AR, FL, GA, KY, LA, MS, NC, SC, TN, VA, WV
     - **Midwest**: IL, IN, IA, KS, MI, MN, MO, NE, ND, OH, SD, WI
     - **Southwest**: AZ, NM, OK, TX
     - **West**: AK, CA, CO, HI, ID, MT, NV, OR, UT, WA, WY
  5. Convert 24-period seasons to 12 months: if a produce item has season value 1 or 2 for a state, it's in season for month 1 (January), etc.
  6. Aggregate: for each region + month, collect all produce names from all states in that region
  7. Deduplicate and sort
  8. Write output to `src/data/seasonal-produce.ts` as a typed TypeScript file

  **Acceptance criteria:**
  - [x] Script runs with `node scripts/scrape-seasonal-produce.mjs`
  - [x] Output file has 5 regions × 12 months of data
  - [x] Each month has at least 10 produce items per region
  - [x] Summer months in Southeast include peaches, okra, tomatoes
  - [x] Script can be re-run if source data updates

  **Dependencies:** None
  **Files:** `scripts/scrape-seasonal-produce.mjs` (new)
  **Scope:** M

- [x] **Task 2: Run scrape script and generate seed data file**
  Run the script to produce `src/data/seasonal-produce.ts` containing:
  - `DEFAULT_SEASONAL_FOODS: Record<string, Record<number, string[]>>` — region → month (1-12) → produce names
  - `USA_REGIONS: string[]` — the 5 region names
  - `USA_STATES_TO_REGION: Record<string, string>` — state code → region

  **Acceptance criteria:**
  - [x] File compiles with TypeScript
  - [x] All 5 regions populated
  - [x] 12 months per region

  **Dependencies:** Task 1
  **Files:** `src/data/seasonal-produce.ts` (generated)
  **Scope:** S (generated output)

- [x] **Task 3: Create pantry staples seed data**
  Create `src/data/pantry-staples.ts`:
  - `DEFAULT_PANTRY_STAPLES: string[]` — ~55 items including all common oils individually (olive oil, vegetable oil, canola oil, avocado oil, coconut oil, sesame oil, peanut oil), salts, peppers, sugars, flours, leaveners, vinegars, condiments, basic aromatics, liquids, dairy basics

  **Acceptance criteria:**
  - [x] 50+ items
  - [x] All common oils listed individually
  - [x] File compiles

  **Dependencies:** None
  **Files:** `src/data/pantry-staples.ts` (new)
  **Scope:** S

- [x] **Task 4: Create storage location constants**
  Create `src/data/storage-locations.ts`:
  - `STORAGE_LOCATIONS = ['Pantry', 'Refrigerator', 'Freezer', 'Countertop'] as const`
  - `type StorageLocation = typeof STORAGE_LOCATIONS[number]`
  - `STORAGE_LOCATION_META: Record<StorageLocation, { icon: string; color: string }>` for UI badges

  **Dependencies:** None
  **Files:** `src/data/storage-locations.ts` (new)
  **Scope:** XS

### Checkpoint: Seed Data
- [x] All data files compile
- [x] Scrape script produces correct output
- [x] `npm run build` passes with new files

---

### Phase 2: Database Schema

- [x] **Task 5: Add new stores and fields to IndexedDB v7**
  Modify `src/lib/storage.ts`:
  1. Bump `DB_VERSION` to 7
  2. Add `seasonalFoods` store: `{ id: string; country: string; region: string; month: number; foods: string[] }` with index `by-country-region-month` on `[country, region, month]`
  3. Add `pantryStaples` store: `{ id: string; name: string }` with index `by-name` on `name`
  4. Add `userLocation` store: single record `{ id: 'default'; country: string; region: string; updatedAt: string }`
  5. Add `storageLocation?: string` to `IngredientRecord` (optional, undefined for existing records)
  6. Add `leftoverStorage?: string` to `RecipeRecord` (optional, undefined for existing records)
  7. Migration handler for `oldVersion < 7` — creates new stores only
  8. Export new interfaces and CRUD functions:
     - `getSeasonalFoods(country: string, region: string, month: number): Promise<string[]>`
     - `setSeasonalFoods(country: string, region: string, month: number, foods: string[]): Promise<void>`
     - `getAllPantryStaples(): Promise<string[]>`
     - `addPantryStaple(name: string): Promise<void>`
     - `removePantryStaple(name: string): Promise<void>`
     - `getUserLocation(): Promise<UserLocationRecord | undefined>`
     - `setUserLocation(country: string, region: string): Promise<void>`
  9. Seed functions:
     - `seedSeasonalFoodsIfNeeded(country: string, region: string): Promise<void>` — imports `DEFAULT_SEASONAL_FOODS` and seeds 12 months for the given country+region
     - `seedPantryStaplesIfNeeded(): Promise<void>` — imports `DEFAULT_PANTRY_STAPLES` and seeds them

  **Acceptance criteria:**
  - [x] DB_VERSION is 7
  - [x] Fresh DB creates all stores
  - [x] Upgrade from v6 preserves all existing data
  - [x] `storageLocation` and `leftoverStorage` are optional — existing records unaffected
  - [x] All CRUD functions work

  **Dependencies:** Tasks 2, 3
  **Files:** `src/lib/storage.ts`
  **Scope:** M

### Checkpoint: Database
- [x] `npm run build` succeeds
- [x] Fresh app creates new stores and seeds data

---

### Phase 3: Computation Layer

- [x] **Task 6: Create recipe synergy computation utility**
  Create `src/lib/recipe-synergy.ts`:

  ```typescript
  interface SynergyResult {
    recipe: Recipe;
    sharedIngredients: string[];
    score: number;
  }

  function computeSynergies(
    mealPlanRecipeIds: string[],
    allRecipes: Recipe[],
    pantryStaples: Set<string>
  ): SynergyResult[]

  function findRecipesContainingIngredient(
    recipes: Recipe[],
    ingredientName: string
  ): Recipe[]
  ```

  Logic for `computeSynergies`:
  1. Collect all unique `name.toLowerCase().trim()` from meal plan recipe ingredients
  2. Remove any matching pantry staples (case-insensitive exact match)
  3. For each recipe NOT in the meal plan, count overlap of its non-staple ingredients
  4. Filter to recipes with **1+** shared non-staple ingredient (no minimum threshold)
  5. Sort descending by score (count of shared non-staple ingredients)

  `findRecipesContainingIngredient`: case-insensitive `includes()` substring match.

  **Acceptance criteria:**
  - [x] Returns all recipes sharing 1+ non-staple ingredient
  - [x] Sorted by score descending
  - [x] Excludes recipes already in the meal plan
  - [x] Recipes sharing only pantry staples are excluded
  - [x] Empty meal plan returns empty array

  **Dependencies:** Task 5
  **Files:** `src/lib/recipe-synergy.ts` (new)
  **Scope:** S

### Checkpoint: Computation
- [x] Functions produce correct results with sample data

---

### Phase 4: Settings UI

- [x] **Task 7: Create PantryStaplesPanel component**
  Create `src/components/pantry-staples-panel.tsx`:
  - Alphabetically sorted list of staple chips/badges with X remove buttons
  - Input + "Add" button at top
  - Case-insensitive duplicate prevention
  - Uses storage CRUD functions

  **Acceptance criteria:**
  - [x] Lists all staples from IndexedDB
  - [x] Add/remove works
  - [x] Duplicates prevented
  - [x] Persists across reloads

  **Dependencies:** Task 5
  **Files:** `src/components/pantry-staples-panel.tsx` (new)
  **Scope:** S

- [x] **Task 8: Create LocationPanel component**
  Create `src/components/location-panel.tsx`:
  - Country dropdown: starts with just "United States"
  - Region dropdown: populated based on country selection. For "United States": Northeast, Southeast, Midwest, Southwest, West
  - On change: saves to IndexedDB, triggers seasonal food re-seed if region changed
  - Shows currently saved country + region

  **Acceptance criteria:**
  - [x] Shows current country/region if set
  - [x] Selecting a new region saves it
  - [x] Changing region triggers seasonal food re-seed
  - [x] Defaults to "United States" / "Northeast" if not set

  **Dependencies:** Tasks 2, 5
  **Files:** `src/components/location-panel.tsx` (new)
  **Scope:** S

- [x] **Task 9: Add "Pantry Staples" and "Location" tabs to Settings**
  Modify `src/components/app-nav.tsx`:
  1. Import `Package` and `MapPin` icons from lucide-react
  2. Add two new `TabsTrigger` items after "Categories"
  3. Add `TabsContent` for each rendering respective panel

  **Acceptance criteria:**
  - [x] Two new tabs visible
  - [x] Both panels render and function
  - [x] Existing tabs unaffected

  **Dependencies:** Tasks 7, 8
  **Files:** `src/components/app-nav.tsx`
  **Scope:** XS

### Checkpoint: Settings
- [x] All 6 settings tabs work
- [x] Pantry staples persist
- [x] Location saves and reseeds seasonal data

---

### Phase 5: Food Synergies UI

- [x] **Task 10: Create FoodSynergiesPanel component**
  Create `src/components/meal-plan/food-synergies-panel.tsx`:
  - Two vertically-stacked panels, each 50% height with `ScrollArea`
  - **Top ("In Season")**: Month label + list of in-season foods as clickable buttons
  - **Bottom ("Synergies")**:
    - Search `Input` at top of list
    - Shows all synergy results (1+ non-staple, sorted by score desc)
    - Lazy loading: state tracks `displayCount` (starts 20). On scroll near bottom, increment by 20
    - Each recipe row: name, shared count badge, shared ingredient names, click to add to default slot
  - Empty states for all scenarios

  Props:
  ```typescript
  {
    editingDay: string | null;
    dayEntries: DayPlanEntryRecord[];
    allRecipes: Recipe[];
    pantryStaples: Set<string>;
    seasonalFoods: string[];
    currentMonth: number;
    onSeasonalFoodClick: (foodName: string) => void;
    onAddToSlot: (recipeId: string, slot: DaySlot) => void;
  }
  ```

  **Acceptance criteria:**
  - [x] Top panel shows in-season foods with month label
  - [x] Bottom shows all synergy results (1+ non-staple, sorted desc by score)
  - [x] Search input filters by recipe name
  - [x] 20 items shown initially; scrolling near bottom loads 20 more
  - [x] Both panels have `ScrollArea` with scrollbars
  - [x] Panels split 50/50 vertically

  **Dependencies:** Task 6
  **Files:** `src/components/meal-plan/food-synergies-panel.tsx` (new)
  **Scope:** M

- [x] **Task 11: Create InSeasonRecipeDialog component**
  Create `src/components/meal-plan/in-season-recipe-dialog.tsx`:
  - Uses shadcn `Dialog`
  - Title: "Recipes with [Food Name]"
  - `Input` for search/filter
  - Each recipe row: name + `Select` dropdown (5 slots) + "Add" `Button`
  - `Select` defaults to first empty slot for the editing day
  - "Add" calls `onAddToSlot(recipeId, selectedSlot)`

  Props:
  ```typescript
  {
    foodName: string | null;
    editingDay: string | null;
    dayEntries: DayPlanEntryRecord[];
    allRecipes: Recipe[];
    onClose: () => void;
    onAddToSlot: (recipeId: string, slot: DaySlot) => void;
  }
  ```

  **Acceptance criteria:**
  - [x] Dialog opens on in-season food click
  - [x] Shows recipes containing that ingredient
  - [x] Search filters by name
  - [x] Each row has slot `Select` defaulting to first empty slot
  - [x] "Add" adds to selected slot

  **Dependencies:** Task 6
  **Files:** `src/components/meal-plan/in-season-recipe-dialog.tsx` (new)
  **Scope:** S

### Checkpoint: Synergy Components
- [x] Both render without errors
- [x] Lazy loading works
- [x] Search filters correctly
- [x] Slot selection works

---

### Phase 6: Storage Location

- [x] **Task 12: Add storage location to recipe editor**
  Modify `src/app/(app)/recipes/page.tsx`:
  1. Add `editStorageLocation` state to `RecipePage`
  2. In the ingredient edit panel (the `isEditing` section of `SortableIngredientItem`), add a `Select` dropdown labeled "Store in" with options from `STORAGE_LOCATIONS` + "Not set"
  3. Include `storageLocation` when saving ingredient edits
  4. Show storage location badge on ingredient rows (when set)
  5. Add recipe-level "Where to store leftovers" `Select` dropdown near servings info
  6. Include `leftoverStorage` when updating recipe

  Modify `src/lib/recipe-store.ts`:
  1. Accept `storageLocation` in `updateIngredient` data parameter
  2. Accept `leftoverStorage` in `updateRecipe` data parameter
  3. Include both fields in serialization to storage layer

  Modify `src/lib/storage.ts`:
  1. Accept `storageLocation` in `updateIngredient` data parameter
  2. Accept `leftoverStorage` in `updateRecipe` data parameter

  **Acceptance criteria:**
  - [x] Ingredient edit shows "Store in" dropdown
  - [x] Selecting a location saves to the ingredient
  - [x] Badge shows on ingredient row
  - [x] Recipe has "Where to store leftovers" dropdown
  - [x] Both persist across reloads
  - [x] `leftoverStorage` does NOT propagate to ingredients

  **Dependencies:** Tasks 4, 5
  **Files:** `src/app/(app)/recipes/page.tsx`, `src/lib/recipe-store.ts`, `src/lib/storage.ts`
  **Scope:** M

- [x] **Task 13: Show storage location on grocery list**
  Modify `src/app/(app)/meal-plans/grocery-list/[weekStart]/page.tsx`:
  1. In Ingredients and Checklist columns, show a small colored badge/icon next to each ingredient indicating its storage location
  2. Use `STORAGE_LOCATION_META` for icon/color

  **Acceptance criteria:**
  - [x] Ingredients with a storage location show a badge
  - [x] Badges are visually distinct (Pantry=amber, Refrigerator=blue, Freezer=cyan, Countertop=green)
  - [x] No badge shown when storage location is not set

  **Dependencies:** Task 12
  **Files:** `src/app/(app)/meal-plans/grocery-list/[weekStart]/page.tsx`
  **Scope:** S

### Checkpoint: Storage Location
- [x] Recipe editor works with new fields
- [x] Grocery list shows badges
- [x] Data persists

---

### Phase 7: Integration

- [x] **Task 14: Integrate synergies panel into weekly view**
  Modify `src/app/(app)/meal-plans/[weekStart]/page.tsx`:
  1. Load pantry staples, seasonal foods, and user location on mount
  2. Change day-detail grid from `grid-cols-[2fr_1fr]` to `grid-cols-[280px_2fr_1fr]`
  3. Render `<FoodSynergiesPanel>` as first (leftmost) column
  4. Render `<InSeasonRecipeDialog>` managed by `selectedSeasonalFood` state
  5. Wire `onAddToSlot` to call `addRecipeToSlot` (with `ensureMealPlan` guard)
  6. Panel visible only when `editingDay` is set

  **Acceptance criteria:**
  - [x] Synergies panel appears left of day plan when day selected
  - [x] Nutrition panel remains on right
  - [x] In-season food click opens dialog
  - [x] Adding recipe from dialog works
  - [x] All existing features (drag-drop, nutrition, grouping) still work

  **Dependencies:** Tasks 10, 11
  **Files:** `src/app/(app)/meal-plans/[weekStart]/page.tsx`
  **Scope:** M

### Checkpoint: Integration
- [x] Full page renders without errors
- [x] All existing features work
- [x] Synergies update reactively when entries change

---

### Phase 8: Polish & Build

- [x] **Task 15: Responsive behavior and edge cases**
  - Hide/collapse synergies panel on screens < `lg`
  - Empty states: no recipes, no entries, no seasonal matches, no location set (show prompt to set location in Settings)
  - Loading states for data fetch
  - Verify `useMemo` deps cause re-computation when entries change

  **Dependencies:** Task 14
  **Files:** `src/components/meal-plan/food-synergies-panel.tsx`, `src/app/(app)/meal-plans/[weekStart]/page.tsx`
  **Scope:** S

- [x] **Task 16: Final build verification**
  `npm run build` — fix all errors.

  **Dependencies:** Task 15
  **Scope:** XS

### Checkpoint: Complete
- [x] All acceptance criteria met
- [x] Build succeeds
- [x] Manual verification of layout and functionality

---

## Files Summary

| File | Action | Phase |
|------|--------|-------|
| `scripts/scrape-seasonal-produce.mjs` | New | 1 |
| `src/data/seasonal-produce.ts` | Generated | 1 |
| `src/data/pantry-staples.ts` | New | 1 |
| `src/data/storage-locations.ts` | New | 1 |
| `src/lib/storage.ts` | Modify (v7, 4 new stores, 2 new fields) | 2 |
| `src/lib/recipe-synergy.ts` | New | 3 |
| `src/components/pantry-staples-panel.tsx` | New | 4 |
| `src/components/location-panel.tsx` | New | 4 |
| `src/components/app-nav.tsx` | Modify (2 new tabs) | 4 |
| `src/components/meal-plan/food-synergies-panel.tsx` | New | 5 |
| `src/components/meal-plan/in-season-recipe-dialog.tsx` | New | 5 |
| `src/app/(app)/recipes/page.tsx` | Modify (storage + leftover fields) | 6 |
| `src/lib/recipe-store.ts` | Modify (new field support) | 6 |
| `src/app/(app)/meal-plans/grocery-list/[weekStart]/page.tsx` | Modify (storage badges) | 6 |
| `src/app/(app)/meal-plans/[weekStart]/page.tsx` | Modify (synergies integration) | 7 |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scrape script breaks if source site changes bundle URL | Low | Script can be manually updated; seed data file is committed so app works without re-scraping |
| Ingredient name matching imprecision | Medium | Case-insensitive substring `includes()`; document limitations |
| Recipe editor already 1700+ lines | Medium | Storage location additions are minimal (~30 lines) |
| 6 settings tabs on mobile | Low | Tabs scroll horizontally; icons keep them compact |
| Seasonal data only covers USA initially | Low | Architecture supports arbitrary countries/regions; UI shows "United States" as default |
