# Go Sync API client handoff

## Objective and scope

Give a developer (or coding agent) in a separate repository enough information to build an Android or iOS client against the existing DietLedger Go HTTP service. Document current behavior, not a new public API version. Scope is Go routes, their wire contracts and workflows, and development/quality gates. No frontend GUI integration or automation, server behavior changes, new authentication scheme, deployment, or release publication.

## Acceptance criteria

- Record the reviewed backend revision. Inventory every intentionally exposed Go route/method, including admin, public, optional-auth, compatibility aliases, and explicitly disabled operations. Do not present accidental router fallthroughs as supported contracts.
- For each operation provide access, inputs, response shape/status, and an implementation reference. Supply backend wire declarations and workflow guidance for nuanced contracts, including session rotation, transport/security, recipe packages, nutrition units, and missing sync capabilities.
- Provide a standalone ZIP with a root `AGENTS.md`, instructions for starting a new repository, implementation stages and exit gates, and machine-readable operation inventory. Include no credentials, database contents, frontend code or frontend automation. Document a reproducible archive build.
- Verify coverage against Go route registrations, verify links and archive contents/freshness, and state what has and has not been runtime checked. Do not claim end-device or live-stack verification without running it.

## Ownership and assumptions

The Go API and PostgreSQL remain authoritative. Native apps consume HTTPS `/api` with operator-configured ingress and the current cookie/Bearer contract; they do not talk directly to PostgreSQL. “Feature complete” means the implemented Go HTTP surface; features implemented elsewhere or not exposed by Go are not promised. The archive is a repository download, not a GitHub release asset.

## Files and verification

Maintain the entry point and handoff in `docs/sync-api/`, surface it from repository documentation, and package it under `download/`. The archive builder checks the operation catalog against registrations and supports a freshness check. This is documentation and packaging only; no product behavior change. Verification is static contract inspection plus executable packaging checks, not modification of the server's test policy.

## Open questions

The Android stack, UX feature prioritization, and target deployment belong to the separate client repository and its human-approved spec. A purpose-built mobile authentication or offline delta protocol would require a separate backend spec and approval.

## Handoff evidence

The snapshot is `6b93123fcc15c4c069edfb9fa108484a56416af0`. The route inventory records 178 method/path operations (including aliases and unavailable operations), matched to all 66 Go registrations; the ZIP includes 110 wire type declarations and no application code. Nested dispatch, statuses and workflow details are source-reviewed; the static checker does not prove runtime behavior. Regenerate with `python3 scripts/build-sync-api-kit.py`; verify with the same command plus `--check`, `unzip -t download/dietledger-sync-api-agent-kit.zip`, and `git diff --check`. No Go/DB stack, device tests, deployment, or publication is part of this docs-only handoff. A consuming client must verify its chosen workflows against an approved HTTPS test instance before shipping.
