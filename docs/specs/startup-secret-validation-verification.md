# Startup credential validation verification

## Scope

Implements the approved startup and Compose credential checks in `docs/specs/public-release-security-and-bootstrap.md`. This slice owns only `sync-server/main.go`, `sync-server/deployment_secrets_test.go`, `docker-compose.yml`, and this verification record. Installer generation, `.env.example`, auth/session redesign, credential rotation, and deployment are out of scope.

## Acceptance criteria

- Compose requires non-empty `POSTGRES_PASSWORD` and `HMAC_SECRET`; neither has a predictable fallback.
- Compose publishes only the web port, defaulting to `127.0.0.1` while retaining `${PORT:-3000}`. API and PostgreSQL remain unpublished.
- API startup validates PostgreSQL URL scheme/host/user/password, rejects missing/invalid/short (<16 character)/known-placeholder database passwords and missing/short (<32 character)/known-placeholder HMAC secrets before constructing the PostgreSQL store or running migrations.
- URL-encoded database passwords are accepted after URL parsing. Error messages do not include credential values or the database URL.
- HMAC is mandatory and persistent even when RSA JWT signing is configured, because saved API credentials use the HMAC secret as AES key material. `NewAuthService` behavior and existing auth fixtures remain unchanged.
- Existing unrelated `main.go` work (including the removal of startup category seeding) is preserved.

## Implementation note

The pure `validateDeploymentSecrets(databaseURL, hmacSecret)` helper runs at the top of `main`, before database connection and migrations. Compose errors are generic required-variable messages. PostgreSQL connection errors are also logged without driver details, avoiding accidental URL credential disclosure. Placeholder matching is case-insensitive and ignores punctuation, covering the current `.env.example` strings as well as common `CHANGE_ME`, `replace_me`, and generic literal values.

## Test-first evidence

Added `sync-server/deployment_secrets_test.go` before the helper. The first focused run, `cd sync-server && go test . -run '^TestValidateDeploymentSecrets' -count=1`, failed to compile with `undefined: validateDeploymentSecrets` at both call sites, confirming the missing behavior. After implementation the same command passed.

## Verification performed

- `cd sync-server && go test . -run '^TestValidateDeploymentSecrets' -count=1` — **PASS**. Cases cover valid URL-encoded credentials, exact minimum lengths, missing/invalid URL and password, short and generic/placeholder database credentials, missing/short/generic/placeholder HMAC, and error redaction.
- `docker compose --env-file <empty-synthetic-file> config --format json` with synthetic required secrets, `PORT=3099`, and sanitized inherited environment — **PASS**. Assertions verified loopback web binding with port 3099, no published API/PostgreSQL ports, and successful required-secret interpolation. Resolved config was captured privately and secret values were not printed.
- The same Compose config command with an empty synthetic env file and no secret environment — **PASS** as a negative check: Compose rejected missing required credentials; diagnostic output was suppressed.
- One exploratory Compose invocation initially omitted `--env-file`; Compose may therefore have implicitly loaded the repository `.env`. Its resolved output was captured in a temporary file and not printed. All reported final positive/negative Compose checks explicitly used an empty synthetic env file and isolated environment; no runtime `.env` values were intentionally read, inspected, or disclosed.

## Not run / limitations

No database connection, migrations, API process startup, Docker container startup, image build, deployment, or credential rotation was performed. The full Go test suite was not run; the focused pure validation test does not require `TEST_DATABASE_URL` or a live database. Installer-provided secret generation is verified in its owning implementation, not here.
