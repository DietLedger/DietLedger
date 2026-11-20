# Docker-first install and controlled runtime verification

> **Historical installer evidence — installer sections superseded.** The owner's explicit [standard Compose / GHCR requirement](standard-compose-ghcr-install.md) replaces host launchers, setup-image export/preparation, generated state/markers and installer rotation commands with operator-supplied protected configuration. The retained commands/results below describe the earlier implementation, not the current installation route. Bootstrap/migration/runtime authority, secret preservation, security/history and publication gates remain applicable. No replacement runtime or publication verification is implied; use [the current guide](../docker-registry-install.md).

Status: **source implementation prepared; NOT a release/deployment approval.**
Implements the authorized security/GitHub-install plan's P4 runtime-role and P5
installer slices. Registry metadata remains deliberately unreleased; no public
package availability is claimed. The owner must build/manual-test before beta.
See `../docker-registry-install.md` for the exact commands, variables and recovery
contract. No real environment file, running application database or live stack
was read/changed for the evidence here.

## Caller-environment preservation follow-up

Native PowerShell scripts share their caller process environment. Sanitizing Docker selectors/Compose variables must not permanently retarget subsequent caller commands or remove pre-existing managed values. Preserve only the variables this installer can mutate, restore them in `finally` on success/failure, and keep unrelated environment changes untouched. Add focused platform-independent PowerShell scope tests before wrapping sanitization/orchestration. No actual Docker, filesystem ACL or private credential operation is required for this regression; native Windows runtime remains a separate gate. Three focused tests reproduced the missing scope before the fix; all 29 environment/endpoint/ACL/state/launcher tests then passed, including actual PowerShell success/failure restoration with no value output. TypeScript and scoped lint passed.

## Acceptance and ownership

- One file-only setup image reuses dependency-free `deploy/install.cjs` rules.
  Export writes only allowlisted public assets; it never writes credentials.
  Bash/PowerShell host launchers own Docker inspection, stable daemon selection,
  foreign stack/volume refusal and private host permissions before helper writes.
- Five independent CSPRNG hex secrets; atomic no-overwrite initial publication;
  byte preservation, exclusive locks, cleanup/error refusal, lost-state recovery
  without rekeying. Private state defaults outside source/build/install assets.
- Explicit file-only `--rotate-claim` changes only `SETUP_CLAIM_SECRET`; normal
  reruns never rotate. Consumed claims stay persisted by the separate Go auth
  change (migration 000036, owned by the auth slice); this installer adds **no
  numbered schema migration** and never clears consumption history.
- Explicit `bootstrap` and `migrate` API commands; normal startup only verifies
  migrations/least privilege. Runtime gets DML/TRUNCATE/sequence access but no
  schema ownership/CREATE, role/admin privileges, inherited roles or ledger
  mutation. Missing/newer versions and read errors fail before listening.
- Coordinated pinned public image variables, Docker-only launchers, explicit
  local-image override before GHCR publication, separate Portainer prepare/import
  path. No host Node/Git/buildx prerequisite for published-image installation.
- Read-only PR CI; manual-only beta publication gated by manual-test plus
  sanitized-source/publication confirmations and exact beta tag/namespace.
  Scoped registry/release tokens, official action SHAs, checksummed public asset
  allowlist. No private SSH/PAT, automatic image push or deployment.

## Incremental RED/GREEN evidence

1. Initial `github-install.test.ts` failed because release secrets/export/runtime
   assets were absent. Credential tests then passed on the narrow first slice;
   later tests cover file export/claim-only rotation and the Docker-only launcher.
2. Migration-readiness test failed to compile without `VerifyMigrations`, then
   passed against the designated exclusive disposable PostgreSQL database.
3. Runtime-role test failed to compile without provisioning/grant/verification
   functions, then passed full migrations, runtime CRUD/content reset, and
   forbidden schema/role/ledger/SET ROLE operations against that same exclusive
   database. The test creates/drops fixed role names, so never run it on an
   application cluster or one sharing those role names.
4. Foreign replaced-volume test failed (a surviving marker previously permitted
   it), then passed after checking the volume's project/install-root ownership.
5. Newer-schema test failed (older API accepted an unknown ledger version), then
   passed after explicitly rejecting unknown versions.
6. Latest focused run:
   `npx vitest run src/scripts/install-bootstrap.test.ts src/scripts/docker-launcher.test.ts src/scripts/github-install.test.ts`
   plus `src/scripts/release-contract.test.ts` and
   `src/scripts/windows-state-guards.test.ts`,
   `src/scripts/windows-docker-endpoint.test.ts` and
   `src/scripts/windows-private-acl.test.ts` passed **56 tests**. These replace obsolete Node orchestration expectations;
   legacy pure two-secret file validation remains covered. No tests require
   retained private builder/upload scripts.
