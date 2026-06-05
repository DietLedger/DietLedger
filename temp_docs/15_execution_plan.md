# DietLedger Simplification — Execution Plan

> Document ID: 15
> Prerequisite: `temp_docs/14_simplification_plan.md`
> Status: EXECUTION PLAN ONLY — no code changes
> Date: 2026-06-05

---

# Guiding Principles

1. **Working software at every commit.** Every step must compile, pass lint, and run.
2. **Stop after any phase.** Each phase leaves the application fully functional.
3. **Type-only imports are moved first.** 20+ components import types from `storage.ts`. These must be redirected before anything is deleted.
4. **Function imports are migrated second.** 13 components call `storage.ts` functions directly. Each must be rewired to the API client.
5. **Leaf dependencies are deleted first.** Sync UI → sync store → sync engine → storage.ts. Delete from the leaves inward.

---

# Phase 0 — Type Extraction

**Goal:** Make every `import type { ... } from '@/lib/storage'` resolve from `api-client.ts` instead, so `storage.ts` can later be deleted without breaking type imports.

**Why first:** 20+ `.tsx` files and 2 `.ts` files import types from `storage.ts`. The types are already re-exported from `api-client.ts:27-52`. This step is purely mechanical find-and-replace.

## Step 0.1 — Audit type re-exports in `api-client.ts`

### Files Modified
- None (verification only)

### Verification
- Confirm `src/lib/api-client.ts:27-52` re-exports every type that components import from `storage.ts`
- Types to verify: `RecipeRecord`, `IngredientRecord`, `IngredientGroup`, `BookRecord`, `ChapterRecord`, `ChapterRecipeRecord`, `ChapterPageRecord`, `BookPageRecord`, `CategoryRecord`, `RecipeCategoryRecord`, `MealPlanRecord`, `DayPlanEntryRecord`, `MealGroupRecord`, `GroceryChecklistRecord`, `NutritionProfileRecord`, `FoodLogEntryRecord`, `WeightEntryRecord`, `CustomFoodRecord`, `ActivityLevel`, `MealSlot`
- Check for any types used in components but NOT re-exported — add them if missing

### Tests Required
- `npm run build` — must compile with zero type errors

### Rollback
- No changes made, nothing to roll back

---

## Step 0.2 — Redirect type imports to `api-client.ts`

### Files Modified (28 files)

**Pages (7 files):**
- `src/app/(app)/kitchen-helper/page.tsx` — change `import type { MealGroupRecord, DayPlanEntryRecord } from '@/lib/storage'` → `from '@/lib/api-client'`
- `src/app/(app)/meal-plans/[weekStart]/page.tsx` — change `import type { CustomFoodRecord, DayPlanEntryRecord, MealGroupRecord } from '@/lib/storage'` → `from '@/lib/api-client'`
- `src/app/(app)/nutrition/profiles/page.tsx` — change `import type { WeightEntryRecord, NutritionProfileRecord, ActivityLevel } from '@/lib/storage'` → `from '@/lib/api-client'`
- `src/app/(app)/nutrition/page.tsx` — change `import type { FoodLogEntryRecord } from '@/lib/storage'` → `from '@/lib/api-client'`
- `src/app/(app)/nutrition/history/page.tsx` — change `import type { FoodLogEntryRecord, MealSlot } from '@/lib/storage'` → `from '@/lib/api-client'`
- `src/app/(app)/nutrition/log/page.tsx` — change `import type { MealSlot, FoodLogEntryRecord } from '@/lib/storage'` → `from '@/lib/api-client'`
- `src/app/(app)/books/[id]/page.tsx` — change `import type { RecipeRecord } from '@/lib/storage'` → `from '@/lib/api-client'`

