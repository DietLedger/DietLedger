# Offline legacy clone → fresh controlled deployment

**Manual recovery procedure, not an in-place upgrade or automatic adoption.**
Do not redeploy the new API image over an old Portainer database using its old
superuser environment: ordinary API startup intentionally refuses that authority.
Keep the old stack, database, credentials and volumes untouched. The procedure
below restores an approved offline backup into a **separate fresh target**.
Operator permission for backup, target resources and eventual cutover is required.

The PostgreSQL 17 synthetic rehearsal verified below is not permission to operate
on a real installation. Windows-native and Portainer-manager recovery sequences
are not certified by that database/HTTP-handler rehearsal.

## STOP conditions and backup gate

1. Obtain a consistent, trusted offline database archive and the exact private
   configuration used by that source: environment/Portainer variables, persistent
   HMAC, any mounted RSA signing material, selected release/configuration, and
   PostgreSQL recovery material. Preserve an independent verified full backup;
   recipe/book export is **not** sufficient. Do not put dumps, private state or
   recovery keys in source, an image build context, Pages or release assets.
2. The existing `HMAC_SECRET` is also the encryption key source for stored provider
   secrets. It must remain **byte-for-byte unchanged**. Missing, weak, placeholder
   or unverified source HMAC means **STOP and recover the original configuration**.
   Generating a new HMAC does not recover encrypted secrets. Do not wipe data or
   re-encrypt unknown ciphertext as a shortcut. New installation guidance recommends
   64-character lowercase-hex values; a legacy HMAC must instead be preserved exactly
   and checked against current Go validation. Any incompatibility requires separately
   reviewed manual recovery, not silent key replacement. Migration/runtime passwords
   must be distinct, exactly 64 lowercase hex characters.
3. Inventory the source PostgreSQL major and migration ledger. This rehearsal
   covers PostgreSQL 17 and the unchanged migration prefix 1–35. Other versions,
   extensions, unknown/newer ledgers, corrupted dumps or unexpected ownership
   require review before continuing. Only restore a trusted archive; a database
   dump is executable database content, not an untrusted recipe import.
4. A dump represents its snapshot. Writes made on the old installation afterward
   are not transferred. An eventual write-freeze/final-backup/cutover plan needs
   separate approval. Nothing here stops/restarts/deletes the old stack.

## Bootstrap refusal/ownership contract

Role names or safe role attributes alone do **not** authorize an existing
application database. Before any role creation, grant, revocation or schema-owner
change, bootstrap must distinguish:

- An empty public schema with a normal fresh-database owner: initial bootstrap
  and controlled roles-only reruns are allowed.
- A populated public schema already owned by `dietledger_migrate`, with every
  public relation, routine, type and extension owned by that migration role and
  both controlled logins already present: controlled reruns are allowed. This
  includes objects deliberately restored **as the migration role** before the
  new application migrations run. Ownership is the provenance boundary, not a
  new adoption flag or a guessed migration version.
- Any legacy-admin-owned, mixed-owned, missing-role or otherwise unverified
  populated schema: refuse without changing **any** content, role credentials,
  grants, ACLs, owners or memberships. Pre-existing safe controlled role names in
  the cluster do not weaken this refusal. No implicit ownership repair is allowed.

Allowed reruns retain role passwords; they do not rekey the database. A refused
legacy target requires the separate fresh-target restore process below, not a
retry flag or manual grants to make an in-place upgrade appear owned.

## Required ordering

```text
approved offline legacy dump + original HMAC
  → new empty target/private state
  → PostgreSQL only
  → api bootstrap (roles/schema authority only; NO app migrations)
  → restore legacy dump AS dietledger_migrate, no owners/ACLs
  → api migrate (new migrations + runtime grants)
  → readiness, data/account/secret/auth checks
  → API/web, then explicit operator cutover approval
```

**Do not run full `compose up` / a full Portainer stack before the restore.** They deliberately run migrations automatically as a
controlled job. Restoring an old schema over an already migrated target is not
this procedure. If ordering is wrong, stop; do not use destructive restore flags
against a populated target to force it through.

## Fresh Compose target: manual stages

These Bash examples are for an operator-approved fresh local Linux Docker target,
not the original server/daemon/stack. Use a separate host or dedicated clean daemon
when the old `dietledger` stack still exists. Operators must select a new project
and volume and verify they cannot collide with foreign/old resources; there is no
host installer to attest that selection. Do not delete/rename old resources to
make room. The target remains Compose-owned; do not later switch its manager to
Portainer through implicit adoption.

