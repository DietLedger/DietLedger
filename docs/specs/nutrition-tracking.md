# Spec: Nutrition Tracking & Multi-Person Health Dashboard

> **Documentation status:** Historical feature spec. For beta implementation, `../final_docs/system_requirements.md` and `NUTRITION_DOMAIN.md` are authoritative. Any IndexedDB, Prisma/SQLite, local sync, or Next.js API route guidance below is deprecated and must be replaced with Go API + PostgreSQL behavior before implementation.

## Objective

Add a comprehensive nutrition tracking system to NutriLabel that supports multiple people, weight logging, calorie/macro goal tracking, and rich chart-based analytics. Also modify the existing `NutritionLabel` component to visually highlight nutrients that exceed daily recommended values (orange for up to 25% over, red above that), while ensuring printed labels always render in pure black and white.

**User Stories:**

- As a user, I want to create profiles for multiple people (family members, clients, etc.) with their demographics and goals
- As a user, I want profiles persisted both locally (IndexedDB) and synced to the server (Prisma/SQLite)
- As a user, I want to log what each person eats each day by selecting recipes, custom foods, or food database items
- As a user, I want to log my weight on any date and see a trend line over time
- As a user, I want to see my auto-calculated BMI, maintenance calories, and daily calorie target to reach my goal weight by my goal date
- As a user, I want a dashboard with charts showing nutrition data for today, this week, this month, and this year
- As a user, I want to see what I've eaten today, my most-eaten recipes/foods, and my current weight at a glance
- As a user, I want all nutrition labels everywhere to highlight values exceeding daily recommended limits (orange ≤25% over, red >25% over) but always print as black and white

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui (new-york style)
- Zustand v5 (client state management)
- IndexedDB via `idb` v8 (client-side cache + offline support)
- Prisma + SQLite (server-side persistence for profiles and logs)
- recharts v2 (charts — already a dependency)
- date-fns v4 (date manipulation)

## Commands

```
Dev:     bun run dev
Build:   bun run build
Lint:    bun run lint
```

## Project Structure

```
prisma/
  schema.prisma                        → Add models: PersonProfile, FoodLogEntry, WeightEntry
  migrations/                          → New migration for nutrition tracking tables

src/
  app/(app)/
    nutrition/
      page.tsx                         → Dashboard/summary page (charts + today's food + stats)
      profiles/
        page.tsx                       → Profile list + create/edit
      log/
        page.tsx                       → Log food intake for a person on a date
      history/
        page.tsx                       → Detailed history browser (filter by person, date range)
  app/api/
    nutrition/
      profiles/
        route.ts                       → GET (list), POST (create)
      profiles/[id]/
        route.ts                       → GET, PUT, DELETE
      log/
        route.ts                       → GET (by person+date range), POST
      log/[id]/
        route.ts                       → PUT, DELETE
      weight/
        route.ts                       → GET (by person), POST
      weight/[id]/
        route.ts                       → PUT, DELETE
      sync/
        route.ts                       → POST (bulk sync from IndexedDB → server)
  lib/
    nutrition-store.ts                 → Zustand store for nutrition tracking state
    nutrition-calcs.ts                 → BMI, TDEE, goal calorie calculations
    storage.ts                         → Add IndexedDB stores: nutritionProfiles, foodLogEntries, weightEntries
    types.ts                           → Add NutritionProfile, FoodLogEntry, WeightEntry types
  components/
    nutrition/
      profile-card.tsx                 → Person profile card (avatar, stats, goal progress)
      person-selector.tsx              → Dropdown/tabs to switch active person
      calorie-summary-chart.tsx        → Bar/line chart of calories over period
      macro-breakdown-chart.tsx        → Pie/donut chart of macros (fat/carbs/protein)
      nutrient-trend-chart.tsx         → Line chart of individual nutrients over time
      weight-trend-chart.tsx           → Weight log chart with trend line
      todays-food-list.tsx             → List of foods eaten today
      most-eaten-list.tsx              → Most frequently eaten recipes/foods
      bmi-calorie-stats.tsx            → BMI, maintenance cals, goal cals display
      food-log-entry.tsx               → Single food log entry row
      add-food-log-dialog.tsx          → Dialog to add a food item to the log
      period-selector.tsx              → Toggle: today / week / month / year
    nutrition-label.tsx                → MODIFIED: add DV threshold highlighting

components/ui/                         → May add: Avatar, Select if missing
```

