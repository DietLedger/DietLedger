# Spec: Dependency-Aware Recipe Import/Export and Nutrition Quarantine

## Status
Approved for incremental implementation following current-code review and the user's approval of the six proposed resolutions and phased plan. Current phase accepts standard DietLedger package-shaped files, including files with missing nutrition/linkages. Third-party format adapters are explicitly deferred. Packages carry available user-generated nutrition and linked-recipe dependencies; standard-food dependencies use stable identities and a database preflight; quarantine handles unresolved dependencies and promotion of reviewed source nutrition into shared custom food records.

The user delegated identity design and requires immutable identities preserved across DietLedger instances. Selected design: stable portable identities, with provider-issued food IDs for standard foods and persist-once UUID identities for DietLedger foods/recipes; local storage keys may be mapped safely. Details below. Implementation starts from the reviewed baseline; see `recipe-nutrition-quarantine-plan.md` for ordered, verifiable tasks. The user permits resetting experimental local data, so no speculative reconstruction of ambiguous legacy identities is required. No remote database reset or deployment is implied.

This approved design supersedes the requirement in `specs/recipe-markdown-import.md` to resolve every ingredient before saving an import, and revisits `docs/Import_design.md` on embedded standard foods and identity handling. Enable the replacement workflow incrementally only after durable repair and backup safeguards exist; see execution evidence in the plan.

## Objective and user value
Make standard recipe/book package transfer work correctly both between DietLedger libraries and for package-shaped files missing nutrition/linkages. Complete packages should arrive with working links because included user-generated dependencies are imported before their dependents and standard-database references are checked before import. Quarantine is the repair/fallback workflow, not a requirement to manually rematch every native import. Arbitrary third-party formats are a later improvement.

Success means a fully supported native package imports ready to use with all links intact; users are warned about missing standard databases and may deliberately continue into quarantine; incomplete standard-shaped packages preserve available facts for explicit promotion into shared custom food records. Recipe text, book organization and saved repair progress survive throughout.

## Requirements from the request
- Current phase supports the standard DietLedger package format, including packages with missing ingredient nutrition/linkages. Do not build new third-party format adapters in this phase; preserve existing markdown behavior while integrating its quarantine rules.
- Native packages contain the full transitive closure of referenced user-generated nutrition entries and other recipes. Import dependencies before dependent recipe content, preserving their identities/linkages under the approved ID policy.
- References to standard databases retain the original standard record IDs and identify their source database. Exports disclose active standard databases; import preflight explains any missing database and offers import-first or explicit continue-without-it.
- Continuing without a required standard database preserves affected references as unresolved and puts affected recipes into quarantine rather than fabricating nutrition or dropping ingredients.
- Non-native ingredient nutrition, when available, is preserved for an explicit quarantine-screen action to add it as a shared custom nutrition entry and link the ingredient.
- Any recipe containing an ingredient without a nutrition-data link or an intentional zero-nutrition override is quarantined, not just recipes with entirely missing nutrition.
- Manually entered nutrition is valid when saved as a shared food-database record available for selection by all users, with the ingredient durably linked to that record. Manual entry must not create only an unlinked recipe-specific snapshot.
- One filterable page lists quarantined recipes as individual expandable cards.
- Expanding a card shows only ingredients missing nutrition data.
- Each ingredient has a button opening a popup food search; selecting a food saves its nutrition match.
- A successfully resolved ingredient disappears from the card. The card disappears when all ingredients are resolved.
- Original standalone/book/chapter/category placement survives quarantine and resolution.
- Quarantined recipes do not appear in recipe search, appear greyed out in books, and are not included when exporting books.

## Native package and dependency workflow
### Package contents
- Carry recipes, books/chapters/pages/order, linked-recipe dependencies and all user-generated/custom nutrition records required by those recipes, recursively. A linked recipe's own food/recipe dependencies are included too.
- Every ingredient reference identifies whether it targets a standard database record, packaged custom food, packaged linked recipe or explicit zero override. Do not rely on matching names or nutrient snapshots to reconstruct identity.
- Standard foods normally reference the recipient's installed standard databases, not automatically turn into new custom foods. Define backward compatibility for existing bundles that embed standard food rows; embedded rows must not bypass an explicit decision to continue without their standard database.
- Include a standard-database manifest describing the exporting library's active databases and releases/versions. Distinguish library inventory from the subset actually required by this package, so an unrelated active dataset does not become an unnecessary import prerequisite. Required references identify the canonical `usda:fdc:<fdcId>` record plus separate dataset/release provenance. The aggregate FDC Full Download is an installation artifact, not a fifth supported database.
- Keep explicit zero overrides and native custom-food source identities intact through round trips. Do not fabricate USDA IDs for custom data.

