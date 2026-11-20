# Cookbook book page repair (approved)

## Objective and user value
Make the imported Public Domain Recipes book readable and editable: a compact author subtitle, an accessible first Preface with attribution and Unlicense, usable chapter navigation, and a functioning Edit Book action.

## Findings / assumptions
- `seed-recipes/complete/Public-Domain-Recipes.dietledger-bundle.json` already includes one Preface book page (position 0) and a Breakfast & brunch chapter (also position 0). The book subtitle currently receives a long description containing attribution and license instructions.
- `src/app/(app)/books/[id]/page.tsx` renders a sortable title row for book pages but never opens or renders their content. Its tie-sort inserts chapters before book pages. Chapters cannot be collapsed.
- `/books/[id]/edit` is currently a copy of the recipe editor, not a book editor. Existing APIs/hooks can update books and pages; avoid a schema change unless necessary.
- The owner will re-import the corrected bundle; no automatic rewrite or description parsing of previously imported book metadata/order. Preserve unrelated working-tree changes.

## Approved acceptance criteria
1. The Public Domain Recipes detail header shows only its author beneath the title; source credit and license text remain available in the Preface, not as a long subtitle. Other books' descriptions should retain a useful display rather than disappear without notice.
2. The Preface is the first navigable book-level item, opens to show its full text with line breaks and links, and precedes Breakfast & brunch. Update bundle positions to place Preface before Breakfast; the owner will re-import the bundle. Tied positions should still render book pages first for predictable legacy display.
3. Chapter headers toggle their recipe/page lists independently, initially collapsed, with accessible expanded state and keyboard operation; drag handles, dropping a book/chapter page on a collapsed chapter header, and add/remove actions remain functional.
4. Edit Book opens an actual book metadata form for title, description/author text, and cover color. Saving uses the existing Go API and returns to/refetches the book; cancel changes nothing, and background refetches do not overwrite unsaved edits. Book-page and chapter-page content is viewable and editable via the detail page using existing page APIs; cancelling a page edit discards its draft.
5. No nutrition data or recipe content changes. Do not rebuild/deploy without a separate request.

## Affected systems
- Book detail and `/books/[id]/edit` frontend routes; existing book/page hooks and client where necessary.
- Complete-only book bundle JSON (only metadata/order, if approved). No new persistence schema or service.
- Product documentation (`PROJECT.md`) and this spec; testing policy unchanged.

## Test/verification plan
- Add focused failing UI tests for subtitle, Preface opening and ordering, collapse toggles, navigation and book edit/save; run red then green.
- Validate bundle metadata/positions/preface presence with a focused fixture check, if bundle changes.
- Run affected UI test suite, TypeScript/lint checks and inspect the diff. Browser-check book detail and edit flow if a browser is available; otherwise report that limitation.

## Decisions
Owner approved metadata-only Edit Book, page editing on the detail page, chapters initially collapsed, and re-importing the corrected bundle (no automatic stored-data migration).