1. Select matching reviewed digest-pinned release assets as described in
   [the installation guide](docker-registry-install.md). No published release is
   asserted here. Before publication, a separately approved candidate test can use
   locally built web/API images with the reviewed `docker-compose.local.yml`
   override on the same isolated daemon and explicit `DIETLEDGER_VERSION=local`.
   This is not anonymous registry-install evidence. Do not start services yet.
   Inspect the target and choose its local socket explicitly; do not rely on a
   mutable current context. Replace the endpoint placeholder deliberately.

   ```bash
   set +x                    # no shell tracing or secret-bearing transcripts
   TARGET_ENDPOINT='unix:///<approved-local-target-socket>'
   STATE="$HOME/dietledger-recovery-private"
   ROOT="$(pwd -P)"           # reviewed public install-assets directory
   unset DOCKER_CONTEXT DOCKER_HOST DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
   ```

   Create a new private configuration directory with owner-only permissions,
   copy `.env.example` to `$STATE/.env`, restrict it to mode 0600 **before** entering
   secrets, and fill the five assignments as below. For the pre-publication
   local candidate only, also set `DIETLEDGER_VERSION=local` and use the reviewed
   local override. A published digest-pinned release Compose needs no version
   variable. No installer, setup image, ownership marker or automatic secret
   generation is required.

2. Before any application data/secret is written to this new target, privately set
   its `HMAC_SECRET` to the exact source HMAC. This copies the existing encryption
   material; it does **not** rotate the source key. Supply four new independent
   CSPRNG values for bootstrap, migration, runtime and setup claim, each 32 random
   bytes rendered as 64 lowercase hex (password manager or separate optional
   `openssl rand -hex 32` invocations). Do not copy the old two-value template
   over the new target configuration or reuse the old superuser as the API login.
   Keep all **five final target values** and selected deployment configuration in
   an encrypted offline backup with the full database backup. Future recovery
   restores that complete configuration exactly; it never regenerates missing
   keys for an initialized database. Keep backups outside the configuration directory.

3. Remove ambient managed interpolation overrides and use explicit env/config
   files. Do not print `compose config`, environment values or service inspection
   output containing secrets.

   ```bash
   unset POSTGRES_PASSWORD MIGRATION_DB_PASSWORD API_DB_PASSWORD HMAC_SECRET SETUP_CLAIM_SECRET
   unset POSTGRES_USER POSTGRES_DB PORT BIND_ADDRESS CORS_ORIGIN AUTH_ALLOW_INSECURE_LOOPBACK
   unset DIETLEDGER_VERSION
   C=(docker --host "$TARGET_ENDPOINT" compose --project-name dietledger
      --project-directory "$ROOT" --env-file "$STATE/.env"
      -f "$ROOT/docker-compose.yml")
   # Candidate-only local test: DIETLEDGER_VERSION=local is set in the private
   # env and add the reviewed override before invoking C:
   # C+=(-f "$ROOT/docker-compose.local.yml")
   "${C[@]}" config --quiet
   "${C[@]}" up -d --wait postgres
   "${C[@]}" run --rm --no-deps bootstrap
   ```

   A published release uses the literal digests in its reviewed Compose asset,
   with no release.env or local override. The database must still be empty at this
   point: bootstrap configures roles/schema permissions, not application tables.
   If it finds an unowned initialized database, **stop**. This is not authority to
   adopt it. Verify no application tables or migration ledger exist before restore.

4. The offline archive must be custom-format and owner/ACL-free on restore. Obtain
   it from the approved **offline source clone/backup**, never an implicitly selected
   live database. PostgreSQL 17 client tools are available inside the official
   PostgreSQL image. Required export options are:

   ```text
   pg_dump --format=custom --no-owner --no-acl --dbname=<approved-offline-source-clone>
   ```

   Restore as `dietledger_migrate`, **not** the bootstrap superuser and not API
   runtime. Supply the migration password through protected client configuration
   or environment, never command-line value, logs or a pasted shell literal.
   For the recommended bare lowercase-hex assignment, the following Bash reader
   fails rather than guessing if that format has been edited:

   ```bash
   PGPASSWORD=; found=0
   while IFS='=' read -r name value || [[ -n "$name" ]]; do
     [[ "$name" = MIGRATION_DB_PASSWORD ]] || continue
     (( found == 0 )) || { echo 'STOP: duplicate credential assignment' >&2; exit 1; }
     [[ "$value" =~ ^[0-9a-f]{64}$ ]] || { echo 'STOP: use reviewed protected client configuration' >&2; exit 1; }
     PGPASSWORD="$value"; found=1
   done < "$STATE/.env"
   (( found == 1 )) || { echo 'STOP: restore private target state' >&2; exit 1; }
   export PGPASSWORD
   if "${C[@]}" exec -T --env PGPASSWORD postgres pg_restore \
     --host 127.0.0.1 --username dietledger_migrate --dbname dietledger \
     --no-owner --no-acl --clean --if-exists --single-transaction --exit-on-error \
     < "$APPROVED_PRIVATE_ARCHIVE"; then result=0; else result=$?; fi
   unset PGPASSWORD
   (( result == 0 )) || { echo 'STOP: restore failed; inspect private diagnostics' >&2; exit 1; }
   ```

   `--clean --if-exists` is permitted here **only for the verified fresh target**,
   so the archive can recreate its public schema. It must never target the source,
   an already used target, or an ambiguously selected database. No role dump is
   restored over the fresh controlled roles. No password/HMAC is regenerated.

