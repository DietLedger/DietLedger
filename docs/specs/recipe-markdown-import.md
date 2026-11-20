# Spec: Markdown Recipe Import Workflow

> Successor approved: `recipe-nutrition-quarantine.md` supersedes this spec's mandatory pre-save matching gate. Enable unmatched saves with persistent quarantine/repair in the ordered plan, not before that path exists. Atomic recipe creation now supports metadata, groups, all ingredients and duplicate-safe request keys; replacing the browser save loop remains a separate slice. No new format adapter is included.

## Objective
Add a recipe import workflow on the Recipes page for markdown files matching the repository's `seed-recipes/*.md` format, excluding `seed-recipes/dist`. Users can select one or more recipe markdown files, review them in a queued modal workflow, match every imported ingredient to a database/USDA/custom-food entry, and save each recipe only when all ingredients are matched.

Assumptions for this first slice:
- Import source is user-selected markdown files in the browser, not a server-side directory scan.
- The initial supported format is the seed recipe markdown format: YAML front matter with `title`, optional prose, bullet metadata for prep/cook/servings, `## Ingredients` with optional `###` groups, and `## Directions` numbered steps.
- Imported ingredient nutrition must come from an explicit match to an existing food database/search result, manually entered nutrition facts, or an explicit zero-nutrition match for water/spices/trace ingredients; unmatched imported ingredients cannot be saved.
- Queue state is transient UI state and does not need persistence across refreshes.

## Tech Stack
- Next.js 16 / React 19 frontend
- TypeScript
- React Query for server state
- Existing Go API recipe/ingredient endpoints via `getApiClient()`

## Commands
- Focused parser test: `npm test -- src/lib/recipe-import.test.ts`
- Frontend tests: `npm test`
- Lint: `npm run lint`
- Build: `npm run build`

## Project Structure
- `src/lib/recipe-import.ts` — markdown parser and draft/matching helpers
- `src/lib/recipe-import.test.ts` — parser and save-readiness tests
- `src/components/recipe/recipe-import-dialog.tsx` — queued import modal UI
- `src/app/(app)/recipes/page.tsx` — adds the import button and save integration
- `recipe-markdown-import.md` — this source-of-truth spec

## Code Style
Use explicit, boring TypeScript functions and local component state. Keep domain persistence server-authoritative by creating recipes through the existing API and adding matched ingredients through existing ingredient endpoints.

```ts
const draft = parseSeedRecipeMarkdown(fileText, fileName);
if (!isImportDraftReady(draft)) return;
```

## Testing Strategy
- Unit test seed markdown parsing with realistic fixtures: front matter title, prep/cook/servings metadata, ingredient groups, ingredient prep instructions, and numbered directions.
- Unit test save readiness: recipes with all matched ingredients can save; any unmatched ingredient blocks save.
- Manual/browser verification is still needed for modal layout and search interactions.

## Boundaries
- Always: require all ingredients to be matched before save; preserve ingredient groups and direction order; use existing recipe and ingredient API endpoints.
- Ask first: adding new backend endpoints, adding dependencies, changing recipe persistence schema, importing non-markdown formats.
- Never: silently create nutrition-less/manual ingredients for unmatched imported ingredients; zero-nutrition matches must be an explicit user action. Never import files from `seed-recipes/dist`; bypass the Go API.

## Success Criteria
- Recipes page includes a visible import button for markdown recipe files.
- Selecting multiple markdown files opens a dialog queue and processes recipes one by one.
- The dialog looks and behaves like a recipe editor in a modal, making the import workflow distinct from normal editing.
- Current recipe can be edited before save: title, servings, serving name, prep/cook time, ingredient amount/unit/name, and directions.
- Each imported ingredient can be searched/matched against the food database/custom foods with the same search source used by the normal ingredient dialog.
- Ingredients that do not exist in the database can be matched by manually entering nutrition facts per 100g.
- Water, spices, and other trace ingredients can be explicitly tied to a zero-nutrition match so they do not block import.
- Ingredient prep instructions remain editable during matching and are saved onto imported ingredients.
- `Save all changes` is disabled until every ingredient in the current recipe has a matched database entry.
- `Undo all changes` resets the current queued recipe to the original parsed data and clears matches.
- `Skip recipe` removes the current recipe from the queue without importing it.
- Saving creates the recipe, persists metadata, groups, directions, ingredient prep instructions, and matched/manual-nutrition ingredients, removes it from the queue, and invalidates recipe queries.

## Open Questions
- Broader arbitrary formats beyond seed-recipes markdown are out of scope for this first slice.
- Category/tag import from front matter tags is not implemented in this slice because existing categories require explicit user-managed category records and the request only required recipe and ingredient matching.