**Components (15 files):**
- `src/components/nutrition/nutrient-trend-chart.tsx` — `FoodLogEntryRecord`
- `src/components/nutrition/most-eaten-list.tsx` — `FoodLogEntryRecord`
- `src/components/nutrition/todays-food-list.tsx` — `FoodLogEntryRecord, MealSlot`
- `src/components/nutrition/food-log-entry.tsx` — `FoodLogEntryRecord, MealSlot`
- `src/components/nutrition/profile-card.tsx` — `NutritionProfileRecord, WeightEntryRecord`
- `src/components/nutrition/bmi-calorie-stats.tsx` — `NutritionProfileRecord, WeightEntryRecord`
- `src/components/nutrition/calorie-summary-chart.tsx` — `FoodLogEntryRecord`
- `src/components/nutrition/weight-trend-chart.tsx` — `WeightEntryRecord`
- `src/components/nutrition/threshold-alerts.tsx` — `FoodLogEntryRecord, NutritionProfileRecord`
- `src/components/nutrition/health-metrics-chart.tsx` — `WeightEntryRecord`
- `src/components/nutrition/nutrient-dashboard.tsx` — `FoodLogEntryRecord, NutritionProfileRecord`
- `src/components/nutrition/macro-breakdown-chart.tsx` — `FoodLogEntryRecord`
- `src/components/meal-plan/in-season-recipe-dialog.tsx` — `RecipeRecord, DayPlanEntryRecord`
- `src/components/meal-plan/food-synergies-panel.tsx` — `RecipeRecord, DayPlanEntryRecord`
- `src/components/nutrition/add-food-log-dialog.tsx` — types (check inline)

**Lib files (2 files):**
- `src/lib/nutrition-calcs.ts` — `import type { ActivityLevel } from '@/lib/storage'` → `from '@/lib/api-client'`
- `src/lib/recipe-synergy.ts` — `import type { RecipeRecord } from '@/lib/storage'` → `from '@/lib/api-client'`

### Files Deleted
- None

### Tests Required
- `npm run build` — zero type errors
- `npm run lint` — zero new warnings
- Manual: load recipe list, nutrition dashboard, meal plan page — verify rendering

### Rollback
- Revert all 28 files to previous import paths. `git checkout HEAD -- <files>`

---

# Phase 1 — Eliminate Direct `storage.ts` Function Calls

**Goal:** Every component that calls `storage.ts` functions directly is rewired to use the API client. After this phase, no UI component imports functions from `storage.ts`.

**Why:** 13 files call functions directly from `storage.ts` (not just types). These must be migrated before `storage.ts` can be removed.

## Step 1.1 — Move API key helpers out of `storage.ts`

The FDA API key functions (`getStoredApiKey`, `setStoredApiKey`) at `storage.ts:1936-1948` are simple localStorage wrappers. They don't belong in IndexedDB storage.

### Files Modified
- `src/lib/recipe-store.ts` — change import source from `@/lib/storage` to a new inline helper or move the functions
- Move the two functions (`getStoredApiKey`, `setStoredApiKey`) inline into `recipe-store.ts` since they are the only consumer

### Files Deleted
- None (functions still exist, just relocated)

### Tests Required
- `npm run build`
- Manual: change FDA API key in settings, verify it persists

### Rollback
- Revert `recipe-store.ts` import change

---

## Step 1.2 — Migrate `recipes/page.tsx` and `books/[id]/edit/page.tsx`

Both files import `getCategoryDescendants` and `getRecipesByCategory` from `storage.ts`.

### Files Modified
- `src/app/(app)/recipes/page.tsx` — replace `getCategoryDescendants` and `getRecipesByCategory` calls with API client calls (`getApiClient().getRecipeCategories(...)` or equivalent)
- `src/app/(app)/books/[id]/edit/page.tsx` — same replacements

### Approach
- `getCategoryDescendants(categoryId)` — implement client-side tree traversal using `getApiClient().getCategories()` result (all categories loaded, walk the tree)
- `getRecipesByCategory(categoryId)` — use `getApiClient().getRecipeCategories(recipeId)` or filter from loaded recipe data

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: navigate to recipes page, filter by category — verify category filtering works
- Manual: navigate to book edit page, add recipe by category — verify

### Rollback
- Revert both files

---

## Step 1.3 — Migrate `settings/page.tsx` export/import

Settings page uses `getAllStoreData` and `putStoreData` from `storage.ts` for IndexedDB export/import (lines 158-193).

