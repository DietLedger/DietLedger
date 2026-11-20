# Duplicate book import decisions (server)

Implements `docs/specs/duplicate-book-import-decisions.md`. This server-only
implementation does not change the frontend contract or recipe/food identity
conflict policy.

## HTTP contract

`POST /api/recipe-bundles/import` accepts the legacy direct bundle or:

```json
{"bundle": {}, "bookDecisions": [{"bundleBookId":"incoming-key","targetBookId":"local-id","action":"merge","targetFingerprint":"opaque-token"}]}
```

Without all necessary choices, the normal summary adds
`requiresBookDecision: true` and
`bookConflicts: [{bundleBookId,title,candidates:[{targetBookId,title,targetFingerprint}]}]`.
This preflight rolls back its read transaction without creating a batch or
writing library content. Cancellation at this step is no request. Titles are
trimmed and compared case-insensitively (`strings.EqualFold`); internal
whitespace, punctuation and accents are not removed. Only caller-owned books
are candidates. Matching independent books inside the incoming package are not
a reason to collapse them.

All conflicts require an explicit choice; multiple same-title targets require a
selected ID. Books without an explicit choice retain the native importer's
source-key/content-hash mapping and existing placement reuse, including when the
locally mapped book was renamed. Clearing chapter/page aliases is limited to
the explicitly chosen book, not other books in the package. Merge retains target
metadata and old structure and appends incoming
chapters/book pages after their existing position tails. Identically named
chapters stay distinct, including when package-local transport keys coincide.
Replace retains the target ID, changes metadata, and deletes only its old book
pages/chapters (cascading chapter pages/placements), never recipes or foods.
Several incoming books may explicitly merge into one target. A target cannot be
replaced by multiple incoming books, or both replaced and merged in one request;
that ambiguous combination fails validation rather than dropping incoming data.

Fingerprints bind the complete candidate ID set and selected book metadata,
chapters, pages and recipe placements. Choices are revalidated inside the
owner-locked transaction. Changed/deleted targets or changed candidate sets
return HTTP 409 with a retry message. Recipe/food conflicts retain their existing
409 behavior. An exact request receipt takes precedence over new title conflicts:
response-loss retries never append or replace twice. Different supplied choices
cannot change an existing receipt's decision.

## Staging, locking and persistence

Missing-link batches retain choices but do not modify target books until Keep
(or the existing ingredient-repair acceptance action). Stale choices at acceptance
roll back all writes; cancel the pending batch and reimport to choose again.
Keep/repair retries do not replay replacement.

Migration `000035_import_book_decisions` adds `recipe_import_batches.book_state`
with versioned choices, invalidation and explicit superseded-book transport keys.
A replacement tombstones older batch placement claims for that target, retaining
the original context and recipes. Only effective, non-superseded structure is
materialized or displayed as pending book placement. Later Keep, repair, cancel,
retries and backup/restore cannot recreate those removed placements. Other books
in the same batch retain their structure.

There are **no global book-table locks**. Row triggers on the five book/placement
tables acquire the existing owner's user-row lock, also used by imports. This
protects candidate inserts and ordinary child edits as well as book metadata;
other owners' book edits remain independent. PostgreSQL can abort a transaction
on a conflicting/deadlocking concurrent write, rather than permit a stale
replacement; callers can retry after that failure.

## Owner backup compatibility

Pending batches serialize additive, opaque `bookState` in the existing version-1
`pendingImports` batch objects. Current browser readers preserve these objects
verbatim; the Go reader validates state versions, keys and decision shapes.
Target IDs are backup transport keys and are authorized/remapped through the
restored main books, never installed as recipient IDs. Still-valid deferred
choices are rebound to restored fingerprints; choices already stale at backup
remain invalidated, not refreshed into overwrite permission. Materialized
placements and supersession markers survive JSON round trips. New batches never
infer placement aliases from mutable global transport-key mappings. Legacy
batches without book state retain the older authorized backup-alias fallback.
Distinct same-title/same-metadata backed-up books remain separate.

## Verification

Use a disposable PostgreSQL database: `testStore` drops the public schema.

```sh
TEST_DATABASE_URL=... go test -count=1 -run '^TestDuplicateBook' ./...
TEST_DATABASE_URL=... go test -race -count=1 -run '^TestDuplicateBook' ./...
TEST_DATABASE_URL=... go test -count=1 ./...
go vet ./...
```

`duplicate_book_import*_test.go` covers no-write preflight, merge/replace,
deferred Keep/cancel/repair, restored choices, stale backup choices, superseded
accepted and unaccepted claims, independent transport keys, multi-book/target
selection, case/whitespace normalization, retries/concurrency, per-owner lock
isolation, transaction-time revalidation, identity conflicts and SQL rollback.
`duplicate_book_mapping_regression_test.go` covers renamed-book reimports both
alone and alongside a separately chosen merge; `duplicate_book_migration_test.go`
executes migration 35 down and up while checking all five triggers, the function,
and the state column. Existing quarantine/backup tests also run. The optional external PDF artifact
journey skips when its source JSON fixture is absent; this is not database-test
coverage or a claim that the PDF journey passed.

Verification recorded for this change: initial focused duplicate-book suite (27 tests/subtests, no skips), focused race suite, full Go suite (536 tests/subtests, with the one external-artifact skip above), `go vet`, `gofmt` and diff whitespace checks passed. A subsequent no-title-match reimport regression was observed failing before the fix and passing after; migration down/reapply also passed. The follow-up broader import/quarantine/backup suite passed 84 tests with no skips, along with its focused race suite and repeat `go vet`/format/whitespace checks. Tests used task-owned disposable PostgreSQL 17 fixtures with loopback-only access. Test-only durability settings were disabled; these checks do not claim crash-durability coverage. The full Go suite was not rerun after the final mapping/migration follow-up. No browser run or deployment was performed by this server-side change.
