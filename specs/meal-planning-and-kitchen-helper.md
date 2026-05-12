# Spec: Meal Planning, Grocery Lists & Kitchen Helper

## Objective

Transform the placeholder Meal Plans page into a fully functional meal planning system with three major features:

1. **Monthly Calendar & Weekly/Daily Meal Plans** -- A calendar view showing existing meal plans, drillable into weekly plans broken down by day and time slot (morning, mid-morning, noon, afternoon, evening). Each slot holds recipes that can be grouped into named meals or left as standalone snacks. Nutrition labels combine dynamically based on user-set servings per recipe.

2. **Grocery List Generation** -- Auto-generates a grocery list from a week's meal plan. Shows deduplicated recipes with ingredient aggregation, unit conversion (imperial/metric), cross-highlighting between recipes and ingredients, and a persistent checkbox list.

3. **Kitchen Helper** -- Replaces the "Prep Scheduling" placeholder. Shows step-by-step prep and cooking instructions for a selected meal or recipe. Adds a "Prep Instructions" field to each ingredient.

**User Stories:**
- As a user, I want to see a monthly calendar with clickable weeks that have meal plans
- As a user, I want to plan meals for each day, organized by time of day
- As a user, I want to add recipes to time slots and group them into named meals
- As a user, I want to see combined nutrition facts for a meal with adjustable servings per recipe
- As a user, I want to drag-and-drop recipes within and between time slots
- As a user, I want to generate a grocery list from my weekly meal plan
- As a user, I want to see aggregated ingredients with unit conversion
- As a user, I want to cross-highlight recipes and ingredients
- As a user, I want a checklist I can check off while shopping (mobile-friendly)
- As a user, I want a step-by-step kitchen helper that shows prep then cooking instructions

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui (new-york style)
- Zustand v5 (state management)
- IndexedDB via `idb` v8 (client-side storage, all data)
- @dnd-kit/core + @dnd-kit/sortable (drag-and-drop reordering)
- date-fns v4 (date manipulation for calendar)
- react-day-picker v9 (calendar component)

## Commands

```
Dev:     bun run dev
Build:   bun run build
Lint:    bun run lint
```

## Project Structure

```
src/
  app/(app)/
    meal-plans/
      page.tsx                          → Monthly calendar view (landing)
      [weekStart]/
        page.tsx                        → Weekly plan view (7-day grid)
      grocery-list/
        [weekStart]/
          page.tsx                      → Grocery list for a given week
    kitchen-helper/
      page.tsx                          → Kitchen Helper page
  lib/
    storage.ts                          → Add IndexedDB stores: mealPlans, dayPlanEntries, mealGroups, groceryChecklists
    meal-plan-store.ts                  → NEW: Zustand store for meal plans
    grocery-store.ts                    → NEW: Zustand store for grocery list + checkbox state
    kitchen-helper-store.ts             → NEW: Zustand store for kitchen helper state
    unit-conversion.ts                  → NEW: Unit conversion utilities (imperial ↔ metric)
    types.ts                            → Add MealPlan, DayPlanEntry, MealGroup, GroceryChecklist types
  components/
    meal-plan/
      monthly-calendar.tsx              → Monthly calendar grid with meal plan indicators
      weekly-plan-grid.tsx              → 7-day grid with time slot rows
      day-plan-editor.tsx               → Daily plan editor (left table + right nutrition panel)
      time-slot-section.tsx             → Single time slot section (morning, mid-morning, etc.)
      meal-entry-card.tsx               → Card for a single recipe entry (draggable)
      meal-group-card.tsx               → Card for a grouped meal (draggable, expandable)
      nutrition-panel.tsx               → Right panel: nutrition label + recipe servings list
      add-recipe-dialog.tsx             → Dialog to search and add a recipe to a slot
      create-meal-group-dialog.tsx      → Dialog to name a new meal group
    grocery/
      recipe-list-panel.tsx             → Left panel: deduplicated recipe list
      ingredient-list-panel.tsx         → Middle panel: aggregated ingredients
      grocery-checklist-panel.tsx       → Right panel: checkbox checklist
    kitchen-helper/
      instruction-step.tsx              → Single instruction step card
      prep-instruction-editor.tsx       → Inline editor for ingredient prep instructions
      ingredient-prep-list.tsx          → List of ingredient prep steps
      cooking-step-list.tsx             → List of cooking instruction steps
    ingredient-prep-instructions.tsx    → Prep instruction editor for recipe edit page
  components/ui/                        → Existing shadcn/ui (may add Checkbox if missing)
```

