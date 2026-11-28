# Testing Strategy

> This document defines the testing strategy for DietLedger.
>
> The goal of testing is not coverage for its own sake.
>
> The goal is confidence.
>
> Testing should focus on protecting business-critical functionality, reducing regression risk, and enabling safe refactoring.

---

# Testing Philosophy

DietLedger is maintained by a single developer using AI-assisted development.

Testing should optimize for:

- correctness
- confidence
- maintainability
- refactoring safety

Testing should not optimize for:

- arbitrary coverage targets
- testing implementation details
- testing frameworks
- testing generated code

A small number of valuable tests is better than a large number of fragile tests.

---

# Testing Pyramid

DietLedger follows a simplified testing pyramid.

```text
E2E Tests
    ↑
Integration Tests
    ↑
Unit Tests
```

Most tests should be unit tests.

Integration tests should protect critical workflows.

E2E tests should validate only the most important user journeys.

---

# What Must Be Tested

The highest priority is business correctness.

---

# Tier 1: Critical Business Logic

These areas should have the strongest test coverage.

## Nutrition Calculations

Examples:

- nutrient calculations
- recipe nutrition totals
- serving calculations
- scaling calculations
- Daily Value calculations

Reason:

Incorrect results directly impact users.

---

## Health Calculations

Examples:

- BMI
- BMR
- TDEE
- calorie targets
- weight projections

Reason:

These calculations influence health decisions.

---

## Dietary Compliance

Examples:

- allergen detection
- dietary rules
- compliance checks

Reason:

Incorrect behavior may create safety issues.

---

## Unit Conversion

Examples:

- weight conversion
- volume conversion
- serving conversion

Reason:

Many nutrition calculations depend on conversions.

---

# Tier 2: Core Workflows

These workflows should be protected by integration tests.

## Recipe Workflow

```text
Food
    ↓
Ingredient
    ↓
Recipe
    ↓
Nutrition
```

Validate:

- ingredient addition
- nutrition generation
- serving calculations
- recipe scaling

---

## Food Logging Workflow

```text
Food
    ↓
Food Log
    ↓
Daily Totals
```

Validate:

- log creation
- aggregation
- reporting

---

## Meal Planning Workflow

```text
Recipe
    ↓
Meal Plan
    ↓
Grocery List
```

Validate:

- plan creation
- aggregation
- grocery generation

---

## Authentication Workflow

Validate:

- login
- registration
- token refresh
- authorization

---

# Tier 3: Critical User Journeys

E2E tests should focus on complete user outcomes.

## Create Recipe

User can:

- create recipe
- add ingredients
- save recipe
- view nutrition

---

## Log Food

User can:

- create profile
- log food
- view dashboard

---

## Create Meal Plan

User can:

- add recipes
- build meal plan
- generate grocery list

---

## Authentication

User can:

- register
- login
- access protected areas

---

# What Should Not Be Tested

Avoid testing:

## Framework Behavior

Examples:

- React internals
- React Query internals
- Next.js internals
- Go standard library behavior

These are already tested by their maintainers.

---

## Implementation Details

Avoid testing:

- private helper implementations
- CSS details
- internal component structure

Test behavior instead.

---

## Trivial Code

Avoid tests for:

- simple pass-through functions
- constant declarations
- obvious getters and setters

## Retired recipe artifacts

Do not maintain tests for the retired `seed-recipes/` directory or the finished
recipe bundles in `recipe_book_bundles/`. Application tests and verification
harnesses must not read either directory. Keep general recipe-bundle
import/export, custom nutrition, PDF export and USDA food-ingestion coverage;
use small synthetic fixtures rather than published recipe artifacts.

Implementation note: remove the seed converter/cookbook artifact tests and the
PDF-artifact-specific Go journey; replace artifact inputs in transport checks
with synthetic native-bundle JSON. Acceptance: no test or verification harness
depends on these directories, and the remaining frontend suite passes. Verify
with focused transport tests, the full frontend suite, TypeScript, lint and
non-database custom-nutrition Go tests. This is test retirement, not a product
behavior change, so no new failing behavior test is required; the reported
missing-seed-file failure is the reproduction. Do not alter application code,
recipe artifacts or private ignored conversion/verification scripts.

---

# Preferred Test Types

## Pure Function Tests

Highest value.

Examples:

- nutrition calculations
- conversion logic
- compliance logic
- aggregation logic

Characteristics:

- fast
- deterministic
- easy to maintain

---

## Integration Tests

Second highest value.

Examples:

- API handlers
- repository interactions
- workflow validation

Characteristics:

- validate system behavior
- catch integration bugs

