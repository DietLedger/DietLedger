# TypeScript cleanup and unused WebSocket example

## Objective and user value
Keep the application and its tests type-safe without requiring dependencies for an unused Socket.IO example or local-only agent tools. Avoid deleting user-owned ignored files, working seed data, bundle exports, or planned product features solely because they are not currently mounted.

## Acceptance criteria
- Remove the two tracked `examples/websocket/` files, which are not referenced by app routes/scripts and require absent Socket.IO dependencies. Do not touch `seed-recipes/`, existing bundle files, or ignored `skills/` and `src/components/local-mode-banner.tsx`.
- Scope the app TypeScript checker so ignored local tooling is not checked as application source, without hiding app code or tests.
- Fix the remaining application and test TypeScript errors with behavior-preserving changes, including the invalid extra Next route export on the Recipes page. Retain the planned nutrition PDF report and repair its typing rather than deleting it. Do not weaken production contracts just to silence tests. Where a wrong type hides a real wire-format mismatch (the grocery checklist's JSON-string `checkedItems`), normalize it at the API client boundary with regression tests.
- Regenerate stale Next route types when applicable, without treating generated files as application source to edit manually.

## Affected systems
`tsconfig.json`, `src/app/(app)/recipes/` and its tests, the application modules/tests reported by `npx tsc --noEmit --pretty false`, the two tracked WebSocket example files, and documentation for any actual behavior change. No dependency or service is added.

## Testing strategy
Reproduce the existing type failures; resolve each group with narrow checks and relevant unit tests; rerun `npx tsc --noEmit --pretty false`, focused Vitest/Go tests where behavior may be affected, and relevant lint checks. Inspect the final diff for accidental changes to existing uncommitted work.

## Verification notes
The initial app typecheck had 43 errors, including tracked Socket.IO examples, ignored local skills, stale generated Next validators, and an invalid named Recipes-page export. The tracked example files were removed; `skills/` and the ignored local-mode banner were excluded without deleting local files. `npx next typegen` refreshed production route types; a brief local Next dev run refreshed stale `.next/dev/types` validators that typegen does not replace. With both generated sets current, `npx tsc --noEmit --incremental false --pretty false`, the full Vitest suite (185 tests), and full ESLint pass. The frontend build also passes. The unused but planned nutrition report was fixed, not deleted.

## Boundaries and assumptions
The tracked example is not a shipped app feature. The ignored local files are not cleanup targets. `src/components/nutrition/nutrition-pdf-report.tsx` remains because a written product plan still describes it. Fixing types must not silently change nutrition computations or dietary rules; a real domain/contract conflict must be raised for human review.