## Data Model

### New Prisma Models (Server-Side)

```prisma
model PersonProfile {
  id            String   @id @default(cuid())
  name          String
  sex           String                    // "male" | "female"
  birthDate     DateTime?
  heightCm      Float?
  activityLevel String   @default("sedentary")  // sedentary|light|moderate|active|veryActive
  goalWeightKg  Float?
  goalDate      DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  foodLogs  FoodLogEntry[]
  weights   WeightEntry[]
}

model FoodLogEntry {
  id          String       @id @default(cuid())
  profileId   String
  date        String                       // YYYY-MM-DD
  mealSlot    String                       // morning|midMorning|noon|afternoon|evening|snack
  sourceType  String                       // "recipe" | "customFood" | "foodItem" | "manual"
  sourceId    String?                      // recipeId, customFoodId, fdcId, or null for manual
  sourceName  String                       // display name (recipe name, food name, etc.)
  servings    Float        @default(1)
  calories    Float        @default(0)
  totalFat    Float        @default(0)
  saturatedFat Float      @default(0)
  transFat    Float        @default(0)
  cholesterol Float        @default(0)
  sodium      Float        @default(0)
  totalCarbs  Float        @default(0)
  dietaryFiber Float      @default(0)
  totalSugars  Float       @default(0)
  addedSugars Float        @default(0)
  protein     Float        @default(0)
  vitaminD    Float        @default(0)
  calcium     Float        @default(0)
  iron        Float        @default(0)
  potassium   Float        @default(0)
  notes       String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  profile     PersonProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId])
  @@index([date])
  @@index([profileId, date])
  @@index([sourceType, sourceId])
}

model WeightEntry {
  id        String       @id @default(cuid())
  profileId String
  date      String                       // YYYY-MM-DD
  weightKg  Float
  notes     String?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  profile   PersonProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([profileId, date])
  @@index([profileId])
  @@index([date])
}
```

### New IndexedDB Stores (version bump to 9)

```
nutritionProfiles:  keyPath: "id"       → NutritionProfileRecord
foodLogEntries:     keyPath: "id"       → indexes: "by-profileId", "by-date", "by-profileIdAndDate" → FoodLogEntryRecord
weightEntries:      keyPath: "id"       → indexes: "by-profileId", "by-profileIdAndDate" → WeightEntryRecord
```

### TypeScript Types

