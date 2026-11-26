# DietLedger native client: agent instructions

Use these instructions in the **new client repository**, not to change the DietLedger server. Read this file and the API handoff's `README.md` and `BUILD.md` before changing code. In the unpacked kit the files are next to this file; in an adopted repository they normally live in `docs/dietledger-api/`. Follow the repository owner's more specific instructions and stop for clarification on conflicts.

## Non-negotiable boundaries

- This is an independent Android or iOS application consuming the Go HTTPS API. Do not automate, embed, scrape or depend on the existing web GUI. Do not read or write PostgreSQL from the app. Do not create a second server, proxy service, API protocol, offline consensus mechanism or shared credentials without a separate approved spec.
- PostgreSQL remains authoritative; Go owns validation, authorization, persisted facts and server-side assessments. Native UI state is local; a cache is never an authority. Only implement local derivations where the contract calls for them; explicitly document their basis, tests and visual uncertainty. Do not substitute guesses for food identity, missing nutrients or allergen safety.
- Treat credentials and health data as sensitive. Use approved HTTPS, one isolated session per origin/account, platform-backed secret storage only when needed, and redacted logs/fixtures. Never snapshot real account data. Do not operate a live stack, consume an operator claim, publish a release or trigger destructive endpoints without explicit approval.

## DietLedger build philosophy

- **Correctness before convenience.** Prefer facts over inferred data, preserve food provenance and historical snapshots, and fail closed on unknown facts or session mismatches. Build around practical end-to-end workflows and user ownership rather than disconnected features.
- **Simplicity wins.** Reuse existing types/patterns, choose the shortest correct ownership path, and remove needless code before adding another abstraction. Optimize for one developer: understandable code, deterministic builds, few dependencies and low operational burden. Document and get approval for significant stack changes.
- **Spec before code.** Link every change to written acceptance criteria. For significant work, get owner approval of the objective, scope, behavior and test plan before implementation. State assumptions; ask when docs, runtime and requirements disagree. Inspect the pinned Go handler, validators, store and tests rather than guessing routes or copying another UI's behavior. Review configured workflow skills when available; discover code via the project's index if configured.
- **Test first, ship small.** Add a focused failing test and observe its failure, implement the smallest fix, then run focused and risk-appropriate checks. Prefer useful unit tests, targeted integration tests and a few critical end-to-end journeys. If a failing test is impractical, record why, use the narrowest substitute and add regression coverage where possible. No unrelated refactors.
- **Verify with evidence, update docs.** Before declaring a stage complete, review changes and record commands, real results, scope and remaining risks; keep the spec current. Do not mark planned tests, builds or publication as complete. Use the staged gates in `BUILD.md` and an explicit handoff after every slice.
