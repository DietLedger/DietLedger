# Implementation Plan: Meal Planning, Grocery Lists & Kitchen Helper

## Overview

Transform the placeholder Meal Plans page into a fully functional meal planning system with three major features: (1) Monthly calendar with weekly/daily meal plans featuring drag-and-drop, grouping, and combined nutrition labels, (2) Grocery list generation with ingredient aggregation, unit conversion, and cross-highlighting, and (3) Kitchen Helper with step-by-step prep and cooking instructions.

## Architecture Decisions

- **All data in IndexedDB** (version bump 5→6) — no server-side storage; follows existing pattern
- **3 new Zustand stores** — `meal-plan-store.ts`, `grocery-store.ts`, `kitchen-helper-store.ts` following existing `set`/`get` pattern
- **4 new IndexedDB stores** — `mealPlans`, `dayPlanEntries`, `mealGroups`, `groceryChecklists`
- **Reuse existing `NutritionLabel` component** — combine nutrition data by summing per-serving values × user-set servings
- **Reuse `@dnd-kit`** — already installed and used for ingredient drag-and-drop in recipe editor
- **Reuse `date-fns` v4 + `react-day-picker` v9** — already installed for calendar rendering
- **Add `prepInstructions: string[]` to IngredientRecord** — with migration in existing `migrateRecipe`
- **Checkbox UI component** — already installed at `src/components/ui/checkbox.tsx`

## Task List

### Phase 1: Foundation (Data Layer)

#### Task 1: Add TypeScript types for meal planning
**Description:** Define all new types in `src/lib/types.ts` and update `IngredientRecord` in `storage.ts` with `prepInstructions`.

**Acceptance criteria:**
- [ ] `DaySlot`, `MealPlanRecord`, `DayPlanEntryRecord`, `MealGroupRecord`, `GroceryChecklistRecord` types defined in `types.ts`
- [ ] `IngredientRecord` in `storage.ts` includes `prepInstructions: string[]`
- [ ] Migration in `migrateRecipe()` sets `prepInstructions = []` for existing ingredients

**Verification:**
- [ ] `bun run build` succeeds with no type errors

**Dependencies:** None

**Files likely touched:**
- `src/lib/types.ts`
- `src/lib/storage.ts`

**Estimated scope:** S (2 files)

---

#### Task 2: Add IndexedDB stores and CRUD functions
**Description:** Bump DB version to 6, create `mealPlans`, `dayPlanEntries`, `mealGroups`, `groceryChecklists` object stores with indexes. Add full CRUD functions following existing `storage.ts` patterns.

**Acceptance criteria:**
- [ ] `DB_VERSION` bumped from 5 to 6
- [ ] 4 new stores created with correct keyPaths and indexes
- [ ] CRUD functions for each store: `getAll*`, `get*ById`, `get*ByMealPlanId`, `put*`, `delete*`
- [ ] `getDayEntriesByDate`, `getDayEntriesByMealPlanId` index queries
- [ ] `getMealPlanByWeekStart` using `by-weekStart` index
- [ ] `getGroceryChecklistByWeekStart` using `by-weekStart` index

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Opening the app in browser doesn't throw DB upgrade errors

**Dependencies:** Task 1

**Files likely touched:**
- `src/lib/storage.ts`

**Estimated scope:** M (1 file, significant additions)

---

#### Task 3: Create meal plan Zustand store
**Description:** Create `src/lib/meal-plan-store.ts` following the existing Zustand store pattern. Manages meal plans, day entries, and meal groups.

**Acceptance criteria:**
- [ ] `useMealPlanStore` hook with state: `mealPlans`, `activeWeekStart`, `dayEntries`, `mealGroups`, `isLoading`, `error`
- [ ] Actions: `fetchMealPlans`, `fetchWeekPlan`, `createMealPlan`, `addRecipeToSlot`, `removeEntry`, `moveEntry` (slot/position change), `updateServings`, `createMealGroup`, `addToGroup`, `removeFromGroup`, `deleteMealGroup`, `reorderEntries`
- [ ] Follows `set`/`get` pattern from `recipe-store.ts`

