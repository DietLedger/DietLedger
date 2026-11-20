# Admin category bulk deletion

## Objective
Let administrators select and delete multiple recipe categories from the existing Settings Categories tab without deleting categories one at a time. Requested by the user; the user approved this plan and the existing parent/subcategory cascade behavior before implementation.

## Scope and ownership
- `src/components/categories-panel.tsx`: local selection, all/none controls, confirmed deletion, pending/error feedback using the existing delete mutation.
- `src/components/category-tree.tsx`: optional accessible controlled checkboxes propagated to descendants.
- `src/components/categories-panel.test.tsx`: interaction regression coverage using existing Vitest/Testing Library tooling.
- `PROJECT.md`: describe the admin workflow.
- No API/schema/dependency changes. Existing server deletion remains authoritative; deleting a parent cascades to its descendants and removes category assignments, not recipes.

## Acceptance criteria
1. Each category in the editable admin tree has an independently toggleable, initially unchecked checkbox, including nested categories.
2. Adjacent link-style buttons labeled `all` and `none` select every loaded category (including collapsed descendants) and clear selection respectively.
3. `Delete selected` is disabled without a valid selection and during deletion. Confirmation warns that selected parents also delete unchecked subcategories; cancellation makes no requests.
4. Confirmed deletion reuses the existing category delete API. An explicit pending state prevents duplicate bulk submissions and selection changes. Successful deletions clear selection; failed requests are surfaced and remaining selections can be retried. Partial success is not represented as atomic success.
5. Read-only category views have no selection or deletion controls; existing create/rename/single-delete behavior is retained.

## Implementation and verification plan
1. Add focused failing interaction tests and verify the expected missing-control failures.
2. Add selection props to the existing tree and bulk controls to the panel, using existing Button/Checkbox/dialog patterns; no new abstraction or framework.
3. Run `npx vitest run src/components/categories-panel.test.tsx`, `npx tsc --noEmit`, and focused ESLint. Run broader frontend tests where practical. Check browser behavior if browser tooling is available; otherwise explicitly report that limitation.
4. Update the product summary and record actual verification here.

## Style and boundaries
Follow the existing client React components, local useState for UI selection and React Query mutation/cache ownership. Use native button semantics with link styling for actions, accessible names for category checkboxes and existing design-system primitives. Never change unrelated package.json edits or category persistence semantics.

## Approval and verification
- User approved preserving the existing parent-delete cascade, explicitly warned in confirmation. No open questions.
- Implemented local selection, nested checkboxes, link-style all/none controls, confirmed sequential requests through the existing deletion mutation, pending-state locking, and explicit partial-failure feedback. Successful requests clear their selections; failed/unattempted current categories remain selectable for retry. Bulk deletion is not atomic.
- Confirmation returns keyboard focus to Delete selected on cancellation/failure, or Create Category when the selection has been cleared.
- TDD: the initial focused suite failed on five missing-control cases (two pre-existing read-only/empty behaviors passed). The focus regression also failed before explicit focus restoration was implemented.
- `npx vitest run src/components/categories-panel.test.tsx`: 9 tests passed, covering selection, collapsed children, confirmation/cancel, successful deletion, cascade-driven query refresh, pending state, partial failure/retry, keyboard focus, read-only and empty views.
- `npm test`: 37 files / 290 tests passed.
- `npx tsc --noEmit`: passed.
- `npx eslint src/components/categories-panel.tsx src/components/category-tree.tsx src/components/categories-panel.test.tsx`: passed.
- Read-only review identified the focus-restoration issue; fixed with regression coverage. No other blocking findings.
- Real-browser/layout verification not run: no browser tool or installed browser runner was available. jsdom interaction tests are not a real-browser journey. No deployment performed.

## Sources
Existing React 19 client component / React Query 5 patterns and the local design-system wrappers were reused. Controlled Checkbox and AlertDialog APIs were checked against https://www.radix-ui.com/primitives/docs/components/checkbox and https://www.radix-ui.com/primitives/docs/components/alert-dialog (including explicit controlled close after asynchronous submission).
