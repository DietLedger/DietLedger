# Review and change an ingredient's database match

## Objective and user value
In the expanded ingredient editor on the Recipes page, show the name of the food database record backing an ingredient, separately from the ingredient's editable recipe name. Allow selecting another local database food to correct imported/manual or wrong matches and update nutrition accordingly.

## Acceptance criteria
- A USDA-sourced ingredient displays its database food's description (resolved by FDC ID); an unavailable record shows an explicit unavailable state, not the editable ingredient name as if it were a verified match.
- Custom-food sources display their matching local custom-food name when a source key resolves. Manual ingredients and unresolved sources show a clear unmatched/unavailable state. Linked recipes are not offered a food replacement.
- Change match searches meaningful-nutrition local/USDA foods and saved custom foods, without demo fallback suggestions. Zero-calorie foods are selectable when at least one other canonical nutrient is positive (for example salt's sodium); records with no positive nutrients are never selectable. Provide a separate explicit **Use no nutrition** action, matching recipe import, for ingredients with no useful nutrition data; it creates a manual zero-nutrient snapshot rather than a database food record.
- Applying a database result validates USDA food existence by FDC ID and custom-food existence by user-owned custom-food ID; do not apply deleted results. Use the nutrients and portions from the selected search result consistently with Add, rather than silently replacing them with a conflicting by-ID snapshot. It updates FDC/source metadata and nutrients using the ingredient editor's current amount/unit, including unsaved edits. Legacy blank units are treated as grams in the ingredient editor and on rematch, so a 100 g selection cannot silently scale to zero. USDA values use a matching food portion gram weight when available. A zero-calorie food retains its non-calorie nutrient snapshot (such as sodium). **Use no nutrition** deliberately applies an all-zero manual snapshot. Preserve recipe-specific name, description, group, prep and storage. Update the current recipe cache immediately from the saved ingredient so displayed calories and recipe totals recalculate; no change on cancel or failed update.

## Scope and ownership
Use the existing Recipes page ingredient editor, Go API food lookup/search and ingredient update mutation; no new persistence or service. React Query remains responsible for refetching the updated recipe.

## Verification
Regression coverage verifies USDA portion weights survive mapping, rematches use the selected result's nutrition even if by-ID lookup disagrees, blank legacy units default to grams, rematches use the current editor amount/unit, and a piece-based rematch computes nonzero nutrients. Ingredient updates invalidate the recipe detail/list queries; recipe summaries and labels derive totals from all ingredients. Focused Vitest, typecheck and ESLint checks should pass. Browser verification remains outstanding when no running browser session is available.

## Open questions / assumptions
USDA FDC-backed records resolve through the existing by-FDC API; custom-food source keys resolve through the existing custom foods list. Custom/manual ingredients can be re-matched to a local USDA food; linked recipe ingredients remain unchanged. The Change match action uses current quantity and unit drafts, while other unsaved ingredient fields are not included.
