# DietLedger Phase 1 Migration Path

Status: Implementation roadmap
Date: 2026-06-05
Scope: Migration to the Phase 1 system described in `system_requirements.md`

## 1. Migration Principles

Every phase MUST end with a working system.
Every task SHOULD be small enough for one focused AI-assisted coding session.
Architectural correctness takes priority over fastest line-count deletion.

Before making changes, future agents MUST read:

1. `system_requirements.md`
2. This file
3. The specific files touched by the task

Test-driven development MUST be used for behavioral changes:

1. Write or update the test first.
2. Confirm the test fails or the missing coverage is visible.
3. Implement the smallest change that passes.
4. Refactor only while tests remain green.

Destructive removals MUST happen only after replacement behavior is tested and working.

## 2. Target End State

At the end of this migration:

- The web app talks only to the Go API for application data.
- PostgreSQL owns all persistent user data.
- Next.js API route handlers are removed.
- Local-only mode is removed.
- IndexedDB application storage is removed.
- Frontend sync infrastructure is removed.
- SQLite backend support is removed.
- Tauri and Capacitor remnants are removed from Phase 1 builds.
- React Query owns server state.
- Zustand owns only client interaction state where needed.
- All current user-facing features still work.
- The test suite covers business logic, API endpoints, authorization, data ownership, and critical UI flows.
- Coverage exceptions are documented.

## 3. Phase Gates

Every phase MUST pass its gate before the next phase begins.

Standard gate:

- Frontend build succeeds.
- Backend build succeeds.
- Relevant unit tests pass.
- Relevant API tests pass.
- No user-facing feature in scope is knowingly broken.
- New coverage does not reduce meaningful coverage for touched paths.
- Any coverage exception is documented.

Suggested commands:

```bash
npm run lint
npm run test
npm run test:coverage
npm run build
cd sync-server && go test ./...
cd sync-server && go build
```

If a command does not exist yet, the task that needs it SHOULD add it or document the temporary substitute.

## 4. Phase 0: Establish Test And Contract Foundation

Goal: Create the safety rails needed before migration begins.

The system remains functionally unchanged at the end of this phase.

### Task 0.1: Add Phase 1 API Contract Skeleton

Description: Create a Markdown API contract that lists all required Phase 1 resource areas and records the current intended endpoint shape.

Acceptance criteria:

- `api_contract.md` exists or `system_requirements.md` contains an equivalent API section.
- Each resource area from `system_requirements.md` is represented.
- Each endpoint entry includes method, path, auth, request, response, and ownership notes.
- Unknown details are marked as `TBD` rather than guessed.

Verification:

- Documentation review confirms every current feature has an API home.
- No code changes are required.

Dependencies: None.

Estimated scope: Small.

### Task 0.2: Standardize Test Commands

Description: Ensure frontend and backend test commands exist and are documented.

Acceptance criteria:

- Frontend has commands for unit tests and coverage.
- Backend has `go test ./...` support documented.
- Build commands are documented.
- Missing tools are added only if required.

Verification:

- Run available test and build commands.
- Document commands that are not yet available.

Dependencies: None.

Estimated scope: Small to medium.

### Task 0.3: Add Baseline Smoke Tests

Description: Add initial tests that prove the hosted path can authenticate and reach key resources.

Acceptance criteria:

- Backend handler tests cover health, auth failure, and at least one authenticated resource.
- Frontend smoke test covers rendering authenticated app shell or equivalent mocked state.
- Tests are designed to survive internal refactors.

Verification:

- New tests fail before required setup if coverage was absent.
- New tests pass after setup.

Dependencies: Task 0.2.

Estimated scope: Medium.

### Phase 0 Gate

- Baseline test commands exist.
- Baseline contract exists.
- Existing app still builds.
- No migration behavior has been changed yet.

## 5. Phase 1: Lock The Runtime Path To Go API

Goal: Ensure the web app uses the Go API path in normal operation.

The system remains usable with current features at the end of this phase.

### Task 1.1: Add Tests For API Client Selection

Description: Prove that the frontend application resolves the Go API client for Phase 1 builds.

Acceptance criteria:

- Tests cover client selection behavior.
- Tests prove local-only mode is not selected for Phase 1.
- Tests cover expected API base URL behavior.

Verification:

- Test fails if `LocalApiClient` is selected.
- Test passes once Phase 1 client selection is enforced.

Dependencies: Phase 0.

