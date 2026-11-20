# Diabetes-aware default dietary profile and recipe filter

Status: Implemented following user approval; later revised by explicit user request to display the opt-in recipe button as **Diabetic**, with no explanatory/warning text in the filter section. The user regards defaults as a starting point and is responsible for personalizing their own filters; profile-editor guidance remains available. See `quarantine-and-diabetic-filter-ux.md` for the latest restoration and verification.

## Objective and user value

Provide a built-in, selectable, editable diabetes-aware dietary profile and a recipe-list filter, reusing dietary profiles instead of introducing a separate diet-management system. Users can start with documented guidance and personalize targets with their diabetes care team.

## Approved assumptions

- “There by default” means available to existing and new users, not automatically filtering everyone's recipes or diagnosing anyone with diabetes.
- The editable profile is **Diabetes-aware**; the user-facing recipe filter button is **Diabetic**. Matching means **matches configured nutrition targets**, never “diabetic-safe,” “ADA approved,” or predicted blood-glucose control.
- Use a conservative high-fiber starter screen rather than inventing a universal carbohydrate or sugar allowance. This deliberately does not assess every aspect of diabetes nutrition.

## Research and provenance

The current published ADA Standards located in this research are the **2026** edition. The ADA standards landing page identifies that edition; search did not establish a published 2027 replacement. Recheck the landing page before implementation if work is resumed later.

Primary sources:

1. ADA, *Standards of Care in Diabetes—2026*, section 5, especially Table 5.1, Table 5.2, Meal Planning, and Carbohydrates:
   - https://pmc.ncbi.nlm.nih.gov/articles/PMC12690188/
   - Publisher: https://diabetesjournals.org/care/article/49/Supplement_1/S89/163932/5-Facilitating-Positive-Health-Behaviors-and-Well
   - Publisher fetch returned HTTP 403; the full primary article was successfully retrieved from PubMed Central.
2. ADA, *Carb Counting and Diabetes*: https://diabetes.org/food-nutrition/understanding-carbs/carb-counting-and-diabetes
3. NIDDK, *Healthy Living with Diabetes*: https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes
4. Edition check: https://professional.diabetes.org/standards-of-care

Findings:

- Individualize eating plans; there is no ideal universal carbohydrate/protein/fat percentage or universal grams of carbohydrate per meal.
- ADA recommendation 5.24: emphasize minimally processed, nutrient-dense, high-fiber carbohydrate sources, at least **14 g fiber per 1,000 kcal**.
- ADA recommendation 5.20: sodium **<2,300 mg/day**, as clinically appropriate. This is a daily intake recommendation, not a recipe or per-meal allowance.
- Emphasize nonstarchy vegetables, whole fruits, legumes, whole grains, lean proteins, nuts/seeds and suitable dairy alternatives; minimize sweetened beverages, added sugars, refined grains, highly processed foods and foods high in saturated fat.
- Carb counting uses **total carbohydrate**, not sugar alone and not an automatically calculated net-carbohydrate substitute.
- Plate-method guidance: half nonstarchy vegetables, one quarter protein, one quarter high-fiber carbohydrate foods. A recipe nutrient vector cannot reliably prove plate composition, processing level, carbohydrate quality, or meal timing.
- Carbohydrate changes can require medication supervision; very-low-carbohydrate/ketogenic plans have particular risks with SGLT2 inhibitors. No medication or insulin advice belongs in this filter.

## Proposed default behavior

