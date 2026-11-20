# Recipe package API: native transfer and import-only quarantine

Authoritative scope: the current user revision in `specs/recipe-nutrition-quarantine.md`; execution evidence and deferred work: `specs/recipe-nutrition-quarantine-plan.md`. All routes below require authentication. The implemented workflow stages imports separately and promotes complete recipes; dataset preflight/inventory and legacy recipe migration are not part of it.

## Authoritative custom recipes (native v4)

`specs/custom-recipe-nutrition.md` adds explicit whole-recipe custom nutrition. Recipe create/read/update and native recipe objects support `description` independently of cooking instructions, plus:

```json
{
  "description": "Original introduction and source callouts",
  "customNutrition": {
    "basis": "recipeTotal",
    "nutrients": { "calories": 992, "totalFat": 8, "saturatedFat": 4, "transFat": 0, "cholesterol": 188, "sodium": 1688, "totalCarbs": 144, "dietaryFiber": 4, "totalSugars": 0, "addedSugars": 0, "protein": 80, "vitaminD": 0, "calcium": 240, "iron": 2.88, "potassium": 1212 },
    "source": "Published cookbook, printed page 3; amounts for the whole recipe",
    "sourceLabel": "Original per-serving label, including unsupported nutrients and %DV",
    "missingNutrients": ["transFat", "totalSugars", "addedSugars", "vitaminD"]
  }
}
```

Custom totals override ingredient-derived totals. `servings: 4` makes the example 248 kcal per serving. Update requests that omit `customNutrition` preserve existing facts; an explicit `null` removes them. Ingredient snapshots and native bundle ingredients can retain `missingNutrients` (canonical nutrient names); nested recipe snapshots preserve the union of child uncertainty, and nonempty missing metadata also requires v4. A linked recipe ingredient still expresses a fraction/multiple of the whole recipe. Custom recipe ingredients can be descriptive/manual with no matches and without pretending they deliberately contain no nutrients; ordinary imported recipes still require valid links or explicit zero choices. All canonical amounts are finite, nonnegative and bounded; the basis, source and missing keys are validated.

Envelopes containing custom nutrition or descriptions use **version 4**, including such dependencies and pending-import contexts. Current readers accept v1/v2/v3/v4; older readers reject v4 instead of silently dropping facts. V4 may carry the same versioned `pendingImports` section as v3. Exports without new metadata retain existing v2/v3 compatibility. The v1/v2/v3 descriptions below remain valid for legacy content; this section supersedes their version limits for custom recipes. No fake food or nutrition-only ingredient is introduced, and historical snapshots are not rewritten.

## Portable identity

Recipe/custom-food reads include `portableId`, generated once independently from `id`:

- Recipes: `dietledger:recipe:<uuid>`.
- Custom foods: `dietledger:food:<uuid>`.
- USDA food identity remains its positive FDC food ID (`usda:fdc:<fdcId>` conceptually); nutrient IDs such as 2048/2047/1008 are unrelated.

Ordinary recipe/custom-food update requests that set `portableId` receive HTTP 400 without changing content. PostgreSQL also rejects identity mutation. The owner/local-key authorization model is unchanged.

## POST /api/recipes

Creation accepts the existing metadata/ingredient fields plus optional `requestKey` and serialized JSON-string `ingredientGroups`:

```json
{
  "name": "Soup",
  "servings": 2,
  "servingName": "bowl",
  "requestKey": "client-generated-draft-key",
  "ingredientGroups": "[{\"id\":\"vegetables\",\"title\":\"Vegetables\"}]",
  "ingredients": [{"name":"Unresolved vegetable","amount":100,"unit":"g","groupId":"vegetables"}]
}
```

- HTTP 201 returns the authoritative saved recipe, including its generated identity and all persisted ingredients.
- Metadata, groups, ingredients and retry-key reservation commit in one transaction. An insert/commit failure leaves none of them persisted.
- Identical decoded request plus the same owner/key returns the same recipe. The key is not shared across users.
- Changed payload under the same owner/key returns HTTP 409, without altering the saved recipe. A new intentional create needs a new key.
- Without a key, independent creates remain independent. The frontend markdown orchestration has not yet migrated to this contract.

