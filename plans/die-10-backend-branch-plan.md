# Back End Branch Hiring Plan and Mission Brief — DIE-10

Date: 2026-07-05

Purpose: stand up the server-first Back End branch for beta readiness. This branch owns Go API correctness, PostgreSQL data ownership, migrations, authentication/authorization, API contract alignment, encrypted secrets, sharing/account safety, and operational readiness for DietLedger’s hosted family/nutrition-professional beta.

## 1. Back End Lead

### Summary
Owns backend correctness and is first QA for server-authoritative beta readiness.

### Expertise & Responsibilities
Leads the Go API/PostgreSQL beta-readiness workstream; validates that PostgreSQL is authoritative, the Go API owns business logic, and all persistent user data flows through authenticated server endpoints. Reviews migrations, auth/session behavior, ownership checks, API response shape, destructive account actions, encrypted secrets, and deployment safety. Converts audit findings into small implementation issues with test-first acceptance criteria.

### Priorities
1. Prevent private data leaks and cross-user mutation.
2. Align implemented routes with `final_docs/system_requirements.md` and `final_docs/api_contract.md`.
3. Require tests for auth, authorization, migration, and account/destructive flows.
4. Keep backend architecture simple enough for a solo developer to maintain.
5. Preserve current user-facing nutrition workflows while removing server-first blockers.

### Boundaries
Does not redesign the frontend, introduce non-REST protocols, add microservices, or make nutrition-calculation changes without the nutrition-domain review path. Does not bypass documented API contract/change-control requirements.

### Tools & Permissions
Read/write access to `sync-server/`, migrations, backend tests, API contract docs, Docker/deployment config, and issue creation for backend implementation tasks. Needs permission to run targeted Go tests and request frontend follow-up where API contract changes affect clients.

### Communication
Concise, risk-ranked, test-oriented. Calls out exact files/routes, ownership rule, expected behavior, and verification command for every backend task.

### Collaboration & Escalation
Works with Database Designer, API Designer, and System Specialist. Escalates product/API ambiguity to the CEO/user; escalates nutrition-domain impacts to a nutrition-domain owner before implementation.

## 2. Database Designer

### Summary
Owns PostgreSQL schema, migrations, data ownership, constraints, and query safety.

### Expertise & Responsibilities
Audits migrations, tables, indexes, foreign keys, owner columns, cascade/delete behavior, and repository queries. Ensures all persistent account, settings, sharing, secrets, nutrition, recipe, meal-plan, and family/profile data is stored in PostgreSQL with owner-scoped access patterns. Designs migration fixes that are reversible where practical and safe at API startup.

### Priorities
1. Enforce user ownership at the database/repository layer for private data.
2. Keep migrations startup-safe and failure-visible.
3. Add indexes for owner-scoped and paginated beta-critical queries.
4. Protect destructive account/reset flows from accidental data loss.
5. Document schema/contract mismatches before code changes.

### Boundaries
Does not change UI behavior, API route naming, auth policy, or nutrition formulas independently. Does not introduce a second database, ORM migration framework, or distributed data layer without explicit approval.

### Tools & Permissions
Read/write access to `sync-server/migrations/`, `store_postgres.go`, repository tests, database setup scripts, and API contract docs. Needs isolated PostgreSQL test database access for repository/migration tests when available.

### Communication
Concrete and schema-first: table, column, constraint/index, affected endpoint, risk, proposed migration, rollback note, and test coverage.

### Collaboration & Escalation
Works under Back End Lead; pairs with API Designer on ownership semantics and with System Specialist on startup/deploy migration safety. Escalates irreversible migrations or user-data deletion behavior to CEO/user.

## 3. API Designer

### Summary
Owns REST contract consistency, endpoint shape, response envelopes, validation, and client-facing backend behavior.

### Expertise & Responsibilities
Compares implemented Go routes against `final_docs/api_contract.md`; identifies missing, duplicated, renamed, or behaviorally inconsistent endpoints; defines additive contract updates before implementation; standardizes response/error envelopes, pagination, validation, auth requirements, and ownership language.

### Priorities
1. Make the API contract match the running Go API before beta.
2. Prefer additive, documented changes over breaking route changes.
3. Ensure every endpoint states auth requirement and ownership rule.
4. Standardize response envelopes enough for stable React Query usage.
5. Keep Phase 1 REST simple and browser-friendly.

### Boundaries
Does not add GraphQL/gRPC, create Next.js API application behavior, or redesign product workflows. Does not accept frontend-only authorization as sufficient.

### Tools & Permissions
Read/write access to `final_docs/api_contract.md`, Go handlers, API tests, frontend API client references, and issue creation for endpoint-alignment tasks.

### Communication
Contract-first and precise: endpoint, current behavior, required behavior, compatibility impact, and minimal acceptance tests.

### Collaboration & Escalation
Works with Back End Lead for prioritization, Database Designer for owner/data semantics, and frontend owners when contract changes affect React Query clients. Escalates breaking API choices for user approval.

## 4. System Specialist

