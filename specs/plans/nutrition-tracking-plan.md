# Implementation Plan: Nutrition Tracking & Multi-Person Health Dashboard

> **Documentation status:** Historical implementation plan. Do not execute tasks that add Prisma/SQLite, IndexedDB-authoritative storage, offline queues, or Next.js API routes for beta. Use `final_docs/system_requirements.md`, `final_docs/migration_path.md`, `NUTRITION_DOMAIN.md`, and current Go API/PostgreSQL patterns instead.

## Overview

Add a comprehensive nutrition tracking system with multi-person profiles, food/weight logging, and a rich chart-based dashboard. Also modify the existing `NutritionLabel` to highlight nutrients exceeding daily values with color-coded warnings (orange/red) while maintaining B&W print output.

## Architecture Decisions

- **Bidirectional sync is new:** Existing Zustand stores are IndexedDB-only. The nutrition store will be the first to implement server sync (IndexedDB + Prisma/SQLite), establishing the pattern for future stores.
- **Zod validation in API routes:** The spec requires it, `zod` is installed but unused. Nutrition API routes will establish this pattern.
- **Inline styles for label highlighting:** The `NutritionLabel` uses inline `styles` objects. Highlighting will use inline styles + a global `@media print` CSS rule rather than Tailwind classes, consistent with the existing FDA-standard label approach.
- **Vertical slicing:** Build one complete feature path at a time (profile CRUD → food logging → weight → dashboard → charts) rather than horizontal (all schema → all API → all UI).

## Dependency Graph

```
Task 1: Prisma schema + migration
Task 2: TypeScript types
Task 3: IndexedDB stores + CRUD functions
    ├── Task 4: API routes (profiles)
    ├── Task 5: API routes (food log, weight, sync)
    └── Task 6: Nutrition calculations utility
            └── Task 7: Nutrition Zustand store
                    ├── Task 8: Person selector + period selector
                    ├── Task 9: Profile management page
                    ├── Task 10: Food log entry + add food dialog (shell + recipe tab)
                    ├── Task 11: Add food dialog (custom food + manual tabs)
                    ├── Task 12: Food logging page
                    ├── Task 13: Weight logging + trend chart
                    ├── Task 14: Calorie summary chart
                    ├── Task 15: Macro breakdown chart
                    ├── Task 16: Nutrient trend chart
                    ├── Task 17: Today's food list + most eaten list
                    └── Task 18: Dashboard page (assembly)
Task 19: NutritionLabel highlighting (independent)
Task 20: Navigation update + history page
Task 21: Sync integration + end-to-end testing
```

## Task List

### Phase 1: Foundation

---

## Task 1: Prisma Schema + Migration

**Description:** Add `PersonProfile`, `FoodLogEntry`, and `WeightEntry` models to the Prisma schema and run the migration. This is the foundation for all server-side persistence.

**Acceptance criteria:**
- [ ] Three new models exist in `prisma/schema.prisma` matching the spec exactly
- [ ] Relations are correct: Profile has many FoodLogEntries and WeightEntries, cascade delete
- [ ] Indexes exist on: `profileId`, `date`, `[profileId, date]`, `[sourceType, sourceId]`, `[profileId, date]` unique on WeightEntry
- [ ] Migration runs without errors

**Verification:**
- [ ] `bunx prisma migrate dev --name add-nutrition-tracking` succeeds
- [ ] `bunx prisma generate` succeeds
- [ ] `bun run build` succeeds

**Dependencies:** None

**Files likely touched:**
- `prisma/schema.prisma`

**Estimated scope:** S (1 file + migration)

---

## Task 2: TypeScript Types for Nutrition Tracking

**Description:** Add all new types/interfaces needed for the nutrition feature: `ActivityLevel`, `MealSlot`, `FoodSourceType`, `NutritionProfileRecord`, `FoodLogEntryRecord`, `WeightEntryRecord`, and update the `NutriLabelDB` interface for the new IDB stores.