### Preflight and standard-database handling
- Inspect/validate the package and manifest before committing recipe import. Show source databases/releases, recipient availability, missing/incompatible requirements and affected recipes/ingredients.
- Offer **Import required database first**, **Continue without database**, or cancel. Reuse current database-import facilities; bulk database installation remains administrator-only unless separately approved. Ordinary users must be able to continue into quarantine or return after an administrator installs the data.
- Do not start recipe import while a selected prerequisite database is still importing or has failed. Recheck readiness after installation; a job record alone is not evidence that the referenced data exists.
- If the user explicitly continues without a required database, keep the original source identity/provenance with the unresolved ingredient, retain all recipe content/placement, and quarantine it. Do not create dangling live foreign-key links or mark it ready because the package carried a nutrient snapshot.
- When a standard record is missing even though its database is reported active, flag the specific unresolved reference rather than silently accepting the dataset-level status.
- Maintain authoritative active-database inventory consistent with completed/failed imports, partial installs, clearing/removal and cached individual records. The existing dataset catalog and seed-job history are inputs, not automatically a complete inventory contract.
- A later prerequisite installation must make retained standard references repairable without reimporting recipe text or losing user repairs. The owner explicitly invokes Recheck links; the server verifies inventory and each retained identity before clearing blockers. Do not silently replace saved repairs or release recipes in the background.

### Dependency-first commit and identity
- Validate dependency closure and collisions before writes. Persist/reuse packaged custom nutrition first, then linked recipes in dependency order, then their dependents and book structure. Ensure recipes are not externally visible as complete until the relevant transaction commits.
- Existing shell-first/hydrate-later mechanics may be used internally only if consistent with the approved identity/order policy and no partially hydrated state is exposed. Cycles or missing packaged dependencies must produce an explicit validation/blocker outcome, never an infinite traversal or silent ID replacement.
- Reimports must be duplicate-safe, preserve consistent references and never overwrite an unrelated user's object because an ID matches.
- **Selected identity design (user delegated):** preserve immutable portable object identities across all instances; do not require identical internal row keys. Keep current local-key remapping where necessary for ownership/collision safety. Extend rather than replace existing import mappings.
- Standard USDA food-record identity is `usda:fdc:<fdcId>` for all four supported FoodData Central data types: Foundation Foods, SR Legacy, Survey (FNDDS), and Branded Foods. FDC IDs share one provider-wide record namespace and identify the exact published record; dataset family/release belongs in provenance/preflight metadata, not in the canonical ID. USDA assigns a new FDC ID when a published record changes, so NDB numbers, FNDDS food codes, GTIN/UPC values, and upstream history keys are typed aliases/lineage—not substitutes that silently rewrite an ingredient to a newer record. Never use local `food_items.id`, names, nutrients, or nutrient-definition IDs as provider identity. See `docs/standard-food-identity-and-distribution.md`.
- USDA nutrient IDs/numbers identify nutrient definitions, not foods: e.g. energy IDs 2048/2047/1008 and numbers 958/957/208. Their existing ingestion mapping remains separate from food identity and is not rewritten by this feature.
- DietLedger-generated shared foods and recipes receive a namespaced UUID portable identity once at original creation/upgrade. Persist it, export it, retain it unchanged on import and all later reexports, and make it immutable through update APIs. Never regenerate it on import or derive it from editable names/nutrient values. Nutrient corrections do not change object identity; a deliberately independent fork/copy gets a new identity.
- Other standard providers use `<provider namespace>:<stable source record ID>`. If a supported dataset lacks stable record IDs, its canonical DietLedger dataset identity manifest must assign the portable IDs once and distribute the same mapping to every installation; do not generate unrelated IDs independently at each installation. No new provider adapter is added in this phase.
- Backfill existing local objects once and persist their portable identities. Reuse existing persisted origin mappings/portable IDs when provable; unknown legacy identity must not be guessed from a matching name. An independently recreated food with the same name is not automatically the same object.
- Repeated import of the same portable ID and matching content reuses the authorized existing object. Same-ID/different-content is an explicit conflict, not a silent overwrite or identity change. Recipe local ownership remains scoped per recipient; portable identity alone grants no edit access to another user's copy. A dependency conflict blocks the entire import transaction until an explicit retain-local or fork-incoming decision, or cancellation. Revalidate decisions against current local content at commit. Distinct portable IDs must never merge solely because their content or names match. Retaining local content preserves repairs; forking creates a new portable identity and remaps incoming dependents with duplicate-safe retries. Export v2; accept v1 through a conservative compatibility reader without inferring missing identity or intentional zero from snapshots.

