# Security verification: sharing, canonical export and global-content trust

Scope: authorized M4/M5 (API06/07/08/09/10/11/13/21). This is private remediation evidence, not authorization to publish reports, alter live data, contact providers or clean legacy rows. The initial checkpoint is commit `0c97246`; this continuation closes its documented implementation gaps. Book-specific `canExportBook`/book-candidate administrator privacy fixes are owned by the parallel book stream and intentionally excluded here.

## Accepted contract

- Recipe-category routes are owner scoped, including administrator callers. Category-association collection reads cannot enumerate foreign private recipe IDs. Global category reads remain available; taxonomy mutations require an administrator.
- Share creation requires actual canonical recipe ownership, defaults to private, and rejects unknown explicit visibility. Updates require explicit valid visibility and publisher ownership. DELETE revokes to private. Foreign share IDs return 404; invalid/omitted/null/empty update visibility returns 400 without mutation. Token reads independently verify canonical ownership and deny invalid legacy visibility.
- Canonical recipe export/candidates require ownership or a legitimate actual-owner `public`/`users` publication. Neither an administrator flag nor a forged legacy share authorizes private canonical content. Every linked recipe/custom-food dependency is checked independently, including owned-book joins and owner-backup closure. Profile/meal-plan candidate/export helpers likewise do not allow administrator access to foreign private data.
- Published default templates are globally readable and administrator-writable. Ordinary owners may write owned non-default templates only. SQL checks both the current row and requested publication state, obtains administrator authority from PostgreSQL, and checks affected rows. This also protects legacy owner-bearing defaults and concurrent administrator publication. Native template imports create owned non-default copies, ignoring supplied publication flags.
- Ordinary native imports may reuse existing global taxonomy but cannot create it. Missing taxonomy fails materialization atomically with a validation error; previously staged package context survives so an administrator can provision categories before retry/Keep. Category creation/import/reparenting share a PostgreSQL graph lock; parent changes reject self/ancestor cycles. Legacy descendant traversal uses visited IDs and a finite graph-size bound without repairing data.
- Native `FoodItems` are unconfirmed package facts, never a shared-food ingestion channel, even for administrator imports. Existing standard rows are reused unchanged. Absent FDC records leave ordinary recipes in owner quarantine, retaining original FDC references, quantities, nutrient snapshots, missing metadata, supplied provenance, per-100g facts, portions and cookbook placement in existing batch context.
- Offline restoration means retained data, not forced publication. Owner backups retain standard-food context even without staged rows or ingredient references. V2 and pending-import V3/V4 restores may stage formerly published recipes when recipient trusted records are absent. Exact retries do not certify package facts. After trusted ingestion, explicit Keep re-verifies links without rewriting unchanged ingredient snapshots; deliberate rematches retain existing recalculation semantics. Whole-recipe custom nutrition remains authoritative separately and does not certify ingredient standard foods. Historical logs are unchanged.
- No schema migration, new dependency/service, real provider request, global-data cleanup or history recalculation is introduced. Previously uncertain shared rows are not automatically reclassified; operator-approved legacy review remains separate.

## Discovery and caller/impact review

CodeGraph status/search/callers/impact were used against the existing index. The composed context operation failed with `Unknown tool`, so targeted searches and direct source inspection supplemented it.

- `CreateSharedRecipe`, visibility update/delete: sharing handlers and PostgreSQL Store interface. Canonical owner creation uses an owner-qualified `INSERT ... SELECT`; mutations qualify publisher ID.
- `ListRecipeCategories`: association handler and native dependency export; internal export reads retain their authorized-recipe prerequisite. `RecipeCategoriesByCategory` no longer accepts an administrator bypass argument.
- Template CRUD: `handlers_phase2.go` and Store methods. Write authority is enforced by guarded SQL, not a caller-supplied admin flag or a preceding readable-template lookup. Native templates have no publication field in their schema and always insert non-default owned rows.
- `importRecipeBundleTx`: direct native persistence and `persistImportSliceTx`. Shared food insertion was removed from this common primitive. `importEvaluator.ingredient` no longer treats retained package FoodItems as canonical nutrition. Direct offline imports route through existing staging rather than discard absent-food metadata.
- `backupPendingImports` and `stagePendingBackupTx`: retain unconfirmed owner context and stage unavailable main-section sources during offline restore. Completed contexts remain receipts; original dependencies are not replayed over edited catalog/template rows.
- `findOrCreateCategoryTx`/`importBundleCategoriesTx`: database administrator qualification before new global category insertion; existing taxonomy reuse is unchanged. No native path updates category parents or publishes default templates.
- Recipe export/candidate and private custom-food closure helpers: no administrator override, actual recipe-owner publisher check on every canonical dependency. Book-specific helper changes are delegated to the book stream, not duplicated in this commit.

## RED / GREEN evidence