**Acceptance criteria:**
- [ ] All types from the spec are defined in `src/lib/storage.ts` (following existing pattern where record types live alongside their stores)
- [ ] `NutriLabelDB` interface is updated with the 3 new store definitions and their indexes
- [ ] Types match the spec exactly (field names, types, optionality)

**Verification:**
- [ ] `bun run build` succeeds with no type errors

**Dependencies:** None

**Files likely touched:**
- `src/lib/storage.ts` (type definitions at top of file)

**Estimated scope:** S (1 file, additions only)

---

## Task 3: IndexedDB Stores + CRUD Functions

**Description:** Bump DB version from 8 to 9. Add the three new object stores (`nutritionProfiles`, `foodLogEntries`, `weightEntries`) with their indexes. Implement all CRUD functions following the existing pattern (create, get, getAll, update, delete, plus specialized queries like `getFoodLogByProfileAndDate`).

**Acceptance criteria:**
- [ ] DB version bumped to 9
- [ ] `upgrade` function has `if (oldVersion < 9)` block creating all 3 stores with correct keyPaths and indexes
- [ ] CRUD functions exported for each store:
  - Profiles: `createNutritionProfile`, `getNutritionProfile`, `getAllNutritionProfiles`, `updateNutritionProfile`, `deleteNutritionProfile`
  - Food log: `createFoodLogEntry`, `getFoodLogEntry`, `getAllFoodLogEntries`, `updateFoodLogEntry`, `deleteFoodLogEntry`, `getFoodLogByProfileAndDate`, `getFoodLogByProfileAndDateRange`
  - Weight: `createWeightEntry`, `getWeightEntry`, `getAllWeightEntries`, `updateWeightEntry`, `deleteWeightEntry`, `getWeightByProfile`, `getLatestWeight`
- [ ] All functions follow existing patterns: `crypto.randomUUID()`, `new Date().toISOString()`, `db.put()`, `db.get()`, `db.getAll()`, index queries
- [ ] Weight upsert logic: `createWeightEntry` checks for existing entry on same profile+date and updates if found

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Existing stores still work (no regression in DB upgrade)

**Dependencies:** Task 2 (types must be defined)

**Files likely touched:**
- `src/lib/storage.ts`

**Estimated scope:** M (1 file, but many new functions)

---

## Task 4: API Routes — Profiles

**Description:** Create server API routes for profile CRUD: `GET /api/nutrition/profiles` (list all), `POST /api/nutrition/profiles` (create), `GET /api/nutrition/profiles/[id]`, `PUT /api/nutrition/profiles/[id]`, `DELETE /api/nutrition/profiles/[id]` (cascade). Use zod for request validation.

**Acceptance criteria:**
- [ ] `src/app/api/nutrition/profiles/route.ts` handles GET (list) and POST (create)
- [ ] `src/app/api/nutrition/profiles/[id]/route.ts` handles GET, PUT, DELETE
- [ ] DELETE cascades to related FoodLogEntries and WeightEntries (Prisma handles via schema)
- [ ] Zod schemas validate: name (required string), sex (required enum male/female), birthDate (optional date string), heightCm (optional number), activityLevel (optional enum), goalWeightKg (optional number), goalDate (optional date string)
- [ ] Follow existing API pattern: try/catch, `NextResponse.json()`, `db` from `@/lib/db`

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual test with curl or browser: GET returns empty array, POST creates a profile

**Dependencies:** Task 1 (Prisma models must exist)

**Files likely touched:**
- `src/app/api/nutrition/profiles/route.ts` (new)
- `src/app/api/nutrition/profiles/[id]/route.ts` (new)

**Estimated scope:** S (2 new files)

---

## Task 5: API Routes — Food Log, Weight, Sync

**Description:** Create server API routes for food log entries, weight entries, and the bulk sync endpoint. Food log supports querying by profile+date range. Weight supports querying by profile. Sync endpoint accepts bulk data from IndexedDB.