7. `bash -n install.sh`, `node --check deploy/setup.cjs`, and native PowerShell
   parser/help/dry-run checks on Linux passed. This is not Windows ACL evidence.
8. Focused Go run in `sync-server` passed with the explicitly selected disposable
   `TEST_DATABASE_URL` and application `DATABASE_URL` removed from the environment:
   `go test ./... -run '^(TestControlledRolesMigrationAndRuntime|TestMigrationReadiness.*|TestValidateDeploymentSecrets.*)$' -count=1`.
   The helper drops/recreates its public schema. `go mod verify` also passed
   before integrating the separately reviewed dependency-agent module changes.
   A full serialized `go test -p 1 ./... -count=1` also passed on that isolated
   database with Go 1.27.4; the optional external PDF artifact was absent and
   its journey skipped. No application database was used.
9. `npx tsc --noEmit --pretty false`, targeted ESLint for changed JS/TS files,
   YAML parsing, `docker compose config` with synthetic values for both modes,
   and `docker buildx bake --print` passed. The rendered synthetic Compose config
   forwarded claim and loopback auth settings only to API, retained local-image
   pull refusal, and published no API/DB host port. No image build or service
   start occurred. Unreleased registry config failed closed as intended.
10. Independent-review path isolation reproduction: five Linux overlap cases
    (same, descendant, ancestor and normalized dot-segment variants) and an
    unrelated-content directory all initially passed unsafe initialization. After
    the guard fix they fail before helper invocation or secret/ownership-marker
    creation; unrelated contents and directory permissions are preserved. A
    prefix-sharing sibling remains allowed. PowerShell synthetic tests extract
    and execute the actual guard functions on Linux for normalized Windows
    equal/descendant/ancestor paths, case differences and separator boundaries,
    plus unrelated contents. They also verify guard placement before creation,
    ACL changes and helper mounting. This is **not native Windows ACL evidence**;
    the execution check explicitly skips if PowerShell is unavailable.
11. Pip review follow-up RED/GREEN:
    - Docker context-switch and precedence tests initially failed. Bash now
      freezes the effective local endpoint and passes explicit `--host` for all
      daemon operations after clearing ambient selectors. Actual PowerShell
      resolver/invocation functions run under a synthetic mock and prove the
      same behavior, including context-over-host precedence and local named-pipe
      selection. Remote named-pipe endpoints were separately reproduced as an
      unsafe accepted case and now fail before state creation.
    - Spaced/quoted/CRLF claim rotation initially silently preserved the old
      value; inline comments were also initially lost. Replacement now targets
      exactly one parsed value token, keeps all other bytes/line endings, and
      reparses/validates a changed claim before atomic publication.
    - Windows source previously created a directory then changed its DACL. It
      now checks existing ancestor owners/effective ACLs first, rejects shared
      FullControl/custom parents and null/empty ACLs, creates each missing
      component using protected security in the creation API, and verifies
      ownership/privacy without late ACL repair. WinPS 5.1 and PowerShell 7+
      API signatures were checked against Microsoft documentation. Synthetic
      execution covers actual rejection functions and ordering; no native NTFS
      or retained-handle test ran. The helper's `ntfs-acl` argument is not an
      independent ACL attestation and requires the native launcher preflight.
    - A replaceable non-sticky Linux parent was also reproduced, then refused
      through trusted-owner/permission/sticky-ancestor checks before creating or
      mounting state. No Go/backend/CI changes were made in this follow-up.
12. Portable build-helper `--dry-run` emits three matching versioned local image
    tags; local launchers now verify OCI version labels and setup-image source
    version before initialization. Native Docker builds and label behavior remain
    a separate manual gate.

## Build/release inputs

Dockerfiles use `npm ci` plus the separately reviewed tracked lockfile, normal Go
checksum verification, Node **22.23.2** and Go **1.27.4** version assertions and
reviewed upstream Linux/amd64 digests. Go uses `GOTOOLCHAIN=local` so a hidden
compiler download cannot invalidate the scanned toolchain contract. Final image
OS/native dependency scans remain required; source dependency scans alone are
not final-image coverage. Upstream digest evidence was fetched from official
Docker Hub metadata on 2026-11-19:

- `https://hub.docker.com/v2/repositories/library/node/tags/22.23.2-alpine`
- `https://hub.docker.com/v2/repositories/library/golang/tags/1.27.4-alpine`
- `https://hub.docker.com/v2/repositories/library/alpine/tags/3.23`
- `https://hub.docker.com/v2/repositories/library/postgres/tags/17-alpine`

Official action SHAs were resolved from
`https://api.github.com/repos/actions/<action>/git/ref/tags/<major>` for checkout,
setup-node, setup-go, upload-artifact and download-artifact. Pin refreshes require
review/retest; a digest/SHA is immutability evidence, not a vulnerability verdict.

## Offline legacy-clone rehearsal (separate target, not in-place upgrade)

