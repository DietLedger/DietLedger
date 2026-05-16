# Implementation Plan: Recipe Sharing, Nutrition, Scaling, Print Studio & Dietary Compliance

## Overview

Five interconnected features for DietLedger: Recipe Sharing & Community Hub, Advanced Nutrition & Health Tracking, Recipe Scaling Engine, Print Studio & Professional Templates, and Dietary Compliance Mode. The implementation spans 4 phases moving from foundation libraries (no UI/server deps) through client-side UI features, server-dependent sharing, and finally export features.

## Architecture Decisions

- **IndexedDB version bump to 11** — Add `dietaryProfiles`, `allergenRules`, `sharedRecipeCache`, `brandKits` stores
- **New Zustand store: `dietary-store.ts`** — Dietary profiles, allergen rules, compliance (follows existing store pattern)
- **No new Zustand store for sharing** — Sharing state is server-driven; client uses React Query-like fetch patterns in components
- **Dietary rules as shared library** — `dietary-rules.ts` is imported by both nutrition components and sharing features
- **PDF export via jspdf + html2canvas** — Client-side only, progress bar for large exports
- **QR codes via qrcode.react** — Client-side generation, no server dependency
- **Smart scaling is display-only** — Original recipe is never modified unless user explicitly clicks "Apply Scale"

## Task List

### Phase 1: Foundation Libraries (no UI, no server)

---

#### Task 1: Add allergen keyword data file

**Description:** Create `src/data/allergen-keywords.ts` with the FDA top 9 allergen keyword mapping and dietary rule exclusion lists.

**Acceptance criteria:**
- [ ] `ALLERGEN_KEYWORDS` maps each of the 9 `Allergen` types to an array of ingredient name keywords
- [ ] `DIETARY_RULES` maps each `DietaryTag` to `{ exclude: Allergen[], excludeKeywords: string[] }`
- [ ] Exclusion list handles false positives (e.g., "coconut" excluded from tree nuts)
- [ ] All data is typed and exported

**Verification:**
- [ ] `bun run lint` passes
- [ ] File imports without errors

**Dependencies:** None

**Files likely touched:**
- `src/data/allergen-keywords.ts` (NEW)
- `src/lib/types.ts` (ADD: `Allergen`, `DietaryTag` types)

**Estimated scope:** S (1-2 files)

---

#### Task 2: Build dietary rules engine

**Description:** Create `src/lib/dietary-rules.ts` with allergen detection and dietary tag inference from ingredient names.

**Acceptance criteria:**
- [ ] `detectAllergens(ingredients: IngredientRecord[]): AllergenDetection[]` performs case-insensitive substring matching
- [ ] `inferDietaryTags(ingredients: IngredientRecord[]): DietaryTag[]` returns matching dietary tags
- [ ] `isRecipeCompliant(recipe: RecipeRecord, profile: DietaryProfileRecord): { compliant: boolean, violations: string[] }` checks recipe against profile
- [ ] All functions are pure (no side effects, no DB access)

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 1

**Files likely touched:**
- `src/lib/dietary-rules.ts` (NEW)

**Estimated scope:** S (1-2 files)

---

#### Task 3: Build recipe scaling engine

**Description:** Create `src/lib/recipe-scaling.ts` with smart scaling logic, unit conversion integration, and batch mode warnings.

**Acceptance criteria:**
- [ ] `computeScaleFactor(options: ScaleOptions): number` handles servings, multiplier, and calorie target modes
- [ ] `scaleIngredient(ingredient, factor): ScaledIngredient` applies smart scaling rules (sub-linear spices, capped leavening/acid)
- [ ] `classifyIngredient(name): 'linear' | 'spice' | 'leavening' | 'acid' | 'count'` uses keyword matching
- [ ] `smartScaleAmount()` auto-converts units on scale-up (e.g., 16 tbsp → 1 cup)
- [ ] `formatScaledAmount()` displays clean fractions
- [ ] Batch warnings trigger for 50+ servings

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** None (uses existing `unit-conversion.ts`)

