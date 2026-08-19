# Spec: Manual Test Worksheet

## Objective

Create a standalone HTML manual testing worksheet for DietLedger so a tester can walk through the major user-facing workflows, record pass/fail status and notes, and export the results as a Markdown file.

## User Value

- Gives the solo maintainer a repeatable checklist for release smoke/regression testing.
- Keeps tester observations in a portable Markdown format that can be attached to issues or release notes.
- Emphasizes high-risk nutrition, health, dietary compliance, serving, and export workflows.

## Success Criteria

1. The worksheet is an HTML file with visible test sections.
2. Each manual test is presented as a header with step checkboxes.
3. Each test has feedback inputs for status, tester, environment/build, notes, actual result, issue link, and follow-up.
4. A save button exports the current worksheet data as a `.md` file.
5. The exported Markdown uses each test as a heading and a `Feedback` subheading with the recorded data.
6. The worksheet covers the currently discoverable app areas: setup, authentication, navigation/settings, recipes, nutrition, books/cookbooks, meal planning, grocery list, kitchen helper, sharing/community, data import/export, administration, and responsive/accessibility smoke checks.

## Affected Files

- `docs/manual-test-worksheet.html` — standalone worksheet and export script.
- `docs/spec-manual-test-worksheet.md` — this specification.

## Testing Strategy

This is a static documentation/testing aid rather than application behavior. TDD is not practical because there is no app runtime integration or test harness for standalone HTML. Verification will be by static inspection and a script-based syntax/structure check of the generated HTML.

## Boundaries

- Always: keep it standalone, dependency-free, and safe to open locally.
- Ask first: integrating it into the Next.js app or adding filesystem/server persistence.
- Never: store secrets in generated Markdown; require testers to record only non-sensitive observations.

## Open Questions

- None for this version. Browser save behavior will use a Markdown file download because local files cannot be written directly from a plain standalone HTML document in all browsers.
