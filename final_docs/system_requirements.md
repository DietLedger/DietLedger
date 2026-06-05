# DietLedger Phase 1 System Requirements

Status: Source of truth for Phase 1 target system
Date: 2026-06-05
Scope: Hosted web application and Go API server only

## 1. Purpose

This document defines the required Phase 1 architecture and behavior for DietLedger.
Future agents MUST read this document before proposing or implementing changes to the Phase 1 system.

Phase 1 is a hosted multi-user web application backed by the Go API server and PostgreSQL.
The goal is to simplify the generated historical architecture into a maintainable production system for a solo developer using AI-assisted development.

This document supersedes earlier architecture review notes in `temp_docs/` for Phase 1 decisions.
Those earlier documents MAY be used as historical context, but this file is authoritative when there is a conflict.

## 2. Phase 1 Scope

Phase 1 MUST include:

- Hosted Next.js web application.
- Go API server, currently located under `sync-server/`.
- PostgreSQL as the authoritative database.
- Docker images for the frontend server and API server.
- Multi-user account-based access.
- All current user-facing features.
- Community and sharing features.
- Cookbook and PDF/export features.
- FDA/USDA food search features.
- User-created custom foods.
- Grocery checklist and pantry-related user features.
- Server-side encrypted user API keys and secrets.
- Automated database migrations at API startup.

Phase 1 MUST NOT include:

- Offline-first behavior.
- Local-only mode.
- IndexedDB as authoritative storage.
- Frontend sync engine behavior.
- Tauri desktop support.
- Capacitor mobile support.
- Native Android or iOS clients.
- SQLite as an active backend.
- Next.js API route handlers for application behavior.

The system MAY keep historical files temporarily during migration, but the Phase 1 target system MUST NOT rely on them.

## 3. Product Requirements

DietLedger MUST preserve the existing user-facing product surface unless a feature is explicitly removed by the user.

The application MUST support:

- Recipe creation, editing, viewing, searching, categorization, and deletion.
- Ingredient management, ingredient grouping, ordering, scaling, and nutrition calculation.
- Cookbook/book creation, chapter management, recipe placement, page management, ordering, and export workflows.
- Meal planning by week, day, meal slot, meal groups, leftovers, and grocery checklist generation.
- Nutrition profiles, food logging, weight tracking, dashboards, trend charts, and reports.
- FDA/USDA food search and food detail lookup.
- User-created custom foods.
- Dietary profiles, allergen rules, nutrient thresholds, and compliance reporting.
- Templates used by recipe, cookbook, print, or export workflows.
- Brand kits and export styling when user-facing.
- Pantry staples and user location if they influence user-facing planning or recommendation behavior.
- Community search, public recipe sharing, private share management, and share deletion.
- User data export and deletion for portability and privacy.

Feature implementations MAY be simplified internally, but externally visible behavior SHOULD remain equivalent or intentionally improved.

## 4. Architecture Requirements

The Phase 1 architecture MUST be:

```text
Browser
  -> Next.js web app
  -> Go API client
  -> Go API server
  -> PostgreSQL
```

The browser MUST communicate with application data through the Go API.
The Go API MUST be the primary backend.
PostgreSQL MUST be the source of truth for persistent data.

The Next.js application MUST NOT implement durable application behavior through App Router API routes.
Next.js MAY proxy requests to the Go API.
Next.js MAY serve pages, layouts, assets, and frontend application logic.

The frontend MUST NOT write authoritative domain data directly to IndexedDB, localStorage, browser cache, or filesystem APIs.

## 5. Data Ownership Requirements

All persistent user data MUST be stored in PostgreSQL.

Persistent user data includes:

- Account data.
- Recipes.
- Ingredients.
- Books.
- Chapters.
- Pages.
- Categories.
- Meal plans.
- Meal plan entries.
- Meal groups.
- Grocery checklists.
- Nutrition profiles.
- Food log entries.
- Weight entries.
- Custom foods.
- Dietary profiles.
- Allergen rules.
- Templates.
- Brand kits.
- Pantry staples.
- User location.
- App settings.
- API keys and user-provided secrets.
- Sharing and community records.

localStorage MAY be used only as a cache or local convenience layer.
localStorage MUST NOT be the only copy of important user data.
Configuration changes MUST be sent to the database.
App settings MUST be per account.

Allowed localStorage use cases include:

- Short-lived UI cache.
- Last opened view or selected item.
- Collapsed or expanded panels.
- Recently used client-side values that are recoverable from the server.
- Non-authoritative React Query persistence if later introduced.

If a value changes product behavior or must follow the user across devices, it MUST be persisted through the Go API to PostgreSQL.

## 6. Authentication And Authorization Requirements

DietLedger MUST be a multi-user hosted application.
Every authenticated user MUST manage only their own data unless a feature explicitly exposes public shared data.

Registration MUST be supported.
Registration MUST be disableable by an administrator-controlled environment variable.
Registration SHOULD also be disableable by an administrator setting if an admin feature exists.

The recommended Phase 1 authentication model is:

- Short-lived JWT access tokens.
- Refresh tokens for session renewal.
- Secure, HTTP-only cookies for web refresh tokens where practical.
- Bearer access tokens for API requests.
- API keys only for programmatic access, not normal browser sessions.

The Go API MUST enforce authentication and authorization at the API boundary.
The frontend MUST NOT be trusted to enforce ownership.

The API MUST reject access to another user's private data.
Community and sharing endpoints MUST explicitly define what data is public.

User-provided API keys and secrets MUST be encrypted server-side before storage.
Secrets MUST NOT be stored as plaintext in PostgreSQL.
Secrets MUST NOT be stored as authoritative data in localStorage.

## 7. API Requirements

The Go API MUST be the only application API for Phase 1.

The API contract MUST be documented in Markdown.
The Markdown API contract MAY live inside this file initially or in a linked `final_docs/api_contract.md` file.
If a separate API contract file is created, this document remains authoritative for architecture and ownership rules.

The API SHOULD use REST over HTTP for Phase 1.
gRPC MUST NOT be introduced for the browser-facing Phase 1 system unless the user explicitly approves the added complexity.

Rationale:

- REST is simpler for browsers, Next.js, proxies, debugging, tests, and AI-assisted development.
- gRPC in browsers usually requires gRPC-Web or a translation proxy.
- At the expected Phase 1 maturity, database design, pagination, indexes, caching, deployment, and endpoint shape matter more for scaling than REST vs gRPC.

The API MUST document:

- Endpoint path.
- HTTP method.
- Authentication requirement.
- Request body.
- Query parameters.
- Response body.
- Error status codes.
- Ownership rules.

API responses SHOULD use consistent envelopes and error formats.
List endpoints MUST support pagination unless there is a documented reason not to.
Mutating endpoints MUST validate input at the API boundary.

The API SHOULD prefer additive changes over breaking changes.
Breaking API changes MUST update the Markdown contract before implementation.

## 8. Frontend State Requirements

React Query MUST own server state in the web app.

Server state includes:

- Fetched records.
- Paginated lists.
- Loading status for API data.
- API errors.
- Mutation state.
- Query invalidation and refetching.
- Cached server responses.

Zustand MAY be used for client interaction state only.

Client interaction state includes:

- Complex editor draft state before save.
- Open panels, dialogs, and drawers.
- Drag and drop working state.
- Wizard state.
- Unsaved-change tracking.
- Temporary UI-only selections.

Plain React state SHOULD be used for simple component-local state.

Zustand MUST NOT be used as the long-term cache for server-owned records.
React Query MUST NOT be used as the primary store for complex unsaved editor workflows if that makes the UI harder to reason about.

The migration SHOULD remove server-state collections from Zustand after the Go API boundary and PostgreSQL ownership are stable.

## 9. Storage And Sync Requirements

The Phase 1 frontend MUST get authoritative information from the Go API and PostgreSQL.

The following frontend concepts MUST be removed from the Phase 1 target system:

- Local-only mode.
- LocalApiClient.
- IndexedDB application database.
- `storage.ts` as an authoritative persistence layer.
- sync engine.
- sync store.
- sync conflict resolution UI.
- write queue.
- read cache as authoritative behavior.
- local export/import workflows that depend on IndexedDB as the source of truth.

Future offline support MUST be treated as a later client concern.
Future native mobile clients SHOULD communicate with the same Go API.
No Phase 1 code SHOULD preserve current sync infrastructure for future speculative use.

Backend sync endpoints MAY be removed during Phase 1 if no current feature depends on them.
If retained temporarily during migration, they MUST be documented as deprecated and MUST NOT be used by the web app.

## 10. Backend Requirements

The Go API server MUST:

- Connect to PostgreSQL.
- Run required migrations automatically at startup.
- Enforce authentication and authorization.
- Validate all external input.
- Store all persistent user data in PostgreSQL.
- Encrypt user-provided secrets before persistence.
- Support all current user-facing application features.
- Expose health and about endpoints.
- Provide consistent JSON responses.
- Support pagination for list endpoints.
- Avoid SQLite in the Phase 1 target system.

The Go API server SHOULD be stateless except for PostgreSQL and external services.
Horizontal scaling SHOULD be possible by running multiple API server instances behind a load balancer.

The Go API MUST NOT depend on Next.js for business logic.

## 11. Frontend Requirements

The Next.js web app MUST:

- Render the full DietLedger user experience.
- Authenticate users through the Go API.
- Fetch and mutate domain data through the Go API.
- Use React Query for server state.
- Use Zustand only for client interaction state where useful.
- Avoid Next.js API routes for application behavior.
- Avoid IndexedDB as required infrastructure.
- Preserve current user-facing features.
- Surface API errors clearly to users.
- Avoid silent data loss on failed saves.

The frontend SHOULD warn users before leaving pages with unsaved important edits.
The frontend SHOULD prefer URL state for navigable selections such as active recipe, active book, active week, or active profile when practical.

## 12. Deployment Requirements

Phase 1 MUST provide Docker images for:

- The frontend server.
- The Go API server.

PostgreSQL MUST be available to the API server.
PostgreSQL MAY be provided by a managed database, host-level service, or an optional local development Compose service.