**Files likely touched:**
- `src/lib/recipe-scaling.ts` (NEW)
- `src/lib/types.ts` (ADD: `ScaleOptions`, `ScaledIngredient`, `ScaledRecipe` types)

**Estimated scope:** S (2 files)

---

#### Task 4: Create template packs data

**Description:** Create `src/data/template-packs.ts` with 4 categories of template packs (Seasonal, Style, Occasion, Professional), each with 3-5 templates using existing `TemplateSection` types.

**Acceptance criteria:**
- [ ] `TEMPLATE_PACKS` array with 4 pack categories, each containing 3-5 template definitions
- [ ] Each template reuses existing `TemplateSection` and `TemplateTheme` types
- [ ] Templates have distinct layouts per category theme
- [ ] Exported as typed constant

**Verification:**
- [ ] `bun run lint` passes

**Dependencies:** None

**Files likely touched:**
- `src/data/template-packs.ts` (NEW)

**Estimated scope:** S (1 file)

---

#### Task 5: Add TypeScript types for all new features

**Description:** Extend `src/lib/types.ts` with all new types needed across features: `SharedRecipeRecord`, `DietaryProfileRecord`, `AllergenRuleRecord`, `NutrientThreshold`, `AllergenDetection`, `BrandKit`, `CookbookExportOptions`, `NutritionProfileRecord` extensions (macro/micro goals), `WeightEntryRecord` extensions (blood sugar/blood pressure).

**Acceptance criteria:**
- [ ] All types from spec are defined
- [ ] `NutritionProfileRecord` extended with optional macro/micro goal fields
- [ ] `WeightEntryRecord` extended with optional health metric fields
- [ ] New types: `SharedRecipeRecord`, `DietaryProfileRecord`, `AllergenRuleRecord`, `BrandKit`, `CookbookExportOptions`, `ScaleOptions`, `ScaledIngredient`
- [ ] `Allergen` and `DietaryTag` union types defined

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds (no type errors from new types)

**Dependencies:** None

**Files likely touched:**
- `src/lib/types.ts` (EXTEND)

**Estimated scope:** S (1 file)

---

### Checkpoint: Foundation

- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds
- [ ] All 5 foundation files compile and export correctly

---

### Phase 2: Client-Side Features (IndexedDB + UI)

---

#### Task 6: Extend IndexedDB schema to v11

**Description:** Add 4 new object stores to `storage.ts`: `dietaryProfiles`, `allergenRules`, `sharedRecipeCache`, `brandKits`. Bump DB version to 11. Add CRUD functions following existing patterns.

**Acceptance criteria:**
- [ ] DB version bumped from 10 to 11
- [ ] `dietaryProfiles` store with keyPath `id`
- [ ] `allergenRules` store with keyPath `id`
- [ ] `sharedRecipeCache` store with keyPath `id`
- [ ] `brandKits` store with keyPath `id`
- [ ] CRUD functions: `dbAddDietaryProfile`, `dbGetDietaryProfile`, `dbGetAllDietaryProfiles`, `dbUpdateDietaryProfile`, `dbDeleteDietaryProfile` (same pattern for each store)
- [ ] Migration logic in `openDB()` handles v10 → v11

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 5

**Files likely touched:**
- `src/lib/storage.ts` (EXTEND)

**Estimated scope:** M (1 large file, many additions)

---

#### Task 7: Create dietary Zustand store

**Description:** Create `src/lib/dietary-store.ts` following existing store patterns for dietary profile CRUD, allergen rule management, and compliance checking.

**Acceptance criteria:**
- [ ] Store state: `profiles[], activeProfileId, allergenRules[], isloading, error`
- [ ] Actions: `loadProfiles()`, `createProfile()`, `updateProfile()`, `deleteProfile()`, `loadAllergenRules()`, `saveAllergenRule()`
- [ ] All mutations call `notifyLocalChange()`
- [ ] Follows exact pattern of existing stores (e.g., `nutrition-store.ts`)

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 6

**Files likely touched:**
- `src/lib/dietary-store.ts` (NEW)

**Estimated scope:** S (1 file)

---

#### Task 8: Build dietary profile editor UI