---

## UI Tests

Use when behavior matters.

Examples:

- user workflows
- complex interactions
- form behavior

Avoid snapshot-heavy testing.

---

# Repository Testing Priorities

The following areas should receive test investment first.

## Priority 1

- nutrition-calcs
- nutrient calculations
- dietary-rules
- recipe-scaling
- unit-conversion
- glycemic-load

---

## Priority 2

- recipe workflows
- food logging workflows
- meal planning workflows
- grocery generation

---

## Priority 3

- authentication
- authorization
- API validation

---

## Priority 4

- publishing workflows
- sharing workflows
- administrative functionality

---

## Lint policy regression gate

Run `node --test eslint.config.test.mjs` alongside `npm run lint` when changing the lint configuration. The four standalone Node CommonJS harnesses in `docs/GitHubPagesTemp` may use `require`; the exception is limited to their exact filenames and the `@typescript-eslint/no-require-imports` rule. Application TypeScript and other CommonJS files retain that rule. Policy tests must verify both allowed and prohibited cases; do not replace them with a blanket CJS or application exemption. These harnesses continue to run under `node --test` independently of Vitest; browser checks remain optional and skipped browser tests are not verification evidence.

## Runtime image input contracts

Run `node --test scripts/runtime-image-contract.test.cjs` for Dockerfile changes. It protects the pinned Node/compiler and locked builder install, package-manager-free web runtime, reviewed Alpine security floors and unchanged direct entrypoints. This standard-library contract is not a substitute for actual image package inventories/scans. Raw package-version matches in public helper binaries require exact image/binary-hash and per-advisory symbol review; do not add blanket stdlib skips or VEX/CI filtering without parent review.

# Backend Testing Strategy

Backend tests should validate:

- business rules
- validation
- authorization
- persistence behavior

Avoid testing:

- HTTP libraries
- JSON libraries
- database driver internals

Focus on application behavior.

---

# Frontend Testing Strategy

Frontend tests should validate:

- user interactions
- workflow behavior
- calculation presentation
- state transitions

Avoid testing:

- styling
- layout details
- implementation structure

Focus on user-visible outcomes.

## Covered Diabetes-aware dietary workflow

- `sync-server/dietary_*_test.go` protects owner-scoped nutrition assessments, missing/unconfirmed facts, custom totals, yield-invariant density, validated criteria/enum arrays, atomic user provisioning, and migration-version failure rollback/retry. Run database coverage on a unique disposable PostgreSQL database.
- `src/components/dietary/*.test.tsx`, `src/components/recipe/diabetes-recipe-filter.test.tsx`, `src/hooks/use-dietary.test.tsx`, and the dietary API/rule tests protect opt-in filtering, editable persisted defaults, clearing optional fields, unknown results, malformed legacy fields and suppression of stale matches during failed/delayed recipe/profile reads.
- Browser evidence and full-suite limitations are recorded in `specs/diabetes-aware-dietary-filter.md`. A screen match must never be described as clinical safety certification.

## Covered content-reset workflow

- `sync-server/reset_data_test.go` exercises the public administrator reset with an independent actual-schema inventory, preserved nutrition/account metadata, completed and pending import state, identical public reimport, authorization/password rejection, and rollback on database failure. Retained personal deletion must clear only caller-owned content/import records and roll back on failure. Use a unique disposable `TEST_DATABASE_URL`; never an application database.
- Reset/startup coverage ensures one-time default-category initialization cannot repopulate a cleared instance on restart. New tables must be classified as cleared custom content or intentionally preserved account/reference metadata.
- Focused frontend interaction coverage exercises administrator Settings labels/confirmation, the instance-reset API rather than personal deletion, failure handling, and cache refresh after success. Browser verification is separate from jsdom coverage. Commands and limitations are recorded in `specs/complete-custom-data-reset.md`.

## Covered session-security workflow

- `sync-server/security_cookie_integrity_test.go` protects production host-prefixed cookie selection, duplicate rejection and separate explicit loopback transport; real browser prefix enforcement remains a distinct verification gate.
- `sync-server/security_auth*_test.go` covers one-use claimed first-admin admission, stable-lock races, last-admin removal, rollback, session revocation/rotation/replay/expiry, origin/CSRF checks, secure-cookie attributes and legacy-key retirement. Use only a dedicated disposable PostgreSQL database; the shared fixture drops its public schema.
- `src/lib/security-auth-client.test.ts` protects no persistent credentials, single-flight refresh, account-generation-safe delayed retries, shared-cookie principal mismatch rejection without revoking the other user's session, fresh-principal reload bootstrap, and refusal of cookie operations without origin-wide Web Locks. `src/hooks/use-auth.test.tsx` protects visible reload-required handling when legacy-worker retirement cannot be proven. Theme/dietary consumers retain account-generation isolation tests.
- Real Chromium plus loopback Go contract evidence and the intentionally separate integrated Next/proxy/worker/browser gates are recorded in `specs/security-auth-session-verification.md`. Unit or contract-harness results do not by themselves close the complete browser-security release gate.