**Verification:**
- [ ] `bun run build` succeeds

**Dependencies:** Task 2

**Files likely touched:**
- `src/lib/meal-plan-store.ts` (new file)

**Estimated scope:** M (1 file, ~200-300 lines)

---

#### Task 4: Create unit conversion utility
**Description:** Create `src/lib/unit-conversion.ts` with imperial↔metric conversion, aggregation, and display formatting.

**Acceptance criteria:**
- [ ] `WEIGHT_TO_GRAMS` and `VOLUME_TO_ML` conversion tables
- [ ] `COUNT_UNITS` list for non-aggregatable units
- [ ] `convertToBase(unit, amount)` — returns grams or ml
- [ ] `aggregateIngredients(ingredients)` — sums quantities by ingredient name in base units
- [ ] `formatAmount(baseAmount, baseUnit, system)` — converts to display units (imperial or metric)
- [ ] Unit preference read/write from localStorage key `nutrilabel-unit-system`

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: known conversions return correct values (e.g., 1 cup = 236.588 ml)

**Dependencies:** Task 1

**Files likely touched:**
- `src/lib/unit-conversion.ts` (new file)

**Estimated scope:** M (1 file, ~100-150 lines)

---

### Checkpoint: Foundation
- [ ] `bun run build` succeeds
- [ ] All types, stores, CRUD functions, and utilities are in place
- [ ] No runtime errors on app load

---

### Phase 2: Monthly Calendar & Weekly Plan

#### Task 5: Replace meal plans placeholder with monthly calendar
**Description:** Replace the placeholder `meal-plans/page.tsx` with a monthly calendar view showing weeks that have meal plans. Uses `react-day-picker` or custom grid with `date-fns`.

**Acceptance criteria:**
- [ ] Full month calendar grid (Mon–Sun weeks) with month/year label and prev/next arrows
- [ ] Days in weeks with meal plans show a dot/badge indicator
- [ ] Clicking any day navigates to `/meal-plans/[weekStart]` (Monday ISO date)
- [ ] Meal plans are loaded from IndexedDB via `useMealPlanStore`
- [ ] `'use client'` directive present

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: calendar renders, navigation works, clicking a day navigates correctly

**Dependencies:** Task 3

**Files likely touched:**
- `src/app/(app)/meal-plans/page.tsx` (replace)
- `src/components/meal-plan/monthly-calendar.tsx` (new)

**Estimated scope:** M (2 files)

---

#### Task 6: Create weekly plan page
**Description:** Create `meal-plans/[weekStart]/page.tsx` with a 7-day grid showing planned entries per day, with week navigation.

**Acceptance criteria:**
- [ ] Dynamic route `[weekStart]` renders Mon–Sun grid
- [ ] Week date range header (e.g., "Jan 6 – Jan 12, 2026") with prev/next arrows
- [ ] Each day column shows number of meals/snacks and clickable entries
- [ ] "Add" button per day that opens day plan editor
- [ ] Auto-creates `MealPlanRecord` on first interaction if none exists for the week
- [ ] "Grocery List" link near top navigating to `/meal-plans/grocery-list/[weekStart]`

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: week view renders, prev/next navigation works, adding an entry auto-creates plan

**Dependencies:** Task 5

**Files likely touched:**
- `src/app/(app)/meal-plans/[weekStart]/page.tsx` (new)
- `src/components/meal-plan/weekly-plan-grid.tsx` (new)

**Estimated scope:** M (2 files)

---

### Checkpoint: Calendar Navigation
- [ ] Monthly calendar → weekly plan navigation works end-to-end
- [ ] Week-to-week navigation works
- [ ] Auto-creation of meal plan records works

---

### Phase 3: Day Plan Editor & Meal Management