## Data Model

### New IndexedDB Stores (version bump to 6)

```
mealPlans:          keyPath: "id"       → MealPlanRecord
dayPlanEntries:     keyPath: "id"       → index: "by-mealPlanId", "by-mealPlanIdAndDate" → DayPlanEntryRecord
mealGroups:         keyPath: "id"       → index: "by-mealPlanId" → MealGroupRecord
groceryChecklists:  keyPath: "id"       → index: "by-weekStart" → GroceryChecklistRecord
```

### TypeScript Types

```typescript
type DaySlot = 'morning' | 'midMorning' | 'noon' | 'afternoon' | 'evening';

interface MealPlanRecord {
  id: string;
  name: string;
  weekStart: string; // ISO date string of the Monday
  createdAt: string;
  updatedAt: string;
}

interface DayPlanEntryRecord {
  id: string;
  mealPlanId: string;
  date: string;        // ISO date string (YYYY-MM-DD)
  slot: DaySlot;
  recipeId: string;
  position: number;
  groupId: string | null; // null = standalone snack
  servings: number;       // defaults to 1
}

interface MealGroupRecord {
  id: string;
  mealPlanId: string;
  date: string;        // ISO date string (YYYY-MM-DD)
  slot: DaySlot;
  name: string;        // user-set, e.g., "Sunday Dinner"
  position: number;
}

interface GroceryChecklistRecord {
  id: string;
  weekStart: string;   // matches MealPlanRecord.weekStart
  checkedItems: string[]; // array of ingredient names that are checked
  updatedAt: string;
}
```

### Changes to Existing IngredientRecord

Add a `prepInstructions` field:

```typescript
interface IngredientRecord {
  // ... all existing fields unchanged ...
  prepInstructions: string[]; // NEW: array of prep instruction strings, defaults to []
}
```

Migration in `storage.ts`: in the `migrateRecipe` function, add:
```typescript
for (const ing of recipe.ingredients) {
  if (ing.prepInstructions === undefined) ing.prepInstructions = [];
}
```

### IndexedDB Schema Update

Add to `NutriLabelDB` interface:
```typescript
mealPlans: {
  key: string;
  value: MealPlanRecord;
  indexes: { 'by-weekStart': string };
};
dayPlanEntries: {
  key: string;
  value: DayPlanEntryRecord;
  indexes: {
    'by-mealPlanId': string;
    'by-date': string;
  };
};
mealGroups: {
  key: string;
  value: MealGroupRecord;
  indexes: { 'by-mealPlanId': string };
};
groceryChecklists: {
  key: string;
  value: GroceryChecklistRecord;
  indexes: { 'by-weekStart': string };
};
```

DB version bumps from 5 to 6, creating all four new stores.

## Feature Specifications

### Feature 1: Monthly Calendar & Meal Plans

#### 1.1 Monthly Calendar Page (`/meal-plans`)

- Replace the current placeholder page with a full monthly calendar
- Use `react-day-picker` or custom calendar grid with `date-fns`
- Each day cell shows a dot or badge if a meal plan exists for the week containing that day
- Clicking any day navigates to `/meal-plans/[weekStart]` where `weekStart` is the Monday of that day's week
- Above the calendar: month/year label with prev/next arrows
- Calendar weeks run Monday–Sunday

#### 1.2 Weekly Plan Page (`/meal-plans/[weekStart]`)

- Shows a 7-day grid (Mon–Sun) for the selected week
- Each day column shows a summary: number of meals/snacks planned
- Each day has an "Add" button that opens the day plan editor
- Each day shows clickable entries (grouped meals and individual snacks)
- Clicking an entry or the "Add" button opens the day plan editor
- Top of page: week date range (e.g., "Jan 6 – Jan 12, 2026") with prev/next week arrows
- If no MealPlanRecord exists for this week, one is auto-created on first interaction

#### 1.3 Day Plan Editor (modal or panel)

**Left side -- Time Slot Table:**

