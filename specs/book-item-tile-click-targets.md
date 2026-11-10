# Book item tile click targets

## Objective / acceptance
On a book detail page, clicking anywhere on a book page, chapter page, or chapter recipe tile opens that page or recipe. Keyboard Enter/Space on the tile does the same. Trash/remove and confirmation/cancel controls must never open the page/recipe; the drag handle remains dedicated to reordering. Chapter collapse behavior and book-level ordering remain unchanged.

## Implementation / verification
Modify only the three existing sortable item rows in `src/app/(app)/books/[id]/page.tsx`. Add focused failing UI tests for row background/content clicks, recipe navigation, trash/confirm/cancel isolation, and keyboard use; run them red then green, then targeted lint and broader frontend tests. Update PROJECT.md cookbook publishing text. No API, persistence, or nutrition change. Preserve unrelated working-tree changes.
