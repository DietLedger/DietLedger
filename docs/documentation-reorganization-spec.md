# Documentation reorganization and Pages promotion

## Objective and value
Bring project documentation, plans, specs, and historical documentation together under `docs/`, making current references easy to find, and make the existing adventure preview the GitHub Pages homepage.

## Approved scope and acceptance criteria
- Preserve root `AGENTS.md`, `ReadMe.md`, and `LICENSE.md` for tool and GitHub discovery; leave recipe content, app assets, and unrelated working-tree changes in place.
- Move project documentation, plans, specs, and historical documentation under `docs/`, retaining content and identifying authority and historical status in a documentation index. Update active references and agent instructions.
- Preserve the prior `docs/index.html` in an archive, promote `docs/GitHubPagesTemp/preview.html` to `docs/index.html`, retain necessary assets and tests, and update their paths.
- Keep the documented GitHub Pages branch `/docs` publishing approach; do not publish or change GitHub settings. All files under `docs/` can be served when Pages is enabled.
- Preserve existing page content and behavior. Do not discard unrelated changes.

## Affected systems
Documentation files, links, agent instructions, static Pages entry point, and its tests. No application, infrastructure, or data behavior changes.

## Verification
Run the Pages tests where dependencies are available; check local documentation links, path references, the Git diff, and that both the previous homepage and promoted preview are preserved. Report limitations. Static moves do not warrant app behavior TDD; existing page tests provide regression coverage.

## Outcome and verification
- Project documentation, historical documentation, plans, and specs now live under `docs/`; `AGENTS.md`, `ReadMe.md`, and `LICENSE.md` remain at the repository root.
- `docs/README.md` identifies authoritative references and historical/planning material. `AGENTS.md` and the root README references were updated for the new layout.
- The adventure preview is `docs/index.html`; the former landing page is preserved at `docs/archive/index.html`. Preview tests and source PDF remain under `docs/GitHubPagesTemp/`.
- The Pages agent reports all 54 focused tests pass, including Chromium desktop/mobile path-prefix checks. The archived homepage retains its prior mobile horizontal overflow; that unrelated behavior was deliberately not changed.
- The documentation agent reports 27 local Markdown links in the index and updated specs resolve. `git diff --check` passes. A final review also corrected the stale API/testing paths in `docs/CONTEXT.md`.
- No GitHub Pages configuration was changed and nothing was published. Publication remains blocked pending credential and Git-history review per the release checklist.

## Open questions
None; layout and Pages visibility approved by the user.