## Standard-format packages with missing nutrition/linkages
- Accept files in the standard package format even when ingredients lack links and/or nutrition, preserving text/amount/unit, recipe metadata, instructions, available source facts and placement. Normalize absent link metadata to an explicit unresolved state; do not reject a structurally valid recipe simply because nutrition is missing. Unresolved references retain available original identities for repair, without dangling live database links.
- Distinguish incomplete nutrition from invalid structure/unsafe data. Validate numeric values and authorization normally. Do not claim support for new third-party file formats; those adapters are deferred.
- Missing trustworthy standard/custom-food links enter quarantine even when the source has numeric nutrition values. Retain those supplied values and their units/basis/provenance as unconfirmed import data; do not publish them to the shared custom database automatically.
- For a quarantined ingredient with usable imported facts, offer **Import supplied nutrition as custom food**. Show the facts and their per-100g/per-serving basis for review, allow correction, then persist a shared custom food and durably link the ingredient. The resulting food is searchable/selectable by all users and resolves that ingredient.
- Manual entry of missing facts follows the same shared-record-and-link path. Searching an existing food or deliberately selecting no nutrition remains available.
- Whole-recipe nutrition labels are not ingredient-level facts. Preserve any supplied label as unconfirmed source data, but do not divide its totals among ingredients or silently resolve them. New whole-recipe-label/composite-food import behavior is deferred; it does not block this standard-package phase.
- Shared publication needs explicit user confirmation, validation, retry behavior and durable source identity; avoid duplicate custom records when a save is retried. Do not lose the supplied unconfirmed facts on refresh before review.

## Approved defaults
1. Apply the same rule to existing recipes and later edits, regardless of import origin. A recipe can re-enter quarantine if an ingredient loses its valid match.
2. Route: `/recipes/quarantine`, linked prominently from Recipes and from greyed-out book tiles. One card per recipe even when it belongs to multiple chapters/books.
3. Filters: recipe-name text, unresolved-ingredient-name text, and book (including standalone/no book). Show unresolved counts and book/chapter context; paginate the recipe list after filtering.
4. Apply regular book-export exclusions to both printable PDF and native bundle JSON. Regular standalone recipe exports also exclude quarantined recipes, so a different regular-export entry point cannot bypass the rule. Show an omission notice/count. Lossless owner backups, especially backup-before-account-deletion, must instead preserve quarantined recipes and their placement/provenance; this explicit backup distinction is approved.
5. A valid link to an owned, nutrition-complete recipe can resolve a recipe-as-ingredient. A missing or incomplete linked recipe blocks its parent too. Resolve the source recipe rather than replace it with a food match. Detect dependency cycles and show an actionable blocked state, not an infinite traversal.
6. Empty recipes remain editable but are incomplete, not automatically nutrition-ready. Show an empty-recipe explanation and link to the editor instead of an empty card that cannot be resolved.

## Confirmed manual-nutrition behavior
- Offer manual nutrition entry as a resolution path, including from ingredient matching. Save the entered facts in the shared food database and link the recipe ingredient to the saved entry.
- The saved entry remains searchable/selectable by all users, not only its creator. A valid link to this entry resolves the ingredient exactly as a valid food-database match does.
- Do not confuse a private existing custom food with the newly required shared manual-entry record. Existing private-food ownership permissions are not implicitly changed.
- Legacy manual snapshots without a durable link are not silently considered linked. Define a user-reviewed conversion/relinking path in the technical plan; do not reconstruct per-100g food facts from an ambiguous quantity/unit or publish recipe-specific snapshots as if they were normalized food records.
- All-zero manual input still requires an intentional no-nutrition choice; merely saving an empty nutrient form must not resolve an ingredient.