**Acceptance criteria:**
- [ ] `src/app/api/nutrition/log/route.ts`: GET (by profileId + date range via query params), POST
- [ ] `src/app/api/nutrition/log/[id]/route.ts`: PUT, DELETE
- [ ] `src/app/api/nutrition/weight/route.ts`: GET (by profileId), POST
- [ ] `src/app/api/nutrition/weight/[id]/route.ts`: PUT, DELETE
- [ ] `src/app/api/nutrition/sync/route.ts`: POST accepts arrays of profiles/food logs/weight entries, upserts each using Prisma
- [ ] Zod validation on all endpoints
- [ ] Weight POST checks for existing entry on same profile+date, updates if found (matching IDB behavior)

**Verification:**
- [ ] `bun run build` succeeds

**Dependencies:** Task 1 (Prisma models)

**Files likely touched:**
- `src/app/api/nutrition/log/route.ts` (new)
- `src/app/api/nutrition/log/[id]/route.ts` (new)
- `src/app/api/nutrition/weight/route.ts` (new)
- `src/app/api/nutrition/weight/[id]/route.ts` (new)
- `src/app/api/nutrition/sync/route.ts` (new)

**Estimated scope:** M (5 new files, but repetitive pattern)

---

## Task 6: Nutrition Calculations Utility

**Description:** Create `src/lib/nutrition-calcs.ts` with pure functions for BMI, BMR (Mifflin-St Jeor), TDEE, and goal calorie calculations. All calculations are pure functions with no side effects.

**Acceptance criteria:**
- [ ] `calculateBMI(weightKg, heightCm)` returns BMI rounded to 1 decimal
- [ ] `calculateBMR(weightKg, heightCm, age, sex)` uses Mifflin-St Jeor equation (default age 30 if null)
- [ ] `calculateTDEE(bmr, activityLevel)` applies correct multiplier per level
- [ ] `calculateGoalCalories(tdee, currentWeightKg, goalWeightKg, goalDate)` returns daily calorie target
- [ ] `getGoalCalorieWarning(goalCalories, sex)` returns warning string if below minimum (1200 female, 1500 male) or null
- [ ] All functions handle null/undefined inputs gracefully (return null or 0)

**Verification:**
- [ ] Known test case: 70kg, 175cm → BMI 22.9
- [ ] Known test case: 80kg, 175cm, age 30, male, sedentary → BMR ≈ 1743, TDEE ≈ 2091
- [ ] Goal test: 80kg → 75kg in 60 days → daily deficit ≈ 642 kcal → goal ≈ 1449 kcal
- [ ] `bun run build` succeeds

**Dependencies:** None (pure utility, no imports from other new files)

**Files likely touched:**
- `src/lib/nutrition-calcs.ts` (new)

**Estimated scope:** S (1 new file)

---

### Checkpoint: Foundation
- [ ] `bun run build` succeeds
- [ ] Prisma migration applied
- [ ] All API routes respond correctly (can create/read profiles via curl)
- [ ] IDB stores created (can verify in browser DevTools)

---

### Phase 2: Core Features

---

## Task 7: Nutrition Zustand Store

**Description:** Create `src/lib/nutrition-store.ts` with the Zustand store managing profiles, food log entries, weight entries, active profile selection, and sync logic. Follow the existing store pattern but add server sync for the first time.

**Acceptance criteria:**
- [ ] Store state: `profiles`, `activeProfileId`, `foodLog`, `weights`, `isLoading`, `error`
- [ ] Actions follow existing pattern (fetch from IDB, mutate state):
  - `fetchProfiles()`, `createProfile()`, `updateProfile()`, `deleteProfile()`
  - `fetchFoodLog(profileId, startDate, endDate)`, `addFoodLogEntry()`, `updateFoodLogEntry()`, `deleteFoodLogEntry()`
  - `fetchWeights(profileId)`, `logWeight()`, `deleteWeightEntry()`
  - `setActiveProfile(id)`
  - `syncToServer()` — pushes unsynced records to `/api/nutrition/sync`
  - `syncFromServer()` — fetches all data from server, merges with IDB (server wins on `updatedAt` conflict)
