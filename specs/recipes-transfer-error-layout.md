# Recipes page transfer error layout

## Objective
Long import/export error messages must remain readable on the Recipes page, including unbroken server error strings, without being clipped by the recipe-list panel.

## Acceptance / scope
- When a transfer fails, show the full message wrapped within the recipe-list panel; exceptionally long messages scroll inside their own limited-height status area instead of pushing the fixed-height panel beyond the viewport.
- Preserve existing short success messages and their compact treatment. No error panel appears in the absence of a status message.
- Change only presentation of transfer status on `src/app/(app)/recipes/page.tsx`; no import, API, or nutrition behavior changes.

## Verification / documentation
Add a focused UI regression test for error wrapping, long-word wrapping, conditional visibility, and success behavior; run it red then green plus targeted lint and broader frontend tests. Update the Recipe Management description in PROJECT.md. If browser layout inspection is unavailable, state that limitation.