#### Task 7: Build day plan editor with time slots
**Description:** Create the day plan editor component with 5 time slot rows (morning, mid-morning, noon, afternoon, evening). Each slot shows entries and an "+ Add" button.

**Acceptance criteria:**
- [ ] 5 time slot rows rendered with labels
- [ ] Entries displayed as cards (standalone or grouped)
- [ ] "+ Add" button per slot opens add recipe dialog
- [ ] Context menu on entries: "Remove", "Set servings"
- [ ] Servings stepper on standalone entries (default 1)

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: time slots render, add/remove entries works

**Dependencies:** Task 6

**Files likely touched:**
- `src/components/meal-plan/day-plan-editor.tsx` (new)
- `src/components/meal-plan/time-slot-section.tsx` (new)
- `src/components/meal-plan/meal-entry-card.tsx` (new)
- `src/components/meal-plan/add-recipe-dialog.tsx` (new)

**Estimated scope:** M (4 files)

---

#### Task 8: Add recipe search dialog
**Description:** Create a searchable dialog that lists user's recipes from IndexedDB. Selecting a recipe adds it as a `DayPlanEntryRecord`.

**Acceptance criteria:**
- [ ] Search input filters recipes by name
- [ ] Recipe list loads from `useRecipeStore`
- [ ] Selecting a recipe creates a `DayPlanEntryRecord` in the selected slot
- [ ] Dialog closes after selection

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: search works, adding a recipe appears in the slot

**Dependencies:** Task 7

**Files likely touched:**
- `src/components/meal-plan/add-recipe-dialog.tsx` (from Task 7)

**Estimated scope:** S (1 file)

---

#### Task 9: Implement drag-and-drop within and between slots
**Description:** Integrate `@dnd-kit` for reordering entries within time slots and moving entries between slots.

**Acceptance criteria:**
- [ ] Entries can be dragged to reorder within a time slot
- [ ] Entries can be dragged to a different time slot (updates `slot` field)
- [ ] Position field is updated on drop
- [ ] Optimistic state update with background persist

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: drag within slot works, drag between slots works, order persists on refresh

**Dependencies:** Task 7

**Files likely touched:**
- `src/components/meal-plan/day-plan-editor.tsx`
- `src/components/meal-plan/time-slot-section.tsx`
- `src/components/meal-plan/meal-entry-card.tsx`

**Estimated scope:** M (3 files)

---

#### Task 10: Implement meal grouping
**Description:** Add ability to select multiple entries and group them into a named meal. Support ungrouping.

**Acceptance criteria:**
- [ ] Multi-select entries in a slot (checkbox or shift-click)
- [ ] "Group as Meal" action prompts for meal name via dialog
- [ ] Creates `MealGroupRecord` and assigns `groupId` to selected entries
- [ ] Grouped entries render as an expandable card with meal name and recipe count
- [ ] "Ungroup" action removes group and clears `groupId` on entries
- [ ] Groups move together during drag-and-drop

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: grouping works, ungrouping works, grouped entries stay together on drag

**Dependencies:** Task 9

**Files likely touched:**
- `src/components/meal-plan/meal-group-card.tsx` (new)
- `src/components/meal-plan/create-meal-group-dialog.tsx` (new)
- `src/components/meal-plan/day-plan-editor.tsx`
- `src/components/meal-plan/time-slot-section.tsx`

**Estimated scope:** M (4 files)

---

### Checkpoint: Day Plan Editor
- [ ] Full day plan editor works: add/remove/entry recipes, reorder, group/ungroup
- [ ] Drag-and-drop between slots works
- [ ] Data persists across page refresh

---

### Phase 4: Nutrition Panel

#### Task 11: Build nutrition panel for day plan editor
**Description:** Create the right-side nutrition panel that shows combined nutrition for selected entries or meal groups with per-recipe servings steppers.

