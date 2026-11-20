# Cookbook PDF measurement choice

## Objective and user value
Require an explicit Imperial, Metric, or Grams choice for cookbook **PDF** export so printed recipes use the reader's preferred measurements without changing saved recipe data or importable recipe-bundle JSON.

## Accepted behavior
- The PDF export form requires a choice before generating the PDF. The chosen system applies only to printed recipe ingredient quantities, not nutrition snapshots, the saved recipe, or bundle/data export.
- Imperial and Metric convert recognized weight units within weight and recognized volume units within volume, using the application's existing standard unit factors. Tiny nonzero weights must not print as zero after rounding. Counts and unknown/free-text units remain unchanged.
- Grams converts weights using exact weight-unit factors (including common spelled-out aliases such as pounds). For non-weight ingredients, including count/otherwise unknown units, use a food-specific USDA gram weight only when the stored USDA portion unambiguously matches the ingredient's measure; never assume water density or a generic weight for all foods/counts. Ingredients without a usable gram weight retain their original amount/unit (explicitly approved exception to the original all-grams goal). Display a notice explaining that some quantities were not convertible.
- Conversions are presentation-only: never change ingredient amounts, units, food identity, nutrition values, or exportable JSON. Linked recipe ingredients remain as recorded unless an actual weight is available for that serving, rather than inventing one.
- Preserve positive USDA `foodPortions` weights in the food database/API when present. A partial live search response merges new portion identities without replacing existing matching weights or duplicating them on repeat; a bulk seed with a nonempty portion list may replace that list. Already imported USDA food rows lacking this metadata render with original units until the USDA data is re-seeded; no automatic backfill or bundle rewrite. Do not regenerate seed recipes, bundles, or unrelated USDA nutrient data.

## Affected systems and boundaries
PDF export form (`src/components/print/cookbook-export.tsx`), options contract (`src/lib/types.ts`), PDF data collection/rendering (`src/lib/pdf-export.ts`), unit-formatting helper and tests. To use USDA data not presently retained, Go USDA import/live lookup, `FoodItem` API and PostgreSQL schema may need a narrowly scoped addition. PostgreSQL is authoritative; the Go API owns food data persistence. Importable bundle endpoints/files remain untouched.

## Testing strategy
First write failing unit tests for Imperial/Metric/Grams conversion (weights, recognized volume+matching USDA portion, counts, unknowns, zero/invalid weights, fallback) and component tests for required selection/notice. Test Go parsing and persistence of food-specific portions from real USDA sample shapes before implementation, including absent/ambiguous entries. Then run focused Vitest, Go package tests, typecheck, and UI/browser PDF inspection when available.

## Verification evidence
Focused conversion/PDF/UI tests first failed for the requested behavior, then passed. Follow-up regression tests reproduced nonzero weight rounding to zero and serialized cookbook portion lookups; both passed after focused fixes. A PostgreSQL test reproduced partial live results replacing a stored rich portion before the merge fix, then passed with repeat-upsert deduplication. A PostgreSQL integration test verifies USDA portion ingestion, food lookup/search, sparse-upsert preservation and absent portions; the full `go test ./...` suite passes against an isolated disposable PostgreSQL database. All 187 frontend tests, TypeScript checking, full ESLint and the Next.js build pass after the review fixes. Browser inspection of a rendered PDF was not available in this environment.

## Documentation
Update `PROJECT.md` for product behavior, `NUTRITION_DOMAIN.md` for the distinction between accurate portions and water-density heuristics, and API contracts for any new FoodItem fields. If new persistence ownership or schema conventions are introduced, update `ARCHITECTURE.md` and `DECISIONS.md` as required by AGENTS.md.

## Implementation notes
- For Grams PDFs, collect unique USDA FDC IDs across all recipes before fetching portion details in batches of at most six concurrent requests. Keep printed chapter/recipe order and render only after all required lookups finish; Imperial/Metric make no portion requests.
- Store a small food-owned portion collection (amount, measure, modifier/description, gram weight) for the USDA seed data. Live `/fdc/v1/search` results may be sparse; do not invent portions from a generic 100-g serving or overwrite seeded portion metadata with search results. An authenticated food-detail lookup can be considered separately if live-only results need more coverage.
- Match only a unique, unambiguous bare measure. A portion with a preparation/size modifier that is not specified by the recipe is not a reliable match. When absent or ambiguous, leave the quantity as originally authored and flag the PDF notice. Branded serving size alone is not a cup/count conversion.
