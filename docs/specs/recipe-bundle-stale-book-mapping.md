# Repair stale book mappings during native bundle re-import

## Objective / user value
Re-import an edited cookbook bundle after the previously imported book was deleted without a `book_pages_book_id_fkey` failure. Preserve owner isolation and idempotency.

## Acceptance criteria
- For both origin-key and content-hash book mappings, reuse a target only if that book still exists and belongs to the importing user.
- A stale mapping results in a new book and remapped Preface/chapter records, rather than an FK error or a write to another user's book.
- Existing owned book imports still update the book and replace its pages/chapters in one transaction; rollback remains atomic on failure.
- The corrected bundle may be re-imported without changing its format or re-creating unrelated recipes.

## Scope / ownership
The Go API importer (`sync-server/import_bundle.go`) owns the book target mapping and transactional persistence. Add focused integration tests in `sync-server/import_bundle_stale_mapping_test.go` using a disposable PostgreSQL test database. No schema or UI changes; do not deploy without a separate request. Preserve ongoing unrelated working-tree modifications.

## Testing and docs
The PostgreSQL integration test reproduced `book_pages_book_id_fkey` before the fix for both origin-key and hash mappings. Against a disposable PostgreSQL 16 container, origin-key, hash lookup, cross-user, and owned-update cases now pass, and `go test ./... -count=1` passes. `../Import_design.md` records the book mapping integrity rule. No production import/deployment was run; no product/architecture policy change.