**Acceptance criteria:**
- [ ] Empty state when nothing selected
- [ ] Single recipe selected: shows recipe name, servings stepper, and `NutritionLabel` component
- [ ] Meal group selected: shows meal name, per-recipe servings steppers, combined `NutritionLabel`
- [ ] Combined label: each nutrient = sum of (per-serving nutrition × servings) across all recipes
- [ ] Changing servings stepper immediately recalculates the label
- [ ] Per-serving nutrition = recipe's total ingredient nutrition / recipe's `servings` field

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: select a recipe → see its nutrition; change servings → values update correctly
- [ ] Manual: select a group → see combined label; adjust per-recipe servings → recalculates

**Dependencies:** Task 10

**Files likely touched:**
- `src/components/meal-plan/nutrition-panel.tsx` (new)
- `src/components/meal-plan/day-plan-editor.tsx` (integrate panel)

**Estimated scope:** M (2 files)

---

### Checkpoint: Nutrition Panel
- [ ] Combined nutrition calculation is accurate
- [ ] Servings stepper recalculates instantly
- [ ] Works for both single recipes and meal groups

---

### Phase 5: Kitchen Helper

#### Task 12: Add prep instructions field to ingredient editing
**Description:** Add expandable "Prep Instructions" section to each ingredient row in the recipe editor page. Support adding/removing prep instruction strings.

**Acceptance criteria:**
- [ ] Each ingredient row has an expandable "Prep Instructions" section
- [ ] "Add Instruction" button adds a text input field
- [ ] Each instruction has a trash icon to delete it
- [ ] Prep instructions stored as `prepInstructions: string[]` on the ingredient
- [ ] Instructions appear in ingredient order, grouped by ingredient group
- [ ] Changes persist to IndexedDB on save

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: add/edit/delete prep instructions works, persists on refresh

**Dependencies:** Task 1

**Files likely touched:**
- `src/app/(app)/recipes/page.tsx` (modify `SortableIngredientItem`)
- `src/components/kitchen-helper/prep-instruction-editor.tsx` (new, reusable inline editor)

**Estimated scope:** M (2 files)

---

#### Task 13: Create kitchen helper page
**Description:** Build the Kitchen Helper page with recipe/meal selection and step-by-step view showing prep instructions before cooking instructions.

**Acceptance criteria:**
- [ ] Navigation tab "Kitchen Helper" added to `NAV_ITEMS` in `app-nav.tsx` with `ChefHat` icon
- [ ] Toggle at top: "Select Recipe" vs "Select Meal"
- [ ] Recipe mode: searchable list of all recipes
- [ ] Meal mode: searchable list of meal groups from weekly plans
- [ ] Step-by-step view: all ingredient prep steps first, then cooking steps
- [ ] Prep steps: knife icon badge, amber accent, ingredient name + prep text
- [ ] Cooking steps: flame icon badge, red accent, step number + instruction text
- [ ] For meals: ALL prep for ALL recipes before ANY cooking steps
- [ ] Recipe headers separate sections for meals
- [ ] Step completion checkbox (session-only state)
- [ ] Large, readable text for kitchen use

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: select a recipe → see prep steps then cooking steps
- [ ] Manual: select a meal → all prep steps before cooking steps
- [ ] Manual: steps can be checked off, state resets on page reload

**Dependencies:** Task 3, Task 12

**Files likely touched:**
- `src/components/app-nav.tsx` (add nav item)
- `src/app/(app)/kitchen-helper/page.tsx` (new)
- `src/components/kitchen-helper/instruction-step.tsx` (new)
- `src/components/kitchen-helper/ingredient-prep-list.tsx` (new)
- `src/components/kitchen-helper/cooking-step-list.tsx` (new)
- `src/lib/kitchen-helper-store.ts` (new, session-only state)

**Estimated scope:** L (6 files) — consider splitting into 13a (store + selection) and 13b (step view)

---

#### Task 13a: Kitchen helper store and selection UI
**Description:** Create the kitchen helper Zustand store (session-only state) and the selection UI.

