# Public-release security and first-deployment bootstrap

> **Historical installer requirements — superseded by explicit owner request.** [Standard Compose / GHCR](standard-compose-ghcr-install.md) replaces mandatory Node/Bash/PowerShell installers, generated-secret state/markers and setup helpers with standard Compose/Portainer and five operator-supplied secrets. Original statuses, commands and test evidence below are retained as history, not current install instructions. Publication hygiene, secret/HMAC preservation, no implicit adoption, database least privilege and separate operational/history/publication approval remain in force. Use [the current guide](../docker-registry-install.md); replacement runtime verification/publication are not claimed here.

Status: **Credential/publication/bootstrap scope approved by owner (2026-11-19); implementation and automated verification complete, with native Windows and real container-start release checks outstanding.** Linux and Windows PowerShell are required. Application-security fixes and history rewriting are not authorized for execution; prepare their approval-ready plans only.

## Subsequent owner request — proposal, not implemented

The owner now requests all private infrastructure removed from current files and retained history, full security remediation, and a fresh Docker installation backed by GitHub without host Node/source-building prerequisites. The updated roadmap is `../plans/security-release-and-github-install.md`, with mandatory infrastructure cleanup in `../plans/public-history-scrub.md`. Its proposed public GHCR images/containerized helper and application/session changes require approval and verification; they do not exist merely because this original Node-based bootstrap is implemented. Do not overwrite the existing stack or delete/recreate the GitHub repository based on the planning request.

## Objective and user value

Prepare DietLedger for public GitHub distribution without publishing credentials or private deployment artifacts. Make a fresh self-hosted installation as close to one command as practical, generating installation-specific secrets once rather than asking users to invent them.

This spec implements the explicit request to audit the repository, replace embedded secrets with safe examples, and generate required local keys on first deployment. The companion audit is `docs/security-public-release-audit.md`.

## Assumptions and boundaries

- A public source release is distinct from exposing a running server to the internet.
- Existing PostgreSQL data and existing operator-managed credentials must be preserved. A changed environment password does not change the password inside an initialized PostgreSQL volume.
- The current remote tar deploy helper loads images only; Portainer owns existing-stack redeploys. Preserve that boundary unless the owner explicitly approves changing it. Existing project instructions and tests prohibit uploading replacement compose files or creating a second remote stack.
- No live deployment, account creation, external credential validation, rotation, database modification, Git history rewrite, force-push, or GitHub setting change is authorized by this implementation spec.
- Third-party API credentials cannot be randomly generated locally. Leave optional integrations unconfigured with documented provider signup steps.
- The working tree contains extensive unrelated work. Preserve it. Do not stage, revert, delete, or reformat unrelated files.

## Proposed implementation

### 1. Publication hygiene

- Preserve the current private `.env` outside publication before replacing tracked content/removing it from tracking; never echo secrets into logs, docs, tests, or diffs shown to the user.
- Keep `.env.example` with empty required-secret assignments (annotated placeholder labels) and documented non-secret defaults, so copying it unchanged fails Compose required-variable validation before even initializing PostgreSQL. Ignore runtime `.env` files and secret/key variants explicitly; do not rely on an exception that admits root `.env`.
- Remove private database/archive artifacts from the publication set only after owner approval. Keep a private local copy where needed; add narrow ignore rules and inspect nested archive content before release.
- Exclude credential artifacts, agent transcripts, local databases, and opaque source backups from Docker build contexts. Preserve intentional public demo assets.
- Record known credential locations and history exposure without recording their values. Rotation/revocation and publication-history cleanup are separate owner-approved operations.

### 2. Generate and retain local deployment secrets