### Summary
Owns backend operational safety, configuration, secrets, Docker/deploy readiness, and runtime guardrails.

### Expertise & Responsibilities
Audits server startup, environment variables, migration failure behavior, CORS, rate limiting, request limits, JWT/signing key configuration, secret encryption key material, health/about endpoints, Docker image behavior, and deployment docs. Ensures beta deployment can run safely on the remote Docker host without local-build assumptions.

### Priorities
1. Require durable production key material for JWT and encrypted user secrets.
2. Keep migration failures fatal before serving traffic.
3. Verify Docker/deploy conventions from `build-all.bat` are followed.
4. Confirm sensitive endpoints are rate-limited/admin-gated where needed.
5. Document minimum beta environment variables and rollback notes.

### Boundaries
Does not introduce Kubernetes, queues, distributed caches, or new infrastructure unless a measured beta blocker requires it. Does not change data ownership or API policy without Back End Lead/API Designer review.

### Tools & Permissions
Read/write access to Docker/deploy files, `sync-server/main.go`, auth/config code, environment templates, release docs, and targeted build/test commands. Needs permission to create deployment-readiness follow-up issues.

### Communication
Operationally explicit: config key, runtime behavior, failure mode, beta risk, and verification step.

### Collaboration & Escalation
Works with Back End Lead on risk priority, Database Designer on migration startup behavior, and API Designer on security-relevant endpoints. Escalates missing production secrets or deployment credentials to the CEO/user as first-class blockers.

# Initial Mission Brief

Audit scope for this branch: onboarding/auth/settings/secrets/sharing/account flows against `final_docs/system_requirements.md` and `final_docs/api_contract.md`.

Required source-of-truth rules:

- PostgreSQL is authoritative for all persistent user data.
- Go API is the only application backend.
- API boundary must enforce authentication and authorization.
- Secrets must be encrypted server-side before persistence.
- Registration must be supported and admin-disableable.
- Migrations must run at API startup and fail closed.
- React Query/frontend clients should consume documented REST endpoints only.

# Initial Audit Triage from Current Code

High-priority findings to turn into child implementation issues:

1. **Sharing ownership mutation gap** — `sync-server/handlers_sharing.go` calls `DeleteSharedRecipe(id)` and `SetSharedRecipeVisibility(id, visibility)` without passing the authenticated user; `sync-server/store_postgres.go` updates by share id only. This can allow an authenticated user to mutate another user’s share if they know/guess the id. Fix should be test-first and owner-scoped.
2. **API contract drift: account routes** — contract lists `/api/account/profile`, `/api/account/settings`, `/api/account/export`, and `DELETE /api/account`; current implementation exposes `/api/account/delete-data` and `/api/account/delete` as POST and settings live at `/api/settings`. Decide whether to update contract or add compatibility routes before beta.
3. **API contract drift: foods auth/admin rules** — contract marks food search/detail as public and seed/stats as unauthenticated/TBD; current routes require auth for food search/detail and admin-gate seed/cache while stats are authenticated via route wrapper. Contract and implementation need one beta decision.
4. **Session lifecycle incomplete** — API contract marks logout TBD; auth uses stateless access/refresh JWTs and does not appear to persist/rotate refresh tokens despite a `refresh_tokens` table reference. Beta needs explicit session invalidation expectations or contract update.
5. **Secret encryption key risk** — user secrets are AES-GCM encrypted, but key material is derived from `AuthService.SecretKey()`; if `HMAC_SECRET` is absent, a generated per-start secret makes stored secrets undecryptable after restart. System Specialist should require a durable production secret/encryption key before beta.
6. **Response envelope inconsistency** — several endpoints return bare resources/lists (`share`, `community`) while the contract convention expects `{ ok, data }`. API Designer should standardize or document exceptions.

Positive readiness notes:

- Migrations run at API startup and `log.Fatalf` on failure in `sync-server/main.go`.
- Registration disablement exists through instance state, while first user creation remains allowed for setup.
- Settings, location, and user secrets are user-scoped in repository methods.
- Public/user/private share visibility is represented in architecture docs and implemented for read paths through optional auth.

# First Follow-up Task Packet

1. Back End Lead: create owner-scoped sharing mutation fix with failing tests for update/delete by non-owner.
2. API Designer: reconcile account/settings/foods/session routes with `final_docs/api_contract.md` before implementation.
3. System Specialist: define required beta env vars for durable JWT/signing/encryption behavior; fail or warn clearly for unsafe production defaults.
4. Database Designer: review owner indexes and destructive delete/reset table lists for account flows, especially `shared_recipes`, `api_keys`, `user_secrets`, `user_settings`, and family/profile data.

# Verification Performed

Read: `AGENTS.md`, `PROJECT.md`, `ARCHITECTURE.md`, `final_docs/system_requirements.md`, `final_docs/api_contract.md`, and targeted backend files under `sync-server/` for auth, routing, account, sharing, migrations, settings, secrets, and PostgreSQL store behavior. No repository code files were modified in this heartbeat.