## Ingredient source fidelity

Ingredient reads and writes now carry:

- `position`: zero-based recipe order. Ordered create/replace arrays assign positions; a single ingredient add appends. Native bundles also emit `position`. Older v1/v2 bundles without positions use their array order.
- `zeroNutritionOverride`: explicit consent to use no nutrition. It is valid only for `sourceType: "manual"`, `fdcId: -3`, all-zero canonical nutrients and no food/recipe/unresolved source. Missing fields mean false; an all-zero snapshot alone never implies intent.
- `unresolvedSource`: an original typed `usda`, `custom_food`, or `recipe` identity retained when no safe local target can be linked. Live `sourceKey`, positive `fdcId`, and `linkedRecipeId` stay empty in that state.
- `unconfirmedNutrition`: retained ingredient-level supplied facts with `basis`, optional `unit`, optional `servingGramWeight`, `provenance`, and canonical `nutrients`. Valid bases are `per100g`, `perServing`, `ingredientAmount`, and `unknown`; `perServing` requires a positive gram weight. These facts are not a confirmed food match.

Migration 000030 marks only provable legacy `manual` / `fdcId=-3` all-zero unlinked rows as explicit overrides. Generic manual/all-zero rows remain ambiguous.

## POST /api/recipe-bundles/export

Existing request shape remains `{ "recipeIds": [], "bookIds": [], "profileIds": [], "mealPlanIds": [] }`. It returns a bundle envelope with `format: "dietledger.recipe-bundle"`, `version: 2` and source/export metadata. V2 recipe/custom-food records carry portable identities; bundle-local references are remapped on import, not installed as local primary keys. Dependency closure must preserve authorized linked/custom-food references and native book organization.

Ordinary export remains main-table-only. Unpromoted imports are stored separately, have no main recipe row/live book join, and cannot be selected by staging ID. No legacy recipe filtering or published/quarantine combined query is introduced.

Canonical recipe export/candidates require ownership or a legitimate `public`/`users` share whose publisher is the actual canonical recipe owner. An administrator flag is not permission to read a foreign private recipe, custom-food dependency, nutrition profile or meal plan. Every linked-recipe dependency is authorized independently; a forged legacy share cannot authorize canonical content through direct export, a book join, linked closure or owner backup. Public/custom-food sharing does not expose private dependencies. Book-specific export authorization is maintained in its separate security slice.

## POST /api/recipe-bundles/owner-backup

The request has no selection body. The authenticated server enumerates every recipe and book owned by the caller, including unresolved/incomplete recipes, then returns a native v2 envelope, or v3 when pending imports must also be retained.

- Administrator status does not expand top-level enumeration to other users' content.
- The backup includes ingredient order/groups, zero intent, unresolved identities, supplied facts, categories, books, chapters, pages, referenced templates, joins, and authorized dependency closure.
- Missing ingredient source targets remain explicit unresolved references with their snapshots/facts.
- Inaccessible private dependencies, malformed stored groups/preparation JSON, missing referenced templates, enumeration failures, and operational dependency lookup failures fail the request; no partial bundle is returned.
- Cyclic category ancestry and duplicate same-name siblings in the exported category closure are non-restorable under the current native importer and fail closed. They are not silently flattened/merged or repaired. Same names under distinct parents are supported. Distinct same-title books/chapters and same-name templates remain distinct through local-key remapping.
- If referenced, authorized custom-food copies share a portable identity but disagree on canonical name/nutrients, export fails rather than silently selecting one copy. Equal copies may share one packaged identity; private inaccessible copies remain forbidden.
- This is a lossless recipe/book backup purpose, not a full account-data export. It does not include profiles, food logs, weights, or meal plans.
- A valid empty bundle is returned when the owner has no recipes or books.
- Enumeration and every dependency/authorization read share one read-only PostgreSQL REPEATABLE READ snapshot, established by the first query. Later committed changes are excluded. Transaction begin/read/validation/commit failure returns no successful bundle. This is not atomic with a later account-deletion request; edits after the snapshot are not protected.

