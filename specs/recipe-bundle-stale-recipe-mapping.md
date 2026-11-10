# Repair stale recipe mappings during native bundle import

## Objective / user value
Import a native recipe bundle successfully after a previously imported recipe was deleted. Do not write ingredients against a missing or other user's recipe ID.

## Acceptance criteria
- Existing origin-key and content-hash mappings are reusable only when their target recipe still exists and belongs to the importing user.
- A stale recipe mapping is replaced by a new shell; all ingredient links and categories reference the new local recipe IDs.
- An import failure rolls back the transaction; do not silently skip the affected recipe or mutate another user's recipe.
- Valid reimports still update/reuse their existing recipe target.

## Scope / implementation
The Go API owns transactional import (`sync-server/import_bundle.go`). Keep the native JSON bundle and UI unchanged. Before accepting mapped recipe IDs from either lookup path, validate target ownership/existence; creating a new shell upserts the origin mapping. No schema change.

## Tests / verification
The integration test reproduced the exact `ingredients_recipe_id_fkey` error before the fix. A disposable local PostgreSQL 16 container now passes the deleted-recipe origin-key and hash-lookup cases, cross-user mapping case, and idempotent reimport; `go test ./... -count=1` also passes. No production import or deployment was run. The duplicate policy is updated in `docs/Import_design.md`.

## Open questions
Other object types may have stale mappings too; this fix is limited to recipes because the reported foreign-key failure is on `ingredients.recipe_id`.