## Domain definition
The Go API owns the authoritative completeness decision. Do not infer completeness from calories or aggregate recipe totals.

| Ingredient source | Resolution rule |
| --- | --- |
| Standard-database food (including USDA) | Valid source database and stable record identity resolving to available meaningful canonical nutrient data; zero-calorie foods such as salt remain valid when another canonical nutrient is positive. Skipped/missing database references remain unresolved. |
| Unconfirmed package-supplied nutrition | Preserved source facts are not yet a valid link. Explicitly import reviewed ingredient facts as a shared custom food and link the ingredient to resolve it. |
| Shared manually entered food | Valid durable shared food-database identity with user-entered meaningful canonical nutrition; searchable/selectable by all users. Counts as resolved. |
| Existing private custom food | Valid existing food owned by the recipe owner, with meaningful canonical nutrient data. Existing private-food permissions remain unchanged. |
| Intentional no-nutrition override | Explicitly recorded user choice with an all-zero canonical nutrient snapshot. |
| Linked recipe | Valid same-owner source recipe, complete under the approved dependency rule above. Foreign/unavailable dependencies remain blocked with an explanation and owner-editor repair path; no new cross-user edit access is granted. |
| Unlinked manual snapshot / unknown source | Unresolved until linked to a saved food entry (including shared manually entered food) or given an explicit zero-nutrition override. |
| Broken/deleted/mismatched identity | Unresolved; existing nutrient values alone do not prove a valid link. |

- A numerical zero is not evidence of a deliberate override. Never automatically mark legacy blank or zero ingredients as intentional overrides.
- Preserve the existing explicit `fdcId = -3`, `sourceType = manual` choice when reading local ingredients. Unlike a generic `manual` source or `fdcId = -2`, it records an intentional choice.
- Both markdown saving and bundle round trips currently lose this distinction; markdown saving also loses selected custom-food identity. Fix these transfer boundaries as part of this feature rather than assuming old snapshots preserve intent.
- Approved design: add a durable `zeroNutritionOverride` ingredient boolean, default false, serialized through API and native bundles; migrate only provable existing `manual/-3` choices. Validate that an enabled override has all canonical nutrients zero and no conflicting food/recipe link. Confirm schema and compatible bundle versioning in the technical plan. Old ambiguous manual-zero records/bundles remain unresolved, not silently trusted as overrides.
- Existing recipe nutrient snapshots and historical food logs are not rewritten merely because quarantine is introduced.
- Matching an ingredient recalculates its snapshot using its current amount/unit and existing food-specific conversion behavior, preserves its recipe-specific name/group/preparation/storage details, and refreshes displayed recipe totals.
- Linked-recipe readiness and linked nutrient snapshots must remain consistent. The technical plan must specify current-recipe snapshot refresh on dependency resolution before a parent is released; historical food-log snapshots remain unchanged.

## Workflow and UI acceptance criteria
### Import
- Markdown and native bundles (including setup/demo and settings entry points) can persist unresolved ingredients without fabricating food links or zero overrides.
- Preserve recipe metadata, ingredient groups, quantities, units, preparation instructions, directions, import identity mappings, book pages, chapters, categories, and ordering.
- Retain numeric validation and authorization. Permit missing standard dependencies after the user confirms continue-without-database; missing nutrition links or packaged food/recipe dependencies become explicitly reported quarantine blockers in otherwise valid standard-format packages, not silent omissions. Native exports must still include the complete custom/recipe dependency closure. Unsafe structural errors remain validation failures. Replace any silent same-identity/different-content overwrite behavior with the selected explicit conflict policy; report effects on local repairs/readiness.
- Community/share imports also receive the same readiness classification, but repairing those importers' unrelated content-copy or dependency-remapping defects is not implicitly included. Surface any defect that prevents the approved quarantine journey before implementing a broader repair.
- Import completion reports which saved recipes need nutrition matching and links to the quarantine page. Fully resolved imports are immediately available.
- An interrupted or failed import must not expose a partially hydrated recipe as complete. Markdown currently saves via several requests; replace that import save sequence with an atomic server-side recipe write containing all intended ingredients, including unresolved ones, plus metadata/groups. Readiness cannot detect ingredients that were never persisted. Specify safe retry behavior before implementation; a failed transaction must not leave a partial recipe or a retry-created duplicate.