The explicit frontend method `exportOwnerRecipeBookBackup(): Promise<RecipeBundle>` posts to this endpoint without a selection body. Both Settings and AppNav account-deletion entry points await this method and JSON download construction/initiation before calling account deletion. Any backup/download exception blocks deletion, logout and navigation; deletion failure also blocks logout/navigation. Settings forwards its required administrator successor unchanged. Ordinary selected-ID exports remain separate. Download initiation is not evidence the browser saved the file to disk; these flows say so and do not promise a ZIP or complete account backup.

## Sharing, recipe categories and templates

- `POST /api/share` requires the caller to own the canonical `recipeId` (404 on missing/foreign). Omitted/empty creation visibility defaults to `private`; explicit unknown values return 400. `PUT /api/share/{id}` requires explicit `private`, `users` or `public`; omitted/empty/null/unknown values return 400 without changes. PUT/DELETE are publisher-owner only (404 for foreign IDs). DELETE revokes to private, retaining the row. Token GET independently verifies canonical ownership and rejects unknown legacy visibility. Anonymous reads require public, users-tier requires authentication and private requires the publisher.
- `GET|POST|DELETE /api/recipes/{id}/categories` is recipe-owner scoped (including for administrator callers); foreign IDs return 404. `GET /api/categories/{id}/recipes` lists caller-owned recipe associations only. Global category collection/descendant reads remain available, while POST/PUT/DELETE taxonomy mutation requires an administrator (403 otherwise). Category parent updates are transactional/serialized; self/ancestor cycles are rejected and visited-set traversal terminates on legacy cycles without repairing them.
- Published default templates are globally readable but only database-confirmed administrators can publish/edit/delete them, including a legacy default still bearing an ordinary user's owner ID. Current-row and requested publication state are guarded at the SQL write boundary, with affected-row checks so concurrent publication cannot race an owner edit. Owned non-default templates remain owner-writable; administrators cannot edit another owner's private non-default template. Native imports create non-default owned copies, not global publications.

## Data reset and import history

`POST /api/instance/reset-user-data` accepts `{ "password": "..." }` and requires an authenticated administrator and their current password. It atomically removes all custom content for all users, including books, recipes, custom foods, global organization/templates, custom nutrition, import mappings, completed/pending import batches, staged payloads, repair receipts and recipe-create retry records. It preserves accounts, settings, sessions, instance configuration, migrations, standard imported food records and seed-job metadata. No custom staples are recreated after success. The response is `{ "ok": true }` only after commit; wrong passwords/non-administrators receive 403, and database failures receive 500 with rollback.

`POST /api/account/delete-data` remains password-gated and strictly caller-scoped for non-admin personal-deletion compatibility. It also clears that caller's import batches, repair receipts and mappings; errors roll back rather than being ignored. It does not reset other users or shared global content. See `specs/complete-custom-data-reset.md`.

Both resets remove the applicable request-hash receipts so an identical bundle can import fresh content afterward. Individual book/recipe deletion retains receipts; explicit identical reimport reconciles missing content as described below. Reset does not invoke import or modify source bundle files.

## Import/quarantine API

This import-only workflow supersedes direct publication of incomplete imported recipes. No dataset inventory/preflight UI is added. Main recipes and normal book joins contain only promoted imports; normal selected JSON/PDF export never reads staged rows. Owner backup explicitly preserves staged imports as described below.

