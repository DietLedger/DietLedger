# Normalize negative USDA nutrient measurements for ingredient creation

## Objective and user value
Allow adding Foundation food FDC 2727569 (chicken breast, meat and skin, raw) and other USDA foods whose analytical carbohydrate-by-difference value is negative, while preserving the API's non-negative nutrient invariant. USDA itself reports -0.42825 g/100g carbs for this food; the existing stored row yields -0.43g in a 100g ingredient and POST /api/recipes/:id/ingredients returns 400.

## Success criteria
- USDA ingestion normalizes negative nutrient quantities to zero (all canonical nutrient fields, not only carbohydrates); positive and zero values, including energy, remain unchanged. Do not infer replacement carbs from calories/macros.
- When constructing a recipe ingredient from an already-stored USDA food record, a negative nutrient snapshot is bounded to zero before sending it to the Go API; existing foods can be used before re-seeding.
- Keep Go API validation strict: directly submitted negative ingredient nutrients still fail. Ingredient scaling retains correct positive values.
- UI displays no misleading promise of automatic updates to existing food rows; re-seed after deploying corrected ingestion to repair food_items. Historical ingredient and log nutrient snapshots are not rewritten.

## Scope
Go USDA ingestion converter in sync-server/seed.go and TypeScript ingredient snapshot builder in src/hooks/use-recipes.ts (used by normal add, markdown import, and rematch). No schema changes, no background repair, no changes to authentication/key management.

## TDD / verification
Confirmed expected failures in nested and flat Go USDA converter fixtures and a 100g TypeScript ingredient-builder fixture before implementation. `go test ./... -run '^TestConvertUSDAFood' -count=1`, `go test ./... -count=1`, `npx vitest run src/hooks/use-recipes.test.ts`, focused ESLint, and `git diff --check` pass. No production data was changed. NUTRITION_DOMAIN.md documents the zero-floor policy.

## Open questions
If users want to preserve raw negative USDA analytical readings separately from canonical nutrition fields, that requires a new explicit source-data field and is out of scope. Production deployment and re-seeding are separate operational steps requiring user authorization.