### Quarantine page
- Authenticated users see only recipes they own and can edit; no instance-wide queue or new admin-edit permission is introduced.
- Each collapsed card shows recipe name, unresolved count, and placement context. Multiple cards can expand independently.
- Expanded rows show ingredient name, quantity/unit, and a `Link nutrition` button; linked-recipe blockers instead identify and link to the source recipe needing repair.
- The popup reuses existing local/USDA/custom-food search and meaningful-nutrition eligibility, including shared manually entered foods. It offers manual nutrition entry that creates a shared selectable record and links the ingredient, plus an explicit `Use no nutrition` action. When source facts exist, also offer the reviewed **Import supplied nutrition as custom food** action from quarantine. It has internally scrollable content/results, keyboard-accessible controls and loading/empty/error states.
- Manual-entry success requires both the shared food record and ingredient link to persist before the ingredient row disappears. Failure must not report resolution or publish invalid food facts. Specify transaction/retry/deduplication behavior in the technical plan.
- Selecting a food or deliberate override saves through the authenticated Go API. Do not remove the row until the server confirms success. Cancel or save failure leaves the unresolved row intact with an error.
- After success, refresh authoritative completeness, affected recipe totals, queue counts, recipe selectors, book views, and export candidates through React Query.
- Resolve the last missing ingredient: the card disappears and the recipe becomes available in every original location without a separate release/move action. Refreshing or navigating away preserves all saved progress.
- Filters operate on the whole eligible queue before pagination. Resolving the last result on a page must not strand the user on an empty page while more results exist.

### Search, books, and exports
- Ordinary recipe discovery/search and recipe pickers do not offer quarantined recipes. This includes community search, which has a separate server query and shared snapshots; classify the actual stored share content separately from live owner recipes. Direct share-link visibility permissions remain unchanged. Explicit owner management/search, editing and quarantine lookup include incomplete drafts; existing-reference hydration must retain authorized referenced content.
- Separate discovery/selection queries from existing-reference hydration. Shared `useRecipes` consumers include historical plans, groceries, kitchen dependencies and backups; do not globally filter their cache and silently lose referenced records. Use explicit read purposes and distinct React Query keys where responses differ.
- Book placement rows remain in storage and on-screen in their original order, with muted styling and a text badge/reason, not colour alone. The repair action opens quarantine without enabling normal recipe-use actions.
- Regular export readiness is enforced by the Go API for bundle candidates and actual payload construction, including requests made directly with recipe IDs. Browser-side filtering alone is insufficient. A clearly separate authenticated owner-backup purpose may retain unresolved content; it must not silently become the default regular cookbook export.
- Account deletion currently downloads a bundle through that same endpoint and then deletes the account. Preserve all quarantined recipe content and joins in that owner backup; block deletion if the required backup request fails. Do not claim this narrow recipe/book backup includes unrelated account data. Cover this destructive flow before enabling any global export filter.
- PDF book construction uses authoritative readiness and omits quarantined recipe pages and their table-of-contents entries. Preserve existing eligible PDF content and relative order. The current PDF exporter does not include book/chapter prose pages; adding those pages is out of scope. Native JSON export must continue preserving its existing book/chapter pages.
- Native book bundles omit quarantined recipes and their `chapterRecipes` joins. Do not emit dangling linked-recipe references or accidentally re-add excluded recipes through dependency traversal.
- Include all eligible user-generated food and linked-recipe dependencies and preserve categories, templates and explicit zero overrides through native round trips. Standard-food references use the active-database manifest/preflight policy above; do not require a full standard database inside every recipe package. Existing private custom-food inclusion/publication must be explicit and authorized, not bulk-publish unrelated private records.
- Existing food-log/history snapshots remain available and unchanged. Redesigning meal-plan history, general nutrition calculations, sharing permissions, or full-account backup coverage is outside this feature; the narrow lossless recipe/book backup safeguard above is necessary to prevent data loss.