Five rows, one per slot:
| Slot | Entries |
|------|---------|
| Morning | [draggable entries] [+ Add] |
| Mid-Morning | [draggable entries] [+ Add] |
| Noon | [draggable entries] [+ Add] |
| Afternoon | [draggable entries] [+ Add] |
| Evening | [draggable entries] [+ Add] |

- Each entry is either a standalone snack (single recipe) or a grouped meal (multiple recipes)
- Entries within a slot are draggable via @dnd-kit for reordering
- "+ Add" button opens the Add Recipe Dialog
- Grouped meals show a card with the meal name and expand to show member recipes
- Context/long-press menu on an entry: "Remove", "Add to group", "Remove from group", "Set servings"

**Right side -- Nutrition Panel:**

- When no entry is selected: empty state prompt
- When a standalone snack (single recipe) is selected: show recipe name, servings stepper (default 1), and the standard `NutritionLabel` component
- When a grouped meal is selected:
  - Show the meal name at the top
  - List each recipe in the group with a servings stepper (default 1)
  - Show the combined `NutritionLabel` where each nutrient = sum of (recipe's per-serving nutrition × servings) across all recipes in the group
  - Changing any servings stepper immediately recalculates the label
- Nutrition data for a recipe is computed by summing its ingredients' nutrient values, then dividing by the recipe's `servings` field to get per-serving values, then multiplying by the user-set servings count

#### 1.4 Add Recipe Dialog

- Search bar that filters the user's existing recipes (from IndexedDB)
- Selecting a recipe adds it as a new `DayPlanEntryRecord` in the selected slot
- After adding, the user can optionally create a group or add to an existing group

#### 1.5 Meal Grouping

- User can select multiple entries in a slot and choose "Group as Meal"
- Prompts for a meal name (e.g., "Sunday Dinner", "Date Night")
- Creates a `MealGroupRecord` and assigns `groupId` to all selected entries
- Grouped entries move together during drag-and-drop
- User can ungroup a meal to return recipes to individual entries
- A group card shows the meal name and number of recipes

#### 1.6 Drag-and-Drop

- Use @dnd-kit (already in dependencies) for:
  - Reordering entries within a time slot
  - Moving entries between time slots (changes the `slot` field)
  - Reordering groups

### Feature 2: Grocery List Generation

#### 2.1 Entry Point

- "Grocery List" link on the weekly plan page (prominent, near the top)
- Navigates to `/meal-plans/grocery-list/[weekStart]`
- Defaults to the current week

#### 2.2 Grocery List Page Layout (Desktop -- 3-column)

**Column 1: Recipe List (left)**

- Shows all recipes used in the week's meal plan
- Duplicate recipes are consolidated as "Recipe Name ×N" where N is the count
- Clicking a recipe highlights all its ingredients in Column 2
- Highlighted state: yellow/amber background

**Column 2: Ingredient List (middle)**

- Shows all unique ingredients across all recipes in the plan
- For each ingredient: name, total quantity, and unit
- Quantities are summed across all occurrences (e.g., if "butter" appears as 2 tbsp in one recipe and 1/4 cup in another, total is converted and summed)
- Unit conversion: defaults to imperial (lbs, oz, fl oz, cups, tbsp, tsp). Setting available to switch to metric (g, kg, ml, L)
- Clicking an ingredient highlights all recipes that use it in Column 1
- Cross-highlighting: ingredient ↔ recipe is bidirectional and mutually exclusive (clicking recipe clears ingredient highlight and vice versa)

**Column 3: Grocery Checklist (right)**

- Renders the ingredient list as checkboxes
- Each item: ingredient name + total quantity + unit
- Sorted by grocery category if possible (produce, dairy, meat, pantry, etc.) -- fallback: alphabetical
- Checking/unchecking a box immediately saves to IndexedDB (`groceryChecklists` store)
- Checked items show strikethrough styling

#### 2.3 Mobile Layout

- On screens < 768px: show only the grocery checklist (Column 3)
- On desktop mode (user can toggle in browser): show full 3-column layout
- Use `use-mobile.ts` hook (already exists) for detection

#### 2.4 Unit Conversion

New utility module `src/lib/unit-conversion.ts`:

- Convert any unit to a canonical "base" unit (grams for weight, ml for volume)
- Aggregate in base units, then convert to the preferred display system
- Imperial display preferences: lbs (>16oz), oz (<16oz), fl oz, cups, tbsp, tsp
- Metric display preferences: kg (>1000g), g, L (>1000ml), ml
- Conversion table:

```typescript
const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1, oz: 28.3495, lb: 453.592, kg: 1000, mg: 0.001,
};
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, 'fl oz': 29.574,
  cup: 236.588, pt: 473.176, qt: 946.353, gal: 3785.41,
};
const COUNT_UNITS = ['whole', 'slice', 'piece', 'clove', 'leaf', 'sprig', 'pinch', 'dash', 'can', 'bag', 'bunch', 'stick'];
```

- Count units cannot be aggregated across different count types (e.g., "2 whole" + "1 slice" stays separate)
- The unit preference (imperial/metric) is stored in localStorage key `nutrilabel-unit-system`

#### 2.5 Persistence

- `groceryChecklists` store in IndexedDB: one record per `weekStart`
- `checkedItems`: array of ingredient name strings (using ingredient name as key since FDC IDs may vary for the same food)
- On any checkbox change: immediately persist via `db.put('groceryChecklists', record)`

### Feature 3: Kitchen Helper

#### 3.1 Navigation Changes

- Add "Kitchen Helper" as a new tab in `NAV_ITEMS` in `app-nav.tsx`:
  ```
  { href: '/kitchen-helper', label: 'Kitchen Helper', icon: ChefHat }
  ```
- Remove "Prep Scheduling" from the meal-plans placeholder feature cards (it's replaced by Kitchen Helper)
- Replace with "Kitchen Helper" in the feature card list, or remove the cards entirely since meal plans will be functional

#### 3.2 Kitchen Helper Page (`/kitchen-helper`)

**Selection Mode:**
- Toggle or tabs at top: "Select Recipe" vs "Select Meal"
- If "Select Recipe": shows a searchable list of all recipes
- If "Select Meal": shows a searchable list of meal groups from weekly plans, plus individual recipes
- After selection, the step-by-step view appears

**Step-by-Step View:**

The helper shows instructions in this strict order:

1. **Ingredient Prep Steps** (all prep instructions for all ingredients, ordered by ingredient group then ingredient position)
   - For each ingredient group header: show group title
   - For each ingredient: show its `prepInstructions` (if any)
   - Each prep instruction is a step card: ingredient name on top, prep instruction text below
   - Visual indicator: prep steps have a distinct color/badge (e.g., knife icon, amber accent)

2. **Cooking Steps** (all recipe instructions, ordered by recipe sequence)
   - For a single recipe: show its instruction steps in order
   - For a meal: show all recipes' instruction steps, with recipe name headers between sections
   - Each cooking step is a step card: step number, instruction text
   - Visual indicator: cooking steps have a distinct color/badge (e.g., flame icon, red accent)

3. **When working off a meal**: ALL ingredient prep steps must appear BEFORE ANY cooking steps
   - This ensures all mise en place is done before cooking begins

**Step Card Features:**
- Large, readable text (designed for kitchen use, possibly messy hands)
- Step number badge
- "Completed" checkbox/tap to mark done (state persisted in session only, not IndexedDB)
- Optional: swipe or keyboard navigation between steps

#### 3.3 Prep Instructions on Ingredients

**In the Recipe Editor (existing recipe edit page):**

- Each ingredient row gains an expandable "Prep Instructions" section
- "Add Instruction" button: adds a new text input field to the ingredient
- Each prep instruction has a small trash icon button to delete it
- Prep instructions are stored as `prepInstructions: string[]` on the ingredient
- Prep instructions appear in the same order as the ingredients appear in the recipe
- If ingredients are grouped, prep instructions are grouped by ingredient group

**Data Migration:**
- Existing ingredients get `prepInstructions: []` by default
- Migration handled in the existing `migrateRecipe` function in `storage.ts`

#### 3.4 Kitchen Helper for Meals

When the user selects a meal (grouped recipes):
- Collect all ingredients from all recipes in the meal
- Show ALL prep instructions for ALL ingredients first (grouped by recipe, then by ingredient group)
- Then show cooking instructions for each recipe in sequence
- Recipe headers separate sections: "Prep: Fried Chicken", "Prep: Mashed Potatoes", "Cook: Fried Chicken", "Cook: Mashed Potatoes"

## Code Style

Follow existing patterns:

```typescript
// IndexedDB CRUD (from storage.ts pattern)
export async function getAllMealPlans(): Promise<MealPlanRecord[]> {
  const db = await getDB();
  const plans = await db.getAll('mealPlans');
  return plans.sort(
    (a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
  );
}

// Zustand store (from recipe-store.ts pattern)
interface MealPlanState {
  mealPlans: MealPlanRecord[];
  activeWeekStart: string | null;
  dayEntries: DayPlanEntryRecord[];
  mealGroups: MealGroupRecord[];
  isLoading: boolean;
  error: string | null;
  fetchMealPlans: () => Promise<void>;
  // ... more methods
}
```

- `'use client'` directive on all interactive pages
- Zustand stores with `set`/`get` pattern
- shadcn/ui components (Card, Dialog, Button, Input, Checkbox, etc.)
- IndexedDB CRUD functions follow `storage.ts` pattern
- Tailwind classes with existing color scheme (emerald accent, stone neutrals)

## Testing Strategy

- Manual testing in browser for all features
- Verify IndexedDB persistence by refreshing page
- Test drag-and-drop within and between slots
- Test nutrition recalculation on servings change
- Test unit conversion accuracy with known values
- Test mobile responsive layout for grocery list
- Test cross-highlighting bidirectionality
- Test checkbox state persistence
- Test kitchen helper step ordering (prep before cooking)
- Test prep instruction CRUD on ingredients

## Boundaries

- **Always:** Run `bun run build` after changes, follow existing naming conventions, use shadcn/ui components, store data in IndexedDB
- **Ask first:** Adding new npm dependencies, changing the NutritionLabel component's external API, changing the existing Recipe/Ingredient Prisma models
- **Never:** Remove existing recipe/book functionality, modify the nutrition label rendering logic, commit `.env` files, add server-side API routes for these features

## Success Criteria

1. Monthly calendar shows all weeks with meal plans, clicking navigates to weekly view
2. Weekly plan shows 7-day grid with entries per day, navigable between weeks
3. Day plan editor shows 5 time slots with draggable recipe entries
4. Recipes can be added to any slot via search dialog
5. Recipes can be grouped into named meals or left as standalone snacks
6. Selecting a meal group shows combined nutrition label with per-recipe servings steppers
7. Nutrition label recalculates instantly when servings change
8. Drag-and-drop reorders entries within slots and between slots
9. Grocery list page shows recipe list, ingredient list, and checklist in 3 columns
10. Duplicate recipes show as "Recipe Name ×N"
11. Ingredients are aggregated with unit conversion (imperial default, metric option)
12. Clicking a recipe highlights its ingredients; clicking an ingredient highlights its recipes
13. Grocery checklist persists checkbox state immediately on change
14. Mobile view shows only the checklist; desktop shows all 3 columns
15. Kitchen Helper tab exists in navigation
16. Kitchen Helper shows prep instructions then cooking steps for a recipe
17. Kitchen Helper shows ALL prep steps for ALL recipes before ANY cooking steps for meals
18. Ingredients have an "Add Prep Instruction" button with delete capability
19. Prep instructions persist in IndexedDB on the ingredient record
20. All data survives page refresh

## Open Questions

1. **Grocery category classification** -- Should ingredients be auto-categorized into grocery sections (produce, dairy, etc.)? If so, we need a classification strategy. Fallback: alphabetical sort.
2. **Kitchen Helper step completion** -- Should completed step state persist across sessions, or reset on page load? (Spec assumes session-only.)
3. **Meal plan sharing** -- Should meal plans be shareable or exportable? (Out of scope for this spec.)

## Implementation Order

1. Data model & storage (IndexedDB stores + types + CRUD functions)
2. Meal plan Zustand store
3. Monthly calendar page
4. Weekly plan page
5. Day plan editor (time slots, add recipe, drag-and-drop)
6. Meal grouping (create groups, assign recipes)
7. Nutrition panel (per-recipe servings, combined label)
8. Prep instructions field on ingredients + editor in recipe page
9. Kitchen Helper page
10. Unit conversion utility
11. Grocery list page (3-column desktop, 1-column mobile)
12. Cross-highlighting (recipe ↔ ingredient)
13. Grocery checklist with persistence
14. Navigation updates (Kitchen Helper tab, remove Prep Scheduling card)