- Use the platform cryptographic random source to generate separate PostgreSQL and HMAC secrets, at least 32 random bytes each, encoded safely for dotenv and PostgreSQL URI interpolation.
- Generate secrets on the target installation, not while building distributable images/tars. Do not package a generated production `.env` with release artifacts.
- Create the runtime secret file atomically with restrictive permissions (0600 on POSIX; document/enforce the Windows equivalent where supported). Do not source or execute arbitrary dotenv content.
- Never print generated values. Redact error messages and dry runs.
- Repeated installs/upgrades preserve exact existing non-placeholder values. Concurrent initializations cannot generate mismatched API/database credentials.
- Reject empty, weak known defaults, and placeholder credentials before starting services. Refuse ambiguous recovery when an initialized database exists but its credentials are unavailable; never reset its volume or silently generate an incompatible password.
- Fail closed on random-source, permission, validation, or persistence failure. Provide an intentional, documented recovery path rather than silently accepting placeholder values.

### 3. Fresh-install entry point and existing deploy behavior

- Provide Linux `install.sh` and Windows `install.ps1` launchers around one dependency-free Node.js 22+ installer (`deploy/install.cjs`), reusing the repository's existing Node tooling rather than duplicating credential logic in two languages. Docker Engine/Desktop, Compose and buildx are prerequisites; the installer checks them before creating configuration. Source installs build both images; packaged installs accept the prescribed combined tar via `--tar`. `--init-only` prepares private configuration without building/starting services, but still checks Docker for existing data.
- Reuse `docker-compose.build.yml` to build both images and `docker-compose.yml` to start the existing services; retain combined-tar naming and image conventions for packaging.
- Default fresh installs to loopback access until the first administrator is created. Explain the explicit opt-in for LAN/public exposure and the requirement for a trusted HTTPS reverse proxy/firewall.
- Existing tar loading and Portainer upgrades remain separate and non-destructive. The installer uses the fixed local Compose project `dietledger`, refuses to adopt existing unrelated/Portainer containers, and records local installer ownership in an ignored marker bound to the Docker daemon ID. Switching Docker contexts cannot silently adopt another daemon's similarly named data. Existing PostgreSQL volumes without the original environment/installer state require deliberate operator recovery, never automatic adoption. A first-install initializer cannot replace Portainer environment variables or claim a redeploy occurred.
- Align `build-all.bat`, `docker-build.bat`, and `docker-build.sh` so they stop copying runnable weak-placeholder `.env` files; package the safe template, both launchers and shared installer instead. Create credentials inside a private staging directory (0700 / protected current-user inheritable Windows ACL) before any credential file exists, then enforce POSIX 0600/private Windows file ACLs before writing secret bytes. Atomically publish without overwrite, release the separate initialization lock independently of temporary-directory cleanup, and require a tar load to report both prescribed latest image tags before Compose starts. Test launcher forwarding on available PowerShell; disclose that Windows filesystem ACL and Docker Desktop behavior still require native Windows verification.
- Require explicit SSH destination instead of defaulting to a private developer machine. Prefer SSH keys/stdin prompts over passwords passed as command-line arguments.

### 4. Security findings outside bootstrap

The audit distinguishes confirmed defects from conditional deployment risks and defense-in-depth recommendations. Its API review found high-risk missing ownership checks, a forged-share/canonical-export disclosure path, first-admin races and untrusted shared-food injection. Credential cleanup alone does not make an instance safe for untrusted users. Fix or explicitly mitigate these release blockers before claiming a secure publicly exposed deployment.

Authorization/session/XSS fixes, dependency upgrades, bootstrap-admin changes, reverse-proxy provisioning, and CI additions require explicitly approved scope and focused regression tests. Do not silently expand a credential/bootstrap change into a broad authentication rewrite. The owner can approve credential/bootstrap work first and application-security work as a separately bounded phase; unresolved findings remain visible in the release gate.

## Affected systems and likely files

- `.env`, `.env.example`, `.gitignore`, `.dockerignore` (publication and build-context rules).
- `docker-compose.yml` (required credentials and optional safe bind configuration).
- `deploy/` (new first-install/bootstrap helper; retain existing remote-loader responsibility).
- `build-all.bat`, `docker-build.bat`, `docker-build.sh`, `scripts/build-and-deploy.js`, `scripts/deploy-built-tar.js`, `src/scripts/deploy-scripts.test.ts`.
- `ReadMe.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PROJECT.md`, and relevant deployment documentation.
- Private artifacts such as `RecipeTool.zip` / `db/custom.db` only with explicit publication-removal approval.

