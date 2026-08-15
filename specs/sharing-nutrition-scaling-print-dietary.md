# Spec: Recipe Sharing, Advanced Nutrition, Recipe Scaling, Print Studio & Dietary Compliance

> **Documentation status:** Historical feature spec. Product ideas may remain useful, but implementation details that rely on IndexedDB, local import, local-only persistence, or client-authoritative nutrition data are deprecated. For beta, `final_docs/system_requirements.md` is authoritative and nutrition-sensitive behavior must also follow `NUTRITION_DOMAIN.md`.

Five features from the DietLedger proposal: Tier 1 #2, Tier 2 #6, Tier 3 #7, #8, #10.

---

## Objective

Add five interconnected features to DietLedger that extend it from a personal recipe tool into a shareable, health-aware, print-ready platform:

1. **Recipe Sharing & Community Hub** (Tier 1 #2) — Share recipes via public links or QR codes; browse and import community recipes
2. **Advanced Nutrition & Health Tracking** (Tier 2 #6) — Rich dashboards, macro/micro goals, weight projections, allergen flagging, PDF reports
3. **Recipe Scaling Engine** (Tier 3 #7) — Scale recipes by servings, multiplier, or target calories with smart unit conversion
4. **Print Studio & Professional Templates** (Tier 3 #8) — Cookbook PDF export, branded templates, recipe card packs
5. **Dietary Compliance Mode** (Tier 3 #10) — FDA allergen auto-flagging, custom dietary profiles, threshold alerts, compliance reports

**User Stories:**

- As a user, I want to share a recipe via a public link with a nutrition label so my friends can view it
- As a user, I want to generate a QR code for a recipe card so I can print it
- As a user, I want to browse a community gallery, search recipes, and import them with one click
- As a user, I want daily/weekly/monthly nutrition dashboards with progress rings for macro and micronutrient goals
- As a user, I want weight trend projections toward my goal date
- As a user, I want to scale a recipe to serve 8 and have all ingredients and nutrition auto-adjust
- As a user, I want to export a full cookbook as PDF with table of contents and page numbers
- As a user, I want allergens auto-flagged on my recipes based on FDA top 9 allergens
- As a user, I want dietary restriction filters (gluten-free, keto, vegan) on recipe lists
- As a user, I want nutrient threshold alerts when a recipe exceeds my daily targets

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (new-york) |
| State | Zustand v5 |
| Storage | IndexedDB via `idb` v8 (client), Go + SQLite (sync server) |
| Charts | Recharts v2 |
| QR Codes | `qrcode.react` (new dependency) |
| PDF Export | `jspdf` + `html2canvas` (new dependencies) |
| Date | date-fns v4 |
| Icons | lucide-react |

## Commands

```
Dev:     bun run dev
Build:   bun run build
Lint:    bun run lint
Test:    bun run test          (vitest — to be added)
```

## Project Structure (new files only)

```
sync-server/
  handlers.go                   → ADD: public sharing endpoints
  models.go                     → ADD: SharedRecipe, CommunityRecipe models
  store.go                      → ADD: sharing/community DB tables + queries

src/
  lib/
    types.ts                    → ADD: SharedRecipe, DietaryProfile, Allergen types
    storage.ts                  → ADD: IndexedDB stores (dietaryProfiles, allergenRules)
    recipe-scaling.ts           → NEW: scaling engine (multiplier, servings, calorie-target)
    recipe-sharing.ts           → NEW: share link generation, import logic
    dietary-rules.ts            → NEW: allergen detection, dietary compliance engine
    pdf-export.ts               → NEW: cookbook/recipe PDF generation
    nutrition-store.ts          → EXTEND: goal tracking, progress rings, projections

  components/
    recipe/
      share-dialog.tsx          → Share recipe dialog (link, QR, copy)
      import-recipe-dialog.tsx  → Import from shared link
      scaling-controls.tsx      → Scale recipe UI (servings, multiplier, calorie target)
      dietary-badges.tsx        → Allergen + dietary tags on recipe cards

    community/
      community-gallery.tsx     → Browse/search community recipes
      recipe-card-public.tsx    → Public recipe view (no auth required)
      community-search.tsx      → Search bar with category/rating filters

    nutrition/
      progress-rings.tsx        → Macro/micro nutrient progress rings
      weight-projection.tsx     → Weight trend with goal projection line
      nutrient-dashboard.tsx    → Enhanced dashboard with micros
      nutrition-pdf-report.tsx  → Export nutrition report as PDF
      threshold-alerts.tsx      → Nutrient threshold warning banner

    print/
      print-studio.tsx          → Print studio main panel
      cookbook-export.tsx       → Full cookbook PDF export controls
      brand-kit-editor.tsx      → Brand kit (logo, colors, fonts) for professionals
      template-packs.tsx        → Template pack browser/selector

    dietary/
      allergen-panel.tsx        → Allergen flagging management
      dietary-profile-editor.tsx → Custom dietary profile editor
      compliance-report.tsx     → Printable compliance report
      dietary-filters.tsx       → Recipe list dietary filters

  app/(app)/
    share/[shareId]/page.tsx    → Public shared recipe view (outside auth)
    community/page.tsx          → Community gallery page

  app/api/
    share/
      route.ts                  → POST (create share link), GET (list user's shares)
      [shareId]/route.ts        → GET (public recipe data)
    community/
      route.ts                  → GET (search/browse public recipes)
      [shareId]/route.ts        → GET (single community recipe detail)
```

## Data Model

### Go Sync Server — New Tables

```sql
-- Shared recipes (published by users)
CREATE TABLE shared_recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  recipe_id TEXT NOT NULL,
  share_token TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  recipe_data TEXT NOT NULL,          -- JSON blob of the recipe
  nutrition_summary TEXT DEFAULT '',   -- JSON: {calories, protein, carbs, fat}
  categories TEXT DEFAULT '[]',        -- JSON array of category strings
  tags TEXT DEFAULT '[]',              -- JSON: ["gluten-free","keto","vegan"]
  allergens TEXT DEFAULT '[]',         -- JSON: ["milk","wheat","eggs"]
  servings INTEGER DEFAULT 1,
  image_url TEXT DEFAULT '',
  rating_avg REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  import_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shared_recipes_token ON shared_recipes(share_token);
CREATE INDEX idx_shared_recipes_user ON shared_recipes(user_id);
CREATE INDEX idx_shared_recipes_public ON shared_recipes(is_public);

-- Ratings
CREATE TABLE recipe_ratings (
  id TEXT PRIMARY KEY,
  shared_recipe_id TEXT NOT NULL REFERENCES shared_recipes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shared_recipe_id, user_id)
);

-- Community categories
CREATE TABLE community_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL
);
```

### IndexedDB — New Stores (version bump to 11)

```
dietaryProfiles:    keyPath: "id"    → DietaryProfileRecord
allergenRules:      keyPath: "id"    → AllergenRuleRecord (per-profile allergen config)
sharedRecipeCache:  keyPath: "id"    → Cache of imported community recipes
```

### TypeScript Types

```typescript
// ── Recipe Sharing ──
interface SharedRecipeRecord {
  id: string;
  userId: string;
  recipeId: string;
  shareToken: string;
  title: string;
  description: string;
  recipeData: string;
  nutritionSummary: string;
  categories: string[];
  tags: string[];
  allergens: Allergen[];
  servings: number;
  imageUrl: string;
  ratingAvg: number;
  ratingCount: number;
  importCount: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Recipe Scaling ──
interface ScaleOptions {
  mode: 'servings' | 'multiplier' | 'calorieTarget';
  targetServings?: number;
  multiplier?: number;
  targetCalories?: number;
  originalServings: number;
  originalCalories: number;
}

interface ScaledIngredient {
  name: string;
  originalAmount: number;
  originalUnit: string;
  scaledAmount: number;
  scaledUnit: string;
  isSmartScaled: boolean;       // true if non-linear scaling applied (spices, salt)
  smartScaleReason?: string;    // "spice", "seasoning", "leavening"
}

// ── Dietary Compliance ──
type Allergen = 'milk' | 'eggs' | 'fish' | 'shellfish' | 'treeNuts' |
  'peanuts' | 'wheat' | 'soybeans' | 'sesame';

type DietaryTag = 'vegetarian' | 'vegan' | 'gluten-free' | 'dairy-free' |
  'nut-free' | 'keto' | 'low-fodmap' | 'paleo' | 'mediterranean' |
  'dash' | 'diabetic' | 'renal' | 'low-sodium' | 'low-potassium';

interface DietaryProfileRecord {
  id: string;
  profileId: string;              // links to NutritionProfileRecord
  name: string;
  allergens: Allergen[];          // user's allergens to flag
  dietaryTags: DietaryTag[];      // dietary patterns to enforce
  nutrientThresholds: NutrientThreshold[];
  createdAt: string;
  updatedAt: string;
}

interface NutrientThreshold {
  nutrient: string;               // "sodium", "potassium", "phosphorus", etc.
  dailyMax: number;               // max mg per day
  perMealMax: number;             // max mg per meal
  alertLevel: 'warning' | 'danger';
}

interface AllergenDetection {
  allergen: Allergen;
  ingredients: string[];          // ingredient names that triggered detection
  confidence: 'high' | 'medium';
}

// ── Print Studio ──
interface BrandKit {
  id: string;
  name: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  tagline: string;
}

interface CookbookExportOptions {
  title: string;
  subtitle: string;
  bookIds: string[];              // which books to include
  includeToC: boolean;
  includeIndex: boolean;
  includePageNumbers: boolean;
  brandKit?: BrandKit;
  templateId?: string;
  pageSize: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
}
```

---

## Feature 1: Recipe Sharing & Community Hub

### How It Works

1. User opens "Share" dialog on a recipe
2. Client POSTs to `/api/share` on the sync server with recipe data
3. Server generates a unique `shareToken`, stores recipe JSON, returns the share link
4. Client displays the share link + QR code generated client-side via `qrcode.react`
5. Public page at `/share/[shareId]` fetches recipe data (no auth required)
6. Visitors can import the recipe into their own collection (one-click POST to their local IndexedDB)
7. Community gallery at `/community` fetches public recipes from sync server with search/filters
8. Users can rate shared recipes (1-5 stars)

### API Endpoints (Sync Server Extensions)

```
POST   /api/share                    → Create shared recipe (auth required)
GET    /api/share                    → List user's shared recipes (auth required)
DELETE /api/share/:shareId           → Unshare a recipe (auth required)
GET    /api/share/:shareToken        → Get public recipe (no auth)
POST   /api/share/:shareToken/rate   → Rate a recipe (auth required)
GET    /api/community                → Browse/search public recipes (no auth)
GET    /api/community/categories     → List categories (no auth)
```

### UI Components

- **ShareDialog** — Modal with: public link copy button, QR code display, toggle public/private, view count, import count
- **CommunityGallery** — Grid of recipe cards with search bar, category pills, sort (rating, newest, most imported)
- **RecipeCardPublic** — Recipe card with: title, nutrition label, servings, allergen badges, rating stars, "Import" button
- **ImportRecipeDialog** — Confirm import, optionally map categories before saving to IndexedDB

### Smart defaults

- Auto-detect allergens from ingredients when sharing (via `dietary-rules.ts`)
- Auto-set `tags` based on ingredients (vegan, gluten-free, etc.)
- Strip personal notes before publishing

---

## Feature 2: Advanced Nutrition & Health Tracking

### What's Already Implemented

The nutrition dashboard already has:
- `CalorieSummaryChart` (bar), `MacroBreakdownChart` (pie), `NutrientTrendChart` (line), `WeightTrendChart` (line)
- `BmiCalorieStats`, `TodaysFoodList`, `MostEatenList`
- `PeriodSelector` (today/week/month/year)
- `NutritionProfileRecord` with goals, `FoodLogEntryRecord`, `WeightEntryRecord`
- `nutrition-calcs.ts` with BMI, BMR, TDEE, goal calorie calculations

### New Additions

1. **Progress Rings** — SVG ring charts for each macro/micro goal. Each `NutritionProfileRecord` gets new goal fields:
   - `proteinGoalG`, `carbsGoalG`, `fatGoalG` (macro goals)
   - `fiberGoalG`, `sodiumMaxMg`, `sugarMaxG` (micro goals)
   - `vitaminDGoalUg`, `calciumGoalMg`, `ironGoalMg`, `potassiumGoalMg` (micronutrient goals)
   Rings show % consumed vs goal, color-coded (green < 80%, yellow 80-100%, red > 100%)

2. **Weight Projection** — Extend `WeightTrendChart` with a dashed projection line from current weight to goal weight by goal date, using the daily deficit already calculated in `calculateGoalCalories()`. Show estimated arrival date range (±2 weeks).

3. **Enhanced Nutrient Dashboard** — New `NutrientDashboard` component showing a grid of progress rings for all tracked micronutrients. Collapsible sections: "Macros", "Minerals", "Vitamins".

4. **Nutrition PDF Report** — Using `jspdf` + `html2canvas`, export a date-range nutrition report including:
   - Summary stats (avg daily calories, macro split)
   - Chart images (calorie trend, macro pie, weight trend)
   - Daily breakdown table
   - Allergen exposure summary
   - Branded header (optional BrandKit)

5. **Health Metric Logging** — Extend the existing weight logging to also support:
   - Blood sugar (mg/dL) with timestamp and meal context (fasting, post-meal)
   - Blood pressure (systolic/diastolic) with timestamp
   - New fields on `WeightEntryRecord`: `bloodSugar`, `bloodPressureSystolic`, `bloodPressureDiastolic`, `measurementContext`
   - New chart: `HealthMetricsChart` showing these over time

6. **Allergen Flagging** — Allergen badges on food log entries and recipe cards (uses `dietary-rules.ts` from Feature 5)

### NutrientProfile Extensions

```typescript
// Add to NutritionProfileRecord
interface NutritionProfileRecord {
  // ... existing fields ...
  proteinGoalG: number | null;
  carbsGoalG: number | null;
  fatGoalG: number | null;
  fiberGoalG: number | null;
  sodiumMaxMg: number | null;
  sugarMaxG: number | null;
  vitaminDGoalUg: number | null;
  calciumGoalMg: number | null;
  ironGoalMg: number | null;
  potassiumGoalMg: number | null;
}
```

---

## Feature 3: Recipe Scaling Engine

### How It Works

1. User clicks "Scale" on a recipe → `ScalingControls` component
2. Choose mode: by servings, by multiplier, or by calorie target
3. `recipe-scaling.ts` computes the scale factor:
   - **Servings**: `factor = targetServings / originalServings`
   - **Multiplier**: `factor = multiplier`
   - **Calorie target**: `factor = targetCalories / originalTotalCalories`
4. For each ingredient, apply the scale factor with smart rules:

### Smart Scaling Rules

| Category | Ingredients | Scaling | Rationale |
|---|---|---|---|
| Linear | Meat, produce, dairy, liquids | `amount * factor` | Directly proportional |
| Sub-linear (spices) | Salt, pepper, chili powder, cumin, etc. | `amount * Math.pow(factor, 0.7)` | Flavor doesn't scale linearly |
| Capped (leavening) | Baking soda, baking powder, yeast | `amount * Math.min(factor, 3)` | Too much leavening ruins texture |
| Capped (acid) | Vinegar, lemon juice, lime juice | `amount * Math.min(factor, 4)` | Over-acidifying is unpleasant |
| Special (garlic) | Garlic cloves | `amount * Math.pow(factor, 0.85)` | Personal preference, less is more |

### Unit Conversion on Scale-Up

When scaling up, if a unit becomes unwieldy, auto-convert:
- `16 tbsp` → `1 cup`
- `48 tsp` → `1 cup`
- `3 tsp` → `1 tbsp`
- `1000 g` → `1 kg`

Uses existing `unit-conversion.ts` functions.

### New File: `src/lib/recipe-scaling.ts`

```typescript
// Core exports
export function computeScaleFactor(options: ScaleOptions): number;
export function scaleIngredient(ingredient: IngredientRecord, factor: number): ScaledIngredient;
export function scaleRecipe(recipe: RecipeRecord, options: ScaleOptions): ScaledRecipe;
export function smartScaleAmount(amount: number, unit: string, ingredientName: string, factor: number): { amount: number; unit: string; isSmartScaled: boolean; reason?: string };
export function formatScaledAmount(amount: number, unit: string): string;

// Ingredient classification
export function classifyIngredient(name: string): 'linear' | 'spice' | 'leavening' | 'acid' | 'count';
```

### UI

- **ScalingControls** — Compact toolbar above recipe ingredients: servings spinner (+/- buttons), quick multipliers (0.5x, 2x, 3x), calorie target input, "Custom" multiplier field
- Scaled amounts shown inline with original amounts in strikethrough
- "Reset to Original" button
- Scaling only affects display/export — original recipe is never modified unless user clicks "Apply Scale"

### Batch Cooking Mode

For large-scale (50+ servings), add warnings:
- "Consider making in batches — oven capacity may be limiting"
- Leavening is capped at 4x regardless of factor
- Show both per-batch and total amounts

---

## Feature 4: Print Studio & Professional Templates

### What's Already Implemented

- 6 seed templates (Classic Card, Full Page, Minimal, Split View, Chapter Layout, Booklet)
- Full template editor with DnD section reordering
- `RecipeRenderer` that applies templates to render recipes
- `TemplateSection` types (14 section types), `TemplateTheme` with colors/font/border-radius
- Basic print CSS (`@media print`)

### New Additions

1. **Template Packs** — Pre-built collections of themed templates:
   - Seasonal (Spring Garden, Summer BBQ, Autumn Harvest, Winter Comfort)
   - Style (Minimalist, Rustic, Modern, Vintage)
   - Occasion (Wedding, Holiday, Family Reunion, Baby Shower)
   - Professional (Dietitian, Chef, Nutrition Coach)
   Each pack contains 3-5 templates. Packs stored as JSON in `src/data/template-packs.ts`.

2. **Brand Kit** — New `BrandKit` type stored in IndexedDB. Users define:
   - Logo (uploaded as base64 data URL, max 500KB)
   - Primary color, secondary color
   - Font family (from system fonts + Google Fonts subset)
   - Tagline text
   Brand kit auto-applies to templates during rendering.

3. **Cookbook PDF Export** — `pdf-export.ts` generates a full PDF:
   - Cover page (title, subtitle, logo from brand kit)
   - Table of contents (chapter titles + page numbers)
   - All recipes rendered with selected template
   - Page numbers (bottom center)
   - Optional index (alphabetical recipe name → page number)
   - Uses `jspdf` for PDF generation, `html2canvas` for template rendering
   - Progress bar during export (recipes rendered sequentially)

4. **Zine/Booklet Format** — Half-letter or A5 format with imposed pages for folding/stapling:
   - 2-up page imposition
   - Page order calculation for booklet binding
   - Margins for binding spine

5. **Recipe Card PDF** — Export individual recipe cards (4x6", 3x5", custom) with:
   - Template applied
   - QR code linking to shared recipe (if published)
   - Nutrition label on back (double-sided print option)

6. **Enhanced Print CSS** — Extend `public/css/print.css`:
   - Page break controls (`break-before`, `break-after`, `break-inside: avoid`)
   - CMYK-safe color conversion hints
   - @page rules for card sizes, margins
   - Dual-sided print support for recipe cards

### Brand Kit Storage

New IndexedDB store (version 11):
```
brandKits: keyPath: "id" → BrandKit
```

### UI Components

- **PrintStudio** — Main panel with tabs: "Templates", "Brand Kit", "Export"
- **TemplatePacks** — Grid of template pack cards with preview thumbnails
- **BrandKitEditor** — Form with logo upload, color pickers, font dropdown, tagline input
- **CookbookExport** — Panel with: book selector (multi-checkbox), template picker, page size, ToC/Index toggles, brand kit selector, "Export PDF" button with progress bar

---

## Feature 5: Dietary Compliance Mode

### How It Works

1. User creates a `DietaryProfileRecord` linked to their `NutritionProfileRecord`
2. Select allergens from FDA top 9 (milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame)
3. Select dietary patterns (vegetarian, vegan, keto, gluten-free, etc.)
4. Optionally set nutrient thresholds (sodium max, potassium max, etc.)
5. `dietary-rules.ts` auto-detects allergens and dietary tags from ingredient names
6. Recipe list shows dietary badges and allergen warnings
7. Meal planning alerts when daily thresholds would be exceeded
8. Compliance reports for dietitians

### Allergen Detection Engine (`dietary-rules.ts`)

**Keyword-based detection** using ingredient name matching:

```typescript
const ALLERGEN_KEYWORDS: Record<Allergen, string[]> = {
  milk: ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'whey', 'casein', 'lactose', 'half-and-half', 'whipping cream'],
  eggs: ['egg', 'egg white', 'egg yolk', 'mayonnaise', 'meringue', 'albumin'],
  fish: ['salmon', 'tuna', 'cod', 'tilapia', 'bass', 'trout', 'anchovy', 'sardine', 'halibut', 'swordfish'],
  shellfish: ['shrimp', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'prawn', 'crawfish'],
  treeNuts: ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut'],
  peanuts: ['peanut', 'peanut butter', 'peanut oil', 'groundnut'],
  wheat: ['wheat', 'flour', 'bread', 'pasta', 'noodle', 'bread crumbs', 'seitan', 'bulgur', 'couscous', 'cracker'],
  soybeans: ['soy', 'soy sauce', 'tofu', 'tempeh', 'edamame', 'miso', 'tamari'],
  sesame: ['sesame', 'tahini', 'sesame oil', 'sesame seed'],
};
```

**Dietary tag detection** — Rule-based inference:

```typescript
const DIETARY_RULES: Record<DietaryTag, { exclude: Allergen[], excludeKeywords: string[] }> = {
  vegetarian: { exclude: [], excludeKeywords: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage', 'ham', 'veal', 'meat'] },
  vegan: { exclude: [], excludeKeywords: [...vegetarian.excludeKeywords, 'milk', 'egg', 'cheese', 'butter', 'cream', 'honey', 'gelatin'] },
  glutenFree: { exclude: [], excludeKeywords: ['wheat', 'flour', 'bread', 'pasta', 'barley', 'rye', 'bulgur', 'couscous', 'seitan'] },
  // ... etc.
};
```

### Threshold Alerts

When viewing a recipe or meal plan:
- Calculate total nutrients for the recipe/meal/day
- Compare against `DietaryProfileRecord.nutrientThresholds`
- Show `ThresholdAlerts` banner: "This recipe contains 1,200mg sodium (80% of your daily max)"
- Color coding: warning (yellow) at 50-80%, danger (red) above 80%

### Compliance Reports

Printable report for dietitians showing:
- Date range
- Allergen exposure events
- Nutrient threshold violations (which days, which meals)
- Average daily intake vs targets
- Weight trend
- Meal plan adherence score

### FDA Allergen Data

Store the top 9 allergen keyword lists in `src/data/allergen-keywords.ts`. This is a static data file (no API needed). The ingredient matching is case-insensitive substring matching.

### Medical Meal Plan Templates

Pre-built meal plan templates for common therapeutic diets:
- DASH diet (7-day template, low sodium)
- Mediterranean diet (7-day template, heart-healthy)
- Renal diet (7-day template, low potassium/phosphorus/sodium)
- Diabetic exchange lists (carb-counted meals)
- Low-FODMAP (7-day template)

Stored as `src/data/medical-meal-templates.ts` — JSON arrays of `DayPlanEntryRecord` templates that users can import into a meal plan.

### UI Components

- **AllergenPanel** — Settings panel: checkboxes for 9 allergens, detected allergens per recipe shown with ingredient highlights
- **DietaryProfileEditor** — Create/edit dietary profiles with allergen selection, dietary tag selection, custom nutrient thresholds
- **ComplianceReport** — Date range picker, export to PDF, print view
- **DietaryFilters** — Filter bar on recipe list: toggle pills for dietary tags, "exclude my allergens" toggle
- **DietaryBadges** — Inline badges on recipe cards: green checkmark (compliant), red warning (allergen detected), gray (unknown)

---

## Implementation Order

```
Phase 1 (Foundation — no server dependency):
  ├── Dietary rules engine (dietary-rules.ts)          ← shared by Features 2, 5
  ├── Recipe scaling engine (recipe-scaling.ts)         ← standalone
  ├── Allergen keyword data (allergen-keywords.ts)      ← standalone
  └── Template packs data (template-packs.ts)           ← standalone

Phase 2 (Client-side features — IndexedDB only):
  ├── Dietary profile types + IndexedDB stores          ← Feature 5
  ├── Dietary badges + filters on recipe list           ← Feature 5
  ├── Scaling controls UI                               ← Feature 3
  ├── Progress rings for nutrition dashboard            ← Feature 2
  ├── Weight projection in WeightTrendChart             ← Feature 2
  ├── Nutrient thresholds + alerts                      ← Feature 2 + 5
  └── Brand kit storage + editor                        ← Feature 4

Phase 3 (Server-dependent features):
  ├── Sync server sharing endpoints                     ← Feature 1
  ├── Share dialog + QR codes                           ← Feature 1
  ├── Public recipe page (/share/[shareId])             ← Feature 1
  ├── Community gallery page                            ← Feature 1
  └── Rating system                                     ← Feature 1

Phase 4 (Export features — depend on Phase 2):
  ├── Cookbook PDF export                               ← Feature 4
  ├── Nutrition PDF report                              ← Feature 2
  ├── Compliance report PDF                             ← Feature 5
  └── Recipe card PDF with QR                           ← Feature 1 + 4
```

---

## Boundaries

- **Always:** Run `bun run lint` before commits, validate new types against existing patterns, use shadcn/ui components, follow Zustand store patterns, call `notifyLocalChange()` on all mutations
- **Ask first:** Adding npm dependencies, changing IndexedDB schema version, modifying sync server API, changing `TemplateSection` type union
- **Never:** Commit secrets/API keys, modify vendor directories, break existing sync protocol, change the `SYNC_STORE_NAMES` array without migration logic

## Success Criteria

### Feature 1: Recipe Sharing
- [ ] User can generate a public share link for any recipe
- [ ] QR code is generated client-side and displayed in share dialog
- [ ] Public page renders recipe with nutrition label without authentication
- [ ] Visitors can import shared recipe into their local collection
- [ ] Community gallery shows public recipes with search and category filters
- [ ] Users can rate shared recipes 1-5 stars

### Feature 2: Advanced Nutrition
- [ ] Progress rings show macro goals (protein, carbs, fat) with % consumed
- [ ] Progress rings show micronutrient goals with color coding
- [ ] Weight projection line extends from current weight to goal date
- [ ] Nutrition PDF report exports with charts, stats, and daily breakdown
- [ ] Blood sugar and blood pressure can be logged and charted
- [ ] Allergen badges appear on food log entries

### Feature 3: Recipe Scaling
- [ ] Scale by target servings (e.g., 2 → 8)
- [ ] Scale by multiplier (e.g., 0.5x, 2x, 3x)
- [ ] Scale by calorie target (e.g., "make this 500 calories per serving")
- [ ] Smart scaling for spices (sub-linear), leavening (capped), acids (capped)
- [ ] Auto unit conversion on scale-up (16 tbsp → 1 cup)
- [ ] "Apply Scale" permanently updates recipe; "Reset" reverts

### Feature 4: Print Studio
- [ ] Template packs browseable and installable
- [ ] Brand kit editor with logo upload, color pickers, font selection
- [ ] Full cookbook PDF export with ToC, page numbers, optional index
- [ ] Recipe card PDF in standard sizes (3x5, 4x6)
- [ ] Zine/booklet format with page imposition

### Feature 5: Dietary Compliance
- [ ] FDA top 9 allergens auto-detected from ingredient names
- [ ] Dietary tags (vegan, keto, gluten-free, etc.) auto-inferred
- [ ] Recipe list filterable by dietary tags and allergen exclusions
- [ ] Nutrient threshold alerts shown on recipes and meal plans
- [ ] Compliance report exportable as PDF
- [ ] Medical meal plan templates importable (DASH, Mediterranean, renal)

## Open Questions

1. **Community moderation** — Should reported/inappropriate shared recipes be auto-hidden, or require manual admin review? (Recommend: auto-hide after 3 reports, admin review queue)
2. **Sharing rate limits** — Should free users have a limit on shared recipes? (Recommend: 10 free, unlimited for pro)
3. **Google Fonts in Brand Kit** — Should we bundle a subset of popular Google Fonts, or load them dynamically? (Recommend: dynamic load with cache)
4. **Allergen detection accuracy** — Keyword matching will have false positives (e.g., "peanut butter" in "peanut butter cookies" is correct, but "coconut" shouldn't flag "tree nuts"). Need a curated exclusion list. (Recommend: maintain exclusion list in allergen-keywords.ts)
5. **PDF export performance** — html2canvas can be slow for large cookbooks. Should we offer a server-side rendering option? (Recommend: client-side only for now, add progress bar)
6. **Blood sugar/blood pressure** — Should this integrate with Apple Health / Google Fit in this phase? (Recommend: defer to later, manual entry only for now)
7. **Shared recipe versioning** — When a user updates a shared recipe, should the public version auto-update? (Recommend: yes, auto-update on push)