Estimated scope: Small.

### Task 1.2: Remove Local-Only Runtime Selection

Description: Simplify the API client factory so Phase 1 always uses the Go API client.

Acceptance criteria:

- `getApiClient()` or equivalent returns the Go API client.
- Local-only environment flags no longer alter Phase 1 runtime behavior.
- Auth bypass for local-only mode is removed.
- User-facing local-only banners or controls are hidden or removed.

Verification:

- API client selection tests pass.
- Login-required routes still require authentication.
- Core recipe list or equivalent page loads through Go API.

Dependencies: Task 1.1.

Estimated scope: Medium.

### Task 1.3: Confirm Next Proxy Behavior

Description: Ensure `/api/*` requests are proxied to the Go API or otherwise routed through the Go API.

Acceptance criteria:

- Proxy behavior is tested or manually verified.
- No new Next.js application API behavior is added.
- API URL configuration is documented.

Verification:

- Browser or integration test confirms a frontend API call reaches the Go API.
- Go health/about endpoint is reachable through the frontend path if proxying is used.

Dependencies: Task 1.2.

Estimated scope: Small.

### Phase 1 Gate

- Web app uses Go API for application data.
- Local-only runtime behavior is disabled.
- Auth bypass is removed.
- Existing critical app flows still work.

## 6. Phase 2: Complete Server Ownership Of Persistent Data

Goal: Move all persistent user data behind the Go API and PostgreSQL before deleting client persistence.

The system remains usable with all current user-facing features at the end of this phase.

### Task 2.1: Classify Remaining Client-Persisted Data

Description: Produce a concise checklist of all remaining data currently stored outside PostgreSQL.

Acceptance criteria:

- Checklist includes templates, dietary profiles, allergen rules, brand kits, pantry staples, user location, app settings, and API keys.
- Each item is classified as persistent user data or cache/UI state.
- Every persistent item has a planned Go API and PostgreSQL destination.

Verification:

- Search confirms all `storage.ts`, IndexedDB, and localStorage persistence points are accounted for.
- Checklist is added to migration notes or relevant task descriptions.

Dependencies: Phase 1.

Estimated scope: Small.

### Task 2.2: Server-Persist App Settings

Description: Move account-level app settings to PostgreSQL through the Go API.

Acceptance criteria:

- App settings are stored per account.
- API supports reading and updating settings.
- Frontend saves settings through the API.
- localStorage, if used, is only cache.

Verification:

- Backend tests cover read/update, auth, ownership, validation.
- Frontend tests cover settings load/save behavior.
- Manual check confirms settings follow account after reload.

Dependencies: Task 2.1.

Estimated scope: Medium.

### Task 2.3: Server-Persist Templates

Description: Move user-created templates to PostgreSQL through the Go API.

Acceptance criteria:

- API supports template CRUD.
- Templates are user-owned or explicitly public defaults.
- Existing template UI works through the API.
- Export/render flows still find templates.

Verification:

- Backend tests cover CRUD and ownership.
- Frontend tests cover list/create/update/delete.
- Export smoke test confirms template usage.

Dependencies: Task 2.1.

Estimated scope: Medium.

### Task 2.4: Server-Persist Dietary Profiles And Allergen Rules

Description: Move dietary profiles and allergen rules to PostgreSQL through the Go API.

Acceptance criteria:

- API supports dietary profile CRUD.
- API supports allergen rule CRUD scoped to profile/user.
- Compliance/reporting flows use server data.
- Unauthorized cross-user access is rejected.

Verification:

- Backend tests cover CRUD, validation, and ownership.
- Frontend tests cover profile and allergen rule workflows.
- Compliance report smoke test passes.

Dependencies: Task 2.1.

Estimated scope: Medium.

### Task 2.5: Server-Persist Brand Kits

Description: Move brand kits to PostgreSQL through the Go API.

Acceptance criteria:

- API supports brand kit CRUD.
- Brand kits are user-owned.
- Cookbook export and nutrition report flows can use brand kits.
- localStorage/IndexedDB is not authoritative.

Verification:

- Backend tests cover CRUD and ownership.
- Frontend tests cover create/edit/delete.
- Export/report smoke tests verify brand kit selection.

Dependencies: Task 2.1.

Estimated scope: Medium.

### Task 2.6: Server-Persist Pantry Staples And User Location

Description: Move pantry staples and user location to PostgreSQL through the Go API.