**Description:** Create `src/components/dietary/dietary-profile-editor.tsx` — form for creating/editing dietary profiles with allergen checkboxes (FDA top 9), dietary tag multi-select, and custom nutrient threshold inputs.

**Acceptance criteria:**
- [ ] Form creates/edits `DietaryProfileRecord` via dietary store
- [ ] Allergen selection as checkboxes with labels
- [ ] Dietary tags as toggle pills
- [ ] Nutrient thresholds as dynamic form rows (nutrient name, dailyMax, perMealMax, alertLevel)
- [ ] Uses shadcn/ui components (Form, Checkbox, Select, Input, Button)
- [ ] Proper loading/error states

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 7

**Files likely touched:**
- `src/components/dietary/dietary-profile-editor.tsx` (NEW)

**Estimated scope:** M (3-4 files with imports)

---

#### Task 9: Build allergen panel and dietary badges

**Description:** Create `src/components/dietary/allergen-panel.tsx` (settings panel showing detected allergens per recipe) and `src/components/recipe/dietary-badges.tsx` (inline badges on recipe cards showing compliance status).

**Acceptance criteria:**
- [ ] `AllergenPanel` displays detected allergens for a recipe with ingredient highlights
- [ ] `DietaryBadges` shows green checkmark (compliant), red warning (allergen), gray (unknown)
- [ ] Uses `dietary-rules.ts` for detection
- [ ] Badges integrate with existing recipe card components

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 2, Task 8

**Files likely touched:**
- `src/components/dietary/allergen-panel.tsx` (NEW)
- `src/components/recipe/dietary-badges.tsx` (NEW)

**Estimated scope:** M (2 new files)

---

#### Task 10: Build dietary filters for recipe list

**Description:** Create `src/components/dietary/dietary-filters.tsx` — filter bar with toggle pills for dietary tags and "exclude my allergens" toggle, integrated into the recipe list page.

**Acceptance criteria:**
- [ ] Filter bar with dietary tag toggle pills (vegetarian, vegan, keto, gluten-free, etc.)
- [ ] "Exclude my allergens" toggle button
- [ ] Filters applied to recipe list in real-time
- [ ] Active filters shown as removable badges
- [ ] Integrated into `src/app/(app)/recipes/page.tsx`

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 2, Task 9

**Files likely touched:**
- `src/components/dietary/dietary-filters.tsx` (NEW)
- `src/app/(app)/recipes/page.tsx` (MODIFY)

**Estimated scope:** M (2 files)

---

#### Task 11: Build scaling controls UI

**Description:** Create `src/components/recipe/scaling-controls.tsx` — compact toolbar for scaling recipes with servings spinner, quick multipliers, calorie target, and scaled ingredient display.

**Acceptance criteria:**
- [ ] Servings spinner with +/- buttons
- [ ] Quick multiplier buttons (0.5x, 2x, 3x)
- [ ] Calorie target input field
- [ ] Scaled amounts shown inline with original in strikethrough
- [ ] "Apply Scale" and "Reset to Original" buttons
- [ ] Smart scale reasons shown as tooltips (e.g., "spice — sub-linear scaling")
- [ ] Batch cooking warnings for 50+ servings

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 3

**Files likely touched:**
- `src/components/recipe/scaling-controls.tsx` (NEW)

**Estimated scope:** M (1 component, integration with recipe view)

---

#### Task 12: Add nutrient goal fields to nutrition profile

**Description:** Extend `NutritionProfileRecord` in storage.ts and types.ts with macro/micro goal fields. Update the profile editor UI to allow setting these goals.

**Acceptance criteria:**
- [ ] `NutritionProfileRecord` has optional goal fields: `proteinGoalG`, `carbsGoalG`, `fatGoalG`, `fiberGoalG`, `sodiumMaxMg`, `sugarMaxG`, `vitaminDGoalUg`, `calciumGoalMg`, `ironGoalMg`, `potassiumGoalMg`
- [ ] Profile editor has input fields for these goals
- [ ] Existing profiles gracefully handle null values
- [ ] DB migration preserves existing data

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 5, Task 6