## Existing implementation and affected systems
- `src/lib/recipe-import.ts`, `src/components/recipe/recipe-import-dialog.tsx`, `src/app/(app)/recipes/page.tsx`: markdown drafts, pre-save matching gate and browser save orchestration.
- `src/lib/recipe-bundles.ts`, setup/settings imports, `sync-server/import_bundle.go`: native package contracts, dependency closure/order, ID policy, preflight/confirmation, source metadata and export traversal.
- `src/lib/usda-datasets.ts`, `src/components/food-database-panel.tsx`, `sync-server/seed.go`, `handlers_food.go`, food/seed repository methods: standard-database inventory, release/provenance and administrator-only prerequisite installation.
- Durable unconfirmed package-supplied ingredient-nutrition storage and immutable portable identities: exact schema/contracts to be selected in the technical plan. No new third-party adapters in this phase.
- `sync-server/models.go`, `repository.go`, `store_postgres.go`, `handlers_crud.go`, `server.go`: recipe/ingredient models, persistence, list/detail/write contracts and authorization.
- `src/lib/api-client.ts`, `api-client-go.ts`, `types.ts`, `recipe-types.ts`; `src/hooks/use-recipes.ts`, `use-books.ts`; `src/lib/query-keys.ts`: explicit API contracts and server-state invalidation.
- `src/components/recipe/ingredient-match-editor.tsx`: existing matching and deliberate no-nutrition behavior to reuse, adapting the search interaction to a popup rather than duplicating food-selection policy.
- `sync-server/migrations/`: approved changes for shared custom-food identity, durable explicit overrides, unconfirmed imported nutrition and database inventory/provenance as required; no separately persisted recipe quarantine state unless a concrete need is approved.
- Proposed route `src/app/(app)/recipes/quarantine/page.tsx` and a non-route testable component; navigation via the existing Recipes UI.
- `src/app/(app)/books/[id]/page.tsx`, `src/lib/pdf-export.ts` (`collectRecipes`), `src/app/(app)/export/page.tsx`, `sync-server/handlers_recipe_bundle.go`: disabled book presentation and actual export enforcement. `src/components/book-renderer.tsx` is currently a template-preview surface, not the PDF export gate.
- `src/app/(app)/settings/page.tsx` and `src/components/app-nav.tsx`: both backup-before-account-deletion flows must use owner-only server-enumerated backups; regular settings export uses the distinct regular purpose.
- `sync-server/handlers_sharing.go`, `store_postgres.go` (`SearchCommunityRecipes`): separate community discovery path requiring the approved search policy.
- Current-code review covered recipe search/picker consumers, community/import paths and book hydration. Shared hooks serve discovery, management and existing-reference hydration; migrate these consumers individually rather than globally filtering their cache. Unrelated existing community-copy defects are not included.

## Approved architecture
- Keep all recipes and their placement relations in the current PostgreSQL tables. Quarantine is eligibility derived by the Go API, not a second recipe store, a copied queue, or a background move job.
- Compute/read one authoritative completeness result for ordinary selection, quarantine management, book hydration and export. Avoid independently reimplementing rules in React, SQL variants and export code.
- Expose server-calculated readiness and unresolved reasons/counts in explicit recipe contracts. Add authenticated, paginated quarantine retrieval with approved filters; retain owner detail access to excluded recipes.
- Reuse existing ingredient writes and snapshot conversion behavior, adding server validation of source identity and explicit override as necessary. Do not trust a client-supplied `ready`/`quarantined` boolean.
- Persist manually entered food facts as shared PostgreSQL food records through authenticated Go API writes; all users can search/select them. Reuse current food persistence/search where suitable. Define their durable non-USDA source identity, normalized nutrient basis, validation, transfer behavior, and creator/admin edit/delete permissions in the technical plan. New shared visibility must not silently widen existing private custom-food permissions or allow arbitrary users to overwrite another user's ingredient snapshots.
- Fail closed on failed source/readiness lookups, but distinguish an operational error from a genuinely unresolved ingredient. Do not classify database errors as valid zero nutrition. Existing `ListRecipes` discards ingredient-hydration errors; readiness must not inherit that behavior and classify failed hydration as empty/complete.
- Scope quarantine placement/filter joins by the authenticated recipe and book owner independently. Do not reuse unscoped chapter APIs to expose another user's book metadata. Existing administrator export privileges do not imply administrator repair privileges.
- Use React Query for all server state; local state only for filters, expanded cards and popup interactions.
- No new dependencies, services, queues or schedulers. Any schema change needs approval in the technical plan.