The authoritative integrated backend was copied privately without changing parent
Next.js/app sources. Its migration files through 35 matched the approved baseline
byte-for-byte. `TestOfflineLegacyCloneTransfer` ran against **one newly created**
labelled official PostgreSQL 17 container, tmpfs storage and a dynamically selected
loopback-only port; it never used the shared integration/test database or its
cluster-wide roles. All accounts, credentials and provider payloads were synthetic.
Actual API bootstrap/migrate commands and PostgreSQL custom dump/restore ran;
HTTP authentication handlers ran in-process without starting an API/Next service.

The rehearsal passed: initial legacy bootstrap refusal while controlled roles
were absent, roles-only bootstrap on an empty target, restore as migration owner
before current migrations, exact pre-migration table digests, normalized
post-migration account/content digests, unchanged provider ciphertext/HMAC
round-trip, existing bcrypt account HTTP login/new session, old-key denial,
runtime DDL/admin refusal, unchanged source-clone digests and byte-identical
five-value private-state backup/restore. Migration 36 intentionally retires the
legacy API key; login audit time changes only after the pre-login comparisons.
The test completed in approximately 17 seconds and its own fixture was removed;
no existing stack, container, database, global test role or live configuration was
changed. No key values, hashes or private paths belong in this evidence.

**Guard follow-up, authorized and verified:** the focused regression failed
against the authoritative earlier source because pre-existing safe role names
permitted legacy ownership mutation. The updated bootstrap checks public schema
and relation/routine/type/extension ownership **before any mutating SQL**, rejecting
legacy or mixed ownership regardless of role names. Populated controlled schemas
also require both logins to pre-exist; missing role credentials are not recreated.
No adoption flag, password change, rekey or migration ID was added.

The same opt-in fixture was rerun using a new private copy of authoritative backend
sources with only this branch's refusal patch overlaid. It passed in about six
seconds: initial and pre-existing-role legacy refusal with identical application
rows and persisted authority snapshots (role/password metadata, memberships,
database/schema/object owners/ACLs, default privileges and sequence state), mixed
legacy-owned table/routine/enum refusal, valid fresh roles-only and deliberately
restored/migrated controlled reruns, then the entire dump/restore/HMAC/login/key
retirement/limited-runtime proof above. Vacuum/statistics counters are excluded
from authority snapshots; no secret/hash values are printed. The new own fixture
was removed after both the RED reproduction and GREEN run. Parent app sources,
existing stacks and shared integration/test databases stayed untouched.

**Controlled migration downgrade boundary, authorized and verified:** a second
focused regression inserted a synthetic unknown ledger row, removed the known
migration-34 record and its seed canary, and revoked a runtime SELECT privilege.
Earlier `RunMigrations` ran the missing known migration and changed the canary /
ledger despite the future row; the RED reproduction failed as expected.
`RunMigrations` and read-only `VerifyMigrations` now share known-set membership
validation. The engine refuses unknown applied versions before known migration
SQL; actual `api migrate` exits before runtime grants. In the GREEN rehearsal,
ledger/data and authority snapshots remained unchanged for both calls, including
the revoked privilege. The synthetic faults were then restored exactly and a
current migration CLI rerun was idempotent; the same PostgreSQL 17 fixture also
passed the complete legacy ≤35 restore/HMAC/login/limited-role proof in about six
seconds. A pure unit test covers fresh/subset/current ledgers and unknown versions
both above and below the maximum known version. No schema fingerprint, production
migration file, dataset cleanup or new mode was introduced. Both RED and GREEN
own fixtures were removed; no shared database or parent source was touched.

The public manual procedure and format/weak-key STOP conditions are in
`../legacy-clone-recovery.md`; real operator backup, cutover, native Windows and
Portainer recovery remain separate gates.

## Unverified release gates

- Integrate the separately owned Go auth/000036 claim contract and dependency
  lock/module changes; rerun full combined suites and builds. No image build or
  full application start was performed for these source/mocked checks.
- Actual setup-image export/preparation and Compose startup/rerun/concurrent init,
  interrupted pull/migration, full DB+private-state restore and upgrade on an
  explicitly approved disposable target; no live data/service changes.
- Native Windows Docker Desktop NTFS inheritance, path/junction refusal,
  second-account and retained-handle checks; PowerShell parsing is insufficient.
- Exact Portainer Docker Standalone version and Git/environment import,
  completion conditions, second deploy, claim rotation and restore. CLI Compose
  tests do not establish Portainer behavior. No Swarm/arm64 support is claimed.
- Final sanitized-source/history/public-assets review, final OS/Node/Go/native
  scans, provenance/checksum verification, public package visibility and anonymous
  pulls from a fresh Docker configuration, then explicit owner publication.
- Configure protected GitHub environments `beta-images` and `beta-release` with
  required reviewers before enabling publication. Workflow files alone do not
  establish GitHub repository protection settings.
