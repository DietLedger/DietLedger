# Duplicate book import decisions

## Objective and user value
When an imported recipe book has the same name as an existing book, let the user explicitly choose **Merge**, **Replace**, or **Cancel import** rather than silently creating or overwriting a book.

## Approved behavior
- Compare titles after trimming surrounding whitespace and ignoring case, limited to books owned by the importing user. If several existing books match, require target selection. Handle every conflicting incoming book in a multi-book package.
- **Merge:** keep the existing book's metadata, chapters, pages and recipes; add the incoming book's chapters and book pages, preserving their contents and order. Keep identically named chapters separate rather than guessing that they are the same. Reuse recipes only according to the existing portable-identity rules; do not overwrite locally edited recipes.
- **Replace:** replace the selected book's metadata and structure with the incoming book, retaining the existing book ID. Remove its old chapter/page placements, not the underlying recipes, food records, or content shared elsewhere. Existing separate recipe identity conflicts still fail safely.
- **Cancel import:** cancel the entire incoming bundle without modifying the existing library or other pending imports.
- Decisions must be applied by the Go API transactionally, with ownership checks, duplicate-safe retries, and revalidation against concurrent edits. Never delete the old book in the browser before import succeeds. Missing-ingredient Stop and undo must not modify existing books; selecting Replace must not modify the existing book before the user accepts any required Relink later decision. Pending import and backup/restore semantics must remain intact.
- If the target changes or disappears while awaiting a decision, do not silently overwrite it: ask again or fail with a clear retry message. Handle conflicts within an incoming package without accidentally merging independent incoming books.
- Replacement must account for previously staged placements and import receipts so canceling an earlier/later batch or retrying it cannot recreate book structure that the user explicitly replaced. Do not silently destroy another pending batch's placement claims.
- Keep normal imports with no matching book working as before. The existing recipe/food portable-identity conflict policy remains unchanged. Completed receipts remain idempotent while their effective claims exist; an explicit identical reimport restores only missing recipes and non-superseded book placements, preserving surviving edits. It must not replay Merge/Replace or overwrite a newly conflicting same-title target. Owner-backup restore remaps transport keys and keeps distinct backed-up books separate.

## Affected systems
Shared recipe bundle import UI and API, Go import staging/decision/promotion, book mappings and placement handling, applicable backup/restore, documentation and tests. No new dependencies or deployment are authorized.

## Verification strategy
Focused failing tests first. Exercise public HTTP/PostgreSQL imports on isolated disposable databases for merge, replace, cancellation, missing-link decisions, multi-book matches, ownership, rollback, retries, concurrent target edits, and backup/restore. Add focused shared UI workflow tests covering all entry points and choices; browser-check decision UI where practical. Verify recipe data, nutrition, and unrelated books survive. Update API and product documentation after implementation.

## Status and verification
Approved by the user on 2026-11-19 using the defaults above. Duplicate-book decisions and the identical-reimport-after-deletion regression are implemented in the shared UI and Go API. `sync-server/DUPLICATE_BOOK_IMPORT.md` records behavior and test evidence. On an isolated disposable PostgreSQL database, the public HTTP deletion/reimport regression failed before the fix and passed after; 20 focused receipt tests/subtests and a 560-test full Go suite passed with one skip for the absent optional PDF fixture. The focused race run passed 22 tests/subtests; `go vet`, `gofmt`, and `git diff --check` passed. Frontend workflow/API/import-entrypoint tests passed (53); ESLint and `tsc --noEmit --incremental false` passed. No browser run or deployment was performed. Changes remain uncommitted and unpublished.

## Individual deletion / identical reimport regression
Explicitly importing the same native file after individually deleting imported books/recipes must restore missing claimed content instead of treating a completed request-hash receipt as proof that rows still exist. Reconcile within that owner's existing receipt and transaction; retain assigned legacy identities, surviving local edits, existing placements/order, pending decisions and mutable quarantine repairs. Exact/concurrent retries without missing content remain no-ops. Restore only effective (not replacement-superseded) book claims. Unrelated imports, Keep and ingredient repair must not resurrect deleted book structure from retained context. Deleted dependency snapshots are not replayed over live foods/templates; normal link verification still governs recipe promotion. Missing-book restoration must fail safely on a new same-title conflict rather than silently selecting/overwriting another book.

Scope: `sync-server` receipt reconciliation/promotion and public HTTP PostgreSQL regressions; API documentation here and `docs/recipe-package-api.md`. No frontend, migration, nutrition calculation or deployment changes. Verify public DELETE -> identical import in both deletion orders, partial deletion with edited survivors, exact/concurrent retry, rollback, pending/repair safety and replacement supersession on disposable PostgreSQL. This is the implementation note/acceptance criteria for the reported bug, not a new import conflict policy.

### Regression verification
Public HTTP tests in `sync-server/import_receipt_reimport_test.go` first failed on disposable PostgreSQL 17: `TestImportReceiptReimportAfterIndividualDeletes/{book-first,recipe-first}` returned empty creation counts, `TestImportReceiptPartialDeletionPreservesEditedSurvivors/{book,recipe}` retained missing rows, and `TestImportReceiptRepairDoesNotResurrectDeletedBook` recreated deleted structure. All now pass. Additional safety RED/GREEN covered receipt writes on accepted quarantine retry, removed placements replayed by unrelated promotion, deleted-food quarantine retries, and live template references lost during book restoration. Test fixture issues (snapshot ordering/JSONB formatting and existing HTTP 400 error mapping) were corrected separately, not counted as product failures.

Final commands from `sync-server`, each with an explicit task-owned disposable `TEST_DATABASE_URL`:
- `go test -count=1 -json ./...`: **560 passed, 1 skipped** (tests/subtests). Only skip: `TestCustomRecipeNutritionArtifactPublicJourney`, absent external PDF artifact; no database skips.
- `go test -race -count=1 -run '^Test(ImportReceipt|DuplicateBookConcurrentChoiceRetries|ImportStagingRollbackAndConcurrentRetries)' -json .`: **22 passed, no skips**, including all 20 receipt tests/subtests, on a separate disposable database.
- `go vet ./...`, changed-Go-file `gofmt -l`, and scoped `git diff --check`: clean.

The unique loopback-only PostgreSQL container used tmpfs and test-only durability settings (`fsync`, `synchronous_commit`, `full_page_writes` off); this proves transactional rollback/concurrency, not crash durability. No live data, frontend/browser work, deployment, migrations or dependency additions. Existing extensive worktree changes were preserved. Reconciliation adds reads proportional to retained claims. New same-title restoration conflicts fail closed with 409; deleted dependency snapshots are deliberately not restored. Existing owner-backup validation may still fail closed when pending contexts retain deleted placement aliases; this fix does not broaden backup repair policy.

## Open questions
None.
