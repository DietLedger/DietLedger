# Spec: Feature Completion Worksheet

## Objective

Create a standalone HTML feature completion worksheet/report for DietLedger that documents the user-facing feature set, estimated completion percentages, known remaining work, and reviewer notes. It should export the completed assessment to Markdown.

## User Value

- Gives the maintainer a single editable snapshot of product readiness by feature area.
- Makes remaining work explicit and easy to update as implementation/testing progresses.
- Produces a Markdown report that can be committed, attached to issues, or used for release planning.

## Success Criteria

1. The worksheet is an HTML file with one section per feature area.
2. Each feature includes an initial estimated completion percentage and rationale.
3. Each feature includes editable fields for revised percent, status, remaining work, blockers, evidence, and priority.
4. A save button exports the current assessment as a `.md` file.
5. The Markdown export documents every feature as a heading with completion percent and remaining work.
6. The worksheet clearly states that percentages are source-based estimates until confirmed by manual testing.

## Affected Files

- `docs/feature-completion-worksheet.html` — standalone worksheet and Markdown export script.
- `docs/spec-feature-completion-worksheet.md` — this specification.

## Testing Strategy

This is a static documentation/testing aid rather than integrated app behavior. Verification will be static inspection and script parsing of the generated HTML.

## Boundaries

- Always: keep it standalone, dependency-free, and locally openable.
- Always: treat completion percentages as editable estimates, not absolute truth.
- Ask first: wiring this into the app, creating server persistence, or changing product behavior.
- Never: invent hidden features not visible in current docs/source; separate future product ideas from implemented features.

## Open Questions

- None for this version.
