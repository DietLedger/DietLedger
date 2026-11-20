# Default-template frontend permission alignment

The approved global-template policy permits administrator writes and owner edits to non-default copies. Backend authorization is authoritative; these UI changes make available actions match that policy, not replace it.

- Ordinary users see Copy, but not Edit/Delete, for global defaults. Their own non-default controls remain available.
- A direct default-editor route is read-only for ordinary users and offers creation of an owned non-default copy.
- Mutation handlers also check the current server-derived template/default state and administrator status. Administrators retain the normal editor/save flow.
- Icon controls now have explicit accessible names. Tests render the route's existing default exports; no test-only Next route exports were introduced.

TDD: the initial four component tests produced two expected failures: ordinary users had all three default-template actions, and the direct default route still displayed Save/editor. After the minimal guards/read-only copy flow, all four passed. Tests were then refactored to assert named user actions rather than markup/button counts.

```sh
npx vitest run 'src/app/(app)/settings/templates/page.test.tsx'
npx eslint 'src/app/(app)/settings/templates/page.tsx' 'src/app/(app)/settings/templates/[id]/page.tsx' 'src/app/(app)/settings/templates/page.test.tsx'
npx tsc --noEmit --incremental false
```

Focused component tests, scoped lint and typecheck passed. This is not a real-browser layout test or proof of server authorization; the sharing/global-content backend regression matrix supplies the latter separately.
