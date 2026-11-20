# API-05 / M3 — book-child verification

Implementation evidence for the privately approved M3 remediation contract and complete security-release roadmap. No deployment, history operation or other module is included.

## Contract and implementation slices

1. Chapters, chapter pages, book pages and recipe placements: authenticate through the actual owning book, reject missing/foreign resources and same-owner URL-parent mismatches with 404. Owner/admin status never substitutes for ownership. Referenced placement recipes must be caller-owned.
2. Reorders, moves and conversions: validate every supplied child and both source/destination before modifying positions; denied/failed transactions leave the complete book graph unchanged.
3. Preserve existing import owner-row locking, replacement/placement receipts and trusted backup/export readers. Direct book export and candidate metadata are owner-only even for administrators; admin authority for other export resource types remains unchanged. Add a book-specific owner-bound store entry point for HTTP operations rather than changing trusted import/fixture primitives or introducing global authorization machinery. Transaction-local delegation must never mutate the shared pool/store.
4. Book-scoped HTTP responses are buffered until the owner transaction commits. A commit failure discards the successful callback response and emits one server error; any callback response with status >=400 aborts the transaction and only then is that response flushed. Callback validation failures must not commit earlier writes.

Focused two-owner HTTP regressions are written and run RED before implementation. Direct store regressions exercise the same scoped entry point. Admin/private-book canaries protect candidate search and direct export; injected commit failure and callback-error-after-write cases protect response/transaction consistency. Existing book owner-lock tests cover import serialization; no new concurrency barrier is required in this follow-up. Run focused coverage, existing book/import/backup tests, then serialized backend tests using only the exclusively assigned disposable database, with inherited `DATABASE_URL` unset. Inspect skips. No test-policy, domain, schema or product changes are intended.

## Evidence

All commands ran from `sync-server/` in the isolated books worktree, with inherited `DATABASE_URL` unset and `TEST_DATABASE_URL` set only in the shell. The assigned database identity was checked before the schema-resetting test helper. No `.env`, application database, service restart, or deployment was used. Raw output remains outside Git.

### RED

Before implementation, the two-owner HTTP regression run failed as expected: authenticated caller requests read foreign chapter/page/book-page/placement content, created/edited/deleted foreign children, accepted same-owner wrong-parent paths and changed book positions/placements. Move/conversion routes also changed foreign source/destination books; missing resources inconsistently returned success or 500. The failures were application behavior, after database setup and migrations succeeded.

Recorded command (database URL intentionally a placeholder):

```sh
cd sync-server
unset DATABASE_URL
TEST_DATABASE_URL=<assigned-disposable-database-url> go test -count=1 -run '^TestSecurityBook(ChildrenOwnership|OwnerPositiveHTTP)$' .
```

### GREEN

After adding request-local owner-lock transactions, resource checks, reorder membership validation, and both-end move/conversion checks, focused two-owner HTTP/store regressions and owner-positive workflows pass:

```sh
cd sync-server
unset DATABASE_URL
TEST_DATABASE_URL=<assigned-disposable-database-url> go test -count=1 -run '^TestSecurityBook(ChildrenOwnership|ChildrenStoreOwnership|OwnerPositiveHTTP)$' .
```

Result: `ok` (all three focused tests passed; no skips). The HTTP matrix verifies 404/non-disclosure and unchanged snapshots of books, chapters, pages, placements, positions and import-batch state after denied operations. Store tests independently verify foreign-book, wrong-parent and cross-owner destination rejection. Owner tests retain authorized reads/edits/reorders/moves/conversions. Existing frontend calls for book-page update/delete had no registered server route; authenticated `/api/book-pages/{pageId}` handlers now complete those intended operations and enforce the same owning-book check.

The broader book/import/backup selection also passed without skips:

```sh
cd sync-server
unset DATABASE_URL
TEST_DATABASE_URL=<assigned-disposable-database-url> go test -count=1 -run '^(TestBookHandlerCRUD|TestDuplicateBook|TestImportReceipt|TestImportStaging|TestOwnerRecipeBookBackup|TestSecurityBook)' .
```

Result: `ok` (57.594s; duplicate-book owner-lock/revalidation, receipt placement restore, import quarantine, owner backup, and the new API-05 regressions passed).

The complete backend suite then passed against the same exclusively assigned disposable DB, without skips:

```sh
cd sync-server
unset DATABASE_URL
TEST_DATABASE_URL=<assigned-disposable-database-url> go test -count=1 ./...
```

Result: `ok` (188.592s). A focused rerun after adding the previously missing authenticated book-page update/delete routes also passed all three security/owner-positive tests. The suite predating those final route/test additions had also passed; this final complete-suite result is the authoritative verification.

## Independent-review follow-up

Before these follow-up fixes, focused regressions failed in all three requested cases: an administrator's candidate list contained a foreign private book and searchable page canaries; admin direct export returned success; callback 400 after a transactional write committed the page; deferred commit failure left a 201 response followed by appended 500 JSON. These failures were observed on the disposable test DB.

Afterward, candidate search and direct book export require exact owner identity (admin export of other private resource types is unchanged). `runBookScope` now buffers response headers/status/body with a small standard-library `ResponseWriter`; callback statuses >=400 abort/rollback and flush only after the transaction unwinds, successful responses flush after commit, and commit failures discard buffered success and emit one server error.

Follow-up RED/GREEN command (URL placeholder only):

```sh
cd sync-server
unset DATABASE_URL
TEST_DATABASE_URL=<assigned-disposable-database-url> go test -count=1 -run '^Test(AdminCannotDiscoverOrExportAnotherUsersPrivateBook|SecurityBookScope(RollsBackCallbackErrorAfterWrite|CommitFailureDiscardsSuccessResponse))$' .
```

Result after implementation: `ok` (all three follow-up regressions passed). The complete backend suite passed after the follow-up changes as well: `go test -count=1 ./...` returned `ok` (172.682s), without skips, using the assigned disposable DB.