- [ ] Each create/update/delete: writes to IDB immediately, then attempts server API call
- [ ] Failed sync marks record with `lastSyncedAt: null`
- [ ] Types imported from `storage.ts`

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Store can be imported without errors in a test component

**Dependencies:** Task 3 (IDB CRUD functions), Task 6 (calculations used in getters)

**Files likely touched:**
- `src/lib/nutrition-store.ts` (new)

**Estimated scope:** M (1 file, ~300-400 lines)

---

## Task 8: Person Selector + Period Selector Components

**Description:** Create two shared UI components used across all nutrition pages. The person selector lets users switch between profiles. The period selector toggles between today/week/month/year.

**Acceptance criteria:**
- [ ] `src/components/nutrition/person-selector.tsx`: Dropdown/select showing all profiles by name, calls `setActiveProfile` on change, shows "No profiles" message if empty with link to create one
- [ ] `src/components/nutrition/period-selector.tsx`: Toggle buttons for Today / Week / Month / Year, uses shadcn/ui ToggleGroup or segmented control style, exports selected period as state
- [ ] Both use `'use client'` directive
- [ ] Both use shadcn/ui components (Select, Button, etc.)
- [ ] Period selector returns a `Period` type: `'today' | 'week' | 'month' | 'year'`
- [ ] Person selector returns selected profile ID

**Verification:**
- [ ] `bun run build` succeeds

**Dependencies:** Task 7 (store must exist for person selector)

**Files likely touched:**
- `src/components/nutrition/person-selector.tsx` (new)
- `src/components/nutrition/period-selector.tsx` (new)

**Estimated scope:** S (2 small components)

---

## Task 9: Profile Management Page

**Description:** Create `/nutrition/profiles` page with profile list (cards) and create/edit dialog. Each profile card shows name, current BMI, goal weight, and progress. The form handles all profile fields including demographics and goals.

**Acceptance criteria:**
- [ ] Page at `src/app/(app)/nutrition/profiles/page.tsx` with `'use client'`
- [ ] Profile list rendered as cards using shadcn Card component
- [ ] Each card shows: name, current weight (latest WeightEntry or "No weight logged"), BMI (calculated), goal weight, activity level
- [ ] "Add Person" button opens a Dialog with form fields per spec
- [ ] Edit button on each card reopens dialog pre-filled with existing data
- [ ] Delete button with confirmation dialog
- [ ] Profile card component in `src/components/nutrition/profile-card.tsx`
- [ ] Quick weight entry dialog accessible from profile card
- [ ] Uses existing layout pattern: `<main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">`

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Can create a profile, see it in the list, edit it, delete it
- [ ] Quick weight entry works from profile card

**Dependencies:** Task 7 (store), Task 6 (BMI calc for display)

**Files likely touched:**
- `src/app/(app)/nutrition/profiles/page.tsx` (new)
- `src/components/nutrition/profile-card.tsx` (new)

**Estimated scope:** M (2 new files)

---

## Task 10: Food Log Entry Component + Add Food Dialog (Recipe Tab)

**Description:** Create the `food-log-entry` display component and the `add-food-log-dialog` with the recipe tab. The dialog is a complex component with three tabs; this task builds the shell and the recipe search/select tab.

**Acceptance criteria:**
- [ ] `src/components/nutrition/food-log-entry.tsx`: Shows food name, servings, calories, meal slot badge, edit/delete buttons. Uses shadcn Card or row layout.
- [ ] `src/components/nutrition/add-food-log-dialog.tsx`: Dialog shell with Tabs component (My Recipes / Custom Foods / Manual Entry)
- [ ] **My Recipes tab**: Searchable list of recipes from IDB (via recipe store or direct IDB query). Selecting a recipe auto-fills nutrition per-serving. User sets servings count. On confirm, creates FoodLogEntry with `sourceType: "recipe"`.
- [ ] Meal slot selector in the dialog (dropdown)
- [ ] Date picker in the dialog (defaults to today)

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Can open dialog, search recipes, select one, set servings, and create a log entry in IDB

**Dependencies:** Task 7 (store), Task 3 (recipe data from IDB)