Acceptance criteria:

- API supports pantry staple list/add/remove.
- API supports user location read/update.
- Grocery or seasonal feature behavior remains intact.
- Data is per account.

Verification:

- Backend tests cover pantry and location ownership.
- Frontend tests cover add/remove/update workflows.
- Manual check confirms persistence across reload.

Dependencies: Task 2.1.

Estimated scope: Medium.

### Task 2.7: Server-Encrypt API Keys And Secrets

Description: Ensure user-provided API keys and secrets are encrypted server-side.

Acceptance criteria:

- API keys are stored encrypted at rest.
- Plaintext secrets are never returned after creation unless explicitly designed and approved.
- Frontend does not persist secrets authoritatively.
- Key rotation or replacement is supported.

Verification:

- Backend tests cover create/list/delete and encrypted storage behavior.
- Tests prove stored value is not plaintext.
- Frontend tests cover key management UI.

Dependencies: Task 2.1.

Estimated scope: Medium.

### Phase 2 Gate

- All persistent user data has a PostgreSQL-backed API path.
- localStorage is cache only.
- IndexedDB is no longer needed for any user-facing feature.
- All moved features have tests.

## 7. Phase 3: Remove Frontend Sync And Offline Infrastructure

Goal: Remove frontend sync/offline behavior after server ownership is complete.

The system remains online-only and fully usable at the end of this phase.

### Task 3.1: Remove Sync UI From Active Layouts

Description: Remove sync indicators, sync settings, local mode banners, and related UI from active screens.

Acceptance criteria:

- Active layouts do not import sync/local-only UI.
- No user-facing controls advertise unsupported sync or local-only behavior.
- Navigation and layout still render correctly.

Verification:

- Component tests or smoke tests cover app shell rendering.
- Manual browser check confirms no sync/local-only UI appears.

Dependencies: Phase 2.

Estimated scope: Small.

### Task 3.2: Remove Frontend Sync Store And Engine Imports

Description: Delete or disconnect frontend sync engine, sync store, conflict resolver, write queue, and read cache from active code.

Acceptance criteria:

- No active frontend import references sync engine/store/conflict/write queue/read cache.
- Go API client performs direct API requests without offline queue semantics.
- Failed writes surface errors instead of being silently queued.

Verification:

- Search confirms no active imports.
- API client tests cover failed write behavior.
- Build passes.

Dependencies: Task 3.1.

Estimated scope: Medium.

### Task 3.3: Remove Deprecated Frontend Sync Files

Description: Delete unused frontend sync/offline files after imports are gone.

Acceptance criteria:

- Unused sync/offline files are deleted.
- Build and tests pass.
- No feature uses deleted modules.

Verification:

- Build passes.
- Search confirms deleted symbols are absent from active imports.

Dependencies: Task 3.2.

Estimated scope: Small.

### Phase 3 Gate

- Frontend has no active sync/offline infrastructure.
- Failed network writes are visible errors.
- App remains fully online-functional.

## 8. Phase 4: Remove IndexedDB And Local API Architecture

Goal: Delete IndexedDB authoritative storage and LocalApiClient.

The system remains fully usable through the Go API at the end of this phase.

### Task 4.1: Redirect Type Imports Away From `storage.ts`

Description: Move shared types to a server/API type module and stop importing types from `storage.ts`.

Acceptance criteria:

- No component imports types from `storage.ts`.
- Shared frontend types are sourced from API/domain type modules.
- Type-only changes do not alter behavior.

Verification:

- TypeScript build passes.
- Search confirms no type imports from `storage.ts`.

Dependencies: Phase 3.

Estimated scope: Medium.

### Task 4.2: Remove Direct Function Imports From `storage.ts`

Description: Replace all direct `storage.ts` function calls with Go API-backed behavior or tested UI-cache behavior.

Acceptance criteria:

- No active code imports functions from `storage.ts`.
- Every replaced behavior has tests.
- Important data still persists to PostgreSQL.

Verification:

- Search confirms no function imports from `storage.ts`.
- Feature tests for touched paths pass.
- Manual checks cover representative recipe, book, nutrition, settings, and export workflows.

Dependencies: Task 4.1.

Estimated scope: Multiple medium tasks, split by feature area.

### Task 4.3: Delete `LocalApiClient`

Description: Remove the local API implementation after no code can select it.

Acceptance criteria:

- `LocalApiClient` file is deleted.
- API client factory has no local-only branch.
- Tests prove Go API client is used.

