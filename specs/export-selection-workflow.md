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