## Approved implementation sequence
1. Detail the selected immutable portable-ID design, legacy migration/conflicts, database-manifest compatibility and imported-fact basis in a versioned standard-package/preflight/API contract. Approve small verifiable implementation tasks before coding; no new third-party adapters.
2. TDD native dependency closure/order, identity preservation under the approved policy, database manifest/preflight, explicit continue-without-database, and shared custom nutrition/zero-override round trips.
3. TDD authoritative readiness and authenticated quarantine reads/eligible selection, including unavailable standard databases, owner detail access and linked-dependency release. Verify counts/pagination and isolation in PostgreSQL integration tests.
4. Accept standard-format packages missing nutrition/linkages and atomically save all ingredients/source facts. Build quarantine promotion of reviewed ingredient facts/manual input into shared custom foods with cross-user selection tests. Integrate existing markdown entry points without adding a format. Verify interrupted imports, retries, duplicate reimports and placement preservation.
5. Build the expandable queue and popup matching with component interaction tests, reusing existing matching behavior and invalidating affected caches.
6. Apply book disabled presentation and both export gates; verify graph integrity, eligible dependencies, PDF contents and release across all placements.
7. Run broader checks, browser-test the complete workflow, review for bypasses and update governing documentation. No deployment is implied.

## Testing strategy
Use failing focused tests before each behavior change, then the smallest passing implementation. Extend existing Vitest and Go test conventions; no new testing framework.

Required evidence:
- Native transfers: recursive custom-food/linked-recipe closure; dependency-first completion; portable IDs/linkages survive export A -> import B -> export B -> import C unchanged despite differing local keys; USDA food identity remains based on FDC ID, not nutrient IDs; identity mutations are rejected; same-ID conflicts, ownership isolation and reimport deduplication; fully available native packages need no manual matching.
- Database preflight: source active/required database manifest, release mismatch, prerequisite import success/failure, ordinary-user permissions, cancel and deliberate skip. Skipping a required database quarantines precisely affected recipes despite imported numeric snapshots; active database with missing record remains unresolved.
- Incomplete standard-format packages: absent links/facts accepted as unresolved, missing dependency targets retained as quarantine reasons, ingredient-level supplied facts retained across refresh, reviewed custom-food promotion, cross-user selection, invalid/ambiguous serving basis, and whole-recipe labels never silently distributed among ingredients. No new third-party-format tests/adapters are required in this phase.
- Domain cases: mixed linked/unlinked ingredients, partial data, unlinked legacy manual snapshots versus valid shared-manual-food links, explicit zero versus accidental zero, salt/other zero-calorie meaningful foods, valid/deleted/foreign private custom foods, broken USDA/shared-food identities, empty recipes, linked-recipe dependency completion and cycles.
- Shared manual entry: facts persist in the database and produce a durable ingredient link; another user can search/select the same food; save/link failure leaves the ingredient unresolved; canonical nutrient normalization, authorization and export/import identity are retained. Historical snapshots and existing private-food visibility are unchanged.
- PostgreSQL/API workflows: existing/imported recipes classified consistently; filtering/counts before pagination; owner isolation; ingredient resolve/reopen transitions; durable queue state; book/chapter/category preservation; invalid writes rejected; actual export cannot be bypassed with direct IDs.
- Bundle compatibility: old ambiguous manual-zero data quarantines; explicit zero and custom-food identity survive new round trips; no dangling joins/dependencies; quarantine not reintroduced through book or linked-recipe export traversal.
- UI interactions: independently expanding cards, all filters, popup search/select/cancel/errors, explicit override, only unresolved rows visible, confirmed success removes rows/cards, counts refresh, last page handled and empty-queue state.
- Integration/browser journey: import mixed standalone/book recipes -> confirm search exclusion, greyed book tiles and regular-export omission -> resolve ingredients across sessions -> confirm automatic availability in original locations and correct recipe totals.
- Safety regressions: backup-before-deletion retains quarantined standalone and book content; failed atomic markdown saving leaves no partial recipe and retries safely; parent snapshots refresh before release; community-search behavior follows the approved scope; foreign book/chapter metadata never leaks.

Commands (run during implementation, not claimed by this draft):
```sh
npm test -- src/lib/recipe-import.test.ts src/hooks/use-recipes.test.ts
npm test -- src/lib/pdf-export.test.ts src/lib/export-selection.test.ts
npm test
npx tsc --noEmit
npm run lint
(cd sync-server && go test ./...)
npm run build:web
```
Add focused commands for new tests when their paths are agreed. Go integration tests require `TEST_DATABASE_URL` pointing to a disposable database: the existing helper drops and recreates its public schema. A skipped integration suite is not verification.