Verification:

- Build passes.
- Search confirms no `LocalApiClient` references.

Dependencies: Task 4.2.

Estimated scope: Small.

### Task 4.4: Delete `storage.ts` And IndexedDB Dependency

Description: Remove the IndexedDB application storage layer and `idb` package dependency.

Acceptance criteria:

- `storage.ts` is deleted.
- `idb` is removed from dependencies if no longer used.
- Lockfile is updated.
- No active IndexedDB app database remains.

Verification:

- Build passes.
- Tests pass.
- Search confirms no `idb` imports in active source.

Dependencies: Task 4.3.

Estimated scope: Medium.

### Phase 4 Gate

- IndexedDB is not required by the application.
- Local API architecture is gone.
- All persistent behavior uses Go API and PostgreSQL.

## 9. Phase 5: Remove Next.js API Routes

Goal: Remove Next.js API route remnants and confirm Go API owns all application behavior.

The system remains fully usable at the end of this phase.

### Task 5.1: Prove Next API Routes Are Inactive Or Replaced

Description: Confirm all Next.js API route directories are empty, inactive, or replaced by Go API endpoints.

Acceptance criteria:

- Route inventory is generated from current repo state.
- Each route area maps to a Go API endpoint or is declared obsolete.
- Any hidden business logic is migrated before deletion.

Verification:

- Search for `route.ts`, `route.js`, and route handlers under `src/app/api`.
- API contract covers required endpoint behavior.

Dependencies: Phase 4.

Estimated scope: Small.

### Task 5.2: Delete Next.js API Route Remnants

Description: Remove `src/app/api` application route remnants after parity is proven.

Acceptance criteria:

- Next.js App Router API route remnants are deleted.
- Frontend API requests still reach the Go API.
- Build passes.

Verification:

- Build passes.
- Smoke tests cover proxied or direct Go API calls.
- Search confirms no application API route handlers remain.

Dependencies: Task 5.1.

Estimated scope: Small.

### Phase 5 Gate

- Next.js does not implement application API behavior.
- Go API is the only backend.

## 10. Phase 6: Remove Backend Obsolete Architecture

Goal: Remove backend code that conflicts with Phase 1 target architecture.

The system remains fully usable with PostgreSQL at the end of this phase.

### Task 6.1: Remove SQLite Backend

Description: Remove SQLite store implementation, SQLite config, SQLite tests, and SQLite dependency.

Acceptance criteria:

- API server supports PostgreSQL only.
- SQLite files and dependencies are removed.
- Local development documentation points to PostgreSQL.

Verification:

- `go test ./...` passes.
- `go build` passes.
- Startup fails clearly if PostgreSQL config is missing.

Dependencies: Phase 5.

Estimated scope: Medium.

### Task 6.2: Remove Or Deprecate Backend Sync Endpoints

Description: Remove backend sync endpoints if unused by the Phase 1 web app, or mark them deprecated until deletion.

Acceptance criteria:

- Web app does not call sync endpoints.
- If endpoints remain, API contract marks them deprecated and unsupported for Phase 1.
- If removed, tests prove no active client depends on them.

Verification:

- Search confirms no frontend calls.
- Backend tests are updated.
- API contract is updated.

Dependencies: Phase 3.

Estimated scope: Small to medium.

### Task 6.3: Remove Backup Or Obsolete Server Files

Description: Delete `.bak` and obsolete server files not used by the PostgreSQL API.

Acceptance criteria:

- Backup code files are removed from active repo.
- Build and tests pass.
- No active imports reference deleted files.

Verification:

- `go test ./...` passes.
- `go build` passes.

Dependencies: Task 6.1.

Estimated scope: Small.

### Phase 6 Gate

- Backend target is PostgreSQL-only.
- No unsupported sync or obsolete backend code is active.
- Go tests and build pass.

## 11. Phase 7: React Query And Zustand Simplification

Goal: Move server state out of Zustand and into React Query.

The system remains fully usable after each store migration.

### Task 7.1: Define Query Key And Mutation Conventions

Description: Establish shared React Query key and invalidation conventions.

Acceptance criteria:

- Query key patterns are documented.
- Mutation invalidation rules are documented.
- Hooks location and naming conventions are documented.

Verification:

- Documentation review.
- One small hook migration follows the convention.

Dependencies: Phase 4.

Estimated scope: Small.