**Files likely touched:**
- `src/components/nutrition/food-log-entry.tsx` (new)
- `src/components/nutrition/add-food-log-dialog.tsx` (new)

**Estimated scope:** M (2 new files, complex dialog)

---

## Task 11: Add Food Dialog (Custom Food + Manual Tabs)

**Description:** Complete the add food dialog with the Custom Foods tab and Manual Entry tab. Custom foods are searched from IDB. Manual entry provides free-form nutrition fields.

**Acceptance criteria:**
- [ ] **Custom Foods tab**: Searchable list of custom foods from IDB. Selecting auto-fills nutrition. User sets servings. `sourceType: "customFood"`.
- [ ] **Manual Entry tab**: Free-form fields for name + all 14 nutrition fields. User fills everything manually. `sourceType: "manual"`.
- [ ] All three tabs share the same submit logic (create FoodLogEntry via store)
- [ ] Edit mode: dialog reopens pre-filled with existing entry data for any source type

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Can add food from custom foods list
- [ ] Can manually enter food with all nutrition fields
- [ ] Can edit an existing entry (pre-filled correctly)

**Dependencies:** Task 10 (dialog shell + recipe tab)

**Files likely touched:**
- `src/components/nutrition/add-food-log-dialog.tsx` (extend)

**Estimated scope:** S (extending existing file)

---

## Task 12: Food Logging Page

**Description:** Create `/nutrition/log` page that assembles the person selector, date picker, meal slot sections, food log entries, and add food dialog into a cohesive food logging experience.

**Acceptance criteria:**
- [ ] Page at `src/app/(app)/nutrition/log/page.tsx`
- [ ] Person selector at top
- [ ] Date picker (defaults to today) next to person selector
- [ ] Six meal slot sections: Morning, Mid-Morning, Noon, Afternoon, Evening, Snack
- [ ] Each section shows entries for that slot + date + profile
- [ ] "+ Add Food" button in each section opens add-food-dialog with meal slot pre-selected
- [ ] Daily totals at bottom: sum of all nutrients for the day
- [ ] Empty state: "No food logged for this meal" in each section

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Can navigate to page, select person, pick date, add food to meal slots
- [ ] Entries persist after page refresh (IDB)

**Dependencies:** Task 8 (person selector), Tasks 10-11 (dialog + entry components), Task 7 (store)

**Files likely touched:**
- `src/app/(app)/nutrition/log/page.tsx` (new)

**Estimated scope:** M (1 new file, ~200-300 lines)

---

## Task 13: Weight Logging Dialog + Weight Trend Chart

**Description:** Create the weight entry dialog (accessible from profile cards and dashboard) and the weight trend chart component showing logged weights with a 7-day moving average trend line.

**Acceptance criteria:**
- [ ] Weight entry dialog: date picker (default today), weight input in kg (with optional lbs toggle that auto-converts), notes field, save button
- [ ] Dialog enforces one entry per person per date (updates if exists)
- [ ] `src/components/nutrition/weight-trend-chart.tsx`: Recharts `LineChart` with:
  - X-axis: date, Y-axis: weight (kg)
  - Data points for each WeightEntry
  - Trend line: 7-day moving average (computed client-side)
  - Goal weight as horizontal dashed `ReferenceLine` (if set)
  - Hover tooltip: date, weight, trend value
- [ ] Chart responsive, uses recharts `ResponsiveContainer`

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Can log weight, see it appear on chart
- [ ] Multiple entries show trend line
- [ ] Goal weight line appears when set

**Dependencies:** Task 7 (store), Task 6 (BMI calc for related display)

**Files likely touched:**
- `src/components/nutrition/weight-trend-chart.tsx` (new)

**Estimated scope:** M (1 new file + extending dialog usage)

---

### Checkpoint: Core Features
- [ ] `bun run build` succeeds
- [ ] Can create profile, log food, log weight
- [ ] Food log entries persist in IDB across page refreshes
- [ ] Weight trend chart renders with data
- [ ] Profile cards show correct BMI and current weight

---

### Phase 3: Dashboard & Charts

---

