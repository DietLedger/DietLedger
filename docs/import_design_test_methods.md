# DietLedger Native Recipe/Cookbook Import Automated Testing Plan

## Status

Proposed testing plan for `docs/Import_design.md`.

## Testing Goals

Automated tests should prove that DietLedger-native recipe/cookbook bundles are:

- self-contained
- server-authoritative
- duplicate-safe
- nutritionally reproducible
- safe across local database primary key differences

Testing should follow `TESTING_STRATEGY.md`: prioritize business-critical correctness and workflow confidence over broad, brittle coverage.

---

## Test Layers

Use three layers:

1. Pure Go unit tests for schema, hashing, and graph planning.
2. Backend integration tests against PostgreSQL for persistence, remapping, dedupe, and transaction behavior.
3. Minimal frontend tests for user-visible import/export triggering and result display only.

The highest-value tests are backend tests because the Go API owns the workflow.

---

## Required Backend Unit Tests

### 1. Bundle schema validation

Validate accepted and rejected bundle structures.

Cases:

- accepts `format = dietledger.recipe-bundle`, `version = 1`
- rejects unknown format
- rejects unsupported version
- rejects missing required recipe fields
- rejects ingredients with invalid source metadata
- rejects chapter/book references to missing bundle IDs
- rejects recipe-category joins to missing recipes/categories
- rejects chapter recipe placements to missing chapters/recipes

Expected location:

```txt
sync-server/import_bundle_test.go
```

---

### 2. Canonical content hashing

Content hashing is used for duplicate detection and import identity.

Test that hashes are:

- deterministic
- independent of JSON/map field order
- independent of source local primary keys
- changed when meaningful content changes
- unchanged when ignored metadata changes, such as source timestamps if timestamps are not part of identity

Cases:

- same recipe with different source local IDs gets the same hash
- same recipe with changed ingredients gets a different hash
- same custom food with same nutrients gets the same hash
- custom food with changed nutrient value gets a different hash

Expected location:

```txt
sync-server/import_hash_test.go
```

---

### 3. Import graph planning

Test the import planner before persistence.

Cases:

- linked recipe dependencies are included before hydration
- recipe shell creation happens before ingredient hydration
- food dependencies are planned before recipes
- books/chapters/pages are planned after recipe ID mapping is available
- missing linked recipe dependency creates a validation error
- missing template reference is planned as clear-reference, not dangling-reference

Expected location:

```txt
sync-server/import_plan_test.go
```

---

## Required Backend Integration Tests

These tests require `TEST_DATABASE_URL`, following existing backend integration conventions.

Expected location:

```txt
sync-server/handlers_recipe_bundle_test.go
```

or split into:

```txt
sync-server/import_bundle_store_test.go
sync-server/handlers_recipe_bundle_test.go
```

---

### 1. Fresh-instance import with USDA foods

Setup:

- fresh test database
- create test user
- create bundle with one recipe and one USDA-backed ingredient
- include the supporting `food_items` row in the bundle

Assert:

- import succeeds
- recipe exists for the importing user
- ingredient exists
- ingredient nutrient snapshot matches the bundle
- `food_items` contains the USDA row
- `food_items.fdc_id` equals the bundle `fdc_id`
- `food_items.id` is generated locally and is not source-local identity

---

### 2. USDA food dedupe by `fdc_id`

Setup:

- insert a `food_items` row with `fdc_id = X`
- import bundle containing a supporting USDA row with `fdc_id = X`

Assert:

- no duplicate `food_items` row is created
- import reuses/skips existing food row
- import result reports reused/skipped USDA food
- recipe import still succeeds

---

### 3. Custom food import and dedupe

Setup:

- bundle contains recipe ingredient sourced from a custom food
- bundle includes custom food dependency

Assert first import:

- custom food is created with a new local ID
- ingredient source metadata points to the mapped custom food identity
- ingredient nutrient snapshot matches bundle

Assert second import of same bundle:

- custom food is not duplicated
- recipe is not duplicated
- import result reports reused or updated objects

---

### 4. Re-import is idempotent for recipes

Setup:

- import a bundle with one recipe
- import the exact same bundle again

Assert:

- only one recipe exists for that import identity
- mapping table contains one recipe mapping
- second import updates/reuses existing recipe instead of creating a duplicate
- import result reports updated/reused recipe, not created recipe

---

### 5. Same recipe name with different content creates conflict

Setup:

- existing recipe named `Chicken Soup` with one content hash
- import bundle containing `Chicken Soup` with different meaningful content and no matching origin mapping

Assert:

- no duplicate recipe is created
- existing recipe is not overwritten
- import result includes a conflict
- conflict identifies object type, name/title, and reason

---

### 6. Linked recipe remapping

Setup:

- bundle contains recipe A with an ingredient linked to recipe B
- bundle contains recipe B

Assert:

- both recipes are imported/reused
- ingredient in recipe A has `linked_recipe_id` equal to target recipe B ID
- ingredient does not retain source recipe ID
- recipe B can be imported before or after recipe A in bundle order; importer still resolves correctly

---

### 7. Cookbook structure import

Setup:

- bundle contains one book
- two chapters
- chapter pages
- book pages
- chapter recipe placements
- positions/order

Assert:

- book is created/reused
- chapters are created in correct order
- chapter pages and book pages preserve content and position
- recipes are placed into correct chapters
- chapter recipe placement order is preserved
- source book/chapter/page IDs are not reused as target IDs

---

### 8. Cookbook re-import is idempotent

Setup:

- import cookbook bundle
- import same bundle again

Assert:

- no duplicate book is created
- no duplicate chapters/pages/placements are created
- ordering remains stable
- import result reports updated/reused, not duplicated

---

### 9. Template remapping and missing templates

Cases:

1. Bundle includes referenced templates.
   - Assert templates are imported/reused.
   - Assert chapter `page_template_id` and `recipe_template_id` point to target template IDs.

2. Bundle references a template that is not included.
   - Assert import succeeds.
   - Assert missing template reference is cleared.
   - Assert no dangling template ID is persisted.

---

### 10. Category tree and recipe-category assignment

Setup:

- bundle contains category parent/child closure
- recipe assigned to child category

Assert:

- categories are imported/reused without duplicate tree creation
- parent-child relationship is preserved
- recipe-category join points to target recipe and target category IDs
- re-import does not duplicate categories or joins

---

### 11. Transaction rollback on failure

Setup:

- bundle contains valid food dependency and recipe shell
- later object is invalid or intentionally fails validation/persistence

Assert:

- import fails
- no partial recipes are persisted
- no partial book/chapter/page records are persisted
- mapping table is unchanged
- food row rollback behavior follows the selected transaction policy; v1 should prefer all-or-nothing unless explicitly documented otherwise

---

### 12. Authorization

Cases:

- unauthenticated import request is rejected
- unauthenticated export request is rejected
- user can import into only their own account
- user cannot export another user's recipe/book by ID
- admin status is not required unless the endpoint is intentionally made admin-only

Assert expected HTTP status codes and no unauthorized persistence.

---

## Required Export Tests

### 1. Export recipe includes full dependency closure

Setup:

- recipe uses USDA food
- recipe uses custom food
- recipe links to another recipe

Assert exported bundle includes:

- selected recipe
- linked recipe dependency
- USDA food item
- custom food dependency
- ingredient source metadata
- nutrient snapshots

---

### 2. Export book includes cookbook graph

Setup:

- book with chapters, pages, recipes, categories, templates

Assert exported bundle includes:

- book
- chapters
- chapter pages
- book pages
- chapter recipe placements
- recipes referenced by the book
- linked recipes used by those recipes
- supporting foods
- referenced templates
- assigned categories and parent category closure

---

### 3. Export omits non-portable local primary keys as authoritative IDs

Assert bundle records either omit local DB primary keys or place them only in bundle-local metadata fields.

The exported identity must not imply that target import should use source database primary keys.

---

## Minimal Frontend Tests

Frontend tests should not retest import orchestration. The Go API owns that.

Test only user-visible behavior:

- import form uploads a bundle file and displays API result summary
- conflicts are displayed to the user
- successful import invalidates recipe/book query caches
- export button requests bundle generation and triggers download
- old demo import path is not shown once replaced

Expected locations depend on final UI placement, for example:

```txt
src/app/(app)/settings/page.test.tsx
src/app/(app)/recipes/page.test.tsx
src/app/(app)/books/page.test.tsx
```

---

## Commands

Backend focused tests:

```bash
cd sync-server && go test ./... -run 'Import|RecipeBundle' -count=1
```

Full backend tests:

```bash
cd sync-server && go test ./... -count=1
```

Frontend focused tests:

```bash
npm test -- --run
```

Use the repository's existing Vitest command if it differs.

Database integration tests require:

```bash
TEST_DATABASE_URL=postgres://...
```

---

## Regression Risks These Tests Must Catch

- source local primary keys accidentally persisted as target IDs
- recipes duplicated on re-import
- books duplicated on re-import
- USDA foods duplicated despite same `fdc_id`
- custom foods duplicated despite same origin/content hash
- linked recipes pointing to stale source IDs
- cookbook ordering lost during import
- template references left dangling
- category trees duplicated or recipe-category joins broken
- nutrition snapshots changed or lost during import
- partial imports left behind after failure
- browser code regaining ownership of import orchestration

---

## Completion Standard

The feature should not be considered complete until automated tests prove:

1. Fresh-instance import works without USDA seed data.
2. Re-import is idempotent for recipes and books.
3. All supporting foods are imported/reused correctly.
4. Nutrition snapshots survive round trip.
5. Linked recipe, cookbook, template, and category references are remapped safely.
6. The Go API, not browser code, owns import/export orchestration.