1. Provision one ordinary user-owned Diabetes-aware profile per existing/new user, once. Preserve existing profiles, selections, and edits. Renaming or deleting it must not cause it to reappear on every read or restart.
2. The profile is editable through the existing dietary-profile editor and appears in the recipe Dietary Filters control by default. It is not automatically enabled. The profile's existing allergen/preferences remain independently configurable.
3. Default daily sodium target: **2,300 mg**, with guidance explicitly stating the clinical recommendation is to stay below that value. No inferred division into three meals or fixed calories.
4. Default recipe screen: **fiber >=14 g per 1,000 kcal**, editable/removable. This is an explicit application-level use of the ADA eating-pattern target, **not an ADA recipe-certification rule**. Explain this in the profile editor, not in the filter controls.
5. The profile guidance explains that standalone lean protein or other meal components may not match despite fitting an appropriate overall eating plan. The filter is an optional discovery aid, not a complete dietary assessment.
6. Optional editable per-serving total-carbohydrate, sodium, added-sugar and saturated-fat limits may be set by the user; leave them unset by default rather than claiming universal diabetes limits. Existing per-meal fields must be clearly labeled when used as one recipe serving, not a whole composed meal.
7. Show sourced qualitative guidance and links in the profile editor. Do not turn whole fruit, beans, dairy or all carbohydrate ingredients into banned keywords. Do not use unreliable glycemic-index coverage as a default gate.
8. A recipe passes only when all enabled recipe criteria are known and met. Use authoritative stored custom recipe nutrition when present; otherwise use established ingredient totals. Honor missing-nutrient metadata, including propagated linked-recipe unknowns. Unknown is not zero. Missing/nonfinite data, nonpositive calories for a density criterion, or invalid servings produces **not assessed**, not a match. Filtered matches exclude not-assessed recipes with an explanation.
9. Evaluate per-serving caps using the current recipe yield; fiber density is invariant under proportional scaling. Daily sodium must not be applied to a single recipe as though it represented the day's food.
10. Clearing the filter restores the unfiltered library. Do not change nutrient calculations, historical logs, or other dietary-tag behavior.

## CodeGraph discovery and ownership

CodeGraph status: indexed, node:sqlite backend, no changed files reported at discovery. `codegraph_context` failed with `Unknown tool`; search, explore, callers, and impact worked.

- `src/components/dietary/dietary-filters.tsx`: `DietaryFilters` and `applyDietaryFilters`; current tags use only ingredient-name inference.
- `src/app/(app)/recipes/page.tsx`: `RecipePage` calls `applyDietaryFilters` in its recipe-list memo. No nutrient-threshold filtering currently occurs there.
- `src/components/dietary/dietary-profile-editor.tsx`: existing profile selection/editing and daily/per-meal maximum editor. Needs explicit units, optional minima/density controls, and safe clearing of optional numbers for the new criteria.
- `src/hooks/use-dietary.ts`: existing React Query CRUD and active-profile fallback; provisioned availability must not silently activate filtering.
- `src/lib/types.ts`, `src/lib/api-client.ts`, `src/lib/api-client-go.ts`: dietary contracts and JSON-string adapters. Existing `sugar`/`fiber` aliases are not canonical nutrient keys; add canonical added-sugar/fiber support without silently changing legacy meanings.
- `src/lib/dietary-rules.ts`: existing `inferDietaryTags` and `isRecipeCompliant` are ingredient-name-only. Do not add a diabetes tag that is inferred as satisfied from names alone, or advertise a pass through the old badge path without nutrient assessment.
- `src/components/recipe/dietary-badges.tsx`: consumes name-only compliance; avoid contradicting the new assessed result.
- `src/components/nutrition/threshold-alerts.tsx`: daily maximum alerts; must not reinterpret a fiber minimum as a maximum or a per-serving cap as a daily allowance.
- `src/components/dietary/compliance-report.tsx`: renders profile thresholds; preserve their basis/units rather than mislabeling new criteria.
- `sync-server/models.go`, `handlers_phase2.go`, `store_postgres.go`, `repository.go`, registration lifecycle and next migration: existing user-owned profile persistence and provisioning. PostgreSQL remains authoritative; validate the new rules in Go.
- Add a narrow authenticated server-side recipe assessment operation to the existing dietary-profile API; use it for diabetes-aware matching. Do not duplicate the new domain evaluator in the browser or relocate all legacy tag rules as an unrelated refactor. Reuse existing owner-authorized recipe reads and authoritative nutrition calculation helpers. Return match/not-match/not-assessed plus reasons. Confirm the exact route and shape in the implementation plan before coding.
- `src/data/medical-meal-templates.ts` already has an unrelated `Diabetic` sample plan. Its fixed 30–45 g/meal, 25 g sugar and macro split are not universal guidance. Align its explanatory notes and clearly label numerical sample-plan values as illustrative rather than reuse them as filter defaults; do not regenerate its seven-day meal content.