## Acceptance criteria

1. The publication tree has no genuine credentials in configuration, source, docs, nested distributable archives, or private database artifacts. Remaining test/example strings are explicitly non-production. Reachable publication history is separately audited; a clean HEAD is not sufficient.
2. A clean fresh install generates two independent strong secrets once, keeps them out of stdout/stderr/build output, and starts healthy services with the same values.
3. A second run preserves secrets, database data, and existing operator configuration. Lost-config recovery with an existing volume fails safely, without destructive commands.
4. Missing/placeholder credentials cannot be used by a normal production Compose startup; generation failure cannot fall back to known defaults.
5. No generated credential enters Docker build context, image layers, shared tars, or committed files. Runtime secrets remain private on the installation host.
6. Build packaging remains one `docker-build/dietledger-{VERSION}.tar` containing both prescribed images. Remote loader uploads only the tar and existing deploy helper and does not create/reconfigure a stack.
7. Documentation clearly distinguishes local first install, HTTPS/network exposure, external API keys, existing Portainer upgrades, and credential rotation/history cleanup.
8. Every audit finding is enumerated with severity, evidence, exposure conditions, remediation, and verification limits. No claim of proving the absence of all vulnerabilities.

## TDD and verification

Before implementation, add focused failing tests for generation, preservation, independent entropy/encoding, placeholder rejection, restrictive permissions, failure paths, concurrent initialization, missing config with existing data, no secret output, and packaging boundaries. Confirm the expected failures before implementing the smallest fix.

Use temporary directories, mocked Docker/SSH executables and disposable isolated services only. Never run destructive PostgreSQL helpers against an application database. Run focused deploy tests, shell syntax checks, Compose validation with synthetic credentials (do not print the resolved environment), and a disposable first-run/re-run smoke test when Docker access permits. Test generated Linux and Windows loaders on their target platform before claiming support. Documentation-only work needs proofreading and diff inspection, not a false TDD claim.

Baseline before implementation: `npx vitest run src/scripts/deploy-scripts.test.ts` passed (4 tests); `bash -n deploy/deploy.sh docker-build.sh portainer-build.sh` passed; uninterpolated Compose validation passed. This does not test secret generation, which does not yet exist.

## Approval decisions / open questions

Owner answers (2026-11-19):

1. Approved credential cleanup and bootstrap spec, including separate fresh-install flow, preserved Portainer ownership, loopback-first defaults and preservation of private local artifact copies.
2. Required initial targets: Linux and Windows PowerShell.
3. Requested an approval-ready application-security remediation plan; no application behavior fixes are authorized in this phase.
4. Selected a coordinated history scrub plan, not clean-history publication. Do not execute rewriting, credential rotation or any push without separate explicit authorization and operator credential review.

Implementation detail: preserve actual environment bytes on rerun; reject ambiguous/interpolating database credential syntax rather than silently re-encode an initialized password. Use URL/dotenv-safe generated hex. Windows ACL behavior and Docker Desktop are native-platform verification limitations if Windows is unavailable.

## Implementation evidence (2026-11-19)

- Added shared `deploy/install.cjs` and thin `install.sh` / `install.ps1` launchers. No new package dependency/service was added. Private `.env` generation, literal validation, no-overwrite publication, separate initialization locking, independent staging cleanup, concurrent retries and daemon-bound marker recovery are implemented. Docker environment selectors/PATH/HOME stay stable across preflight and mutation; case-varied managed overrides are removed. Dry runs do not read config or invoke Docker.
- Fresh source installs use buildx bake for both images; tar installs require `docker load` to report both prescribed `:latest` tags before any service startup. Prerequisite capability checks precede secret writes. Compose `up --wait` is used only for installer-owned stacks; Portainer remains unchanged.
- `.env.example` required values are empty with inert labels. Compose rejects missing/template credentials and defaults to loopback. Main validates database password/HMAC before DB connection/migrations and never logs the connection URL. `HOSTNAME=0.0.0.0` explicitly aligns the standalone web listener with container-local healthchecks.
- All three tar builders ship only safe template/installer assets rather than creating runtime `.env`; exact-version loaders propagate failures. Existing output `.env` is preserved, so whole-folder distribution must be reviewed rather than blindly copied. Remote helpers require an explicit destination and reject password arguments without echoing values; stdin/key support and image-load-only behavior remain.
- `.env`, `RecipeTool.zip`, `db/custom.db`, and `sync-server/dietledger-api.exe` were removed from the **index only**, preserving all four local files. These are intentionally staged publication removals, not filesystem deletions or a history scrub. Git/build excludes now cover local safety/agent/index/key artifacts and installer state. Unremediated detailed security working papers are explicitly Git-ignored and build-excluded to avoid accidental source/Pages disclosure; they remain available privately in this workspace.
- Prepared `application-security-remediation.md` and `../plans/public-history-scrub.md` as **plans only**, including all 52 numbered findings/advisory references and coordinated scrub gates. No app authorization/session/XSS implementation, revocation, rewrite, force-push, deployment or live service change occurred.