## Task 14: Calorie Summary Chart

**Description:** Create the calorie summary bar chart that adapts its display based on the selected period (today: single bar, week: 7 bars, month: daily bars, year: monthly aggregates).

**Acceptance criteria:**
- [ ] `src/components/nutrition/calorie-summary-chart.tsx`: Recharts `BarChart`
- [ ] Period logic:
  - Today: single bar showing consumed vs goal
  - Week: 7 bars (Mon-Sun) with goal `ReferenceLine`
  - Month: daily bars for the month with goal `ReferenceLine`
  - Year: 12 monthly aggregated bars with goal `ReferenceLine`
- [ ] Uses recharts `ResponsiveContainer`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ReferenceLine`
- [ ] Accepts `entries: FoodLogEntryRecord[]`, `period: Period`, `goalCalories: number | null` as props
- [ ] Date aggregation uses `date-fns`

**Verification:**
- [ ] `bun run build` succeeds

**Dependencies:** Task 7 (store types)

**Files likely touched:**
- `src/components/nutrition/calorie-summary-chart.tsx` (new)

**Estimated scope:** S (1 new file)

---

## Task 15: Macro Breakdown Chart

**Description:** Create a donut/pie chart showing fat/carbs/protein as percentage of total calories for the selected period.

**Acceptance criteria:**
- [ ] `src/components/nutrition/macro-breakdown-chart.tsx`: Recharts `PieChart` with `Pie` (donut via innerRadius)
- [ ] Shows fat (9 kcal/g), carbs (4 kcal/g), protein (4 kcal/g) as percentage of total calories
- [ ] Center label shows total calories
- [ ] Legend with color-coded macro names
- [ ] Accepts `entries: FoodLogEntryRecord[]` as prop
- [ ] Handles empty state (no entries)

**Verification:**
- [ ] `bun run build` succeeds

**Dependencies:** Task 7 (store types)

**Files likely touched:**
- `src/components/nutrition/macro-breakdown-chart.tsx` (new)

**Estimated scope:** S (1 new file)

---

## Task 16: Nutrient Trend Chart

**Description:** Create a multi-line chart showing selectable nutrients over time for the selected period.

**Acceptance criteria:**
- [ ] `src/components/nutrition/nutrient-trend-chart.tsx`: Recharts `LineChart` with multiple `Line` components
- [ ] Selectable nutrients via checkboxes/legend: calories, protein, fat, carbs, sodium
- [ ] Each nutrient as a separate colored line over time
- [ ] Toggle nutrients on/off via interactive legend
- [ ] X-axis: date, Y-axis: amount (with unit in label)
- [ ] Responsive container
- [ ] Accepts `entries: FoodLogEntryRecord[]`, `period: Period` as props

**Verification:**
- [ ] `bun run build` succeeds

**Dependencies:** Task 7 (store types)

**Files likely touched:**
- `src/components/nutrition/nutrient-trend-chart.tsx` (new)

**Estimated scope:** S (1 new file)

---

## Task 17: Today's Food List + Most Eaten List

**Description:** Create the two list components for the dashboard: today's food log grouped by meal slot, and a ranked list of most frequently eaten foods.

**Acceptance criteria:**
- [ ] `src/components/nutrition/todays-food-list.tsx`:
  - Shows all food log entries for today grouped by meal slot
  - Each entry: name, servings, calories, edit/delete actions
  - Total row at bottom with sum of all nutrients
  - Reuses `food-log-entry.tsx` component
- [ ] `src/components/nutrition/most-eaten-list.tsx`:
  - Ranked list of most frequently logged foods for the period
  - Shows: rank, food name, times eaten, average calories
  - Top 10 for today/week, top 20 for month/year
  - Accepts `entries: FoodLogEntryRecord[]`, `period: Period` as props

**Verification:**
- [ ] `bun run build` succeeds

**Dependencies:** Task 7 (store types), Task 10 (food-log-entry component)

**Files likely touched:**
- `src/components/nutrition/todays-food-list.tsx` (new)
- `src/components/nutrition/most-eaten-list.tsx` (new)

**Estimated scope:** S (2 new files)

---

## Task 18: Dashboard Page Assembly

**Description:** Create the main `/nutrition` dashboard page that assembles all components: person selector, period selector, stats cards, all four charts, food list, and most eaten list.

**Acceptance criteria:**
- [ ] Page at `src/app/(app)/nutrition/page.tsx` with `'use client'`
- [ ] **Top row**: Person selector + Period selector
- [ ] **Stats cards row** (4 cards using shadcn Card):
  - Current BMI (from `calculateBMI`)
  - Maintenance Calories (from `calculateTDEE`)
  - Goal Calories (from `calculateGoalCalories`) with warning if below minimum
  - Calories consumed today with progress bar toward goal
- [ ] **Charts grid** (responsive 2-column): Calorie Summary, Macro Breakdown, Nutrient Trend, Weight Trend
- [ ] **Below charts**: Today's Food List, Most Eaten List
- [ ] All data comes from the nutrition store, filtered by active profile and selected period
- [ ] Uses `useEffect` to fetch data on mount and when profile/period changes
- [ ] Layout follows existing pattern: `<main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">`

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Dashboard renders with all sections
- [ ] Switching profiles updates all data
- [ ] Switching periods updates charts and lists