| Slice | Observed RED / correction | GREEN coverage |
| --- | --- | --- |
| Share creation/visibility | Initial regression returned 201 publishing another owner's recipe. | `TestShareOwnershipAndVisibilityValidation`; owner/public/private mutation matrix, invalid update input, legitimate users-tier read/export/candidates. |
| Standard-food trust | `TestSecurityBundleFoodTrustOfflineRestore` published an imported recipe immediately from package facts; direct import inserted a shared standard-food row. | No insertion through direct/staged/retry/backup/keep/failure paths; exact retained facts/portions/source quantities/placement; trusted ingestion then explicit verification; historical-log byte equality. |
| Category association privacy | Administrator category collection leaked a foreign private recipe ID. | `TestSecurityRecipeCategoryMatrix`: administrator and ordinary attacker GET/POST/DELETE denial, unchanged victim association, owner CRUD. |
| Canonical export | Legacy forged share/admin direct export returned 200; separate candidate regression exposed foreign private profile/book/plan IDs. | Forged share token/direct export, linked closure, owned-book join and owner backup deny canonical data. Administrator recipe/profile/plan candidates and exports are owner scoped. Book-specific privacy regression is assigned separately. |
| Global import authority | Ordinary native bundle created a new global category. | Atomic rejection/no published recipes; explicit administrator provisioning allows reuse; imported publication flags cannot create defaults. Non-admin taxonomy mutation remains 403. |
| Users publication | Authenticated users-tier canonical export succeeded but candidates omitted the legitimate recipe. | Candidate query and canonical export agree on actual-owner users/public publication. |
| Template current-row authority | Review found the initial SQL could let the owner of a legacy default write it and race administrator publication. | Store-level legacy-default create/update/delete guards, owner/private/default/admin HTTP matrix, and blocked-writer publication barrier verify the final SQL. Dedicated pre-fix RED was not captured for these follow-up tests. |
| Category graph integrity | Original traversal had no visited set; original update accepted any parent. | Self-parent and sequential ancestor rejection; two actual reciprocal updates are held at the graph-lock barrier and exactly one succeeds. Legacy cyclic traversal returns each ID once. These follow-up tests were added after the initial guard implementation. |

### Trusted fixture adaptation (not weakened assertions)

An initial trial that only skipped shared FoodItems insertion exposed implicit trust in three older tests. The approved continuation removes both insertion and evaluator fallback, retaining package context rather than reverting the policy:

- `TestFinalStagingPartialDependencyEdits`: explicitly seed the trusted canonical food before testing preservation of user edits and later promotion.
- `TestImportStagingBackupRestoresCanonicalPortions`: explicitly seed the recipient's trusted canonical portions before testing canonical rematching; no package certification is involved.
- `TestOwnerBackupRestoreAcrossDatabases`: seed recipient trusted records before testing full published-content equality. Its distinct-ID, snapshot, portable identity and relationship assertions remain intact.
- `TestFinalStagingDeletedMaterializedFoodStaysMissing`: seed the initial trusted standard row so the test truly exercises later deletion rather than starting absent.
- The former explicit-admin private custom-food export positive is replaced by owner-positive plus administrator-as-attacker denial, reflecting the approved ownership policy rather than preserving a privacy bypass.

Separate security tests cover the empty-catalog case instead: durable quarantined restoration from both main-only and mixed pending backups, context-only/unreferenced facts, owner isolation, failure rollback, unchanged trusted rows and original snapshots. Offline restoration does not require network calls or fabricate zero nutrients.

## Verification commands

Run serially from `sync-server`, substituting an isolated disposable PostgreSQL URL only in the environment. Test helpers drop/recreate `public`; never use an application database or inherited runtime configuration. No raw logs or operator paths are committed.

```sh
env -u DATABASE_URL TEST_DATABASE_URL='<isolated disposable PostgreSQL URL>' go test -count=1 -run '^(TestSecurity.*|TestRecipeBundleCandidatesRespectExportEligibility|TestBundleExportCustomFoodRequiresRequesterAuthorization|TestFinalStagingPartialDependencyEdits|TestImportStagingBackupRestoresCanonicalPortions|TestOwnerBackupRestoreAcrossDatabases)$' .
env -u DATABASE_URL TEST_DATABASE_URL='<isolated disposable PostgreSQL URL>' go test -race -count=1 -run '^(TestSecurity.*|TestRecipeBundleCandidatesRespectExportEligibility|TestBundleExportCustomFoodRequiresRequesterAuthorization)$' .
env -u DATABASE_URL TEST_DATABASE_URL='<isolated disposable PostgreSQL URL>' go test -count=1 ./...
git diff --check
```

Final results on the isolated fixture:

- Focused real HTTP/store security and related regression runs: PASS.
- Focused security/candidate/custom-food `-race` run: PASS (33.073 seconds), including barrier-controlled category and template races.
- `go test -count=1 ./...`: PASS (178.254 seconds); JSON output recorded 595 test/subtest pass events, zero failures and one skip. `TestCustomRecipeNutritionArtifactPublicJourney` skipped because its external PDF artifact is absent from the isolated worktree. No database security regression was skipped.
- `git diff --check`: PASS.

A skipped test is not passing evidence. Browser layout/visual testing is not claimed: this slice changes backend authorization/import trust, not rendering. Release/integration verification must include the parallel book helper fixes and other security streams. No implementation question remains for the assigned food/quarantine policy; uncertain legacy catalog review remains a separately authorized operator task, not part of this change.