### Task 7.2: Migrate Template And Dietary Stores

Description: Move template and dietary server state from Zustand to React Query hooks.

Acceptance criteria:

- React Query owns fetched templates and dietary data.
- Zustand, if retained, owns only active UI selection or editor state.
- Existing UI behavior remains.

Verification:

- Hook tests cover loading, success, error, and mutation invalidation.
- UI tests cover create/update/delete flows.

Dependencies: Task 7.1 and Phase 2 server endpoints.

Estimated scope: Medium.

### Task 7.3: Migrate Nutrition Store

Description: Move nutrition profiles, food logs, and weights to React Query.

Acceptance criteria:

- React Query owns nutrition server state.
- Redundant sync methods are removed.
- Active profile selection is URL state, local preference, or small client state.

Verification:

- Tests cover profile, food log, and weight queries/mutations.
- Dashboard smoke test passes.

Dependencies: Task 7.1.

Estimated scope: Medium.

### Task 7.4: Migrate Meal Plan Store

Description: Move meal plans, entries, and groups to React Query.

Acceptance criteria:

- React Query owns meal plan server state.
- Drag/drop or edit-in-progress state remains client-owned.
- Grocery generation still works.

Verification:

- Tests cover weekly plan query and mutations.
- Meal planning smoke test passes.

Dependencies: Task 7.1.

Estimated scope: Medium.

### Task 7.5: Migrate Book And Category Store

Description: Move books, chapters, pages, categories, and recipe-category assignments to React Query.

Acceptance criteria:

- React Query owns book/category server state.
- Derived category tree is computed, not stored as authoritative server data.
- Editor interaction state remains client-owned.

Verification:

- Tests cover book/category queries and mutations.
- Book editor smoke test passes.

Dependencies: Task 7.1.

Estimated scope: Medium to large, split further if needed.

### Task 7.6: Migrate Recipe Store

Description: Move recipe list/detail server state to React Query while preserving complex editor behavior.

Acceptance criteria:

- React Query owns recipe list/detail data.
- Recipe editor draft state remains local or Zustand if needed.
- Ingredient mutations invalidate or update query caches correctly.
- FDA/custom food search behavior remains intact.

Verification:

- Tests cover list/detail queries and recipe mutations.
- Editor tests cover unsaved draft behavior.
- Recipe CRUD smoke test passes.

Dependencies: Task 7.1.

Estimated scope: Large; split by recipe list, recipe detail, editor mutations, and food search.

### Phase 7 Gate

- Server-state collections are no longer manually cached in Zustand.
- Zustand remains only where it simplifies client interaction state.
- React Query conventions are consistent.

## 12. Phase 8: Remove Platform Remnants From Phase 1 Build

Goal: Remove Tauri and Capacitor from active Phase 1 build and dependency surfaces.

The web app remains fully usable at the end of this phase.

### Task 8.1: Remove Capacitor Scripts And Dependencies

Description: Remove Capacitor package dependencies, scripts, and config from Phase 1.

Acceptance criteria:

- Capacitor dependencies are removed.
- Capacitor scripts are removed.
- Lockfile is updated.
- Web build remains clean.

Verification:

- `npm install` or equivalent lockfile update completes.
- Build and tests pass.

Dependencies: Phase 5.

Estimated scope: Small.

### Task 8.2: Remove Tauri Build Integration

Description: Remove Tauri scripts and active build references.

Acceptance criteria:

- Tauri scripts are removed from Phase 1 package scripts.
- Tauri source is deleted or archived outside the active build path per user decision.
- Web build remains clean.

Verification:

- Build and tests pass.
- Search confirms no active build depends on Tauri.

Dependencies: Phase 5.

Estimated scope: Small.

### Phase 8 Gate

- Phase 1 build targets hosted web only.
- Mobile and desktop remnants do not affect install, build, or deployment.

## 13. Phase 9: Deployment Hardening

Goal: Ensure the hosted web and API deployment path is clear and repeatable.

The system is deployable at the end of this phase.

### Task 9.1: Build Frontend And API Docker Images

Description: Ensure Docker images exist for frontend and Go API.

Acceptance criteria:

- Frontend image builds.
- API image builds.
- Runtime environment variables are documented.
- API can connect to PostgreSQL.

Verification:

- `docker compose build` or equivalent succeeds.
- Local run reaches frontend and API health endpoint.

Dependencies: Phase 6.

Estimated scope: Medium.

