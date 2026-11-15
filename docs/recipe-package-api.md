# Recipe package API: incremental v2 foundation

Authoritative target spec: `specs/recipe-nutrition-quarantine.md`. Execution evidence and unfinished work: `specs/recipe-nutrition-quarantine-plan.md`. All routes below require authentication. This checkpoint is **not** the completed database-preflight/quarantine workflow.

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

Ready-only filtering is not enabled by this foundation.

## POST /api/recipe-bundles/owner-backup

The request has no selection body. The authenticated server enumerates every recipe and book owned by the caller, including unresolved/incomplete recipes, then returns the same native v2 bundle envelope.

- Administrator status does not expand top-level enumeration to other users' content.
- The backup includes ingredient order/groups, zero intent, unresolved identities, supplied facts, categories, books, chapters, pages, referenced templates, joins, and authorized dependency closure.
- Missing ingredient source targets remain explicit unresolved references with their snapshots/facts.
- Inaccessible private dependencies, malformed stored groups, missing referenced templates, enumeration failures, and operational dependency lookup failures fail the request; no partial bundle is returned.
- This is a lossless recipe/book backup purpose, not a full account-data export. It does not include profiles, food logs, weights, or meal plans.
- A valid empty bundle is returned when the owner has no recipes or books.
- Enumeration and every dependency/authorization read share one read-only PostgreSQL REPEATABLE READ snapshot, established by the first query. Later committed changes are excluded. Transaction begin/read/validation/commit failure returns no successful bundle. This is not atomic with a later account-deletion request; edits after the snapshot are not protected.

The Settings and AppNav account-deletion flows must use this endpoint before deleting an account; their client integration is tracked separately in the implementation plan.

## POST /api/recipe-bundles/import

The body is the bundle itself, not a wrapper. Versions 1 and 2 are accepted; unsupported versions fail with HTTP 400. The browser file reader accepts v1/v2 JSON and still rejects legacy ZIP input; it does not add format adapters or replace server validation.

- Supplied portable food/recipe identities are validated and retained. Different identities never merge merely because names/nutrients match.
- Legacy objects without portable identities receive persisted local portable identities; an existing authorized origin mapping may identify a prior import, but content hashes/names do not establish identity.
- Reuse compares incoming content against current local content with transport/local IDs normalized. Unchanged reuse does not recreate ingredients or overwrite repairs.
- Conflicting recipe/custom-food identity returns HTTP 409 and rolls back the entire import. The retain-local/fork-incoming interaction is a later slice; conflicts are currently safe blockers, not automatic replacements.
- Imports serialize per owner, making identical concurrent imports duplicate-safe. Recipe shells and dependency mappings remain internal to the transaction.
- Structurally valid `usda`, `custom_food`, and `recipe` ingredient references may name a target absent from the package. Import preserves that source in `unresolvedSource`, preserves optional package `suppliedNutrition`, and does not create a dangling live link. Unknown source types, conflicting identity fields, unsafe structure and invalid numeric/basis data still fail validation.
- V2 bundle ingredients may include `position`, `zeroNutritionOverride`, and `suppliedNutrition`. Explicit positions must be present on every ingredient in that recipe and unique/non-negative; otherwise array order is used. Order-only changed content under the same portable recipe identity is a conflict.
- Full database manifests/preflight, reviewed supplied-fact promotion, readiness/quarantine APIs, retain/fork conflict UI and regular export gates are still tracked in the plan. Do not infer those behaviors from the storage contract alone.