### Files Modified
- `src/app/(app)/settings/page.tsx` — remove the IndexedDB export/import section, or replace with server-side backup/restore via Go API

### Approach
- Option A: Remove the data export/import UI entirely (server manages data)
- Option B: Replace with Go API-based export endpoint (`GET /api/export`) and import endpoint (`POST /api/import`)
- Recommend Option A for Phase 1 simplicity

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: navigate to settings page, verify it loads without errors

### Rollback
- Revert settings page

---

## Step 1.4 — Migrate brand kit components

Three components use brand kit functions from `storage.ts`.

### Files Modified
- `src/components/print/cookbook-export.tsx` — replace `getAllBrandKits`, `getBrandKit` with API client or state from a brand kit store
- `src/components/print/brand-kit-editor.tsx` — replace `getAllBrandKits`, `createBrandKit`, `updateBrandKit`, `deleteBrandKit` with API client calls
- `src/components/dietary/compliance-report.tsx` — replace `getAllBrandKits`, `getBrandKit` 
- `src/components/nutrition/nutrition-pdf-report.tsx` — replace `getAllNutritionProfiles`, `getAllFoodLogEntries`, `getAllBrandKits`

### Approach
- Brand kits need server-side API endpoints. Add to Go server, or
- If brand kits are client-only: create a minimal Zustand store with localStorage persistence
- `getAllFoodLogEntries` and `getAllWeightEntries` in compliance/PDF reports — use `getApiClient().getFoodLogByProfileAndDateRange()` and `getApiClient().getWeightByProfile()`
- `getAllNutritionProfiles` — use `getApiClient().getNutritionProfiles()`

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: create a brand kit, use it in cookbook export, generate a compliance report, generate a nutrition PDF report

### Rollback
- Revert all modified files

---

## Step 1.5 — Migrate `pantry-staples-panel.tsx`

### Files Modified
- `src/components/pantry-staples-panel.tsx` — replace `getAllPantryStaples`, `addPantryStaple`, `removePantryStaple`, `seedPantryStaplesIfNeeded` with API client calls or localStorage

### Approach
- Pantry staples are user preferences, not shared data. Use localStorage or add Go API endpoints
- Simplest: create a thin localStorage wrapper since this is a personalization feature

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: add/remove pantry staples, verify persistence

### Rollback
- Revert file

---

## Step 1.6 — Migrate `location-panel.tsx`

### Files Modified
- `src/components/location-panel.tsx` — replace `getUserLocation`, `setUserLocation`, `seedSeasonalFoodsIfNeeded` with localStorage or API calls

### Approach
- User location is a single-record preference. Use localStorage.
- Seasonal foods seed data is static — move the seed logic to a utility that doesn't touch IndexedDB

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: set location, verify seasonal produce shows correctly

### Rollback
- Revert file

---

## Step 1.7 — Migrate `custom-foods-panel.tsx`

### Files Modified
- `src/components/custom-foods-panel.tsx` — replace `getAllCustomFoods`, `addCustomFood`, `updateCustomFood`, `deleteCustomFood`, `type CustomFoodRecord` with API client calls

### Approach
- Custom foods already have Go API endpoints (`/api/custom-foods`)
- Use `getApiClient().getCustomFoods()`, `getApiClient().createCustomFood()`, etc.
- Type `CustomFoodRecord` is already re-exported from `api-client.ts`

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: create, edit, delete a custom food

### Rollback
- Revert file

---

## Step 1.8 — Migrate `pdf-export.ts`

### Files Modified
- `src/lib/pdf-export.ts` — replace `getRecipe`, `getBook`, `getChaptersByBook`, `getChapterRecipes`, `getBrandKit`, `getTemplate` imports from `storage.ts` with API client calls

### Approach
- All these functions have Go API equivalents via `getApiClient()`
- Replace `storage.getRecipe(id)` with `getApiClient().getRecipe(id)`, etc.

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: export a recipe as PDF, export a cookbook

### Rollback
- Revert file

---

## Step 1.9 — Migrate `app-settings-store.ts`

### Files Modified
- `src/lib/app-settings-store.ts` — replace `getAppSettings`, `putAppSettings` from `storage.ts` with localStorage