```typescript
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
type MealSlot = 'morning' | 'midMorning' | 'noon' | 'afternoon' | 'evening' | 'snack';
type FoodSourceType = 'recipe' | 'customFood' | 'foodItem' | 'manual';

interface NutritionProfileRecord {
  id: string;
  name: string;
  sex: 'male' | 'female';
  birthDate: string | null;       // ISO date string
  heightCm: number | null;
  activityLevel: ActivityLevel;
  goalWeightKg: number | null;
  goalDate: string | null;        // ISO date string
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FoodLogEntryRecord {
  id: string;
  profileId: string;
  date: string;                   // YYYY-MM-DD
  mealSlot: MealSlot;
  sourceType: FoodSourceType;
  sourceId: string | null;
  sourceName: string;
  servings: number;
  calories: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  totalCarbs: number;
  dietaryFiber: number;
  totalSugars: number;
  addedSugars: number;
  protein: number;
  vitaminD: number;
  calcium: number;
  iron: number;
  potassium: number;
  notes: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WeightEntryRecord {
  id: string;
  profileId: string;
  date: string;                   // YYYY-MM-DD
  weightKg: number;
  notes: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### IndexedDB Schema Update

Add to `NutriLabelDB` interface:

```typescript
nutritionProfiles: {
  key: string;
  value: NutritionProfileRecord;
};
foodLogEntries: {
  key: string;
  value: FoodLogEntryRecord;
  indexes: {
    'by-profileId': string;
    'by-date': string;
    'by-profileIdAndDate': [string, string];
  };
};
weightEntries: {
  key: string;
  value: WeightEntryRecord;
  indexes: {
    'by-profileId': string;
    'by-profileIdAndDate': [string, string];
  };
};
```

DB version bumps from 8 to 9, creating all three new stores.

## Feature Specifications

### Feature 1: Person Profiles

#### 1.1 Profile Management

- New page at `/nutrition/profiles`
- List of all profiles as cards showing: name, current BMI, goal weight, progress toward goal
- "Add Person" button opens a dialog/form with fields:
  - **Name** (required)
  - **Sex** (male/female, required)
  - **Date of Birth** (optional, used for age in calorie calculations)
  - **Height** in cm (optional, used for BMI)
  - **Activity Level** (dropdown: Sedentary, Lightly Active, Moderately Active, Active, Very Active)
  - **Goal Weight** in kg (optional)
  - **Goal Date** (optional, date picker — the target date to reach goal weight)
- Edit and delete buttons on each profile card
- Deleting a profile cascades to all its food logs and weight entries

#### 1.2 Current Weight

- The profile card displays the most recent weight entry as "Current Weight"
- If no weight entry exists, shows "No weight logged"
- Clicking the weight opens a quick weight entry dialog

#### 1.3 Sync Behavior

- Profiles are stored in both IndexedDB (for fast local access) and Prisma/SQLite (for server persistence)
- On create/update/delete: write to IndexedDB immediately, then POST/PUT/DELETE to server API
- If offline: queue changes in IndexedDB with `lastSyncedAt: null`, sync on reconnect
- On page load: fetch from server, merge with local data (server wins on conflict using `updatedAt` timestamps)
- A sync utility function in `nutrition-store.ts` handles the bidirectional sync

### Feature 2: Food Logging

#### 2.1 Log Page (`/nutrition/log`)

- Person selector at the top (dropdown or tabs showing all profiles)
- Date picker (defaults to today)
- Meal slot sections: Morning, Mid-Morning, Noon, Afternoon, Evening, Snack
- Each section has an "+ Add Food" button

#### 2.2 Add Food Dialog

Three tabs in the dialog:

1. **My Recipes** — Searchable list of user's recipes from IndexedDB. Selecting a recipe auto-fills nutrition data (per-serving values × servings). User sets number of servings.
2. **Custom Foods** — Searchable list of custom foods. User sets quantity/servings.
3. **Manual Entry** — Free-form: name + all nutrition fields (for foods not in the database).

When adding from a recipe:
- Nutrition = sum of recipe ingredients / recipe.servings × user-specified servings
- `sourceType: "recipe"`, `sourceId: recipe.id`, `sourceName: recipe.name`

When adding from custom food:
- Nutrition = custom food values × servings
- `sourceType: "customFood"`, `sourceId: customFood.id`, `sourceName: customFood.name`

When adding from food database:
- `sourceType: "foodItem"`, `sourceId: fdcId`, `sourceName: food description`
- Nutrition auto-filled from food database

When adding manually:
- `sourceType: "manual"`, `sourceId: null`, `sourceName: user-entered name`
- User fills in all nutrition fields manually

#### 2.3 Food Log Entry Display

Each entry in the log shows:
- Food name
- Serving count
- Calories
- Meal slot badge
- Edit button (reopens the dialog pre-filled)
- Delete button (with confirmation)

#### 2.4 Today's Food Summary (on dashboard)

- Running total of calories consumed today vs. daily goal
- Running macros: fat, carbs, protein consumed today
- List of all foods eaten today grouped by meal slot

### Feature 3: Weight Tracking

#### 3.1 Weight Log Entry

- Accessible from the profile card or a dedicated section
- Date picker (defaults to today, but any past date allowed)
- Weight input in kg (with option to input in lbs — auto-converts)
- Optional notes field
- Only one weight entry per person per date (updating replaces)

#### 3.2 Weight Trend Chart

- X-axis: date
- Y-axis: weight in kg
- Data points for each logged weight
- Trend line: 7-day moving average (computed client-side)
- Goal weight shown as a horizontal dashed line (if set)
- Hover tooltip shows: date, weight, trend value

### Feature 4: Nutrition Dashboard (`/nutrition`)

#### 4.1 Layout

The dashboard is the main nutrition tracking page. It consists of:

**Top row:**
- Person selector (switch between profiles)
- Period selector (Today / This Week / This Month / This Year)

**Stats cards row:**
- Current BMI (auto-calculated from height + latest weight)
- Maintenance Calories (TDEE — see calculations below)
- Goal Calories (daily intake needed to reach goal weight by goal date)
- Calories consumed today (with progress bar toward goal)

**Charts section (responsive grid):**

1. **Calorie Summary Chart** (bar chart)
   - Today: single bar showing consumed vs goal
   - Week: 7 bars (Mon-Sun) of total daily calories, goal line overlaid
   - Month: daily bars for the month
   - Year: monthly aggregated bars

2. **Macro Breakdown Chart** (donut/pie chart)
   - Fat / Carbs / Protein as percentage of total calories for the selected period
   - Center shows total calories

3. **Nutrient Trend Chart** (multi-line chart)
   - Selectable nutrients (calories, protein, fat, carbs, sodium, etc.)
   - Each nutrient as a line over time for the selected period
   - Toggle nutrients on/off via legend

4. **Weight Trend Chart** (line chart with trend line)
   - As described in Feature 3.2
   - Shows data for the selected period (or last 90 days if "year")

**Below charts:**

5. **Today's Food List**
   - All food log entries for today for the selected person
   - Grouped by meal slot
   - Each entry: name, servings, calories, edit/delete buttons
   - Total row at bottom

6. **Most Eaten Recipes/Foods**
   - Ranked list of most frequently logged foods for the selected period
   - Shows: rank, food name, times eaten, average calories per serving
   - Top 10 for today/week, top 20 for month/year

#### 4.2 Calculations

**BMI:**
```
BMI = weightKg / (heightCm / 100)²
```

**Basal Metabolic Rate (Mifflin-St Jeor):**
```
Male:   BMR = 10 × weightKg + 6.25 × heightCm - 5 × age - 5
Female: BMR = 10 × weightKg + 6.25 × heightCm - 5 × age + 161
```

If age is not available, use 30 as default (with a note that DOB should be set for accuracy).

**Total Daily Energy Expenditure (TDEE / Maintenance Calories):**
```
Activity multipliers:
  Sedentary:       BMR × 1.2
  Lightly Active:  BMR × 1.375
  Moderately Active: BMR × 1.55
  Active:          BMR × 1.725
  Very Active:     BMR × 1.9