**Files likely touched:**
- `src/lib/types.ts` (EXTEND)
- `src/lib/storage.ts` (EXTEND)
- `src/components/nutrition/profile-card.tsx` (MODIFY)

**Estimated scope:** M (3 files)

---

#### Task 13: Build progress rings component

**Description:** Create `src/components/nutrition/progress-rings.tsx` — SVG ring charts for macro and micronutrient goals with color coding (green < 80%, yellow 80-100%, red > 100%).

**Acceptance criteria:**
- [ ] SVG ring chart shows % consumed vs goal
- [ ] Color coding: green < 80%, yellow 80-100%, red > 100%
- [ ] Accepts nutrient name, current value, goal value as props
- [ ] Grid layout for multiple rings (Macros section, Minerals section, Vitamins section)
- [ ] Accessible labels

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 12

**Files likely touched:**
- `src/components/nutrition/progress-rings.tsx` (NEW)

**Estimated scope:** S (1 file)

---

#### Task 14: Build nutrient dashboard with progress rings

**Description:** Create `src/components/nutrition/nutrient-dashboard.tsx` — enhanced dashboard showing a grid of progress rings organized by collapsible sections (Macros, Minerals, Vitamins). Integrate into the nutrition page.

**Acceptance criteria:**
- [ ] Collapsible sections: Macros, Minerals, Vitamins
- [ ] Each section shows a grid of progress rings
- [ ] Data sourced from food log entries and nutrition profile goals
- [ ] Period-aware (today/week/month)
- [ ] Integrated into `src/app/(app)/nutrition/page.tsx`

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 13

**Files likely touched:**
- `src/components/nutrition/nutrient-dashboard.tsx` (NEW)
- `src/app/(app)/nutrition/page.tsx` (MODIFY)

**Estimated scope:** M (2 files)

---

#### Task 15: Add weight projection to weight trend chart

**Description:** Extend `src/components/nutrition/weight-trend-chart.tsx` with a dashed projection line from current weight to goal weight by goal date, using the daily deficit from `calculateGoalCalories()`.

**Acceptance criteria:**
- [ ] Dashed projection line from latest weight entry to goal weight by goal date
- [ ] Estimated arrival date range shown (±2 weeks)
- [ ] Uses `calculateGoalCalories()` daily deficit for projection slope
- [ ] Projection only shown when goal weight and goal date are set
- [ ] Legend updated to show "Projected" line

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 12

**Files likely touched:**
- `src/components/nutrition/weight-trend-chart.tsx` (MODIFY)

**Estimated scope:** S (1 file)

---

#### Task 16: Add health metric logging (blood sugar, blood pressure)

**Description:** Extend `WeightEntryRecord` with optional health metric fields. Add UI for logging blood sugar and blood pressure with measurement context. Create `HealthMetricsChart` component.

**Acceptance criteria:**
- [ ] `WeightEntryRecord` extended with `bloodSugar?`, `bloodPressureSystolic?`, `bloodPressureDiastolic?`, `measurementContext?`
- [ ] Weight logging dialog includes optional health metric fields
- [ ] New `HealthMetricsChart` shows blood sugar and blood pressure over time
- [ ] Measurement context selector (fasting, post-meal, random)

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 5, Task 6

**Files likely touched:**
- `src/lib/types.ts` (EXTEND)
- `src/lib/storage.ts` (EXTEND)
- `src/components/nutrition/weight-trend-chart.tsx` or new `health-metrics-chart.tsx`
- Weight logging dialog component (MODIFY)

**Estimated scope:** M (3-4 files)

---

#### Task 17: Build threshold alerts component

**Description:** Create `src/components/nutrition/threshold-alerts.tsx` — warning banner shown on recipe views and meal plans when nutrient thresholds from dietary profile are exceeded.

**Acceptance criteria:**
- [ ] Banner shows when recipe/meal nutrients exceed dietary profile thresholds
- [ ] Color coding: warning (yellow) at 50-80%, danger (red) above 80%
- [ ] Shows specific nutrient amounts and percentages (e.g., "1,200mg sodium — 80% of daily max")
- [ ] Reads thresholds from active dietary profile
- [ ] Dismissible per session

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 7, Task 12

