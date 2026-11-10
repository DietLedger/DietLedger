# Plan: MyFitnessPal Data Import

## Objective
Import MyFitnessPal export data into DietLedger as server-authoritative nutrition history, preserving historical nutrient snapshots and making uncertain mappings reviewable before they affect reports.

This plan focuses first on MyFitnessPal food diary exports. Recipes, exercises, friends/social data, and body measurements are out of scope unless present in a later sample export and explicitly planned.

## Assumptions
- The first supported source will be CSV files exported from MyFitnessPal's diary/export tooling.
- Import targets an existing DietLedger nutrition profile selected by the user.
- Imported food log entries should be historical snapshots, not live links to USDA/custom foods.
- Date, meal, food name, servings/quantity, calories, macros, and available micronutrients are enough for a useful first version.
- Some MyFitnessPal foods will not map cleanly to DietLedger's canonical nutrients; missing supported nutrients should default to zero with an import warning, not block import.

## Source Data Handling

### Supported Input
Initial support:
- `.csv` MyFitnessPal food diary export files.
- One or more files selected in the browser.

Future support:
- Zip exports if MyFitnessPal provides bundled data.
- Weight/body measurement exports.
- Exercise exports only after deciding whether DietLedger should model exercise explicitly.

### CSV Header Detection
Implement tolerant header mapping rather than hard-coding one exact export:

Required fields:
- Date
- Meal / meal name / meal slot
- Food / food name / item
- Calories

Optional fields:
- Time
- Servings / quantity
- Serving unit
- Fat / total fat
- Saturated fat
- Trans fat
- Cholesterol
- Sodium
- Carbohydrates / carbs / total carbs
- Fiber
- Sugars
- Added sugars
- Protein
- Vitamin D
- Calcium
- Iron
- Potassium

Ignored unless later supported:
- Exercise calories
- Notes
- Brand IDs / internal MyFitnessPal IDs
- Unsupplied micronutrients outside DietLedger's canonical set

## DietLedger Mapping

### Entity Target
Create `FoodLogEntryRecord` entries through existing food log APIs:

- `profileId`: selected profile
- `date`: parsed MyFitnessPal date
- `time`: optional parsed time, if present
- `mealSlot`: mapped DietLedger meal slot
- `sourceType`: `manual`
- `sourceId`: `null`
- `name`: MyFitnessPal food name
- `servings`: parsed servings/quantity, default `1`
- canonical nutrient fields: imported values, defaulting missing fields to `0`
- `servingAmount` / `servingUnit`: set when export contains a parseable serving measure

### Meal Slot Mapping
Map MyFitnessPal meal names into DietLedger slots:

| MyFitnessPal value | DietLedger slot |
|---|---|
| Breakfast | `morning` |
| Morning Snack | `midMorning` |
| Lunch | `noon` |
| Afternoon Snack | `afternoon` |
| Dinner | `evening` |
| Evening Snack | `night` |
| Snack / Snacks | `snack` |
| Unknown/custom meal | `snack`, with warning |

Custom meal names should remain visible in import review warnings/metadata if possible, but the stored enum must be valid.

### Nutrient Semantics
DietLedger canonical nutrients are:

- calories
- totalFat
- saturatedFat
- transFat
- cholesterol
- sodium
- totalCarbs
- dietaryFiber
- totalSugars
- addedSugars
- protein
- vitaminD
- calcium
- iron
- potassium

Import rules:
- Keep imported values as historical snapshots.
- Do not recalculate calories from macros.
- Do not infer missing micronutrients.
- Missing canonical nutrients become `0`.
- Unit suffixes like `g`, `mg`, `mcg`, `%` should be parsed where safe.
- Percent daily value columns should not be imported as nutrient amounts unless a documented conversion is added later.

## Workflow UX

### Entry Point
Add an import action in Nutrition / Food Log, likely near the food log controls:
- `Import MyFitnessPal`

### Import Dialog Flow
1. Select target nutrition profile.
2. Select one or more CSV files.
3. Parse client-side and show preview summary:
   - total rows
   - date range
   - meals found
   - entries ready to import
   - rows with warnings/errors
4. Allow row review before writing:
   - food name
   - date
   - meal slot
   - servings
   - calories/macros summary
   - warning badges
5. Import button is disabled only for fatal parse errors, not for harmless missing optional nutrients.
6. On import, call existing food log create API for each valid row.
7. Show summary:
   - created count
   - skipped duplicate count, if duplicate handling is implemented
   - failed rows with reasons