### Approach
- App settings (meal slot times) are a single JSON object. Use localStorage directly.
- Create inline helpers: `getAppSettings()` reads from localStorage, `putAppSettings()` writes to localStorage

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: change meal slot times in settings, reload, verify persistence

### Rollback
- Revert file

---

## Step 1.10 — Verify zero remaining `storage.ts` function imports

### Verification
- Run: `grep -r "from '@/lib/storage'" src/` — should return zero matches (type imports already redirected in Phase 0)
- If any remain, add migration steps for those files before proceeding

### Tests Required
- `npm run build`
- `npm run lint`
- Full smoke test: recipes, books, meal plans, nutrition, settings, export

### Rollback
- Revert entire Phase 1

---

# Phase 2 — Remove Offline and Sync Infrastructure

**Goal:** Remove all sync, offline write queue, and read cache code. The application is now online-only.

**Prerequisite:** Phase 0 and Phase 1 complete — no component imports from `storage.ts`.

## Step 2.1 — Remove `SyncIndicator` from navbar

### Files Modified
- `src/components/app-nav.tsx` — remove `import SyncIndicator` (line 43) and `<SyncIndicator />` usage (line 156)

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: verify navbar renders without sync indicator

### Rollback
- Revert `app-nav.tsx`

---

## Step 2.2 — Remove `LocalModeBanner` from root layout

### Files Modified
- Root layout file (verify which file imports `LocalModeBanner` — likely `src/app/layout.tsx` or `src/app/(app)/layout.tsx`)

### Files Deleted
- None

### Tests Required
- `npm run build`
- Manual: verify no banner appears

### Rollback
- Revert layout file

---

## Step 2.3 — Delete sync UI components

### Files Deleted
- `src/components/sync-indicator.tsx` (78 LOC)
- `src/components/local-mode-banner.tsx` (106 LOC)
- `src/components/sync/sync-settings-panel.tsx`
- `src/components/sync/sync-initializer.tsx`
- `src/components/sync/sync-status-indicator.tsx`
- `src/components/sync/conflict-resolver.tsx`
- `src/components/sync/` directory

### Files Modified
- None (all imports already removed in Steps 2.1 and 2.2)

### Tests Required
- `npm run build`
- `npm run lint`

### Rollback
- Restore deleted files from git

---

## Step 2.4 — Delete sync library files

### Files Deleted
- `src/lib/sync-engine.ts` (253 LOC)
- `src/lib/sync-conflict.ts` (81 LOC)
- `src/lib/sync-store.ts` (183 LOC)
- `src/lib/export-import.ts` (114 LOC)

### Files Modified
- None (no remaining imports — verified by grep)

### Tests Required
- `npm run build`

### Rollback
- Restore from git

---

## Step 2.5 — Delete write queue and read cache

### Files Deleted
- `src/lib/write-queue.ts` (178 LOC)
- `src/lib/read-cache.ts` (97 LOC)

### Files Modified
- `src/lib/api-client-go.ts` — remove imports of `writeQueue` and `readCache`, remove `queuedWrite()` method (lines 108-120), remove `cachedGet()` method (lines 96-106). Constructor no longer calls `writeQueue.init()` or `readCache.init()`.

### Tests Required
- `npm run build`
- Manual: create a recipe, verify it saves to server
- Manual: view recipe list, verify data loads from server

### Rollback
- Revert `api-client-go.ts`, restore deleted files

---

## Step 2.6 — Simplify `api-client-go.ts`

### Files Modified
- `src/lib/api-client-go.ts`:
  - Remove `localFallback()` method (lines 838-841)
  - Remove all template methods that delegate to `localFallback()` (lines 843-860)
  - Remove all dietary profile methods that delegate to `localFallback()` (lines 862-887)
  - Templates and dietary profiles now need server endpoints OR throw errors (decision needed)
  - Remove `cachedGet()` if not already removed in Step 2.5
  - Remove `queuedWrite()` if not already removed in Step 2.5

