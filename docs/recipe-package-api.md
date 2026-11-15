# Recipe package API: native transfer and import-only quarantine

Authoritative scope: the current user revision in `specs/recipe-nutrition-quarantine.md`; execution evidence and deferred work: `specs/recipe-nutrition-quarantine-plan.md`. All routes below require authentication. The implemented workflow stages imports separately and promotes complete recipes; dataset preflight/inventory and legacy recipe migration are not part of it.

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

## Import/quarantine API

This import-only workflow supersedes direct publication of incomplete imported recipes. No dataset inventory/preflight UI is added. Main recipes and normal book joins contain only promoted imports; normal selected JSON/PDF export never reads staged rows. Owner backup explicitly preserves staged imports as described below.

- `POST /api/recipe-bundles/import`: stage the whole bundle first and verify actual links. A complete batch may promote immediately. Missing links return the ordinary import summary plus optional `pendingImportId`, `requiresDecision: true`, `quarantined`, and `promotedRecipeIds`. No main writes occur until the user accepts a batch requiring a decision.
- `POST /api/recipe-imports/{batchId}/decision`, JSON `{ "action": "keep" | "cancel" }`: keep promotes complete recipes and retains unresolved rows; cancel discards only this unaccepted incoming batch. Earlier quarantine is untouched. Returns an import summary. No whole-library reset or deletion of reused main objects implements undo.
- `GET /api/recipe-imports`: return an array of owner-only `QuarantinedRecipe` objects: `{ id, batchId, requiresDecision, recipe: RecipeRecord, unresolvedIngredients: [{ ingredientId, reason }], bookTitles: string[] }`. This reads staged recipes/import context exclusively, cumulatively across batches. Unaccepted batches remain resumable after refresh, including batches reusing another import's staged identity. Decision-only records cannot be edited as recipe rows; choose Keep/Cancel first. Editable IDs are durable staging IDs, not main recipe IDs.
- `PUT /api/recipe-imports/{recipeId}/ingredients/{ingredientId}`: accept the existing ingredient write shape from the existing rematch builder, verify the selected canonical source, update staged content and promote newly complete recipes/dependency parents transactionally. Returns an import summary with `promotedRecipeIds` and `quarantined`. The reserved ingredient key `new` supports adding the first ingredient to an empty staged recipe through the same search popup. Invalid/unavailable/foreign matches fail without removing staged content.
- API client methods: `getQuarantinedRecipes()`, `decideRecipeImport(batchId, action)`, and `resolveQuarantinedIngredient(recipeId, ingredientId, data)`; existing native import callers share the missing-record decision dialog. Existing native validation/identity-conflict errors remain safe blockers.
- Owner backup stays v2 when no staged recipes or pending import decisions exist; otherwise it uses **v3**, with an explicit `pendingImports` section containing versioned batch context and staged payloads. The current reader/import restore validates and restores that section; older readers reject v3 rather than silently discard staged content. V3 main content must also have valid links: changing the envelope version cannot bypass staging verification. A non-restorable mix of incomplete legacy/manual main content plus staging fails backup generation rather than returning a v3 envelope the public importer cannot restore. Portable references into already-promoted dependencies must be remapped on restore. Staged writes/promotion and backup use the same transaction/snapshot boundary so a recipe is backed up either staged or promoted, never neither.

## Native persistence and compatibility

The body is the bundle itself, not a wrapper. Versions 1, 2 and supported v3 pending-import envelopes are accepted; unsupported versions fail with HTTP 400. The browser reader retains the supported pending-import section and rejects legacy ZIP input. The public import handler uses staging; the transaction-taking native persistence primitive is reused only for verified promotion/restore, not as a public unresolved-recipe bypass.

- Supplied portable food/recipe identities are validated and retained. Different identities never merge merely because names/nutrients match.
- Legacy objects without portable identities receive persisted local portable identities; an existing authorized origin mapping may identify a prior import, but content hashes/names do not establish identity.
- Reuse compares incoming content against current local content with transport/local IDs normalized. Unchanged reuse does not recreate ingredients or overwrite repairs.
- Conflicting recipe/custom-food identity returns HTTP 409 and rolls back the entire import. The retain-local/fork-incoming interaction is a later slice; conflicts are currently safe blockers, not automatic replacements.
- Imports serialize per owner, making identical concurrent imports duplicate-safe. Recipe shells and dependency mappings remain internal to verified promotion transactions. Batch cancellation never removes a staged recipe retained by another accepted/pending import; completed context is not replayed over later user edits.
- Structurally valid `usda`, `custom_food`, and `recipe` ingredient references may name a target absent from the package. Import preserves that source in `unresolvedSource`, preserves optional package `suppliedNutrition`, and does not create a dangling live link. Unknown source types, conflicting identity fields, unsafe structure and invalid numeric/basis data still fail validation.
- V2 bundle ingredients may include `position`, `zeroNutritionOverride`, and `suppliedNutrition`. Explicit positions must be present on every ingredient in that recipe and unique/non-negative; otherwise array order is used. Order-only changed content under the same portable recipe identity is a conflict.
- USDA `foodItems[].portions` retains food-specific gram weights through native/owner-backup transfer. Available canonical sources are verified without rewriting unchanged ingredient snapshots. Deliberately repairing a match recalculates that ingredient and affected staged linked parents; unrelated snapshots remain unchanged.
- Dataset manifests/preflight, reviewed supplied-fact publication and retain/fork conflict UI are deferred. The implemented import-only quarantine API does not introduce those workflows, migrate existing main data, or change published queries.