5. Only after successful restore, apply current migrations and runtime grants:

   ```bash
   "${C[@]}" run --rm --no-deps migrate
   ```

   Stop on any migration error. Do not grant DDL/superuser to API or skip ledger
   checks. Both the controlled migration command and normal API startup must
   reject any ledger version absent from their embedded known set. Controlled
   migration checks this **before** applying even a missing known step and before
   runtime grants. An older binary must never partially modify a newer database
   and defer downgrade rejection until serving. The normal API also verifies
   migration completeness and least privilege before listening. Restore/rehearse
   backups rather than improvising rollback or deleting tables/volumes. Never
   delete real migration-ledger rows to coerce an older binary; select the matching
   reviewed release or an approved compatible backup. Schema downgrades are not
   automatic recovery.

6. Before enabling wider access, verify content counts/digests, clinical and food
   log snapshots, recipe/book placement, user IDs/bcrypt/admin roles, and provider
   secret decryption using the unchanged HMAC. Migration 36 intentionally retires
   the old `users.api_key` bearer value and introduces DB-backed sessions. Old keys
   and stateless credentials must not authenticate. Existing account passwords
   remain valid; logging in creates a new session and updates login audit time.
   Recipe/book exports cannot substitute for these complete database checks.

7. Start API/web only on the new approved target after the preceding checks,
   using the same explicit Compose endpoint, project, files and preserved private
   configuration. No host installer or manager takeover is involved. Back it up
   again before cutover. Wider access still requires explicit TLS/origin/firewall settings;
   insecure-loopback cookie mode is not a public HTTP deployment setting.
   Keep the original stack/backup until the owner approves cutover and later
   retirement separately. This document grants neither action.

## Portainer boundary

The source may be an old Portainer installation; exporting an offline clone does
not change its ownership or authorize new-image redeployment there. The tested
manual sequence above uses a new controlled database, not Portainer stack adoption.
A new Portainer target needs an independently reviewed staging sequence that starts
only PostgreSQL/bootstrap, restores before migrations, then enables the normal
migrate/API/web definition against that same **new Portainer-owned** volume.
Do not deploy the full Git-stack definition first and assume it leaves an empty
unmigrated restore target. Exact Portainer behavior and native Windows binary
archive transport require separate rehearsal; they were not exercised here.

## Reproducible synthetic verification

`sync-server/legacy_clone_transfer_test.go` is explicitly opt-in. It accepts no
existing database URL/container. It creates exactly one new labelled official
PostgreSQL 17 container per invocation, tmpfs storage, dynamically published
loopback-only port, random synthetic credentials and a private temporary state.
It removes only that returned container ID, including on failures after creation.
Do not run it against an application container or substitute the shared test DB.

In a private copy of the authoritative integrated backend source, after explicit
permission to create that one disposable PostgreSQL fixture:

```bash
RUN_LEGACY_CLONE_FIXTURE=1 LEGACY_CLONE_DOCKER_ENDPOINT='unix:///<approved-local-socket>' \
  go test . -run '^TestOfflineLegacyCloneTransfer$' -count=1 -v
```

The ordinary Go suite skips this fixture without explicit opt-in. The recorded
rehearsal used the unchanged baseline migrations 1–35, inserted a legacy account
with bcrypt/API-key SQL (not current claim-aware CreateUser), seeded recipes,
book/chapter/page placement, clinical/food-log snapshots, settings, encrypted
provider data and legacy refresh metadata. It ran actual API **bootstrap/migrate
commands**, PostgreSQL dump/restore, runtime-role checks and current HTTP handlers
in-process—no Next.js/API listener or full app service was started.

Successful evidence: bootstrap refused legacy data both before and after safe
controlled role names existed in the cluster. Refused calls preserved application
rows and authority snapshots covering role/password metadata, memberships,
database/schema/object ownership and ACLs, default privileges and sequences
(excluding observational vacuum/statistics counters). Migration-owned schema with
a foreign-owned table, routine or enum was also refused without mutation. Fresh
roles-only, deliberately restored migration-owned and fully migrated controlled
reruns succeeded without changing role credentials. A synthetic future-ledger
case with a missing executable known migration/canary and a revoked runtime grant
was rejected by both the engine and actual migrate command without ledger, data
or ACL changes; restoring only those fixture faults preserved current reruns. Target bootstrap created no
app tables; restore was ownerless/ACL-free as migration owner; pre-migration table
digests matched exactly; post-migration baseline content/account digests matched
after only API-key/ledger normalization; original provider ciphertext decrypted
with unchanged HMAC; bcrypt HTTP login/new session worked; old-key authentication
and runtime DDL were denied; source clone stayed unchanged; five-value private
state backup/restore was byte-identical; own fixture cleanup passed. This does not prove a real operator backup, production cutover,
Windows ACLs, Portainer recovery or all possible legacy HMAC formats.

The focused ownership regression was reproduced failing on the earlier
implementation, then passed with the refusal hardening and full restore proof in
one newly created disposable fixture. This closes the source-level guard finding,
not the operator's real backup, cutover or platform gates. Use the reviewed version
containing that hardening; the original stack stays untouched.