**Dependencies:** Tasks 8, 13-17 (all chart/list components), Task 7 (store), Task 6 (calculations)

**Files likely touched:**
- `src/app/(app)/nutrition/page.tsx` (new)
- `src/components/nutrition/bmi-calorie-stats.tsx` (new, for the stats cards)

**Estimated scope:** M (2 new files, but mostly assembly)

---

### Checkpoint: Dashboard
- [ ] `bun run build` succeeds
- [ ] Dashboard renders correctly with test data
- [ ] All charts display data
- [ ] Period switching works
- [ ] Stats cards show correct calculations

---

### Phase 4: Polish & Integration

---

## Task 19: NutritionLabel Highlighting

**Description:** Modify the existing `NutritionLabel` component to highlight nutrient rows exceeding 100% DV. Add orange (≤125%) and red (>125%) highlighting that only applies on screen, not in print.

**Acceptance criteria:**
- [ ] `NutrientRowProps` gains optional `highlightExceed?: boolean` prop (default true)
- [ ] `NutritionLabelProps` gains optional `highlightExceed?: boolean` prop (default true)
- [ ] When `highlightExceed` is true and `dv > 100`:
  - `dv <= 125`: row background `#FFF3E0`, text `#E65100`
  - `dv > 125`: row background `#FFEBEE`, text `#B71C1C`
- [ ] Highlighting uses inline styles (consistent with existing label approach)
- [ ] Print CSS added (global stylesheet or component-level `<style>`) to strip highlights:
  ```css
  @media print {
    .nutrient-row-highlight { background: transparent !important; color: #000 !important; }
  }
  ```
- [ ] Backward compatible: existing `NutritionLabel` usage works without any changes (prop defaults to true)
- [ ] No visual change when all nutrients are at or below 100% DV

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Existing recipe pages render unchanged (all nutrients ≤100% DV)
- [ ] Add a high-sodium ingredient → sodium row turns orange when 100-125% DV
- [ ] Push sodium over 125% DV → row turns red
- [ ] Print preview shows no highlights (pure B&W)
- [ ] `highlightExceed={false}` suppresses all highlighting

**Dependencies:** None (independent of all other tasks)

**Files likely touched:**
- `src/components/nutrition-label.tsx` (modify)
- Possibly `src/app/globals.css` (for print CSS)

**Estimated scope:** S (modifying 1 existing file + minor CSS addition)

---

## Task 20: Navigation Update + History Page

**Description:** Add "Nutrition" to the app navigation and create the `/nutrition/history` page for browsing food log history with filters.