**Files likely touched:**
- `src/components/nutrition/threshold-alerts.tsx` (NEW)

**Estimated scope:** S (1 file)

---

#### Task 18: Build brand kit storage and editor

**Description:** Create `src/components/print/brand-kit-editor.tsx` — form with logo upload (base64), color pickers, font dropdown, tagline. Wire up to `brandKits` IndexedDB store.

**Acceptance criteria:**
- [ ] Logo upload as base64 data URL (max 500KB validation)
- [ ] Primary and secondary color pickers
- [ ] Font family dropdown (system fonts + Google Fonts subset)
- [ ] Tagline text input
- [ ] Save/load/delete brand kits from IndexedDB
- [ ] Preview of brand kit applied to a sample template section

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 6

**Files likely touched:**
- `src/components/print/brand-kit-editor.tsx` (NEW)

**Estimated scope:** M (1 component + storage integration)

---

### Checkpoint: Client-Side Features

- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds
- [ ] Dietary profiles can be created and applied to recipe list
- [ ] Recipe scaling works with smart rules
- [ ] Progress rings display on nutrition dashboard
- [ ] Weight projection shows on weight trend chart
- [ ] Brand kit can be saved and loaded

---

### Phase 3: Server-Dependent Features (Sharing & Community)

---

#### Task 19: Add sync server sharing tables and models

**Description:** Extend Go sync server with `shared_recipes`, `recipe_ratings`, `community_categories` tables. Add Go models for `SharedRecipe`, `RecipeRating`, `CommunityCategory`.

**Acceptance criteria:**
- [ ] `shared_recipes` table with all columns from spec
- [ ] `recipe_ratings` table with unique constraint on (shared_recipe_id, user_id)
- [ ] `community_categories` table
- [ ] Indexes on `share_token`, `user_id`, `is_public`
- [ ] Go models with JSON tags matching TypeScript types
- [ ] Auto-migration on server startup

**Verification:**
- [ ] Go server compiles: `cd sync-server && go build`
- [ ] Tables created on startup

**Dependencies:** Task 5

**Files likely touched:**
- `sync-server/models.go` (EXTEND)
- `sync-server/store.go` (EXTEND)

**Estimated scope:** M (2 files)

---

#### Task 20: Add sync server sharing API endpoints

**Description:** Add HTTP handlers for sharing endpoints: POST/GET/DELETE `/api/share`, GET `/api/share/:shareToken`, POST `/api/share/:shareToken/rate`, GET `/api/community`, GET `/api/community/categories`.

**Acceptance criteria:**
- [ ] POST `/api/share` — creates shared recipe, generates UUID share token
- [ ] GET `/api/share` — lists user's shared recipes (auth required)
- [ ] DELETE `/api/share/:shareId` — soft-delete (sets is_public=false)
- [ ] GET `/api/share/:shareToken` — returns public recipe data (no auth)
- [ ] POST `/api/share/:shareToken/rate` — upsert rating 1-5 (auth required)
- [ ] GET `/api/community` — paginated search with query, category, sort params
- [ ] GET `/api/community/categories` — list all categories
- [ ] Routes registered in `server.go`

**Verification:**
- [ ] Go server compiles
- [ ] Endpoints follow existing auth middleware pattern

**Dependencies:** Task 19

**Files likely touched:**
- `sync-server/handlers.go` (EXTEND)
- `sync-server/server.go` (EXTEND — route registration)

**Estimated scope:** L (2 files, 7 endpoints) — consider splitting

---

#### Task 21: Add Next.js API route proxies for sharing

**Description:** Create API routes in `src/app/api/share/` and `src/app/api/community/` that proxy to the sync server, following existing patterns in `src/app/api/`.