### Test-first and review evidence

Initial installer tests failed for the missing helper/launchers (16 failures); publication/remote tests then reproduced six unsafe baseline behaviors. Focused follow-up RED runs reproduced copied-template acceptance, replacement-label startup acceptance, case-varied override/context switching, daemon-marker reuse, generic password acceptance, missing tar image tags, non-private staging and cleanup failures. Small fixes made each corresponding suite green. Agent packaging/startup test-first records are `bootstrap-packaging-verification.md` and `startup-secret-validation-verification.md`.

Independent read-only security review identified Windows inherited-file-handle exposure before ACL restriction, late Docker selector/environment changes, daemon-marker reuse, incomplete-tar mixing, cleanup lock stranding, generic-secret mismatch and listener/healthcheck inconsistency. Credential files now first exist inside an already-private inheritable-ACL directory, and the other issues have focused regression coverage. Native Windows two-account ACL behavior is still not a claimed test result.

Final checks:

- `npm test`: **59 files, 541 tests passed**.
- Focused four bootstrap/publication/packaging/remote suites: **50 tests passed**.
- `npx tsc --noEmit --incremental false`: passed.
- Focused ESLint on installer/tests, Node syntax on remote scripts, and Bash syntax on launchers/build/remote loader: passed.
- `TEST_DATABASE_URL= DATABASE_URL= HMAC_SECRET= go test -json ./... -count=1`: passed; **91 top-level tests passed and 223 database-dependent tests skipped**. Skips are not integration coverage. Focused auth/startup validation also passed.
- Synthetic Compose rendering with an explicit separate env file and sanitized inherited environment: verified required-secret/template rejection, loopback/custom port, web listener value and unpublished DB/API. Resolved credentials were never printed.
- PowerShell 7 on Linux: launcher help/dry-run/argument forwarding and embedded ACL script syntax passed. This is **not** Windows ACL/Docker Desktop validation.
- Real image builds/startup, live migration/deployment and native Windows tests were not run. Mocked Docker orchestration is not a claim of healthy running containers. Native Windows and a disposable actual first-install/rerun smoke test remain release gates; no app-security or historical-secret gate is cleared by these tests.

### Official source checks

- Compose required interpolation and shell precedence: https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/ (`${VAR:?error}` rejects unset/empty; shell overrides files, hence managed-variable sanitization).
- Health waiting: https://docs.docker.com/reference/cli/docker/compose/up/ (`--wait` waits for running/healthy services).
- Node 22 filesystem APIs and Windows permission limitations: https://nodejs.org/docs/latest-v22.x/api/fs.html (POSIX mode alone is not a Windows owner-only ACL).
- Protected ACL inheritance: https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.objectsecurity.setaccessruleprotection?view=net-9.0 (protect inheritance and remove inherited rules; new staging-directory rules explicitly inherit only current-user access).

## Documentation updates on implementation

Update this living spec and the audit disposition before each approved scope change. Update the README installation path, architecture/decision records for credential ownership and bootstrap boundary, product deployment expectations, and existing tar deployment instructions. Change testing policy documentation only if policy/tooling changes, not merely for adding focused regression tests.