## Scoped personal-key checks

`sync-server/personal_key_auth_test.go` verifies discovery and separation from session/public dispatch, legacy refusal, malformed/ambiguous credentials, expired/revoked or removed owners, malformed grants, and verification-store failures. Run PostgreSQL cases only with an isolated, disposable `TEST_DATABASE_URL`; existing reset tests include the personal-key relation and owner-only/rollback assertions. `personal_key_management_test.go` covers password/HTTPS/CSRF admission, expiry, owner list/revocation, and issuance caps. `personal_key_routes_test.go` checks the exact allowlist and UI grant options against the approved spec, with database regressions for cross-owner records, role-gated SQL, and sharing. The web management tests verify one-time display and obsolete account responses. The opt-in built HTTPS harness and its limitations are documented in [the scoped key spec](specs/scoped-personal-sync-api-keys.md).

## Covered API resource admission and transport

- `sync-server/build_input_contract_test.go` checks ordered Docker-ignore rules include the exact transport source while neighboring legacy APIs/private inputs stay excluded. This is a build-input contract, not a Docker image execution claim.
- `sync-server/seed_recovery*_test.go` covers fresh bounded terminal cleanup after cancellation/deadline, worker release after failed/blocked cleanup, and real PostgreSQL row-lock failure/recovery with exact-attempt guards and unrelated/legacy job preservation. Use only an exclusive disposable database.
- `sync-server/resources_test.go`, `ratelimit_test.go`, `seed_resources_test.go`, `seed_context_test.go` and `usda_live_test.go` cover actual-byte caps (including false/missing lengths and trailing data), route exceptions, cleanup, bounded workers/batches/inflation, cancellation, fake-clock limiter state and secret-safe synthetic provider errors. Context/database cases require an exclusive disposable `TEST_DATABASE_URL`; never an application database.
- `src/proxy.test.ts`, `proxy-route.test.ts` and `security-headers.test.ts` cover finite admission, request/response streaming lifetime, separate Set-Cookie/auth-CSRF forwarding, forwarding-header distrust, body caps and staged headers. Source tests prohibit convention-reserved middleware/proxy files because they reintroduce framework cloning before admission.
- Before claiming large-upload compatibility after Next/routing changes, run `npm run build:web` then `node scripts/verify-resource-transport.mjs`. The latter starts/closes only ephemeral loopback Next and synthetic upstream HTTP fixtures, asserts the built middleware manifest is empty, and streams large validly framed multipart transport at/over 512 MiB without retaining the dataset. This is opt-in runtime evidence, not a Docker/external ingress or complete food-import claim. No real provider or database is used. Record exact target Next version and standalone trace limitations.

## Covered onboarding workflows

- Setup wizard account -> basics transition: `src/components/setup/setup-wizard.test.tsx`.
  Guards against the wizard skipping the basics step after admin account
  creation (the step list changes shape when the session authenticates, so the
  current step is tracked by key, not positional index).
- Setup wizard finish + per-user completion: `src/components/setup/setup-wizard.test.tsx`.
  Guards that finishing the wizard records two distinct completions: the
  global instance flag via `completeOnboarding()` (`instance_meta`) AND the
  admin's own `onboardingComplete` via the per-user settings mutation
  (`user_settings`, keyed by user_id). Proves onboarding completion stays
  per-user instead of being shared/global.
- Backend instance-metadata + registration gate: `sync-server/handlers_instance_test.go`.
  Guards the public `GET /api/instance/state` read, the admin-only
  `POST /api/instance/onboarding/complete` and `PUT|PATCH
  /api/instance/registration` endpoints (auth/admin/method/rejection +
  success with persisted state), and the registration-disabled behavior of
  `POST /api/auth/register` (`403` when disabled and a user exists, the
  claimed first-admin path when registration is disabled, and recovery after
  re-enable). Requires `TEST_DATABASE_URL` like the rest of the backend
  integration suite.