### Duplicate Handling
Initial simple duplicate strategy:
- Before import, fetch existing entries for the import date range.
- Treat rows as duplicate when the tuple matches:
  - profileId
  - date
  - mealSlot
  - name normalized
  - calories
  - servings
- Default behavior: skip duplicates.
- Include an override option later if needed: `Import duplicates anyway`.

## Backend/API Approach

### Phase 1 Recommendation
Use frontend parsing plus existing food log APIs.

Rationale:
- No schema change required.
- Uses existing server validation and persistence.
- Food log entries already store nutrient snapshots, which matches imported history.
- Keeps first implementation small and reversible.

### When to Add Backend Endpoint
Add a backend batch endpoint only if one-by-one creation is too slow or needs stronger transactional semantics:

`POST /api/nutrition/profiles/{profileId}/food-log/import`

Potential request:
```json
{
  "source": "myfitnesspal",
  "entries": [ ... ]
}
```

Potential response:
```json
{
  "created": 123,
  "skipped": 4,
  "failed": [
    { "row": 42, "reason": "invalid date" }
  ]
}
```

Do not add this endpoint until frontend-only import proves insufficient.

## Implementation Tasks

### Task 1: Collect sample exports and pin format
Acceptance:
- Add sanitized sample MyFitnessPal CSV fixture(s) under `src/lib/__fixtures__` or similar.
- Document observed headers in this plan.

Verification:
- Fixture contains no private user data.

Files:
- `specs/myfitnesspal-import-plan.md`
- `src/lib/__fixtures__/myfitnesspal-food-diary.csv` or test-local fixture string

### Task 2: Build pure parser
Acceptance:
- `parseMyFitnessPalFoodDiaryCsv()` returns normalized draft entries plus warnings/errors.
- Header aliases are covered.
- Missing optional canonical nutrients default to `0`.
- Invalid required fields produce row-level errors.

Verification:
- Unit tests for normal rows, custom meal names, missing nutrients, unit suffix parsing, invalid dates, and duplicate-ish rows.

Files:
- `src/lib/myfitnesspal-import.ts`
- `src/lib/myfitnesspal-import.test.ts`

### Task 3: Build import preview dialog
Acceptance:
- User can select profile and CSV file(s).
- Preview shows date range, row counts, warnings, and importable rows.
- Fatal rows are not imported.

Verification:
- Component test if practical; otherwise focused manual browser verification.

Files:
- `src/components/nutrition/myfitnesspal-import-dialog.tsx`
- `src/app/(app)/nutrition/log/page.tsx` or nearby nutrition page entry point

### Task 4: Persist imported entries
Acceptance:
- Import creates `FoodLogEntryRecord` entries using existing API.
- React Query invalidates affected food-log/date-range nutrition queries.
- Duplicate rows are skipped by default.
- Import summary is shown after completion.

Verification:
- Unit test duplicate detection helper.
- Manual import against dev data with a small sample CSV.

Files:
- `src/components/nutrition/myfitnesspal-import-dialog.tsx`
- `src/hooks/use-nutrition.ts` if a helper mutation is useful

### Task 5: Hardening and docs
Acceptance:
- Update user-facing docs or spec with supported MyFitnessPal export instructions.
- Add clear unsupported-format error messages.
- Add privacy note: import is local browser parsing plus DietLedger API writes.

Verification:
- `npm test -- src/lib/myfitnesspal-import.test.ts`
- `npm run lint`
- `npm run build`

Files:
- `specs/myfitnesspal-import-plan.md`
- optional `docs/userdocs/...`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| MyFitnessPal export formats vary | High | Header alias detection; collect sample first; row-level errors not whole-file failure |
| Percent daily values mistaken for actual nutrients | High | Do not import `%` columns unless explicitly converted later |
| Duplicate imports inflate history | High | Default duplicate detection and skip summary |
| Large exports are slow with one API call per row | Medium | Start simple; add backend batch endpoint if needed |
| Meal names do not fit DietLedger enum | Medium | Deterministic mapping with warnings; unknown -> `snack` |
| Imported nutrition differs from current USDA data | Low/expected | Treat food log as historical snapshot; do not relink/recalculate |

## Open Questions
- What exact MyFitnessPal export file(s) will be available: CSV, zip, or both?
- Does the user want imported foods added to custom foods for reuse, or only historical food logs?
- Should imported weight entries be included if available?
- Should duplicate detection be strict by default or allow importing duplicate days intentionally?
