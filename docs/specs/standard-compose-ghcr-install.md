# Standard Compose / GHCR installation

## Objective and authority

Implement the owner's explicit standard Docker Compose / Portainer request. Replace the separate setup image and host preparation system with operator-supplied configuration, while retaining existing Go bootstrap, migration, admission and runtime authority checks. This request approves repository implementation, not publication, history adoption, live deployment replacement or data deletion. This spec supersedes the installer-specific portions of earlier bootstrap specs/ADRs; unrelated security gates remain.

## Contract and success criteria

- Exactly two application packages: `ghcr.io/dietledger/dietledger-web` and `ghcr.io/dietledger/dietledger-api`; retain the pinned official PostgreSQL 17 image.
- One standard five-service definition: postgres -> API-image bootstrap -> API-image migrate -> restricted API -> web. Preserve health / successful-completion dependency conditions. Portainer definition has identical semantics (prefer identical bytes).
- Source Compose explicitly requires `DIETLEDGER_VERSION` rather than pretending an unpublished tag exists. Release asset generation replaces both app references with exact pushed, previously built/scanned digests and validates matching version/revision metadata. No runtime release.env, installer, ownership marker, checkout path, install root, Docker socket or host bind is required.
- `.env.example` has five EMPTY secret assignments: POSTGRES_PASSWORD, MIGRATION_DB_PASSWORD, API_DB_PASSWORD, HMAC_SECRET, SETUP_CLAIM_SECRET. Require each with Compose `:?` interpolation. Document five independent CSPRNG values (32 random bytes rendered as 64 hex characters is compatible), no automatic generation/rotation, restricted storage and encrypted offline backup together with the database. HMAC must survive restores because it encrypts provider configuration. Existing Go validation remains unchanged.
- Only web publishes a port, default 127.0.0.1:3000. Explicit loopback HTTP opt-in and exact browser CORS_ORIGIN; non-loopback access requires trusted HTTPS ingress, secure-context browser support and false insecure-loopback flag. Browser API stays same-origin through Next, not a separate public API address.
- Bootstrap alone receives bootstrap/migration/runtime passwords; migrate receives its own connection; API receives runtime connection, HMAC and claim; web receives none. No env_file distributing all secrets to containers.
- Operator chooses a NEW project/stack and new volume. No automated adoption, password recovery or live-stack changes. Missing/incorrect initialized credentials fail closed through existing commands; no silent credential replacement.
- Public install needs only Docker Compose or Portainer Docker Standalone, released Compose and explicit environment values. No login/token, source checkout, Node/Go/Git/buildx or host installer. Local developer builds remain opt-in and build/load web/API only.

## Affected files/systems

Compose definitions and environment template; Dockerfile and local build helper; remove public setup/host-installer implementation and tests specific to it, replacing with focused Compose/release contracts. Adapt existing beta workflow and release-manifest helper/tests, never add a second pipeline. Update README, installation/release/CI guidance, architecture, decisions, project/testing documentation and affected earlier specs (clearly superseded where historical). Preserve private ignored scripts and unrelated dirty work.

## TDD and verification

1. Add focused failing Compose/env/build/release tests before implementation. Cover absent/empty required variables, service image identity, least-secret scope, internal-only ports, completion/health ordering, no helper/installer dependency, exactly two build/publication targets, safe assets and digest binding. Use existing test tooling only.
2. Retain/run Go deployment-secret, runtime-role, bootstrap ownership and migration-ledger refusal regressions on a NEW isolated disposable cluster only. Tests that reset schemas must never connect to existing databases.
3. Actual fresh Compose run on an explicitly approved Docker endpoint with unique project/new volume and synthetic secrets/data, no live resources. Exercise claimed first admin, ordinary registration/login/refresh/logout, schema/role denial, account/data/provider ciphertext preservation through repeated up/recreation/restart, web same-origin transport and readiness. Use local candidate images before publication, record exact image IDs and limitations; local execution is not anonymous GHCR installation proof.
4. Portainer: check pinned upstream Standalone implementation for completion dependency support; record actual version/runtime only if a real approved isolated Portainer target is available. Compose/source checks do NOT certify Portainer.
5. Build/scans precede any publication in existing manual workflow. Protected environments, pinned actions, minimal permissions and GITHUB_TOKEN packages:write retained. Attach matching digest-pinned Compose, safe .env.example, release metadata and SHA256SUMS. Require token-free pulls with an isolated DOCKER_CONFIG before release assets; no change to operator Docker credentials.
6. Run focused checks, relevant lint/type checks and inspect final diff. Record commands/results and separate repository, runtime, Portainer and publication statuses here.

## Publication gates and open runtime approval