- Settings completion/navigation ordering: `src/hooks/use-settings.test.tsx` holds an active settings refetch and proves `useUpdateSettings` cannot finish early. This prevents successful welcome Skip/Finish from navigating under a stale onboarding flag and being sent back to `/welcome`.
- Per-user welcome wizard: `src/components/setup/user-wizard.test.tsx`.
  Guards that Skip completes with only the `onboardingComplete` flag (no
  profile or preference payload written), that finishing persists the chosen
  unit system and theme together with the completion flag in one settings
  write, and that the optional profile is created with imperial height
  converted to centimetres (a BMI/BMR/TDEE input, so nutrition-domain
  correctness applies).
- Welcome routing gate: `src/app/(app)/layout.test.tsx`.
  Guards that an authenticated non-admin whose per-user `onboardingComplete`
  is false is redirected to `/welcome` without rendering app content.

## Security sharing and global-content regressions

`sync-server/security_sharing_trust_test.go` and `specs/security-sharing-trust-verification.md` cover cross-owner/admin-as-attacker sharing/category/template matrices, forged legacy canonical exports and dependency closure, reciprocal category-reparent and template-publication barriers, and direct/staged/retry/rollback/offline-backup standard-food trust. Trusted-promotion fixtures explicitly preseed synthetic canonical foods; separate empty-catalog restore cases require durable quarantine/unconfirmed metadata, quantities, portions and cookbook placement. Historical logs and unchanged ingredient snapshots remain unchanged through verification. Run database-backed tests serially with `TEST_DATABASE_URL` explicitly pointed at a unique disposable database; unset `DATABASE_URL`. These schema-resetting tests must never use application data. Test owner-positive paths alongside unauthorized HTTP/store attempts, and do not treat a skipped PostgreSQL test as passing evidence.

## Covered import-only quarantine workflow

- `sync-server/import_quarantine*_test.go` covers staging-first writes, whole-batch keep/cancel, cumulative imports, ownership, retry/rollback/commit failure, dependency cycles, independent promotion and book placement. Shared staged identities must survive cancellation by another batch.
- HTTP and separate-database owner-backup journeys cover both main and staged content, resumable pending decisions, source facts/unchanged snapshots, canonical rematch scaling, USDA portion weights and pending placement aliases. Use explicit disposable `TEST_DATABASE_URL`; these helpers drop schemas and create disposable restore databases. Skips are not passing evidence.
- `recipe-import-entrypoints.test.tsx`, `recipe-import-workflow.test.tsx`, `recipe-import-dialog.test.tsx`, `recipe-quarantine.test.tsx` and `recipe-import-bundle.test.ts` protect actual file/Markdown/share controls, missing-record choices, resumed decisions, existing popup reuse, errors, metadata and confirmed-promotion cache refresh. Published queries must not merge quarantine into the main recipe cache.
- Browser verification remains a separate check when tooling is available; jsdom tests are not a claim of a real browser journey. No new test framework or dependency is introduced.

## Authoritative custom recipe nutrition

`specs/custom-recipe-nutrition.md` requires coverage for validated whole-recipe facts, persistence and omission/removal semantics, authoritative serving totals without ingredient double-counting, nested-recipe fractions, custom import readiness, v4 import/export/backup and identity comparisons, logging/meal-plan/share/PDF consumers, and recipe scaling versus yield editing. Existing ingredient-derived recipe and historical-log behavior must remain unchanged. Run PostgreSQL integration checks only on a unique disposable database. Use synthetic fixtures for this application coverage; finished PDF recipe artifacts are outside the maintained test suite.

## Nutrition correctness suites (Phase B hardening)

- Vitamin D ingestion: `sync-server/seed_test.go`.
  Guards that USDA nutrient 324/1114 (IU) converts to micrograms (40 IU per
  microgram), that native microgram nutrient 1166 wins when present, and
  that the value is zero when absent. Requires no database.
- Unit conversion canonical tables:
  - `src/lib/recipe-types.test.ts` — `convertToGrams` pins the exact weight
    factors, water-density volume factors, the `whole`=100g heuristic, and
    the unknown-unit-returns-0 rule (single source: `unit-conversion.ts`).
  - `sync-server/units_test.go` — the Go table mirrors the TypeScript table
    so server-side matching and frontend calculators agree.
- Health calculation fixtures: `src/lib/nutrition-calcs.test.ts`.
  BMI / Mifflin-St Jeor / Harris-Benedict / Owen / TDEE assertions use
  hand-computed known values (not recomputed formulas), so a wrong constant
  cannot pass.
- Server-side input validation: `sync-server/validation_nutrition_test.go`
  (pure unit tests for the guards) and `sync-server/validation_handler_test.go`
  (handler-level 400 behavior for recipes, ingredients, logs, profiles,
  weights, custom foods, and day-plan entries). The handler file requires
  `TEST_DATABASE_URL`.

