# Preserve USDA food energy and meaningful zero-calorie records

## Objective
Preserve USDA-provided energy and other nutrient data so recipe and food-log snapshots are accurate, including foods such as table salt that have zero calories but meaningful sodium.

## Acceptance criteria
- Bulk Foundation JSON: read metabolizable energy (Atwater Specific, nutrient ID 2048/number 958) when available; fall back to General (2047/957), then legacy kcal Energy (1008/208). Ignore unrelated units; never add energy variants together or synthesize calories from macros.
- USDA live-search JSON: decode flat `nutrientId`, `nutrientNumber`, `value` as well as bulk nested `nutrient` and `amount`, preserving other nutrients.
- Keep zero-calorie USDA records when at least one other canonical nutrient is positive; keep excluding records whose entire canonical nutrient set is zero or negative. Apply this eligibility consistently to seeding, live-search caching, database search and food lookup/selectors. Do not synthesize calories from macros.
- Frontend database and custom-food selectors, including recipe match changes and food logging, allow zero-calorie records only when another canonical nutrient is positive; truly nutritionally empty records remain unavailable.

## Scope and ownership
The Go API owns USDA nutrient mapping and database-food eligibility during ingestion, caching, search and lookup. Frontend selectors apply the same rule to fallback and user-owned custom-food records. No database schema change or macro-derived calorie estimation.

## Verification
Verify USDA salt-like zero-calorie records with sodium remain ingestible, searchable and selectable; zero-calorie records with no other nutrients remain excluded; and positive-calorie foods continue to work. Run focused Go and Vitest tests, TypeScript, ESLint, and diff checks.