```

TDEE = BMR × activity multiplier

**Goal Calories (to reach goal weight by goal date):**
```
daysRemaining = goalDate - today (in days)
weightDeltaKg = currentWeightKg - goalWeightKg
totalCalorieDelta = weightDeltaKg × 7700  // 7700 kcal ≈ 1 kg body fat
dailyDeficit = totalCalorieDelta / daysRemaining
goalCalories = TDEE - dailyDeficit

If weightDeltaKg < 0 (need to gain): dailyDeficit is negative, so goalCalories > TDEE
If weightDeltaKg > 0 (need to lose): dailyDeficit is positive, so goalCalories < TDEE
```

If goal weight or goal date is not set, show "Set a goal to see target calories."
If goal date is in the past, show "Goal date has passed."
If the calculated goal calories are below 1200 (female) or 1500 (male), show a warning: "This target is below recommended minimum. Consider extending your goal date."

#### 4.3 Period Aggregation

- **Today**: all food log entries where `date === today`
- **This Week**: entries where date is within the current week (Mon-Sun)
- **This Month**: entries where date is within the current calendar month
- **This Year**: entries where date is within the current calendar year

For each period, aggregate (sum) all nutrient fields across all entries for the selected person.

### Feature 5: NutritionLabel DV Highlighting

#### 5.1 Modification to NutrientRow

The existing `NutrientRow` component in `src/components/nutrition-label.tsx` gains a new optional prop:

```typescript
interface NutrientRowProps {
  name: string;
  value: number;
  unit: string;
  dv?: number;
  bold?: boolean;
  indent?: boolean;
  noDV?: boolean;
  highlightExceed?: boolean;  // NEW
}
```

When `highlightExceed` is true (default: true):
- If `dv` is defined and `dv > 100`:
  - If `dv <= 125` (up to 25% over): row background = orange (`#FFF3E0`), text = dark orange (`#E65100`)
  - If `dv > 125` (more than 25% over): row background = red (`#FFEBEE`), text = dark red (`#B71C1C`)