- `POST /api/recipe-bundles/import`: stage the whole bundle first and verify actual links. A complete batch may promote immediately. Missing links return the ordinary import summary plus optional `pendingImportId`, `requiresDecision: true`, `quarantined`, and `promotedRecipeIds`. A bundle with a same-name owned book returns `requiresBookDecision: true` and `bookConflicts` before creating a batch or writing library content. Send the original bundle with explicit `bookDecisions` (`bundleBookId`, `targetBookId`, `action: merge|replace`, and server-issued `targetFingerprint`) to continue; the original direct-bundle body remains accepted for backward compatibility. Merge retains existing book metadata/placements and appends incoming chapters/pages; Replace retains the book ID and recipes while replacing metadata and structure. Multiple matches require selecting a target for each conflicting incoming book. Cancel aborts the entire bundle in the shared UI. Choices are revalidated under the owner lock; changed candidates/structure return HTTP 409 rather than silently overwriting. Exact request receipts preserve retry idempotency. Choices for batches with missing ingredient links are deferred until Keep/repair, and owner backup preserves pending choices and superseded placement claims.
- `POST /api/recipe-imports/{batchId}/decision`, JSON `{ "action": "keep" | "cancel" }`: keep promotes complete recipes and retains unresolved rows; cancel discards only this unaccepted incoming batch. Earlier quarantine is untouched. Returns an import summary. No whole-library reset or deletion of reused main objects implements undo.
- `GET /api/recipe-imports`: return an array of owner-only `QuarantinedRecipe` objects: `{ id, batchId, requiresDecision, recipe: RecipeRecord, unresolvedIngredients: [{ ingredientId, reason }], bookTitles: string[] }`. This reads staged recipes/import context exclusively, cumulatively across batches. Unaccepted batches remain resumable after refresh, including batches reusing another import's staged identity. Decision-only records cannot be edited as recipe rows; choose Keep/Cancel first. Editable IDs are durable staging IDs, not main recipe IDs.
- `PUT /api/recipe-imports/{recipeId}/ingredients/{ingredientId}`: accept the existing ingredient write shape from the existing rematch builder, verify the selected canonical source, update staged content and promote newly complete recipes/dependency parents transactionally. Returns an import summary with `promotedRecipeIds` and `quarantined`. The reserved ingredient key `new` supports adding the first ingredient to an empty staged recipe through the same search popup. Invalid/unavailable/foreign matches fail without removing staged content.
- API client methods: `getQuarantinedRecipes()`, `decideRecipeImport(batchId, action)`, and `resolveQuarantinedIngredient(recipeId, ingredientId, data)`; existing native import callers share the missing-record decision dialog. Existing native validation/identity-conflict errors remain safe blockers.
- Owner backup stays v2 when no staged recipes, pending import decisions or retained unconfirmed standard-food package facts exist; otherwise it uses **v3**, with an explicit `pendingImports` section containing versioned owner batch context and staged payloads. V4 metadata retains the existing v4 envelope. The current reader/import restore validates and restores that section; older readers reject v3 rather than silently discard staged content. V3 main content must also pass link verification: if a source that was trusted on the exporting instance is unavailable on the recipient, affected main recipes enter quarantine while their source facts/portions and placements remain in owner batch context. Changing the envelope version cannot certify those facts or bypass verification. A non-restorable mix of incomplete legacy/manual main content plus staging fails backup generation rather than returning a v3 envelope the public importer cannot restore. Portable references into already-promoted dependencies must be remapped on restore. Staged writes/promotion and backup use the same transaction/snapshot boundary so a recipe is backed up either staged or promoted, never neither.

### Identical reimport after individual deletion

An accepted/materialized request-hash receipt records prior acceptance, not proof that its rows still exist. An explicit identical `POST /api/recipe-bundles/import` (including timestamp-only changes) reconciles missing recipe identities and effective book/chapter/page/recipe-placement claims inside the existing owner-locked transaction. It retains generated legacy identities and the receipt; it does not clear import history or run the original Merge/Replace again. Restored recipes/books appear in the ordinary `created` counts; deleted local IDs are not reused.

- Surviving edited recipes, book metadata, pages, dependencies and placement order remain authoritative. Exact retries with no missing content perform no content/receipt writes. A different payload still uses normal portable-identity conflict validation.
- Unaccepted receipts resume the existing decision unchanged. Existing mutable staged rows/repairs are retained, never replaced with original snapshots. Missing recipes re-enter link verification under prior acceptance; unavailable dependencies leave them quarantined without replaying deleted foods/templates/categories. Live templates may be reused by restored chapters without overwriting their contents.
- Replacement-superseded book claims remain suppressed. Unrelated imports, Keep and ingredient repairs cannot recreate deleted materialized book structure or removed placements for surviving recipes; they may append placements for newly promoted recipes.
- A newly conflicting same-title book during missing-book restoration returns HTTP 409 with the existing changed-target error, without writes. Old decision fingerprints do not authorize overwriting it; identical-receipt reconciliation does not offer a fresh Merge/Replace selection.
- Insert/validation/commit failures roll back reconciliation, including staging, placements and mapping changes. Concurrent identical imports remain duplicate-safe. Pending-import backup payloads are not replayed by a retry of the enclosing backup receipt.