### Task 9.2: Validate Automatic Migrations

Description: Ensure API startup runs PostgreSQL migrations safely.

Acceptance criteria:

- API startup applies pending migrations.
- Migration failure prevents serving traffic.
- Migration behavior is tested or manually verified.

Verification:

- Test or local run starts from empty database and reaches ready state.
- Bad migration config fails startup.

Dependencies: Task 9.1.

Estimated scope: Medium.

### Task 9.3: Document Production Deployment Shape

Description: Document the two application containers and PostgreSQL dependency.

Acceptance criteria:

- Documentation states frontend and API are the two application containers.
- PostgreSQL may be managed DB or optional local dev service.
- Required environment variables are listed.
- Registration disable setting is documented.

Verification:

- Documentation review.

Dependencies: Task 9.1.

Estimated scope: Small.

### Phase 9 Gate

- Frontend image builds.
- API image builds.
- API runs migrations automatically.
- Deployment docs are current.

## 14. Phase 10: Coverage Completion And Final Regression

Goal: Bring the migrated system to high confidence and document remaining test exceptions.

The system is ready for Phase 1 development after this phase.

### Task 10.1: Create Coverage Exception Register

Description: Document files or paths that cannot reasonably reach 100 percent meaningful coverage.

Acceptance criteria:

- Exception register exists in `` or test docs.
- Each exception includes reason and alternative verification.
- No business logic is exempted without explicit rationale.

Verification:

- Coverage report reviewed against exception register.

Dependencies: Prior phases.

Estimated scope: Small.

### Task 10.2: Add API Endpoint Coverage

Description: Ensure every Phase 1 endpoint has meaningful tests.

Acceptance criteria:

- Each endpoint has success, auth failure, validation failure, and ownership tests where applicable.
- Public endpoints have public access tests.
- Error responses follow documented contract.

Verification:

- Backend coverage report.
- API contract checklist complete.

Dependencies: API contract and backend migration phases.

Estimated scope: Multiple medium tasks by resource area.

### Task 10.3: Add Critical Frontend Flow Coverage

Description: Cover important user journeys with component and Playwright tests.

Acceptance criteria:

- Auth flow covered.
- Recipe CRUD flow covered.
- Book/export flow covered.
- Meal planning flow covered.
- Nutrition logging flow covered.
- Custom food flow covered.
- Sharing/community flow covered.
- Settings/API key flow covered.

Verification:

- Frontend test suite passes.
- Playwright critical flows pass.

Dependencies: Frontend migration phases.

Estimated scope: Multiple medium tasks by flow.

### Task 10.4: Final Manual Regression

Description: Manually verify the migrated app against current user-facing feature expectations.

Acceptance criteria:

- Register new account when registration enabled.
- Confirm registration disabled behavior.
- Login and logout.
- Create, edit, delete recipe.
- Search food database.
- Create custom food.
- Create book and export.
- Create categories and assign recipes.
- Create meal plan and grocery checklist.
- Create nutrition profile, food log, and weight entry.
- Create dietary profile and allergen rule.
- Generate reports.
- Manage app settings.
- Manage encrypted API keys.
- Share recipe and search community.

Verification:

- Manual checklist completed.
- Any defects become new TDD tasks.

Dependencies: All prior phases.

Estimated scope: Medium.

### Phase 10 Gate

- Full automated suite passes.
- Coverage targets are met or exceptions documented.
- Critical manual regression is complete.
- Phase 1 architecture matches `system_requirements.md`.

## 15. Dependency Summary

Critical path:

```text
Phase 0
  -> Phase 1
  -> Phase 2
  -> Phase 3
  -> Phase 4
  -> Phase 5
  -> Phase 6
  -> Phase 7
  -> Phase 8
  -> Phase 9
  -> Phase 10
```

Some cleanup tasks MAY be parallelized after their dependencies are met, but database/API ownership tasks SHOULD remain sequential enough to keep the system working after every phase.

## 16. Stop Conditions

An agent MUST stop and ask the user before continuing if:

- A current user-facing feature appears impossible to preserve.
- A migration would require changing the Phase 1 source-of-truth architecture.
- A persistent data category has no PostgreSQL destination.
- A test failure indicates a possible behavioral regression.
- A task requires adding major infrastructure not listed in `system_requirements.md`.
- A task requires choosing between REST and gRPC again.
- A task requires weakening authentication, authorization, or secret handling.

