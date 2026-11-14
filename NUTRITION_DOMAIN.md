# Nutrition Domain

> This document defines the nutrition domain used throughout DietLedger.
>
> Nutrition is one of the highest-risk domains in the system.
>
> Incorrect nutrition behavior directly impacts:
>
> - food logging
> - meal planning
> - recipe analysis
> - dietary compliance
> - health tracking
> - reporting
>
> Changes to this domain require additional scrutiny.

Testing requirements for nutrition logic are defined in TESTING_STRATEGY.md.

---

# Domain Mission

The purpose of the Nutrition Domain is:

> Determine what a person is eating and how that compares to their goals.

All nutrition functionality ultimately supports this objective.

---

# Domain Ownership

The Nutrition Domain owns:

- nutrient calculations
- calorie calculations
- macro calculations
- micronutrient calculations
- food intake tracking
- nutrition reporting
- health metrics
- weight tracking
- goal tracking
- dietary compliance calculations

---

# Domain Boundaries

The Nutrition Domain does not own:

## Recipe Authoring

Owned by the Recipe Domain.

Recipes provide nutrition inputs.

---

## Meal Planning

Owned by the Meal Planning Domain.

Meal plans consume nutrition information.

---

## Grocery Planning

Owned by the Grocery Domain.

Nutrition provides ingredient and nutrient data.

---

## Publishing

Owned by the Publishing Domain.

Nutrition provides analysis data only.

---

## Authentication

Owned by the Platform Domain.

Nutrition does not manage identity or access.

---

# Core Nutrition Pipeline

The canonical nutrition flow is:

```text
Food Data
    ↓
Ingredients
    ↓
Recipes
    ↓
Food Log Entries
    ↓
Daily Totals
    ↓
Goals
    ↓
Insights
```

Future implementations should preserve this model.

---

# Core Domain Entities

## Food Item

A food source with nutrient information.

Sources include:

- USDA foods
- custom foods
- imported foods

Food items are the foundation of all nutrition calculations.

---

## Ingredient

A food item attached to a recipe with an amount and unit.

Ingredients carry nutrient data.

---

## Recipe

A collection of ingredients.

Recipes derive nutrient totals from ingredient nutrients.

Recipes are nutrition inputs.

---

## Food Log Entry

A historical record of food consumption.

Food log entries are nutrient snapshots.

They are not live references.

---

## Person Profile

Represents a person being tracked.

Contains:

- demographics
- goals
- activity level
- health information

---

## Weight Entry

Historical body weight measurement.

Used for:

- BMI
- BMR
- TDEE
- trend calculations

---

## Dietary Profile

Defines dietary restrictions.

Examples:

- allergens
- dietary tags
- nutrient thresholds

Used for compliance analysis.

---

# Canonical Nutrient Model

The system uses a fixed nutrient set.

## Required Nutrients

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

All nutrition-carrying entities should use this same nutrient set.

---

# Nutrition Principles

## Nutrition Is Derived Data

Nutrition values are calculated.

Nutrition should not be manually authored except where explicitly allowed.

---

## Deterministic Calculations

Identical inputs must produce identical outputs.

This applies to:

- nutrient totals
- calorie totals
- Daily Values
- BMI
- BMR
- TDEE
- goal calculations

---

## Traceability

Users should be able to understand:

- where values originated
- how calculations were performed
- which foods contributed

Avoid opaque calculations.

---

## Accuracy Over Complexity

Prefer understandable and verifiable calculations.

Avoid complex estimation models unless clearly justified.

---

## Food Selection Eligibility