**Acceptance criteria:**
- [ ] `src/app/api/share/route.ts` — POST (create share), GET (list user's shares)
- [ ] `src/app/api/share/[shareId]/route.ts` — GET (public recipe)
- [ ] `src/app/api/community/route.ts` — GET (search/browse)
- [ ] `src/app/api/community/[shareId]/route.ts` — GET (single recipe detail)
- [ ] Follow existing API route patterns

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 20

**Files likely touched:**
- `src/app/api/share/route.ts` (NEW)
- `src/app/api/share/[shareId]/route.ts` (NEW)
- `src/app/api/community/route.ts` (NEW)
- `src/app/api/community/[shareId]/route.ts` (NEW)

**Estimated scope:** M (4 files)

---

#### Task 22: Build share dialog with QR code

**Description:** Create `src/components/recipe/share-dialog.tsx` — modal with share link, QR code (via `qrcode.react`), copy button, public/private toggle, and stats.

**Acceptance criteria:**
- [ ] Share link generated via API
- [ ] QR code rendered client-side using `qrcode.react`
- [ ] Copy link to clipboard button
- [ ] Toggle public/private
- [ ] Display view count and import count
- [ ] Auto-detect allergens from `dietary-rules.ts` before sharing

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 2, Task 21, install `qrcode.react`

**Files likely touched:**
- `src/components/recipe/share-dialog.tsx` (NEW)

**Estimated scope:** M (1 component + dependency)

---

#### Task 23: Build public shared recipe page

**Description:** Create `src/app/(app)/share/[shareId]/page.tsx` — public-facing recipe view that fetches shared recipe data without authentication. Shows recipe with nutrition label, allergen badges, and import button.

**Acceptance criteria:**
- [ ] Page renders at `/share/[shareId]` without auth
- [ ] Fetches recipe data from API
- [ ] Displays recipe with nutrition label (existing `nutrition-label.tsx`)
- [ ] Shows allergen badges and dietary tags
- [ ] "Import to My Recipes" button (saves to IndexedDB)
- [ ] Responsive layout

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 21, Task 9

**Files likely touched:**
- `src/app/(app)/share/[shareId]/page.tsx` (NEW)
- `src/components/recipe/import-recipe-dialog.tsx` (NEW)

**Estimated scope:** M (2 files)

---

#### Task 24: Build community gallery page

**Description:** Create `src/app/(app)/community/page.tsx` and supporting components (`community-gallery.tsx`, `recipe-card-public.tsx`, `community-search.tsx`) for browsing, searching, and importing community recipes.

**Acceptance criteria:**
- [ ] Grid layout of public recipe cards
- [ ] Search bar with text query
- [ ] Category filter pills
- [ ] Sort options: rating, newest, most imported
- [ ] Recipe cards show: title, nutrition summary, allergen badges, rating stars, import count
- [ ] "Import" button on each card
- [ ] Rating dialog (1-5 stars) for authenticated users

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 21, Task 9

**Files likely touched:**
- `src/app/(app)/community/page.tsx` (NEW)
- `src/components/community/community-gallery.tsx` (NEW)
- `src/components/community/recipe-card-public.tsx` (NEW)
- `src/components/community/community-search.tsx` (NEW)

**Estimated scope:** L (4 files) — could split UI components

---

### Checkpoint: Server Features

- [ ] Go server compiles and starts
- [ ] Share link can be generated
- [ ] Public recipe page renders
- [ ] Community gallery shows recipes with search
- [ ] Import from community works

---

### Phase 4: Export Features

---

#### Task 25: Build PDF export library

**Description:** Create `src/lib/pdf-export.ts` with cookbook PDF generation, recipe card PDF, and nutrition report PDF using jspdf and html2canvas.

**Acceptance criteria:**
- [ ] `exportCookbook(options: CookbookExportOptions): Promise<Blob>` — generates full cookbook PDF
- [ ] `exportRecipeCard(recipe, template, options): Promise<Blob>` — single recipe card
- [ ] `exportNutritionReport(profile, dateRange): Promise<Blob>` — nutrition report
- [ ] Cover page, ToC, page numbers, optional index for cookbooks
- [ ] Progress callback for long exports
- [ ] Uses `html2canvas` for chart rendering, `jspdf` for PDF assembly

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 6, install `jspdf` + `html2canvas`

**Files likely touched:**
- `src/lib/pdf-export.ts` (NEW)

**Estimated scope:** L (1 large file) — consider splitting into 3 exports

---

#### Task 26: Build print studio UI

**Description:** Create `src/components/print/print-studio.tsx` — main panel with tabs: Templates, Brand Kit, Export. Template pack browser and cookbook export controls.

**Acceptance criteria:**
- [ ] Tab layout: "Templates", "Brand Kit", "Export"
- [ ] Template tab: grid of template packs with install buttons
- [ ] Brand Kit tab: embeds `BrandKitEditor`
- [ ] Export tab: book selector, template picker, page size, ToC/Index toggles, brand kit selector, "Export PDF" button with progress bar

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 18, Task 25

**Files likely touched:**
- `src/components/print/print-studio.tsx` (NEW)
- `src/components/print/template-packs.tsx` (NEW)
- `src/components/print/cookbook-export.tsx` (NEW)

**Estimated scope:** L (3 files)

---

#### Task 27: Build nutrition PDF report UI

**Description:** Create `src/components/nutrition/nutrition-pdf-report.tsx` — panel for configuring and exporting nutrition reports as PDF.

**Acceptance criteria:**
- [ ] Date range picker
- [ ] Select which charts to include
- [ ] Preview of report sections
- [ ] "Export PDF" button with progress
- [ ] Branded header option (from brand kit)

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 25, Task 14

**Files likely touched:**
- `src/components/nutrition/nutrition-pdf-report.tsx` (NEW)

**Estimated scope:** M (1 file)

---

#### Task 28: Build compliance report

**Description:** Create `src/components/dietary/compliance-report.tsx` — printable compliance report for dietitians with date range, allergen exposure, threshold violations, and export to PDF.

**Acceptance criteria:**
- [ ] Date range picker
- [ ] Allergen exposure events table
- [ ] Nutrient threshold violations (which days, which meals)
- [ ] Average daily intake vs targets
- [ ] Weight trend summary
- [ ] Meal plan adherence score
- [ ] Export to PDF button
- [ ] Print-friendly CSS

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 7, Task 17, Task 25

**Files likely touched:**
- `src/components/dietary/compliance-report.tsx` (NEW)

**Estimated scope:** M (1 file)

---

#### Task 29: Create medical meal plan templates

**Description:** Create `src/data/medical-meal-templates.ts` with pre-built 7-day meal plan templates for DASH, Mediterranean, Renal, Diabetic, and Low-FODMAP diets.

**Acceptance criteria:**
- [ ] 5 diet templates, each with 7 days of `DayPlanEntryRecord` templates
- [ ] Each day has balanced macro splits for the target diet
- [ ] Templates importable into meal plan store
- [ ] Typed and validated against `DayPlanEntryRecord`

**Verification:**
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds

**Dependencies:** Task 5

**Files likely touched:**
- `src/data/medical-meal-templates.ts` (NEW)

**Estimated scope:** M (1 large data file)

---

#### Task 30: Enhance print CSS for cards and booklets

**Description:** Extend print CSS with page break controls, @page rules for card sizes, CMYK-safe colors, and dual-sided print support.

**Acceptance criteria:**
- [ ] `@page` rules for 3x5 and 4x6 card sizes
- [ ] Page break controls (`break-before`, `break-after`, `break-inside: avoid`)
- [ ] Zine/booklet format with 2-up page imposition
- [ ] Dual-sided print support for recipe cards (nutrition label on back)
- [ ] CMYK-safe color hints for professional printing

**Verification:**
- [ ] `bun run lint` passes
- [ ] Print preview shows correct page sizes

**Dependencies:** Task 26

**Files likely touched:**
- `public/css/print.css` or `src/app/globals.css` (EXTEND)

**Estimated scope:** S (1 file)

---

### Checkpoint: Complete

- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds
- [ ] Cookbook PDF export works
- [ ] Nutrition report export works
- [ ] Compliance report export works
- [ ] Recipe card PDF with QR code works
- [ ] All 5 features end-to-end verified

---

## Dependency Graph

```
Task 1 (allergen data) ──────┐
Task 2 (dietary rules)  ─────┤
Task 3 (scaling engine) ─────┤
Task 4 (template packs) ─────┤
Task 5 (types) ──────────────┤
                              │
Task 6 (IndexedDB v11) ──────┤ ← depends on Task 5
Task 7 (dietary store) ──────┤ ← depends on Task 6
                              │
Task 8 (profile editor) ─────┤ ← depends on Task 7
Task 9 (allergen panel) ─────┤ ← depends on Task 2, 8
Task 10 (dietary filters) ───┤ ← depends on Task 2, 9
Task 11 (scaling UI) ────────┤ ← depends on Task 3
Task 12 (nutrient goals) ────┤ ← depends on Task 5, 6
Task 13 (progress rings) ────┤ ← depends on Task 12
Task 14 (nutrient dashboard) ┤ ← depends on Task 13
Task 15 (weight projection) ─┤ ← depends on Task 12
Task 16 (health metrics) ────┤ ← depends on Task 5, 6
Task 17 (threshold alerts) ──┤ ← depends on Task 7, 12
Task 18 (brand kit editor) ──┤ ← depends on Task 6
                              │
Task 19 (Go sharing tables) ─┤ ← depends on Task 5
Task 20 (Go sharing APIs) ───┤ ← depends on Task 19
Task 21 (Next.js API routes) ┤ ← depends on Task 20
Task 22 (share dialog) ──────┤ ← depends on Task 2, 21
Task 23 (public recipe page) ┤ ← depends on Task 21, 9
Task 24 (community gallery) ─┤ ← depends on Task 21, 9
                              │
Task 25 (PDF export lib) ────┤ ← depends on Task 6
Task 26 (print studio UI) ───┤ ← depends on Task 18, 25
Task 27 (nutrition report) ──┤ ← depends on Task 25, 14
Task 28 (compliance report) ─┤ ← depends on Task 7, 17, 25
Task 29 (medical templates) ─┤ ← depends on Task 5
Task 30 (print CSS) ─────────┘ ← depends on Task 26
```

## Parallelization Opportunities

These task groups can be worked on in parallel:

| Group | Tasks | Rationale |
|-------|-------|-----------|
| Foundation libs | 1, 3, 4, 5 | No dependencies on each other |
| Dietary chain | 1→2→7→8→9→10 | Sequential chain |
| Nutrition chain | 12→13→14, 12→15, 12→16→17 | Branches from Task 12 |
| Server chain | 19→20→21→22/23/24 | Sequential, server-only |
| Export chain | 25→26/27/28 | Sequential from PDF lib |

**Recommended parallel streams:**
1. Stream A: Tasks 1→2→7→8→9→10 (dietary chain)
2. Stream B: Tasks 3→11 (scaling)
3. Stream C: Tasks 5→6→12→13→14, 15, 16→17 (nutrition)
4. Stream D: Tasks 19→20→21 (server, after Task 5)
5. Stream E: Tasks 25→26→27→28→30 (exports, after Task 6)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| IndexedDB v10→v11 migration breaks existing data | High | Test migration with existing v10 data; add rollback in openDB error handler |
| html2canvas slow for large cookbooks | Medium | Sequential rendering with progress bar; warn user for 50+ recipes |
| Allergen false positives (keyword matching) | Medium | Curated exclusion list in allergen-keywords.ts; confidence levels |
| Go server sharing endpoints auth complexity | Medium | Follow existing auth middleware pattern; test with/without auth |
| Template packs data size | Low | Lazy-load pack data; only import on install |
| QR code library bundle size | Low | `qrcode.react` is small (~10KB); dynamic import if needed |

## New Dependencies to Install

```
bun add qrcode.react jspdf html2canvas
bun add -D @types/html2canvas
```

**Note:** These require user approval per spec boundaries ("Ask first: Adding npm dependencies").

## Open Questions (from spec)

1. Community moderation approach (auto-hide after 3 reports recommended)
2. Free user sharing limits (10 free recommended)
3. Google Fonts bundling strategy (dynamic load recommended)
4. Allergen false positive handling (exclusion list recommended)
5. Server-side PDF rendering (defer, client-side only for now)
6. Apple Health / Google Fit integration (defer to later phase)
7. Shared recipe versioning (auto-update recommended)