### Decision Required
- **Templates:** Add Go API endpoints for template CRUD (server-side), or use localStorage
- **Dietary profiles:** Add Go API endpoints (server-side), or use localStorage
- **Recommendation for Phase 1:** Use localStorage for both. Create a thin `src/lib/local-json-store.ts` utility (~30 LOC) that reads/writes JSON to localStorage.

### Tests Required
- `npm run build`
- Manual: create/edit/delete a template, verify persistence
- Manual: create/edit/delete a dietary profile, verify persistence

### Rollback
- Revert `api-client-go.ts`

---

## Step 2.7 — Simplify `api-client.ts`

### Files Modified
- `src/lib/api-client.ts`:
  - Remove `LocalApiClient` import (line 299)
  - Remove `GoApiClient` dynamic import (line 302)
  - Remove `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` check (lines 293-304)
  - Always return `GoApiClient` instance
  - Remove `resetApiClient()` if unused
  - Remove `setApiClient()` if unused

### Files Deleted
- None yet (`api-client-local.ts` deleted in Phase 3)

### Tests Required
- `npm run build`
- Full smoke test

### Rollback
- Revert `api-client.ts`

---

## Step 2.8 — Remove `isLocalOnly` bypass in auth

### Files Modified
- `src/hooks/use-auth.tsx`:
  - Remove `isLocalOnly` check at line 78-81
  - Change `isAuthenticated: isLocalOnly || !!user` → `isAuthenticated: !!user`

### Tests Required
- `npm run build`
- Manual: verify login flow works, verify unauthenticated users are redirected to `/login`

### Rollback
- Revert `use-auth.tsx`

---

## Step 2.9 — Clean sync-related types

### Files Modified
- `src/lib/types.ts` — remove `SyncStatus` (line 174), `SyncServerConfig` (lines 176-191), `SyncChangeLogEntry` (lines 193-201), `SyncConflictRecord` (lines 203-215), `SYNC_STORE_NAMES` (lines 217-237), `SyncStoreName` (line 239)

### Files Deleted
- None

### Tests Required
- `npm run build`

### Rollback
- Revert `types.ts`

---

# Phase 3 — Remove `storage.ts` and `api-client-local.ts`

**Goal:** Delete the IndexedDB layer entirely.

**Prerequisite:** Phase 1 complete (zero function imports from `storage.ts`) and Phase 2 complete (no sync/write-queue/read-cache).

## Step 3.1 — Delete `api-client-local.ts`

### Files Deleted
- `src/lib/api-client-local.ts` (496 LOC)

### Files Modified
- `src/lib/api-client.ts` — remove any remaining reference to `./api-client-local`

### Tests Required
- `npm run build`

### Rollback
- Restore file, revert `api-client.ts`

---

## Step 3.2 — Delete `storage.ts`

### Files Deleted
- `src/lib/storage.ts` (2,299 LOC)

### Files Modified
- None (all imports redirected in Phases 0 and 1)

### Tests Required
- `npm run build`
- `npm run lint`
- Full smoke test: every page, every CRUD operation

### Rollback
- Restore `storage.ts` from git

---

## Step 3.3 — Remove `idb` dependency

### Files Modified
- `package.json` — remove `"idb": "^8.0.3"` (line 70)
- Run `npm install` to update lock file

### Tests Required
- `npm run build`
- Verify no `node_modules/idb` references remain: `grep -r "from 'idb'" src/`

### Rollback
- Add `idb` back to `package.json`, run `npm install`

---

# Phase 4 — Remove Server-Side Obsolete Code

**Goal:** Clean up Go server and Next.js infrastructure.

## Step 4.1 — Remove Go SQLite backend

### Files Deleted
- `sync-server/store_sqlite.go` (938 LOC)
- `sync-server/store_sqlite_test.go` (29 LOC)
- `sync-server/store_old.go.bak` (623 LOC)
- `sync-server/handlers_old.go.bak` (538 LOC)
- `sync-server/sync.db` (SQLite database file)

### Files Modified
- `sync-server/main.go` — remove `case "sqlite"` branch (lines 31-46), remove `DB_PATH` env var
- `sync-server/repository.go` — remove `SQLiteStore` references from `Store` interface if any
- `sync-server/go.mod` — run `go mod tidy` after removing `modernc.org/sqlite`

