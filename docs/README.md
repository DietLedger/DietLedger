# Documentation index

Project documentation lives under `docs/`. The repository-root exceptions are `AGENTS.md` (agent instructions), `ReadMe.md` (GitHub-facing setup and overview), and `LICENSE.md` (license discovery and terms).

## Current authoritative references

Use these as the current sources of truth; when older material conflicts, follow these documents and current application/API behavior:

- [Project and product behavior](PROJECT.md)
- [System architecture and ownership](ARCHITECTURE.md)
- [Nutrition domain rules](NUTRITION_DOMAIN.md)
- [Architecture decisions and rationale](DECISIONS.md)
- [Testing strategy](TESTING_STRATEGY.md)
- [Standard Compose / GHCR installation and recovery](docker-registry-install.md) and [approved installation spec](specs/standard-compose-ghcr-install.md): these supersede earlier host-installer/setup-image routes, not retained security gates. Runtime verification and publication remain separate.
- [Go Sync API for Android/iOS and other native clients](sync-api/README.md) and [downloadable AI agent kit](../download/dietledger-sync-api-agent-kit.zip?raw=true)
- [Recipe package API](recipe-package-api.md), [dietary profile API](dietary-profile-api.md), and [standard food identity/distribution](standard-food-identity-and-distribution.md)
- [Current feature specifications](specs/): treat each specification's status and approval notes as authoritative for that feature; implementation plans are supporting evidence, not a substitute for approval.

## Historical, reference, and planning material

These documents are retained for context and must not override the current references above or current source behavior:

- [Historical/final-era documents](final_docs/), including prior system requirements, API contract, migration path, and regression records. Consult [ARCHITECTURE.md](ARCHITECTURE.md) and current API documentation for present behavior.
- [Plans](plans/), including superseded, completed, and proposed work. Confirm status and approval before treating any plan as actionable.
- [Historical and superseded specifications](specs/), including documents explicitly marked historical and nested prior plans. Check each document's status; a spec's presence does not imply approval or implementation.
- [Temporary analysis and execution notes](temp_docs/); these are archival context, not current policy.
- [Data store analysis](DATA_STORE.MD), [repository analysis](REPOSITORY_ANALYSIS.md), [architecture review](architecture-review.md), and [AI architecture review](ai-architecture-review.md) provide historical/investigative context unless explicitly refreshed and reconciled with current architecture.
- Legacy feature/design references—[Import design](Import_design.md), [import design test methods](import_design_test_methods.md), [original spec](spec.md), [original plan](PLAN.md), [server-first plan](PLAN-server-first.md), and [context notes](CONTEXT.md)—should be read alongside the current authoritative references above.

## Other documentation

- [Documentation reorganization spec](documentation-reorganization-spec.md)
- [Storyboard gallery](storyboards/)
- [GitHub release setup notes](github-release-setup.md)

This index classifies document purpose; it does not change approval status or imply that historical plans/specifications should be executed.