Production deployment SHOULD treat PostgreSQL as durable infrastructure rather than a disposable application container.

The API server MUST run migrations automatically on startup.
Migration failure MUST prevent the API from serving traffic.

The deployment MUST support environment variables for:

- API bind address and port.
- Database connection string.
- JWT signing secret or key material.
- Secret encryption key material.
- Allowed CORS origins.
- Registration enabled or disabled.
- Public frontend API base URL or proxy target.

Backups, restore automation, and observability are not required for the initial Phase 1 migration, but the architecture SHOULD leave room for them.

## 13. Scalability Requirements

The system SHOULD be designed to scale toward a large hosted multi-user workload over time.
The target ambition is up to 2 million users within 4 years.

Phase 1 scalability MUST focus on simple fundamentals:

- Stateless API servers.
- PostgreSQL-backed persistence.
- Proper indexes for owner-scoped queries.
- Pagination on list endpoints.
- Request body limits.
- Input validation.
- Rate limiting on sensitive endpoints.
- Efficient query shapes.
- Avoiding over-fetching in the frontend.
- React Query caching and request deduplication.
- Clear separation between public shared data and private user data.

The system SHOULD NOT introduce gRPC, distributed caches, queues, event sourcing, sharding, or microservices in Phase 1 unless a measured bottleneck requires them.

## 14. Testing Requirements

Test-driven development MUST be used during migration.
Every behavioral migration task MUST begin with a failing or missing test that describes the desired behavior.

The long-term target is 100 percent coverage of meaningful code.
This target is aspirational, not a reason to write brittle or meaningless tests.

At minimum, the following MUST be tested:

- Business logic.
- API endpoints.
- Authentication and authorization.
- Data ownership boundaries.
- PostgreSQL repository behavior.
- Validation behavior.
- React Query hooks and API client behavior where meaningful.
- Critical UI flows.
- Export/report generation logic.
- Migration behavior.

Coverage exceptions MUST be documented.
Acceptable exceptions MAY include:

- Generated files.
- Framework bootstrapping.
- Static configuration.
- Thin wiring code with no meaningful branches.
- Code that can only be verified manually or through deployment checks.

Recommended frontend test stack:

- Vitest for unit tests.
- React Testing Library for component tests.
- Mock Service Worker or equivalent request interception for frontend API behavior.
- Playwright for critical end-to-end browser flows.

Recommended backend test stack:

- Go `testing` package.
- Table-driven unit tests.
- Handler tests using `httptest`.
- Repository tests against an isolated PostgreSQL test database when practical.
- Contract-style API tests based on the Markdown API contract.

Each migration task SHOULD define a path-specific coverage goal.
If 100 percent coverage is not practical for a path, the reason MUST be documented.

## 15. Required Verification Commands

The exact commands MAY change as the repository evolves, but the target system MUST provide commands equivalent to:

```bash
npm run lint
npm run test
npm run test:coverage
npm run build
cd sync-server && go test ./...
cd sync-server && go build
docker compose build
```

Critical browser flows SHOULD be verified with Playwright.

## 16. API Contract Baseline

The Phase 1 API contract MUST cover at least these resource areas:

- Auth: register, login, refresh, logout/session handling if implemented.
- Account: profile, settings, export, delete.
- Recipes and ingredients.
- Books, chapters, chapter recipes, chapter pages, book pages.
- Categories and recipe category assignments.
- Foods and food search.
- Custom foods.
- Nutrition profiles.
- Food log entries.
- Weight entries.
- Meal plans.
- Meal plan entries.
- Meal groups.
- Grocery checklists.
- Dietary profiles.
- Allergen rules.
- Templates.
- Brand kits.
- Pantry staples.
- User location.
- API keys and encrypted secrets.
- Sharing.
- Community search and categories.
- Health and about.

Each endpoint MUST specify whether data is private, public, or owned by another shared access rule.

## 17. Change Control

This file is a living requirements document.
Future agents MUST update this file when a Phase 1 requirement changes.

Changes SHOULD be made before implementation when practical.
When implementation discovers that a requirement is incorrect, the agent MUST update the requirement and call out the change to the user.

Future agents SHOULD ask the user for clarification before changing:

- Data ownership rules.
- Authentication strategy.
- API protocol.
- PostgreSQL as source of truth.
- Removal or addition of user-facing features.
- Testing standards.
- Deployment topology.

## 18. Current Decisions

Accepted Phase 1 decisions:

- PostgreSQL is the authoritative database.
- Go API is the only application backend.
- Next.js API routes are removed from the target system.
- REST is the Phase 1 API protocol.
- Markdown is the API contract format.
- React Query owns server state.
- Zustand owns client interaction state only.
- All persistent user data is server persisted.
- localStorage is cache only.
- Secrets are encrypted server-side.
- Registration is supported and can be disabled.
- Offline and sync infrastructure are removed from the Phase 1 web app.
- SQLite, Tauri, and Capacitor are removed from the Phase 1 target.
- TDD is required during migration.
- 100 percent meaningful coverage is the long-term target, with documented exceptions.