### Tests Required
- `cd sync-server && go build`
- `cd sync-server && go test ./...` (excluding sqlite tests)
- `docker compose up --build` — verify server starts with PostgreSQL only

### Rollback
- Restore deleted files, revert `main.go`, `go mod tidy`

---

## Step 4.2 — Remove Next.js API routes

### Files Deleted
- `src/app/api/books/` (entire directory)
- `src/app/api/categories/` (entire directory)
- `src/app/api/community/` (entire directory)
- `src/app/api/fda/` (entire directory)
- `src/app/api/foods/` (entire directory)
- `src/app/api/nutrition/` (entire directory)
- `src/app/api/recipes/` (entire directory)
- `src/app/api/share/` (entire directory)

### Files Modified
- None (proxy.ts already handles all these routes in server mode)

### Tests Required
- `npm run build`
- Manual: verify every API operation still works (all proxied to Go server)

### Rollback
- Restore directories from git

---

## Step 4.3 — Remove `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` everywhere

### Files Modified
- `Dockerfile` — remove `ARG NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` (lines 4, 13, 28, 32)
- `docker-compose.yml` — remove `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` env vars (line 56)
- `.env` — remove if present
- `.env.example` — remove if present
- `src/proxy.ts` — remove `isLocalOnly` check (lines 42-44). Proxy always forwards to Go server.
- `src/hooks/use-auth.tsx` — already cleaned in Step 2.8

### Files Deleted
- None

### Tests Required
- `npm run build`
- `docker compose up --build` — full stack test

### Rollback
- Revert all modified files

---

## Step 4.4 — Remove Prisma directory

### Files Deleted
- `prisma/` directory (entire)

### Files Modified
- None (Prisma not in dependencies)

### Tests Required
- `npm run build`

### Rollback
- Restore from git

---

# Phase 5 — Remove Capacitor and Tauri from Build

**Goal:** Strip mobile/desktop build infrastructure from CI and package.json.

## Step 5.1 — Remove Capacitor dependencies and scripts

### Files Modified
- `package.json`:
  - Remove `"@capacitor/android": "^8.3.1"` (line 21)
  - Remove `"@capacitor/cli": "^8.3.1"` (line 22)
  - Remove `"@capacitor/core": "^8.3.1"` (line 23)
  - Remove `"@capacitor/ios": "^8.3.1"` (line 24)
  - Remove scripts: `cap:init`, `cap:add:android`, `cap:add:ios`, `cap:sync`, `cap:open:android`, `cap:open:ios` (lines 13-18)
  - Remove scripts: `tauri:dev`, `tauri:build` (lines 11-12)
- Run `npm install` to update lock file

### Files Deleted
- `capacitor.config.ts`

### Tests Required
- `npm install`
- `npm run build`
- `npm run dev` — verify web app starts

### Rollback
- Revert `package.json`, restore `capacitor.config.ts`, run `npm install`

---

## Step 5.2 — Gitignore or branch `src-tauri/`

### Files Modified
- `.gitignore` — add `src-tauri/` to ignore list, OR
- Leave `src-tauri/` in repo but exclude from build pipeline

### Approach
- Do NOT delete `src-tauri/`. It will be needed for Phase 6 (Desktop).
- Add a note in README that Tauri is postponed
- Ensure no build script references it

### Tests Required
- `npm run build` — verify no Tauri-related errors

### Rollback
- Revert `.gitignore`

---

# Phase 6 — Final Verification

## Step 6.1 — Full regression test

### Manual Tests
- [ ] Register new account
- [ ] Login / Logout
- [ ] Create recipe with ingredients
- [ ] Edit recipe name, servings, instructions
- [ ] Delete recipe
- [ ] Search FDA food database
- [ ] Create book with chapters
- [ ] Add recipes to chapters, reorder
- [ ] Create chapter pages
- [ ] Create/edit/delete categories
- [ ] Assign categories to recipes
- [ ] Create meal plan for a week
- [ ] Add recipes to meal plan slots
- [ ] Generate grocery checklist
- [ ] Create nutrition profile
- [ ] Log food entries
- [ ] Log weight entries
- [ ] View nutrition charts and dashboards
- [ ] Export cookbook as PDF
- [ ] Generate nutrition PDF report
- [ ] Create/edit dietary profile with allergen rules
- [ ] View compliance report
- [ ] Settings: change meal slot times, manage API keys
- [ ] Brand kit: create, edit, use in exports
- [ ] Custom foods: create, edit, delete
- [ ] Share recipe via community
- [ ] Docker: `docker compose up --build` works end-to-end