## Native persistence and compatibility

The legacy import body is the bundle itself; duplicate-book decisions use a wrapper containing `bundle` and `bookDecisions`. Versions 1, 2, 3 and 4 are accepted where their corresponding pending-import/custom-nutrition metadata validates; unsupported versions fail with HTTP 400. The browser reader retains the supported pending-import section and rejects legacy ZIP input. The public import handler uses staging; the transaction-taking native persistence primitive is reused only for verified promotion/restore, not as a public unresolved-recipe bypass.

- Supplied portable food/recipe identities are validated and retained. Different identities never merge merely because names/nutrients match.
- Legacy objects without portable identities receive persisted local portable identities; an existing authorized origin mapping may identify a prior import, but content hashes/names do not establish identity.
- Reuse compares incoming content against current local content with transport/local IDs normalized. Unchanged reuse does not recreate ingredients or overwrite repairs.
- Conflicting recipe/custom-food identity returns HTTP 409 and rolls back the entire import. The retain-local/fork-incoming interaction is a later slice; conflicts are currently safe blockers, not automatic replacements.
- Imports serialize per owner, making identical concurrent imports duplicate-safe. Recipe shells and dependency mappings remain internal to verified promotion transactions. Batch cancellation never removes a staged recipe retained by another accepted/pending import; completed context is not replayed over later user edits.
- Structurally valid `usda`, `custom_food`, and `recipe` ingredient references may name a target absent from the package. Import preserves that source in `unresolvedSource`, preserves optional package `suppliedNutrition`, and does not create a dangling live link. Unknown source types, conflicting identity fields, unsafe structure and invalid numeric/basis data still fail validation.
- V2 bundle ingredients may include `position`, `zeroNutritionOverride`, and `suppliedNutrition`. Explicit positions must be present on every ingredient in that recipe and unique/non-negative; otherwise array order is used. Order-only changed content under the same portable recipe identity is a conflict.
- USDA `foodItems[]`, including portions, descriptions, provenance and per-100g facts, is unconfirmed package input, never a trusted shared-catalog ingestion path—even for an administrator. Only already available trusted database/USDA-ingestion records verify an FDC link; imported facts neither create nor overwrite shared standard-food rows. Absent records leave ordinary recipes quarantined. Whole-recipe custom totals retain their existing explicit authority, without certifying ingredient food facts. Owner batch context retains unconfirmed standard-food metadata/portions even if no staged rows remain or a food is unreferenced, and owner backup transfers it without publication. Offline restoration means retained data, not forced publication. Existing uncertain legacy catalog rows are reused, not automatically cleansed or reclassified.
- Available canonical sources are verified without rewriting unchanged ingredient snapshots. Exact receipts are not implicit repairs; an explicit Keep re-verifies an accepted pending batch after trusted ingestion. Deliberately repairing a match recalculates that ingredient and affected staged linked parents using the trusted current record/portions; unrelated snapshots and historical logs remain unchanged.
- Global category creation through native import requires a database-confirmed administrator; ordinary imports may reuse existing taxonomy by name/parent but cannot create/reparent/delete global categories. A missing category fails the materialization transaction with a validation error; any already-staged source context remains available, and an administrator must provision the taxonomy before retry/Keep. Imported templates are always owned non-default copies; package flags cannot publish defaults.
- Dataset manifests/preflight, reviewed supplied-fact publication and retain/fork conflict UI are deferred. The implemented import-only quarantine API does not introduce those workflows, migrate existing main data, or change published queries.