## Documentation updates when implementing
- `PROJECT.md`: complete/incomplete standard-package import workflows, deferred third-party adapters, database preflight, shared custom nutrition, quarantine discoverability and book/export behavior.
- `NUTRITION_DOMAIN.md`: completeness rules, explicit-zero provenance, valid shared manually entered food links, legacy snapshot handling and linked-recipe policy.
- `ARCHITECTURE.md`, `DECISIONS.md`: derived readiness ownership and any approved portable/source metadata change.
- `specs/recipe-markdown-import.md`, `specs/ingredient-database-match.md`, `docs/Import_design.md`: replace contradictory save gate, align matching and bundle contract/round-trip rules.
- Existing user/API documentation and frontend/backend contract types: new management query and readiness fields.
- `TESTING_STRATEGY.md` only if test policy/tooling or required coverage changes.

## Code style and boundaries
Follow current explicit Go handlers/store methods and TypeScript API/hook patterns. Keep presentation simple, with policy owned by the server:
```ts
await updateIngredient.mutateAsync({ ingredientId, updates });
// Use the confirmed server result/refetch, not a local "ready" guess.
```
- Always: use CodeGraph-first discovery where available, preserve ownership and snapshots, TDD behavior, verify scope and update this spec before discovered decisions are implemented.
- Ask first: unresolved domain policies, schema changes, incompatible bundle/API changes, broader sharing/history/backup behavior, added dependencies or scope changes.
- Never: treat all-zero nutrients as deliberate consent, silently invent nutrition, move/delete book placements on quarantine, release before confirmed persistence, or bypass API export checks.

## Approval record and resolved review decisions
- **Identity choice resolved:** user delegated design; use immutable portable IDs, provider-issued standard food IDs and persist-once DietLedger UUIDs, safe local mapping and explicit content conflicts as specified above.
- **Format scope resolved:** standard package-shaped input only for this phase, including missing nutrition/linkages. New third-party adapters and whole-recipe-label/composite import behavior are deferred.
- **Database compatibility approved:** separate verified active inventory from package requirements and individual record availability. A different release warns but does not alone block when the required dataset and referenced meaningful food exist. Missing/partial datasets require installation or explicit continuation; embedded/live-cache rows do not certify installation or bypass a skip. Recheck links is explicit and owner-initiated.
1. Shared publication and ingredient linking are one transaction with idempotent retries. Normalize to per-100g canonical units; per-serving facts require a known positive gram mass. Creator/admin editing is allowed, deletion while referenced is forbidden, and shared foods survive creator deletion under admin stewardship. Private foods remain private.
2. Readiness applies to existing recipes, edits, empty recipes and linked parents. Keep explicit owner management and existing-reference hydration separate from ready-only discovery/selection so drafts and historical references remain accessible.
3. Ambiguous legacy zeros remain unresolved. Persist explicit zero intent and do not invent portable identity from matching names/content.
4. Owner recipe/book backups enumerate all owned content server-side, retain quarantine and unresolved references/placement, and fail on operational retrieval errors or non-restorable structure. Verified fail-closed cases include malformed groups/preparation JSON, missing templates, inaccessible dependencies, conflicting referenced custom-food copies and category cycles/duplicate sibling names that native import cannot preserve. Both Settings and AppNav deletion flows stop on backup/download-construction failure. The export uses one read-only database snapshot; separate account deletion does not protect edits committed after that snapshot. This is not a full-account backup or confirmed-disk-save promise.
5. Ordinary community discovery is ready-only; direct share visibility permissions stay unchanged. Classify stored share content separately from live owner recipes. Do not silently broaden scope into unrelated community-copy repairs.
6. Go validates source identity and computes confirmed food matches from canonical server data, superseding the selected-client-search-snapshot-wins contract in the prior match spec. Refresh linked parents and ancestors synchronously using stored multipliers before release and after subsequent source edits; historical logs remain unchanged.
7. Missing/cyclic linked dependencies remain preserved quarantine blockers. Accessible sources have repair navigation; unavailable/cyclic sources also expose explicit parent-editor removal/replacement/relinking, not an impossible source-only repair loop.
8. No application code was changed before this approval. No new service, dependency, third-party adapter or deployment is authorized by this spec.