- If `dv <= 100` or `noDV`: no highlight

#### 5.2 Print Behavior

The `NutritionLabel` component detects print mode via CSS `@media print`:

```css
@media print {
  .nutrient-row-highlight { background: transparent !important; color: #000 !important; }
}
```

Or use a CSS class approach: highlight classes are applied with `@media screen` only. The label's container gets `className="nutrition-label-container"` and all highlight styles are wrapped in a `@media screen` block.

**Result:** On screen, exceeding nutrients are highlighted orange/red. On print (or when using the browser's print/PDF function), the label renders as pure black and white with no highlights.

#### 5.3 Scope

The `highlightExceed` prop is passed as `true` by default everywhere `NutritionLabel` is rendered:
- Recipe detail pages
- Meal plan nutrition panels
- Nutrition tracking dashboard
- Book recipe renders
- Template previews

There is no need for any consuming code to opt in — it's the default behavior. If someone wants to suppress highlights (unlikely), they can pass `highlightExceed={false}`.

The `NutritionLabelProps` interface gains an optional prop:

```typescript
interface NutritionLabelProps {
  data: NutritionData;
  servingDescription?: string;
  servingsPerContainer?: number;
  highlightExceed?: boolean;  // NEW: defaults to true
}
```

This is backward-compatible — existing call sites don't need changes.

## Code Style

Follow existing patterns:

```typescript
// API route pattern (from existing routes)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const profileId = searchParams.get('profileId');
  // ...
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // validate with zod
  // ...
  return NextResponse.json(record, { status: 201 });
}

// Zustand store pattern (from recipe-store.ts)
interface NutritionState {
  profiles: NutritionProfileRecord[];
  activeProfileId: string | null;
  foodLog: FoodLogEntryRecord[];
  weights: WeightEntryRecord[];
  isLoading: boolean;
  // ...
  fetchProfiles: () => Promise<void>;
  createProfile: (data: Omit<NutritionProfileRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncedAt'>) => Promise<NutritionProfileRecord>;
  addFoodLogEntry: (entry: Omit<FoodLogEntryRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncedAt'>) => Promise<FoodLogEntryRecord>;
  logWeight: (entry: Omit<WeightEntryRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncedAt'>) => Promise<WeightEntryRecord>;
}
```

- `'use client'` directive on all interactive pages
- Zustand stores with `set`/`get` pattern
- shadcn/ui components (Card, Dialog, Button, Input, Select, Tabs, etc.)
- Tailwind classes with existing color scheme (emerald accent, stone neutrals)
- Recharts components for all charts
- Server API routes use Prisma + zod validation

## Testing Strategy

- Manual testing in browser for all features
- Verify IndexedDB persistence by refreshing page
- Verify server sync by restarting the dev server and confirming data persists
- Test BMI calculation with known values (e.g., 70kg, 175cm → BMI 22.9)
- Test TDEE calculation with known values
- Test goal calorie calculation: e.g., 80kg person wanting to reach 75kg in 60 days
- Test weight trend chart with multiple entries
- Test nutrition label highlighting: add an ingredient that pushes sodium over 100% DV, verify orange; push over 125%, verify red
- Test print/PDF: verify highlights disappear in print preview
- Test period aggregation: add foods across multiple days, verify week/month totals
- Test profile CRUD and cascade delete
- Test food log CRUD for each source type (recipe, custom food, food item, manual)

## Boundaries

- **Always:** Run `bun run build` after changes, follow existing naming conventions, use shadcn/ui components, validate API inputs with zod
- **Ask first:** Adding new npm dependencies, changing the NutritionLabel component's external API surface (beyond the new optional prop), changing the Prisma schema for existing models (Recipe, Ingredient, FoodItem)
- **Never:** Remove existing functionality, commit `.env` files, break the existing NutritionLabel print/PDF rendering, store sensitive health data externally

## Success Criteria

1. Multiple person profiles can be created, edited, and deleted
2. Profiles are persisted in both IndexedDB and Prisma/SQLite
3. Profile sync works: changes appear after server restart
4. Food can be logged from recipes, custom foods, food database items, or manual entry
5. Food log entries show correct nutrition values based on servings
6. Weight can be logged for any date, with one entry per person per date
7. Weight trend chart shows data points and 7-day moving average trend line
8. Dashboard shows correct period-based aggregation (today/week/month/year)
9. Calorie summary chart displays correctly for each period
10. Macro breakdown donut chart shows fat/carbs/protein percentages
11. Nutrient trend chart shows selectable nutrient lines over time
12. BMI is auto-calculated from height and latest weight
13. TDEE (maintenance calories) is calculated using Mifflin-St Jeor + activity multiplier
14. Goal calories are calculated showing daily intake needed to reach goal weight by goal date
15. Warning shown if goal calories are below safe minimum
16. Today's food list shows all logged entries grouped by meal slot
17. Most eaten list shows ranked foods by frequency for the period
18. NutritionLabel highlights nutrients exceeding 100% DV in orange (≤125%) or red (>125%)
19. NutritionLabel prints as pure black and white with no highlights
20. All existing NutritionLabel render sites show highlights without code changes (backward compatible)

## Open Questions

1. **Unit system for weight** — Should we support both kg and lbs input (with conversion), or just kg? The spec assumes kg internally with optional lbs input that auto-converts.
2. **Profile avatars** — Should profiles support avatar images or colored initials? Could use the existing emerald accent colors as avatar backgrounds with initials.
3. **Export/sharing** — Should the dashboard data be exportable (CSV, PDF)? Out of scope for initial spec but worth noting.
4. **Sync conflict resolution** — Currently spec'd as "server wins on conflict using updatedAt." Is this acceptable, or should there be a merge UI?

## Implementation Order

1. Prisma schema changes + migration (PersonProfile, FoodLogEntry, WeightEntry)
2. API routes for profiles, food log, weight entries
3. IndexedDB stores + CRUD functions in storage.ts (version bump to 9)
4. Nutrition calculations utility (`nutrition-calcs.ts`)
5. Nutrition Zustand store with sync logic
6. Person selector component + profile management page
7. Profile create/edit form
8. Food logging page + add food dialog (recipe tab, custom food tab, manual tab)
9. Weight logging dialog + weight trend chart
10. Nutrition dashboard page layout + stats cards + period selector
11. Calorie summary chart
12. Macro breakdown chart
13. Nutrient trend chart
14. Today's food list on dashboard
15. Most eaten list on dashboard
16. NutritionLabel highlighting modification (NutrientRow + print CSS)
17. Navigation update (add Nutrition to NAV_ITEMS)
18. Sync integration testing + offline queue