**Acceptance criteria:**
- [ ] `kitchen-helper-store.ts` manages: selected recipe/meal, completed steps, step navigation
- [ ] Selection UI with recipe/meal toggle and searchable lists

**Dependencies:** Task 3

**Files likely touched:**
- `src/lib/kitchen-helper-store.ts` (new)
- `src/app/(app)/kitchen-helper/page.tsx` (selection part)

**Estimated scope:** M (2 files)

---

#### Task 13b: Kitchen helper step-by-step view
**Description:** Build the step-by-step instruction view with prep steps before cooking steps.

**Acceptance criteria:**
- [ ] Prep steps rendered with knife icon and amber accent
- [ ] Cooking steps rendered with flame icon and red accent
- [ ] Steps ordered: all prep → all cooking
- [ ] Step completion checkbox (session state)
- [ ] Large readable text

**Dependencies:** Task 13a, Task 12

**Files likely touched:**
- `src/app/(app)/kitchen-helper/page.tsx` (step view part)
- `src/components/kitchen-helper/instruction-step.tsx` (new)
- `src/components/kitchen-helper/ingredient-prep-list.tsx` (new)
- `src/components/kitchen-helper/cooking-step-list.tsx` (new)

**Estimated scope:** M (4 files)

---

#### Task 14: Update navigation — add Kitchen Helper, update meal plans placeholder
**Description:** Add Kitchen Helper tab to navigation and update the meal plans page feature cards (remove "Prep Scheduling" card since it's replaced).

**Acceptance criteria:**
- [ ] `NAV_ITEMS` includes `{ href: '/kitchen-helper', label: 'Kitchen Helper', icon: ChefHat }`
- [ ] Import `ChefHat` from `lucide-react`
- [ ] Meal plans monthly calendar replaces placeholder entirely (done in Task 5)

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: Kitchen Helper tab appears in sidebar

**Dependencies:** Task 5

**Files likely touched:**
- `src/components/app-nav.tsx`

**Estimated scope:** XS (1 file)

---

### Checkpoint: Kitchen Helper
- [ ] Kitchen Helper accessible from nav
- [ ] Select recipe → step-by-step works
- [ ] Select meal → all prep before cooking works
- [ ] Prep instructions editable on ingredients and appear in Kitchen Helper

---

### Phase 6: Grocery List

#### Task 15: Build grocery list page — recipe and ingredient panels
**Description:** Create the grocery list page with 3-column desktop layout. Implement Column 1 (recipe list) and Column 2 (ingredient list with aggregation).

**Acceptance criteria:**
- [ ] Route `/meal-plans/grocery-list/[weekStart]` renders correctly
- [ ] Column 1: deduplicated recipes as "Recipe Name ×N"
- [ ] Column 2: aggregated unique ingredients with total quantities and units
- [ ] Quantities summed across all recipe occurrences in base units
- [ ] Unit conversion: defaults to imperial, togglable to metric
- [ ] Cross-highlighting: clicking recipe → highlights its ingredients; clicking ingredient → highlights its recipes

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: recipe list shows correct counts
- [ ] Manual: ingredients are aggregated correctly (e.g., 2 tbsp + 1/4 cup butter = consolidated)
- [ ] Manual: cross-highlighting works bidirectionally

**Dependencies:** Task 4, Task 6

**Files likely touched:**
- `src/app/(app)/meal-plans/grocery-list/[weekStart]/page.tsx` (new)
- `src/components/grocery/recipe-list-panel.tsx` (new)
- `src/components/grocery/ingredient-list-panel.tsx` (new)
- `src/lib/grocery-store.ts` (new)

**Estimated scope:** M (4 files)

---

#### Task 16: Build grocery checklist with persistence
**Description:** Add Column 3 — the grocery checklist with checkboxes that persist to IndexedDB.

**Acceptance criteria:**
- [ ] Checkbox list of all ingredients with name + total quantity + unit
- [ ] Checking/unchecking immediately saves to `groceryChecklists` store
- [ ] Checked items show strikethrough styling
- [ ] Sorted alphabetically (fallback; grocery category sorting is out of scope per open questions)
- [ ] Mobile layout (<768px): shows only the checklist column

**Verification:**
- [ ] `bun run build` succeeds
- [ ] Manual: checking items persists on page refresh
- [ ] Manual: mobile view shows only checklist
- [ ] Manual: desktop shows all 3 columns

**Dependencies:** Task 15

**Files likely touched:**
- `src/app/(app)/meal-plans/grocery-list/[weekStart]/page.tsx`
- `src/components/grocery/grocery-checklist-panel.tsx` (new)

**Estimated scope:** S (2 files)

---

### Checkpoint: Grocery List
- [ ] Full 3-column desktop layout works
- [ ] Mobile shows only checklist
- [ ] Ingredient aggregation and unit conversion are accurate
- [ ] Cross-highlighting works
- [ ] Checkbox state persists

---

### Phase 7: Polish & Integration

#### Task 17: End-to-end integration testing and polish
**Description:** Test the complete user flow end-to-end: create meal plan → add recipes → group meals → view nutrition → generate grocery list → use kitchen helper. Fix any integration issues.

**Acceptance criteria:**
- [ ] Complete flow: monthly calendar → weekly plan → day editor → add recipes → group → nutrition → grocery list → kitchen helper works
- [ ] All data survives page refresh
- [ ] No console errors
- [ ] Navigation between all pages works correctly
- [ ] `bun run build` succeeds with no warnings

**Verification:**
- [ ] `bun run build` succeeds
- [ ] `bun run lint` passes
- [ ] Manual: complete user flow tested

**Dependencies:** All previous tasks

**Files likely touched:**
- Various fixes across existing files

**Estimated scope:** M (varies)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `@dnd-kit/sortable` v10 API differs from v6 core | Medium | Verify compatibility; may need adapter. Existing recipe page uses dnd-kit already — follow that pattern |
| Ingredient unit aggregation edge cases (e.g., mixing count + volume units) | Medium | Count units are non-aggregatable per spec; handle gracefully as separate line items |
| Large recipe count could slow grocery list aggregation | Low | All computation is client-side with IndexedDB; acceptable for typical user data sizes |
| IndexedDB v5→v6 migration on existing data | High | Test with existing data; migration only adds new stores and a field default — no destructive changes |
| `react-day-picker` v9 API for custom day rendering | Low | Check docs for v9 DayPicker customization; fallback to custom date-fns grid if needed |

## Open Questions (from spec)

1. **Grocery category classification** — Fallback to alphabetical sort. Auto-categorization deferred.
2. **Kitchen Helper step completion** — Session-only (resets on page reload), per spec.
3. **Meal plan sharing** — Out of scope per spec.

## Task Summary

| Phase | Tasks | Est. Files | Dependencies |
|-------|-------|------------|--------------|
| 1. Foundation | 1-4 | 5 new/modified | None → sequential |
| 2. Calendar | 5-6 | 4 new | Phase 1 |
| 3. Day Editor | 7-10 | 8 new/modified | Phase 2 |
| 4. Nutrition | 11 | 2 new | Phase 3 |
| 5. Kitchen Helper | 12-14 | 8 new/modified | Phase 1 + 3 |
| 6. Grocery List | 15-16 | 6 new | Phase 1 + 2 |
| 7. Polish | 17 | varies | All |
| **Total** | **17 tasks** | **~33 files** | — |

## Parallelization Opportunities

After Phase 1 completes:
- **Phase 2 (Calendar)** and **Phase 5 (Kitchen Helper prep instructions)** can run in parallel
- **Phase 3 (Day Editor)** must wait for Phase 2
- **Phase 6 (Grocery List)** can start once Phase 1 is done (unit conversion) but needs Phase 2 for the route/link
- **Phase 4 (Nutrition Panel)** must wait for Phase 3 (meal grouping)
