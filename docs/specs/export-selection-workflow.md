# Export Selection Workflow

## Objective

Replace the one-click recipe bundle export with a selectable export screen that lets users choose exactly which eligible recipes, books, nutrition profiles, and meal plans to include.

## User Value

Users can export a focused subset of their data instead of always exporting everything, while admins can perform full backup/export operations across recipe, book, nutrition-profile, and meal-plan content.

## Acceptance Criteria

- The export workflow displays a screen with recipe, book, nutrition profile, and meal plan export candidates.
- Recipes eligible for a normal user:
  - recipes owned by that user
  - recipes shared publicly by another user
- Books eligible for a normal user:
  - only books created by that user
- Nutrition profile candidates for a normal user include only that user's person profiles and their associated nutrition history (food logs and weight entries).
- Meal plan candidates for a normal user include only that user's meal plans and their entries/groups.
- Admins can export any recipe, book, nutrition profile, or meal plan.
- A filter input at the top filters visible candidates case-insensitively.
- A candidate matches the filter when the filter text appears in:
  - recipe name
  - recipe description/instructions
  - book title
  - book description
  - book page or chapter page content
  - nutrition profile/person name
  - meal plan name or week start
- Candidates render as selectable tiles.
- Clicking a tile toggles its selection.
- Clearing or changing the filter does not clear selection.
- A clear selections button clears selected items.
- An `Export all` control invalidates current selections and exports all eligible candidates.
- Normal export exports only selected items.
- Backend export authorization enforces the same rules as the UI.

## Affected Systems

- Go API bundle export candidates and export authorization for recipes, books, nutrition profiles, and meal plans.
- Frontend API client types/methods.
- New export screen/page.
- Frontend bundle type support for exported nutrition profile, food log, weight, meal plan, day-plan entry, and meal-group payloads.
- App navigation export entry point.

## Testing Strategy

- Backend handler/store tests for candidate visibility and export authorization.
- Frontend unit tests for filtering/selection behavior where practical.
- Run focused tests and lint.

## Open Questions / Assumptions

- "Public recipe" maps to `shared_recipes.visibility = 'public'` for the source recipe.
- "Export all" means all currently eligible candidates, not just filtered candidates.

## Single cookbook export page

**Objective:** Let users download the cookbook they are viewing as a printable PDF or as an importable DietLedger bundle, without leaving its Export page.

**Acceptance criteria:**
- The cookbook's Export page offers PDF (the default) and DietLedger bundle. Both formats target the cookbook in the page URL.
- PDF keeps the existing print settings, including the required measurement-unit choice. Bundle export does not show or require PDF settings.
- Bundle export sends only the current book ID to the existing native export API and downloads its response as a `.dietledger-bundle.json` file. Existing bundle contents, dependency rules, and authorization remain server-owned.
- The form prevents another export while one is in progress and reports failures without starting a download. The bulk Export Data page, book-list quick download, and Print Studio's PDF workflow are unchanged.

**Affected files and verification:** The book export route uses the shared cookbook export form, existing PDF generator, native export endpoint, and download helper. The cookbook publishing section of `PROJECT.md` documents the format choice. No backend changes.

**Verification:** The new route tests first failed without the format choice, then passed for PDF settings, the bundle request and named download, and failure/retry. All 490 frontend tests, TypeScript, and scoped ESLint pass. An isolated Vivaldi smoke test with a mock API verified the default PDF controls, cookbook-only bundle request, and the exact JSON and filename passed to the browser. Saving to disk could not be verified in the headless browser, which also did not save a standalone control download.