### Automated Tests
- `npm run build` — clean build
- `npm run lint` — zero errors
- `cd sync-server && go build` — clean build
- `cd sync-server && go test ./...` — all tests pass

---

# Summary Table

| Step | Phase | Files Modified | Files Deleted | Risk | Can Stop After? |
|------|-------|---------------|---------------|------|-----------------|
| 0.1 | Type Extraction | 0 | 0 | None | Yes |
| 0.2 | Type Extraction | 28 | 0 | Very Low | Yes |
| 1.1 | Function Migration | 1 | 0 | Low | Yes |
| 1.2 | Function Migration | 2 | 0 | Low | Yes |
| 1.3 | Function Migration | 1 | 0 | Medium | Yes |
| 1.4 | Function Migration | 4 | 0 | Medium | Yes |
| 1.5 | Function Migration | 1 | 0 | Low | Yes |
| 1.6 | Function Migration | 1 | 0 | Low | Yes |
| 1.7 | Function Migration | 1 | 0 | Low | Yes |
| 1.8 | Function Migration | 1 | 0 | Low | Yes |
| 1.9 | Function Migration | 1 | 0 | Low | Yes |
| 1.10 | Verification | 0 | 0 | None | Yes |
| 2.1 | Offline Removal | 1 | 0 | Very Low | Yes |
| 2.2 | Offline Removal | 1 | 0 | Very Low | Yes |
| 2.3 | Offline Removal | 0 | 6 | Low | Yes |
| 2.4 | Offline Removal | 0 | 4 | Low | Yes |
| 2.5 | Offline Removal | 1 | 2 | Medium | Yes |
| 2.6 | Offline Removal | 1 | 0 | Medium | Yes |
| 2.7 | Offline Removal | 1 | 0 | Medium | Yes |
| 2.8 | Offline Removal | 1 | 0 | Low | Yes |
| 2.9 | Offline Removal | 1 | 0 | Very Low | Yes |
| 3.1 | Storage Removal | 1 | 1 | Low | Yes |
| 3.2 | Storage Removal | 0 | 1 | Low | Yes |
| 3.3 | Storage Removal | 1 | 0 | Low | Yes |
| 4.1 | Server Cleanup | 2 | 5 | Medium | Yes |
| 4.2 | Server Cleanup | 0 | 8 dirs | Low | Yes |
| 4.3 | Server Cleanup | 4 | 0 | Low | Yes |
| 4.4 | Server Cleanup | 0 | 1 dir | Very Low | Yes |
| 5.1 | Platform Cleanup | 1 | 1 | Very Low | Yes |
| 5.2 | Platform Cleanup | 1 | 0 | Very Low | Yes |

**Total steps:** 29
**Total files modified:** ~38 unique files
**Total files deleted:** ~28+ files/directories
**Estimated LOC removed:** ~6,400

---

# Critical Path

The execution has one hard dependency chain:

```
Phase 0 (types) → Phase 1 (functions) → Phase 3 (delete storage.ts)
                                                  ↑
Phase 2 (remove sync/write-queue) ────────────────┘
```

Phases 4 and 5 are independent of each other and can run in any order after Phase 3.

---

# Decision Points

Three decisions must be made before starting:

1. **Step 1.4 — Brand kits:** Server API endpoints or localStorage?
2. **Step 1.5 — Pantry staples:** Server API endpoints or localStorage?
3. **Step 1.6 — User location:** Server API endpoints or localStorage?

Recommendation: **localStorage for all three** in Phase 1. These are user-preference features that don't need cross-device sync until offline support is implemented (Phase 3/5 of product roadmap). Migrating to server-side storage can happen later without breaking changes.
