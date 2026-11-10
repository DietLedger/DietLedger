# Improve food database search relevance

## Objective
Help users find staple foods and exact database matches (for example, `Salt, table` when searching `salt`) without losing the existing broad full-text search behavior.

## Acceptance criteria
- Search results prioritize literal exact description matches, then normalized phrase matches, then descriptions beginning with the literal query, before stemming-based full-text matches.
- Existing full-text matching remains the fallback for broader descriptions; ranking is deterministic with text rank and description as tie-breakers.
- Food search keeps the API's result ordering and page limit; do not add a new favorites/staples catalog or a new search service.
- Search continues to apply meaningful-nutrition eligibility, so zero-calorie foods such as salt with positive sodium are eligible and nutritionally empty foods remain excluded.
- The database must contain the USDA salt record for search to return it; previously omitted SR Legacy foods need a dataset reimport after deployment.

## Scope and ownership
Improve ranking in the existing Go `PostgresStore.SearchFoods` query. The frontend continues to display server order and the existing client-side fallback behavior. No schema, persistence, or dependency changes.

## Verification
Add a focused store regression test with a staple exact/prefix match and multiple broader/stemming-related distractors; verify the staple is first on the first page. Run the focused and full Go tests, frontend tests, typecheck, targeted lint, and `git diff --check`.

## Assumptions
A generic relevance ranking is preferable to introducing a curated staples list. Literal matching should outrank English stemming, while broad full-text results remain available after higher-confidence matches.
