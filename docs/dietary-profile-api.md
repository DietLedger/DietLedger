# Dietary Profile API

Dietary profiles are caller-owned records. The authenticated Go API validates profile writes and is authoritative for recipe nutrient assessments. Existing allergen and ingredient-name/tag rules remain separate. `allergens` and `dietaryTags` retain JSON-string array fields; writes require arrays of recognized enum strings, not `null`/objects/scalars. Tags include `vegetarian`, `vegan`, `glutenFree`, `dairyFree`, `nutFree`, `soyFree`, `eggFree`, `keto`, `paleo`, `lowFodmap`, `dASH`, `mediterranean`, and `diabetesAware`. Allergens are the existing top-nine keys: `milk`, `eggs`, `fish`, `shellfish`, `treeNuts`, `peanuts`, `wheat`, `soybeans`, and `sesame`.

## `GET /api/dietary-profiles/{id}/recipe-assessments`

Requires authentication. The profile ID must belong to the caller; otherwise the endpoint returns `404`. The response uses the standard envelope:

```json
{
  "ok": true,
  "data": [
    { "recipeId": "recipe-id", "status": "match", "reasons": [] }
  ]
}
```

Each caller-owned recipe is returned with status `match`, `noMatch`, or `notAssessed` and a `reasons` string array. The request accepts no recipe or nutrient facts. This endpoint evaluates configured nutrient criteria only; it does not evaluate allergens or infer dietary tags from ingredient names.

`perMealMax` is evaluated against one current recipe serving (whole-recipe nutrients divided by servings). `per1000KcalMin` is evaluated as nutrient grams/mg/etc. per 1,000 kcal, using the canonical nutrient unit and whole-recipe totals so changing yield does not change density. Comparisons allow only relative 1e-12 floating-point representation tolerance. `dailyMax` remains a daily-intake limit and is never applied to a recipe. `totalCarbs` means total carbohydrate; no net-carbohydrate deduction is made.

A profile with no recipe-level criteria returns `notAssessed`. Rows whose optional numeric fields are all cleared are allowed but inert. Invalid stored criteria or nutrition, missing required nutrient facts (including propagated linked-recipe missing-nutrient metadata and unknown calories for density), unresolved/unconfirmed ingredient nutrition, unmatched zero placeholders without deliberate no-nutrition intent, no ingredients without authoritative custom nutrition, invalid servings, and nonpositive calories needed for a density criterion cannot produce a match. Legacy known nutrient snapshots remain usable without a fresh food-source rematch; explicit `zeroNutritionOverride` is permitted. If any required fact is unknown, `notAssessed` takes precedence over known failures. Authoritative `customNutrition` whole-recipe totals replace ingredient-derived values.

Canonical nutrient keys are supported, with legacy `sugar` mapped to `totalSugars` and `fiber` mapped to `dietaryFiber`. Profile `nutrientThresholds` retains the existing JSON-array representation; each item supports `nutrient`, optional `dailyMax`, optional `perMealMax`, optional `per1000KcalMin`, and `alertLevel` (`warning` or `danger`). Numeric thresholds must be finite, nonnegative, and at most 1,000,000. Unsupported keys, fields, enum values, malformed JSON, and invalid numbers are rejected on profile create/update.

## Explicit starter restoration

`POST /api/dietary-profiles/diabetes-aware-starter` requires authentication and accepts no request body. It returns an existing caller-owned profile tagged `diabetesAware` (preferring active, then name/id order) without changing any fields, or creates the same inactive defaults as account provisioning if none exists. The operation locks the caller's user row so concurrent clicks, retries and reset requests serialize; a retry returns the persisted profile rather than replacing edits. Reads and migrations do not recreate deleted profiles. The Recipes page invokes this endpoint only after the user clicks **Diabetic** while no eligible profile exists. It selects the returned profile, leaving the filter opt-in. A failed restore remains visible outside the filter controls and may be retried; the requested filter stays active and suppresses unverified results until retry or Clear. Clear remains accessible after failure. Client cache updates/invalidations and successful selection are bound to the initiating authenticated user/token and mounted caller; a late result after logout/account change/token change/unmount cannot populate a subsequent session's cache. Tokens are not stored in query keys or mutation variables/context.

## Provisioned starter

Migration 000033 provisions an inactive, editable **Diabetes-aware** profile once for users already in the database. Migration SQL and the applied-version record commit in one transaction, preventing a retry after a failed version write from duplicating seeded profiles. New users receive the same profile atomically with account creation. Its `dietaryTags` include `diabetesAware`; that tag identifies the profile and is never inferred from recipe ingredients. Default thresholds are sodium `dailyMax: 2300` (`warning`) and dietaryFiber `per1000KcalMin: 14` (`warning`). Existing reads do not recreate deleted or renamed profiles.