**Acceptance criteria:**
- [ ] Add entry to `NAV_ITEMS` in `src/components/app-nav.tsx`: `{ href: '/nutrition', label: 'Nutrition', icon: Activity }` (using Activity icon from lucide-react)
- [ ] History page at `src/app/(app)/nutrition/history/page.tsx`:
  - Person selector
  - Date range picker (start date, end date)
  - Filterable table/list of food log entries
  - Grouped by date, then by meal slot
  - Each entry shows: name, servings, calories, meal slot, edit/delete
  - Totals per day and for the entire range

**Verification:**
- [ ] `bun run build` succeeds
- [ ] "Nutrition" appears in nav, navigates to `/nutrition`
- [ ] History page shows filtered entries

**Dependencies:** Task 8 (person selector), Task 7 (store)

**Files likely touched:**
- `src/components/app-nav.tsx` (modify)
- `src/app/(app)/nutrition/history/page.tsx` (new)

**Estimated scope:** S (1 modification + 1 new file)

---

## Task 21: Sync Integration + End-to-End Polish

**Description:** Wire up the sync logic end-to-end: ensure IndexedDB changes are pushed to server API, server data is fetched on load, conflicts are resolved, and the offline queue works. Also fix any issues found during integration testing.

**Acceptance criteria:**
- [ ] On page load: store calls `syncFromServer()` which fetches all data from server and merges with IDB
- [ ] On create/update/delete: store writes to IDB then calls server API
- [ ] Failed API calls mark records as unsynced (`lastSyncedAt: null`)
- [ ] A "Sync" button or automatic trigger attempts to push unsynced records
- [ ] Navigation between nutrition sub-pages works correctly
- [ ] All nutrition pages render without console errors
- [ ] Cross-page state: adding food on log page updates dashboard
- [ ] Edge cases handled: no profiles exist, no food logged, no weight logged

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Create profile → refresh → profile persists (IDB)
- [ ] Create profile → restart server → profile still available (server sync)
- [ ] Add food → check dashboard → calories update
- [ ] Log weight → check profile card → BMI updates

**Dependencies:** All previous tasks

**Files likely touched:**
- `src/lib/nutrition-store.ts` (sync refinement)
- Various pages (bug fixes from testing)

**Estimated scope:** M (integration + bug fixes across multiple files)

---

### Checkpoint: Complete
- [ ] All 20 success criteria from the spec are met
- [ ] `bun run build` succeeds
- [ ] All pages render correctly
- [ ] Sync works end-to-end
- [ ] NutritionLabel highlights correctly and prints B&W

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| IDB version upgrade breaks existing stores | High | Test that existing stores survive the v8→v9 upgrade; only add new stores, never modify existing ones in the version bump |
| Sync conflicts cause data loss | Medium | Server-wins strategy with `updatedAt` timestamps; log conflicts for debugging |
| Large food log entries slow down IDB queries | Medium | Indexed queries on `[profileId, date]` keep queries fast; consider pagination for history page |
| NutritionLabel highlighting breaks print/PDF | Low | Test print preview early; use CSS-only solution (`@media print`) rather than JS-based detection |
| recharts bundle size | Low | Already a dependency; tree-shaking applies |
| MealSlot type conflicts with existing DaySlot | Low | DaySlot doesn't include 'snack'; MealSlot is a separate type |

## Open Questions (from spec)

1. **Unit system for weight** — Recommend supporting both kg and lbs with auto-conversion. Spec already assumes this.
2. **Profile avatars** — Recommend colored initials using emerald accent palette (low effort, high visual value). Can use existing Avatar component if available in shadcn/ui setup.
3. **Export/sharing** — Out of scope per spec. Can be added later.
4. **Sync conflict resolution** — Server-wins is acceptable for MVP. A merge UI can be added later if needed.

## Summary

| Phase | Tasks | Estimated Scope |
|-------|-------|----------------|
| Phase 1: Foundation | Tasks 1-6 | 6 files new/modified |
| Phase 2: Core Features | Tasks 7-13 | 9 files new/modified |
| Phase 3: Dashboard & Charts | Tasks 14-18 | 7 files new |
| Phase 4: Polish & Integration | Tasks 19-21 | 4 files new/modified |
| **Total** | **21 tasks** | **~26 files** |