---

## Docker installation and database authority

- The owner's standard Compose requirement supersedes setup-helper/host-installer tests, not database security checks. Focused Compose/release contracts must cover five empty required secrets, lowercase-hex password guidance, absent/empty interpolation refusal, least-secret service mapping, private API/database ports, health/successful-completion ordering, identical Portainer semantics, exactly two application build/publication targets and digest-bound safe release assets. Source Compose must require explicit `DIETLEDGER_VERSION`; release assets contain literal approved digests. No private script or installed Node/Git/buildx/login may be required for public installation. These are repository contracts, not runtime evidence.
- `sync-server/runtime_roles_test.go` and `migration_readiness_test.go` run only
  against an explicitly disposable `TEST_DATABASE_URL`. They exercise fresh role
  provisioning/migration, runtime CRUD/reset, forbidden DDL/admin/ledger writes,
  and missing/newer migration refusal. Controlled migration must reject unknown
  applied versions before any missing known SQL or runtime grants; the offline
  fixture includes an executable canary plus revoked ACL and checks no mutation.
  Pure known-set tests also reject unknown gaps below the highest known version.
  Role tests also create/drop the fixed
  fresh-install roles: use an isolated test cluster/database with no app roles.
- `sync-server/legacy_clone_transfer_test.go` is an explicit opt-in offline
  migration rehearsal. It never accepts an application/shared test database:
  it creates one new labelled PostgreSQL 17 tmpfs container on an explicitly
  approved local endpoint, uses a dynamic loopback port and synthetic secrets,
  then removes only its own returned container ID. Ordinary Go runs skip it.
  Its legacy 1–35 → controlled-target dump/restore checks are separate from
  fresh install and native/Portainer certification; see `legacy-clone-recovery.md`
  for ordering, immutable key requirements and refusal/controlled-rerun checks.
  Refusal regressions compare persisted authority metadata as well as data, so
  safe pre-existing role names cannot hide schema-owner/ACL/password mutations.
- PR CI has only read permissions and no live credentials. Release checks must separately prove a fresh Compose install on an approved isolated target, bootstrap/migration failure blocking, account/auth flows, preservation across repeated up/recreation/restarts and restore, least database authority, same-origin transport and protected operator configuration (including restrictive Windows ACLs where applicable). Record exact image IDs and distinguish local candidate tests from anonymous GHCR exact-digest pulls.
- Source review identifies Portainer CE 2.45.4 LTS as a candidate with required Compose dependency handling; the actual version/runtime and fresh/second-deploy/failure/restore checks remain pending. Health/completion conditions gate orchestration, not continuous restarts; API startup still independently verifies ledger/authority. Never remove conditions to obtain a passing deployment. Mock/static/CLI Compose checks do not certify Portainer. See `docker-registry-install.md` and `specs/standard-compose-ghcr-install.md`; historical installer evidence is retained but does not verify the replacement.

---

# Nutrition Testing Requirements

Nutrition is protected functionality.

Changes affecting:

- nutrients
- servings
- BMI
- BMR
- TDEE
- Daily Values
- dietary compliance

must include tests.

No exceptions.

---

# Regression Testing

Every bug fix should include:

1. A failing test.
2. The fix.
3. A passing test.

The bug should not be allowed to reappear.

---

# Test Data Principles

Prefer:

- small datasets
- realistic values
- deterministic inputs

Avoid:

- large fixtures
- random values
- unnecessary complexity

Tests should be easy to understand.

---

# Coverage Philosophy

Coverage is a signal.

Coverage is not a goal.

A well-tested critical calculation is more valuable than dozens of low-value tests.

When choosing between:

- more coverage
- better coverage

prefer better coverage.

---

# Before Merging Changes

For significant changes verify:

## Correctness

- Does behavior work?
- Are calculations correct?

## Regression Safety

- Are tests present?
- Are tests meaningful?

## Risk Areas

- Nutrition
- Health calculations
- Compliance
- Authentication
- Data integrity

Have these areas been protected?

---

# Testing Checklist

Before completing a change:

## Business Logic

- Is the behavior tested?

## Critical Calculations

- Are calculations verified?

## Integration

- Are workflows validated?

## Regression

- Would this bug be caught again?

## Maintainability

- Will future contributors understand the test?

If any answer is no, additional testing may be required.

---

# Success Criteria

The testing strategy succeeds when:

- critical calculations are protected
- regressions are caught early
- refactoring becomes safer
- contributors trust the test suite
- bugs become increasingly difficult to reintroduce

The goal is confidence, not coverage.