## Success criteria and testing (TDD)

- Existing and new users see the default profile; it can be selected, edited, saved, refreshed, renamed and deleted without duplicate provisioning, loss of edits, or cross-user access.
- Recipe filter is opt-in and combines with existing filters. Edited targets change results; clearing restores recipes.
- Focused failing tests precede implementation. Cover fiber-density equality/just below, optional per-serving caps, total vs net carbs, yield changes, proportional scaling, daily-vs-serving separation, nonfinite/zero calories, no ingredients, authoritative custom totals, missing nutrients and linked unknowns.
- Go tests protect assessment authorization, validation, persistence and provisioning idempotence. Use a unique disposable PostgreSQL database for destructive integration helpers; skipped database tests are not passing evidence.
- UI tests cover default visibility, select/edit/save/refetch, optional blank fields, source/help text, unknown results and actual recipe filtering. Run focused dietary tests, relevant Go packages, frontend lint and touched-path type checks. Verify the changed interaction in a browser if a safe runtime is available.
- Preserve all pre-existing uncommitted work; numerous relevant files were already dirty at discovery. No broad cleanup or deployment is authorized.

## Documentation and scope

After implementation update PROJECT.md (default selectable profile), NUTRITION_DOMAIN.md (screening semantics and limitations), API documentation/contracts, and this spec with verification evidence. Record the new server assessment boundary in ARCHITECTURE.md and DECISIONS.md. Update TESTING_STRATEGY.md only if required coverage/tooling policy changes.

No new dependencies, insulin dosing, glucose predictions, universal carb restrictions, automatic ketogenic advice, meal-plan generation, historical-log rewriting, or deployment.

## Implementation contract

- Reuse dietary tag `diabetesAware` to identify the editable starter profile. It is never inferred from ingredient names. Migration 000033 provisions existing users; atomic user creation provisions future users once, without read-time reseeding. Each migration's SQL and applied-version record now share a transaction, avoiding duplicate random-ID provisioning on a failed version write/retry.
- Extend nutrient thresholds with optional `per1000KcalMin`. Existing `dailyMax` and `perMealMax` remain backward compatible; the latter is explicitly one recipe serving for recipe screening. Default thresholds are sodium `dailyMax: 2300` and dietaryFiber `per1000KcalMin: 14`, both warning-level.
- Add authenticated **GET `/api/dietary-profiles/{id}/recipe-assessments`**, returning the existing API envelope with an array of `{ recipeId, status: "match" | "noMatch" | "notAssessed", reasons: string[] }` for the caller's recipes. The profile is caller-owned. The Go evaluator assesses nutrition criteria only; existing ingredient-name tag/allergen filtering remains separate and combines with it in the UI. No caller-supplied nutrient facts are accepted.
- No configured recipe criterion yields `notAssessed`, not an unconditional match. Invalid stored facts/criteria likewise cannot generate a match.
- React Query caches assessments beneath the recipe-list invalidation prefix and keys by selected profile/recipe inputs. Profile mutations explicitly invalidate assessments. Recipe/yield/nutrition mutations refresh them even if a subsequent list fetch fails. While assessment, recipe or profile refresh is pending, or recipe/profile/assessment reads fail, do not show unverified cached matches. Malformed legacy profile shapes throw a visible API read error rather than dropping restrictions.
- Validate dietary-tag/allergen enum arrays and nutrient criteria on server writes, preserving legacy sugar/fiber aliases and inert cleared rows. Invalid stored nutrient rules cannot yield a pass. Compute density from whole-recipe totals with relative 1e-12 floating-point tolerance, so equality and proportional scaling do not change with yield.
- The dietary filter section contains filter controls only; remove its warnings and guidance. Keep operational profile/assessment errors and pending or unassessed status visible near results, including when the controls are collapsed. The profile editor retains full guidance; filtering remains fail-closed. Regression tests cover the controls, status visibility and error/pending behavior.
- Parent owns integration/contracts and documentation. Parallel implementation areas may own backend assessment/provisioning and frontend profile/filter components, without unrelated edits.