Food selection eligibility depends on meaningful canonical nutrition data, not calories alone. Positive-calorie foods remain eligible. Zero-calorie foods are eligible for seeding, live-search caching, database searches, and food-record selectors when at least one other canonical nutrient is positive (for example, table salt's sodium); records with no positive canonical nutrient values remain excluded. Do not fabricate calories from generic macro factors: a zero-calorie food keeps its source calorie value of zero while its other nutrients are retained. In recipe Change match and recipe import, a separate explicit **Use no nutrition** action remains available for ingredients with no useful nutrition data; it creates a manual zero-nutrient snapshot, distinct from selecting a zero-calorie food record.

## Snapshot Semantics

Food log entries are historical records.

When a recipe changes:

Existing food log entries do not automatically change.

This behavior is intentional.

---

# Canonical Business Rules

## Nutrient Snapshots

Ingredients and food log entries store nutrient snapshots.

They do not maintain live references to source foods.

---

## Historical Data Is Immutable

Food log entries represent historical consumption.

Recipe edits should not silently alter historical records.

---

## Consistent Nutrient Definitions

A nutrient must have the same meaning everywhere in the application.

---

## Reproducible Results

The same profile and food log data should always produce the same nutrition outcomes.

---

# Health Calculations

## BMI

BMI calculations are canonical business logic.

Changes require review.

---

## BMR

Supported BMR equations are canonical business logic.

Changes require review.

---

## TDEE

Activity multipliers are canonical business logic.

Changes require review.

---

## Goal Calories

Goal-calorie calculations are canonical business logic.

Changes require review.

---

# FDA Daily Values

FDA Daily Values are considered authoritative.

Changes require explicit review.

Daily Value calculations should remain consistent throughout the application.

---

# Dietary Compliance

Dietary compliance determines whether foods or recipes satisfy a dietary profile.

Compliance may consider:

- allergens
- dietary tags
- nutrient thresholds

Compliance logic is considered high-risk functionality.

---

# Serving Calculations

Serving calculations determine:

- recipe nutrient totals
- per-serving nutrients
- food log nutrient values

Serving calculations are considered high-risk functionality.

---

# Unit Conversion

Nutrition calculations depend on unit normalization.

Examples:

- grams
- kilograms
- milligrams
- ounces
- pounds
- cups
- tablespoons
- teaspoons

Unit conversion behavior must remain consistent across the application.

Printable cookbook PDF units are presentation-only: they do not change stored ingredient amounts or nutrient snapshots. Weight-to-weight conversion uses exact unit factors, and small nonzero printable weights must not round to zero. A volume or count may be printed in grams only when an unambiguous USDA portion for that specific matched food supplies a positive gram weight for the same measure. Nutrition's existing water-density and whole-item heuristics are **not** reliable printable ingredient weights. Where food-specific weight data is absent or ambiguous, Grams PDF mode leaves the ingredient's original amount and unit visible with a notice; older imported foods need their USDA portion metadata re-seeded to become convertible.

---

# Goal Tracking

Nutrition goals may include:

## Calories

Daily calorie targets.

---

## Macronutrients

- protein
- carbohydrates
- fat

---

## Micronutrients

- fiber
- sodium
- sugar
- vitamin D
- calcium
- iron
- potassium

Goals are used for:

- progress tracking
- dashboard reporting
- nutrition insights

---

# High-Risk Areas

Changes in the following areas require additional review.

## Nutrient Mapping

Food source → nutrient conversion.

---

## Serving Calculations

Recipe and food serving logic.

---

## Daily Value Calculations

FDA reference calculations.

---

## Food Log Aggregation

Daily, weekly, monthly, and yearly summaries.

---

## Weight Calculations

BMI, BMR, TDEE, and projections.

---

## Dietary Compliance

Allergen detection and compliance logic.

---

## Goal Calculations

Calorie and nutrient target calculations.

---

# Known Domain Concerns

These are known issues and tradeoffs.

They should remain visible to contributors.

- ~~inconsistent unit conversion constants~~ — resolved: canonical tables live
  in `src/lib/unit-conversion.ts` (TypeScript) and `sync-server/units.go`
  (Go); both must mirror each other (weight factors exact, volume factors
  water-density approximation, `whole` = 100g heuristic, unknown units
  contribute 0 grams). Fixture suites on both sides pin the values.
- ~~vitamin D naming inconsistency~~ — resolved: `vitaminD` is micrograms
  everywhere (labels use the 20 mcg Daily Value; goals are micrograms). USDA
  ingestion converts IU at 40 IU per microgram (`resolveVitaminD` in
  `sync-server/seed.go`); migration `000023` corrected previously stored IU
  values in `food_items` and USDA-linked `ingredients`. Pre-migration food
  log / day-plan snapshots intentionally keep legacy values (historical
  immutability).
- ~~limited server-side nutrition validation~~ — resolved: the Go API
  validates nutrient numbers (non-negative, bounded), servings (recipes
  >= 1; logs > 0), body measurements (height <= 300cm, weight <= 1000kg),
  and enum whitelists (meal slots, source types, sex, activity level) on
  create and update paths. See `sync-server/validation_nutrition.go`.
- USDA Foundation energy ingestion: use kcal nutrient 2048/958 (Atwater specific) when available, then 2047/957 (general), then legacy 1008/208; do not sum variants or derive calories from macros when USDA provides no energy. The shared Go converter accepts both nested bulk-dataset `nutrient`/`amount` and flat live-search `nutrientNumber`/`value` records. Food eligibility is based on meaningful canonical nutrition, not calories alone: zero-calorie records with another positive nutrient (e.g. table salt's sodium) remain selectable, while records with no positive canonical nutrients are excluded. USDA can report negative analytical differences (e.g., FDC 2727569 has −0.42825 g carbohydrate by difference per 100 g); canonical ingested nutrient quantities are floored at zero, not rederived. Ingredient creation likewise floors negative values from previously stored food rows. The Go API still rejects direct negative ingredient nutrients. Reimporting USDA data updates food items by FDC ID, but does not silently rewrite ingredient or historical food-log nutrient snapshots.
- snapshot staleness tradeoffs
- glycemic index coverage gaps
- source type inconsistencies
- calorie calculation interpretation differences
- vitamin D display unit spellings still vary cosmetically (`ug` vs `mcg`);
  both mean micrograms

These are known design concerns, not necessarily defects.

---

# Ingredient Nutrition Intent and Imported Facts

- Canonical nutrient zeros do not prove user intent. Only the durable `zeroNutritionOverride` choice counts as deliberate no-nutrition; compatible legacy migration is limited to provable manual `fdcId=-3` unlinked all-zero rows.
- A package nutrient snapshot is not a trusted food link. Ingredient-level supplied facts retain their basis (`per100g`, `perServing`, `ingredientAmount`, or `unknown`), units and provenance as unconfirmed data until reviewed and linked through a server-owned resolution workflow.
- Missing USDA/custom-food/recipe identities remain unresolved source facts without dangling live references. Historical food-log snapshots are unchanged.
- Ingredient ordering is recipe content and is persisted independently of regenerated local row UUIDs.

# Validation Expectations

Nutrition calculations should:

- be deterministic
- be testable
- be reproducible
- avoid hidden state
- avoid silent recalculation of historical data

Changes must follow TESTING_STRATEGY.md.

---

# Nutrition Success Criteria

The Nutrition Domain succeeds when users can:

- accurately log food intake
- understand nutrient consumption
- compare intake against goals
- monitor long-term trends
- identify dietary issues
- make informed nutrition decisions

Every nutrition feature should improve one or more of these outcomes.

---

# Nutrition Change Checklist

Before modifying nutrition logic:

## Calculation Impact

- Does this change nutrient calculations?
- Does this change serving calculations?
- Does this change FDA Daily Values?

## Historical Impact

- Does this change historical results?
- Does this change snapshot behavior?

## Health Impact

- Does this change BMI?
- Does this change BMR?
- Does this change TDEE?
- Does this change goal calculations?

## Compliance Impact

- Does this affect allergen detection?
- Does this affect dietary compliance?

## Reporting Impact

- Does this affect dashboards?
- Does this affect reports?
- Does this affect trends?

## User Impact

- Will users see different numbers?
- Will existing behavior change?

If any answer is yes, treat the change as high risk and document the impact.