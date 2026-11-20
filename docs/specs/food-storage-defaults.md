# Per-user storage defaults for matched foods

## Objective and user value
When a user chooses where to store an ingredient linked to a specific database food, remember that location so future uses of that same food in recipes preselect it. Let users explicitly revise the default without rewriting existing recipes.

## Accepted behavior
- A first saved nonempty location in the existing ingredient editor for a matched USDA food (by FDC ID) or custom food (by user-owned ID) sets that user's default for that database item, only if no default exists. A choice for a manually entered or linked-recipe ingredient remains specific to that recipe. An ingredient may be added without a location; its first later saved choice still establishes the default.
- On a later addition of the same database food, its default is preselected as the new ingredient's recipe-specific storage location, persisted with the ingredient, and shown as a location tag on its collapsed recipe tile. On rematch, preserve a previously chosen nonempty recipe-specific location (per `ingredient-database-match.md`); if none was chosen, preselect the new food's default. Merely editing a recipe-specific location does not overwrite an existing default. If the optional defaults lookup fails, adding/rematching still proceeds with a blank default rather than blocking the ingredient operation.
- Provide an accessible **Update default** action next to the existing **Store in** dropdown in the recipe ingredient editor. It saves the selected location to both the current recipe ingredient and, for a matched item, the user's default; future ingredient additions use the new default. It changes no other recipe entries. Use a clear disabled state if no database match or no selected location.
- Preferences are per authenticated user and stored in PostgreSQL through the Go API; users cannot read or mutate other users' preferences. Do not modify USDA food rows shared across users. Keep React Query as owner of server state. On updating an ingredient with a first location, insert its default only if absent in the same transaction; explicit default changes replace it.
- The combined action clearly reports success only after both writes succeed, and reports partial failure accurately. Empty/invalid locations never become defaults; the first-choice behavior must not overwrite an explicitly changed default.

## Affected systems and boundaries
Go storage preference schema, store methods, authenticated API route/validation and API docs; frontend API client/types, Next.js API proxy, recipe-ingredient creation/edit/rematch flows in `src/hooks/use-recipes.ts` and `src/app/(app)/recipes/page.tsx`, and focused integration/UI tests. Existing recipes and recipe-bundle JSON remain unchanged. No new dependency or service.

## Testing strategy
Write failing Go integration tests for first-write-wins, explicit replacement, per-user isolation, invalid IDs/locations, and behavior for deleted custom food. Write failing frontend tests for default preselection on repeated food use and the Update default button, including a failed API call. Implement smallest behavior, then run focused Go/Vitest tests, typecheck and relevant lint/browser checks.

## Verification evidence
Focused frontend tests cover default lookup, custom-food identity and the explicit control. Go handler/store integration tests cover first-write-wins, explicit override, manual/rematch exclusion, validation, per-user isolation, custom-food deletion, ownership and no retroactive edits; a separate failing database constraint test reproduced a missing custom-food reference and passed after tightening the migration. `go test ./...` passed against a disposable PostgreSQL database, and 185 frontend tests, TypeScript checking and full lint pass. Interactive browser verification was not available.

## Documentation
Update `PROJECT.md`, `ARCHITECTURE.md` and `DECISIONS.md` for per-user preference ownership/persistence, and `../final_docs/api_contract.md` (or equivalent) for API changes. Only update `NUTRITION_DOMAIN.md` if food-nutrition behavior changes (not expected).

## Implementation notes

The `/api/food-storage-defaults` endpoint must be included in `src/proxy.ts` so authenticated client requests reach the Go API; otherwise the Next.js app returns 404 and blocks ingredient rematching while fetching defaults.
The existing recipe UI adds a food without choosing storage; first-choice insertion therefore belongs to the first saved location edit, not the add action. To avoid accidentally setting a default on rematch or unrelated edits, only first-insert when the same matched food's prior ingredient storage was empty and the user saves a nonempty location. Current custom-food search loses the real custom-food ID by generating a synthetic FDC ID; repair that identification as part of supporting custom-food defaults, without treating manually entered items as reusable database foods. Keep first-choice insertion atomic with the ingredient update, and ensure the ingredient ID actually belongs to the authorized recipe. Preserve all existing uncommitted recipe edits.