## Verification evidence

- Filter-only presentation follow-up: focused tests first failed on guidance/status in the controls, then passed (14 tests). The broader dietary frontend selection passed 61 tests; `npx tsc --noEmit --pretty false`, touched-file ESLint, and `git diff --check` passed. Tests cover status after collapsing controls and fail-closed pending/error behavior. No browser verification was run for this follow-up.
- TDD RED/GREEN observed for the Go evaluator, profile validation/provisioning, migration rollback/retry, client API/selection/cache behavior, real recipe-page filtering, profile edit/save/error workflows, and compact guidance. Follow-up regressions reproduce failed recipe/profile refreshes and delayed profile/allergen refresh races before the safety fixes.
- `cd sync-server && TEST_DATABASE_URL=<unique disposable PostgreSQL 17 database> go test -count=1 ./...`: PASS, full suite, 61.163s in the parent's final run. Tests actually executed against the disposable database; no application/remote data was used. `go vet ./...`: PASS.
- Focused `npx vitest run src/components/dietary src/components/recipe/diabetes-recipe-filter.test.tsx src/hooks/use-dietary.test.tsx src/lib/api-client-go.test.ts src/lib/dietary-rules.test.ts`: 62 tests PASS.
- Final full `npx vitest run`: 350 PASS, 1 FAIL. The failure is the untouched `src/lib/custom-recipe-transfer.test.ts` artifact test: ENOENT for `recipe_meals_pdfs/deliciously-healthy-family-meals-first-two.recipe-bundle.json`. It belongs to other pre-existing uncommitted work; no artifact was fabricated or unrelated test changed to hide it.
- `npx tsc --noEmit --pretty false`, touched-file ESLint, and `git diff --check`: PASS.
- Private desktop Vivaldi, freshly built temporary frontend/API copies and a separate disposable browser database: default-off/all recipes, opt-in only confirmed matches, unknown-fiber disclosure, Clear restoration, default profile 14→20 edit/save/refresh persistence and changed results all verified. Injected assessment/profile-save failures, initial unavailable-profile disclosure and failed recipe-list refresh after a mutation were also verified without unverified matches. Normal run had no console exceptions/errors or failed HTTP requests. Offline font response fixtures were build-only; the temporary API's only binding adjustment was loopback-only. No production service was changed.
- At 1391×880, the compact expanded filter panel was 288 px tall and the first recipe was visible at y=722–742. The existing navigation's 34 px horizontal overflow was identical with filters collapsed/expanded and left outside scope. Evidence: `/tmp/diabetes-browser.PMQhHem2/final/` (reports, source manifest and screenshots). The final additional profile-in-flight gate was added after this browser snapshot and verified with the delayed-profile regression, full frontend suite and type check; no claim of browser coverage for that exact race.
- Independent review identified density precision, malformed legacy profiles, migration version-write atomicity and stale-cache/refetch issues; each received narrow fixes and regression coverage. The initial-error notice was confirmed outside the eligible-profile controls and tested with an empty cache.
- Requested external opencode workflow skill files were not present in the checked project/user skill locations; the repository's written spec, TDD, source-driven, incremental and review requirements were followed directly.
- Task-owned browser/API/frontend processes and disposable PostgreSQL fixture were stopped after verification. No dependencies, commits, deployment or unrelated cleanup were introduced.