Canonical/remote sanitized-history adoption is pending. Do not push private integration lineage, publish packages, change package visibility or replace refs. Owner must separately approve exact history/ref operations and publication after manual testing/security gates. New GHCR packages default private; owner must configure repository Actions package access and explicitly approve public visibility for both packages. Anonymous exact-digest pulls and install from released assets remain post-publication gates.

Read-only discovery found local Docker default endpoint `unix:///var/run/docker.sock`, Docker 29.10.0 / Compose 5.8.0, and an existing unrelated PostgreSQL fixture. Request approval before creating a unique isolated test project/volume on that endpoint; do not touch the existing fixture. No Portainer target/version has yet been approved.

## Evidence

### Repository verification (2026-11-20)

- TDD: initial Compose contracts failed 0/8 on old installer dependencies; replacement passes 8/8. Build/image contracts first reproduced the setup stage/third target/tag, then passed. Release tests first reproduced old three-image/assets behavior; follow-up RED/GREEN protected preservation of secret-generation/backup comments, exact-candidate runtime checks before pushes, hidden `.env.example` upload and post-push install-asset checks.
- `node --test scripts/runtime-image-contract.test.cjs scripts/compose-install.test.cjs scripts/release-manifest.test.cjs eslint.config.test.mjs`: 30/30 passed (24 deployment/release/image/verifier contracts + 6 lint-policy tests).
- `npm test -- --run`: 69 files / 571 tests passed.
- `npx tsc --noEmit`: passed (repeated after the verifier was added).
- Verifier syntax, `npx eslint --no-ignore scripts/verify-compose-install.mjs`, pure exported input guards and missing-opt-in refusal: passed; these checks invoked no Docker mutation. Ordinary repository ESLint ignores this script, so its explicit lint command matters.
- `npm run lint`: zero errors; two existing unused-expression warnings in unrelated PDF browser scripts.
- `env -u DATABASE_URL -u TEST_DATABASE_URL -u RUN_LEGACY_CLONE_FIXTURE ... go test . -count=1 -v -run '^(TestValidateDeploymentSecrets.*|TestAuthRequiresPersistentSecret|TestNewAuthServiceWithHMACSecret|TestMigrationVersionMembershipRejectsEveryUnknownAppliedVersion)$'`: all five selected test functions passed; no database-backed checks were represented by this run.
- `docker buildx bake --print -f docker-compose.build.yml`: exactly api/web targets; no build or container start performed.
- Both workflow YAML files parsed with available PyYAML. `git diff --check`: passed at checkpoint.

### Opt-in runtime harness (maintainers only)

`scripts/verify-compose-install.mjs` requires explicit approved `DIETLEDGER_TEST_DOCKER_HOST` (a local Unix socket) and preloaded tagged/digest `DIETLEDGER_TEST_WEB_IMAGE` / `DIETLEDGER_TEST_API_IMAGE`. It also requires the pinned official PostgreSQL image already loaded; it never pulls/builds/retags. Optional absolute `DIETLEDGER_TEST_COMPOSE_FILE` selects a generated release asset whose app digests must match the explicit image inputs. It creates its own synthetic secrets, isolated Docker client config, unique project/new volume and loopback web port, verifies resource labels before cleanup, and never prunes or adopts a stack. No host tool requirement is added to public installation: this Node harness is maintainer-only verification.

Its HTTP journey covers claimed admin, ordinary registration/login/refresh/logout and Origin/CSRF refusal, persisted book/provider ciphertext, TCP-authenticated least-privilege SQL refusals, repeated up/job/service recreation/PostgreSQL restart, retained role-password hashes and session/provider decryption. It is not a real-browser or Portainer test. A missing opt-in refuses before Docker. Actual successful execution is still required before calling any of these runtime-verified.

### Runtime/publication status

- Actual fresh Compose install, disposable-cluster Go authority/ownership tests and rebuilt-image scans: awaiting explicit isolated Docker target approval; not yet performed for this replacement.
- Portainer: upstream CE 2.45.4 LTS source commit `505380c8eecff08cf513c457494bde91634db9ff` embeds Compose 2.40.3; file/upload/Git builders converge on Compose Up. Upstream handles healthy and successful-completion conditions. This is source evidence ONLY, not a tested Portainer deployment/version. No approved runtime target yet.
- Release workflow now runs synthetic Compose journeys against built/scanned candidates before push; after isolated anonymous digest pulls it checks image IDs against those candidates and installs the generated digest-pinned definition before uploading its fixed allowlist. Upload explicitly includes the safe hidden `.env.example`. These are workflow requirements, not claims that the workflow has run.
- `release.json` remains `unreleased` with null web/API digests. No image/package publication, package-visibility change, Git ref adoption/push, live deployment operation or data deletion has been performed.
- Post-publication anonymous pulls and installation from actually downloaded GitHub Release assets remain separate gates after history, security, manual-test and owner publication approval.
