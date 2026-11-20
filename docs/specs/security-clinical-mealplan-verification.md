# M1/M2 clinical and meal-plan owner-boundary verification

Implementation evidence for the privately approved M1/M2 remediation modules and complete security-release roadmap (API-03/API-04/API-12 only).

## Contract and assumptions

- Authenticated owner plus actual stored parent authorize access; child `user_id` never authorizes a foreign parent. No administrator override.
- Missing/foreign resources and mismatched URL parents return 404; anonymous remains 401 and invalid input remains 400. Nested and flat child routes enforce the same ownership.
- Guard writes in PostgreSQL, including referenced meal group/recipe belonging to the addressed owned plan/owner. Reject same-owner wrong-parent IDs as well as foreign IDs. No victim changes on rejection.
- Preserve clinical formulas, measurement field handling, nutrition/log snapshots, and existing partial-update semantics. No schema migration, data repair, auth-framework change, UI, deployment or other security-module work.
- Existing unscoped collection readers are also used by trusted native bundle serialization; retain those internal contracts and authorize API collection dispatch before reading. Mutating store APIs receive explicit owner/parent constraints.

## Ordered slices and verification

1. Measurements: two-owner real HTTP regression for collection/create/update/delete, swapped/same-owner wrong URL parents, missing IDs, positive owner CRUD and clinical fields; then guarded store/handler fix.
2. Allergen rules: foreign dietary parent collection/create and legacy inconsistent child/parent rows, nested wrong-parent mutation and flat routes; then parent-aware store/handler fix preserving pointer-based patches.
3. Meal-plan entries/groups: two-owner HTTP/store regression covering foreign collections, create/update/delete, flat and nested item routes, mismatched group/recipe references and same-owner wrong parent; then guarded mutations preserving partial edits and snapshots.
4. Focused GREEN; broader serialized PostgreSQL Go suite and diff review. No concurrency invariant was changed, so no race-detector-only claim is made; no frontend behavior change requires a browser/build.

All commands run only in the assigned isolated worktree. Database tests run serially with `DATABASE_URL` removed and `TEST_DATABASE_URL=<verified-disposable-postgresql-url>` set explicitly; the assigned disposable fixture is schema-destructive. Never source environment files. Do not put private worktree/home paths, concrete database endpoints, ports, hostnames, or owner infrastructure into committed notes or test output.

## RED/GREEN evidence

Commands below use `<verified-disposable-postgresql-url>` as a placeholder. The concrete disposable fixture endpoint and raw logs are intentionally not in Git.

### RED (before implementation)

`cd sync-server && env -u DATABASE_URL TEST_DATABASE_URL='<verified-disposable-postgresql-url>' go test -count=1 -v -run '^TestSecurity(MeasurementOwnership|AllergenParentOwnership|MealPlanChildrenOwnership)$' .`

**Expected non-zero exit.** After correcting invalid fixture-only profile/slot inputs, the regressions failed for the intended security reasons: measurement POST accepted a foreign profile and modified its rows; measurement update/delete accepted wrong/foreign parent-child combinations; allergen collection/create exposed a foreign parent path and rule updates/deletes accepted foreign or mismatched profile IDs; meal-plan collections returned foreign entries/groups, child operations accepted swapped/mismatched plan IDs, and entries accepted foreign/missing group and recipe references. Snapshot assertions observed unauthorized changes before the fix. An initial attempt had fixture errors (`sex is required`, invalid slot); that run was discarded as inconclusive, fixtures were corrected, and RED was rerun successfully as a security reproduction.

### GREEN

Focused: `cd sync-server && env -u DATABASE_URL TEST_DATABASE_URL='<verified-disposable-postgresql-url>' go test -count=1 -run '^(TestDayPlanEntryPartialUpdate|TestSecurity(MeasurementOwnership|AllergenParentOwnership|MealPlanChildrenOwnership))$' .` — **PASS**.

Broader serialized backend suite: `cd sync-server && env -u DATABASE_URL TEST_DATABASE_URL='<verified-disposable-postgresql-url>' go test -count=1 ./...` — **PASS** (full package suite; no skip reported).

The whole-suite run initially exposed an existing partial-update test fixture using a nonexistent synthetic group ID. The fixture now creates a real plan-local group and still verifies fields survive a partial update/move/ungroup. No behavior or nutrition snapshots were weakened to accommodate the guard.

### Verification limits

- Only API-03/API-04/API-12 are addressed here; this is not closure of the complete security roadmap or all 52 findings.
- No browser, frontend, container, deploy, live-service, external-provider, or runtime production-database checks were performed or authorized.
- Tests use a disposable PostgreSQL fixture and schema-resetting helper. Run serially; do not substitute inherited `DATABASE_URL` or source an env file.
- No clinical formula, historical log snapshot, schema migration, or client behavior change was included.
