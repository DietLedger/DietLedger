# DietLedger Architecture

> This document defines the authoritative architecture of DietLedger.
>
> The primary goals of the architecture are:
>
> * correctness
> * maintainability
> * simplicity
> * solo-developer velocity
> * AI-assisted development
>
> When making architectural decisions, prefer simpler solutions unless additional complexity provides clear and measurable value.

---

# System Overview

DietLedger is a server-authoritative nutrition platform.

The system consists of four primary layers:

```text
Browser
    ↓
Next.js Frontend
    ↓
Go API
    ↓
PostgreSQL
```

Authority flows downward.

The browser is not authoritative.

The frontend is not authoritative.

The API is authoritative.

PostgreSQL is the system of record.

---

# Architectural Principles

## Simplicity Over Abstraction

Prefer:

* direct implementations
* explicit data flow
* straightforward ownership

Avoid:

* unnecessary layers
* speculative abstractions
* framework-driven architecture

---

## Single Source Of Truth

Every piece of data must have a single authoritative owner.

Duplicate ownership creates consistency problems and increases maintenance cost.

---

## Existing Systems First

Before introducing new infrastructure, dependencies, or abstractions:

1. Can PostgreSQL solve the problem?
2. Can the Go API solve the problem?
3. Can existing code solve the problem?

Prefer extending existing systems over creating new systems.

---

## Optimize For One Developer

Architecture should optimize for:

* understanding
* debugging
* maintainability
* low operational burden

Not for hypothetical future organizations.

---

# Technology Stack

## Frontend

Responsibilities:

* rendering
* routing
* user interaction
* presentation logic

Technology:

* Next.js
* React
* TypeScript

---

## API

Responsibilities:

* business rules
* validation
* authorization
* persistence orchestration

Technology:

* Go

The API is the authoritative implementation of domain behavior.

---

## Portable Recipe/Food Identity

Recipes and custom foods persist a namespaced UUID `portableId` independently of their local row key. PostgreSQL generates it once and rejects mutation; owner-scoped uniqueness allows authorized recipe copies to retain identity without sharing edit access. API reads expose it and ordinary update APIs reject attempts to set it. USDA food identity remains its FDC food ID, unrelated to nutrient IDs. Migration 000028 assigns identities to legacy local objects without guessing remote origins. Package transfer integration follows `specs/recipe-nutrition-quarantine-plan.md`; stored identity alone does not imply quarantine/preflight is implemented.

## Import/Quarantine Storage

Import-only quarantine uses separate PostgreSQL storage: `recipe_import_batches` retains native package context and placement mappings; `recipe_import_staged` holds mutable recipe payloads; repair receipts make response-loss retries safe. A completed request-hash receipt records prior acceptance, not row existence: explicit identical reimports restore only missing recipe/effective placement claims, preserving surviving edits and replacement tombstones. Imports with missing links await a whole-batch Stop and undo / Relink later decision before publishing main data. Verified recipes promote into the existing recipe tables and leave staging in one transaction. Quarantine accumulates across imports and reads staging/context exclusively; published recipes, ordinary candidates, native exports and PDF construction continue reading main tables and live joins only. No existing recipes are migrated or reset.

The quarantine page reuses the existing ingredient-search editor, rematch scaling and recipe totals. Source verification preserves unchanged ingredient snapshots; repair recalculates the changed match and affected staged linked parents. Retained package placement creates book structure once, then appends promoted joins without replaying old dependency content. Owner backup includes pending content in the same read snapshot, using v3 only when pending imports exist. Duplicate book titles are resolved through server preflight and fingerprinted Merge/Replace choices; deferred choices apply only when a batch is accepted. PostgreSQL owner-row locks serialize book metadata and placement writes with import decisions without globally blocking other users. Normal discovery/book styling and dataset inventory/preflight remain deferred.

## Owner Recipe/Book Backup

The authenticated `POST /api/recipe-bundles/owner-backup` endpoint enumerates all caller-owned recipes and books server-side, independent of discovery caches or selected-ID exports. It uses native v2 dependency serialization, preserves incomplete ingredient source facts and placement, validates the resulting bundle, and fails rather than returning a partial backup on operational errors or non-restorable structure. Administrator status does not widen owner enumeration. Enumeration, authorization and all dependency serialization reads run within one read-only PostgreSQL REPEATABLE READ transaction, using a transaction-local store reader without mutating the shared connection pool. The snapshot starts at the first query and excludes later commits. It does not coordinate subsequent account deletion or protect intervening edits. Both Settings and the AppNav settings dialog request this endpoint directly, independent of recipe/book React Query cache contents, and await JSON download construction/initiation before requesting account deletion. Backup/download failures keep the account/session intact; deletion failure does not trigger logout/navigation. Settings retains its administrator-successor selection. The browser cannot prove disk persistence. This is not a full account-data backup. Owner backups also reject category cycles/duplicate sibling names that the native importer cannot preserve; referenced same-identity custom-food copies must agree on canonical content, and malformed preparation JSON is a retrieval error rather than empty instructions. These checks fail closed without repairing source data or changing category identity/import policy.

## User Appearance Preferences

The browser applies the selected palette and light/dark appearance through the existing CSS token system. Luxury defaults to dark but has a light variant; the other palettes also support both appearances. The stored palette ID remains separate from `appearanceMode`; legacy `theme: light/dark` values are interpreted as modes. Explicit appearance changes are serialized per authenticated session, so a queued change cannot be sent under a later user's credentials. PostgreSQL settings patches merge atomically as top-level JSONB objects, preserving unrelated concurrent updates. The local cache is a presentation preference, not authoritative nutrition data. See `specs/olive-botanical-dark-luxury-themes.md`.

## Content Reset Boundary

The existing administrator-only, password-gated `POST /api/instance/reset-user-data` performs one PostgreSQL transaction over an explicit custom-content table inventory. It clears global and user-owned content plus import/create retry bookkeeping, not accounts, login sessions, preferences, instance configuration, schema versions or imported standard nutrition records. Failure rolls back the reset; success does not reseed pantry staples. The separate `/api/account/delete-data` endpoint remains owner-scoped and clears the caller's import receipts in the same transaction as their content. Neither endpoint silently ignores database errors. Keeping the global and personal routes separate prevents a personal reset from becoming a cross-account privilege escalation. See `specs/complete-custom-data-reset.md`.

## Imported Standard-food Trust

Native `FoodItems` facts are not trusted ingestion, even when labeled USDA or submitted by an administrator. Import never inserts/overwrites shared standard-food rows. Existing trusted rows may verify links; absent records leave ordinary recipes in owner quarantine. The existing owner batch context retains supplied FDC facts, portions and placement, including context-only data without staged recipes. Owner backup transfers this unconfirmed context, and unavailable recipient sources can stage formerly main recipes during restore. Offline restoration preserves data rather than certifying it. Trusted USDA ingestion remains the path to canonical records; no new service, schema or automatic legacy cleanup is introduced.

## Ingredient Source Fidelity

PostgreSQL stores ingredient order, deliberate zero-nutrition intent, unresolved typed source identities and unconfirmed package-supplied facts. Missing package dependencies do not become dangling live links: the original reference is retained separately until a later server-authoritative repair verifies a target. Unconfirmed facts retain basis/unit/provenance but do not count as a food match. The Go API validates these contracts and native package round trips; the browser does not infer intent from nutrient values.

## Authoritative Custom Recipe Nutrition

Recipes may retain published whole-recipe nutrition in a one-to-one PostgreSQL `custom_recipe_nutrition` table keyed by the existing recipe row. This extends rather than duplicates recipe ownership, portable identity, cookbook membership and recipe-as-ingredient references. `customNutrition` has an explicit `recipeTotal` basis, canonical nutrient totals, source citation, original label and missing-nutrient metadata. The Go API validates and persists these facts; custom totals replace ingredient-derived totals rather than being added to them. Descriptive ingredients remain available for cooking/groceries without fabricated food matches or zero-nutrition consent. Normal recipes keep existing readiness rules. Linked ingredient snapshots retain an explicit missing-nutrient list, so a regular parent does not turn an unknown child nutrient into a measured zero. Description is separate from cooking instructions. Anonymous public recipe views receive the same breadcrumb context as authenticated views.

Native bundles carrying these fields use version 4, including dependency closure and pending-import backup contexts, so older readers reject rather than silently lose authoritative facts. Existing content without these fields retains its previous envelope. See `specs/custom-recipe-nutrition.md` for scope and verification.

## Dietary Nutrition Assessment

Dietary profiles remain user-owned PostgreSQL records. The Diabetes-aware starter is provisioned once for existing/new users, not regenerated on profile reads. `GET /api/dietary-profiles/{id}/recipe-assessments` authorizes the caller's profile and evaluates the caller's stored recipes in Go, using authoritative custom totals or ingredient snapshots and their missing-nutrient metadata. It returns match/noMatch/notAssessed with reasons; it accepts no browser-supplied nutrition facts. The frontend combines confirmed nutrition matches with existing ingredient-name tag/allergen filters. React Query caches results keyed by the selected profile and recipe inputs under the existing recipe-list invalidation prefix; dietary-profile mutations also invalidate assessments. Recipe/profile refresh errors and in-flight assessment/recipe/profile reads suppress matches rather than redisplaying a stale pass. Malformed legacy profile fields surface as read errors, not silently discarded restrictions. Migration SQL and its version record commit atomically so failed provisioning cannot seed duplicates on retry. The filter is opt-in; nutrient screening is not medical certification. Legacy name-based rules are not moved or expanded as part of this change. See `specs/diabetes-aware-dietary-filter.md` and `docs/dietary-profile-api.md`.

## Database

Responsibilities:

* persistent storage
* transactional consistency
* authoritative data ownership

Technology:

* PostgreSQL

All persistent application data belongs in PostgreSQL.

---

# Local Deployment Credential Ownership

The owner's explicit standard Compose / GHCR requirement supersedes host launchers, setup images and installer ownership markers. Operators supply and preserve five independent secrets in protected configuration: PostgreSQL bootstrap, migration login, API runtime login, persistent HMAC and first-admin claim. The empty `.env.example` must be filled before startup. Recommend five independent 32-byte random values rendered as 64 lowercase hex characters; migration/runtime passwords require that exact format and must differ. Passwords must be URL-safe for connection URL interpolation. Restrict file permissions/Windows ACLs and keep an encrypted offline configuration backup with the database; HMAC is essential for restoring encrypted provider settings. No automatic generation/rotation, adoption or credential recovery is provided.

An explicit `bootstrap` API command provisions fresh database roles without replacing existing passwords; an explicit `migrate` command owns schema changes and runtime grants. Before any bootstrap mutation, populated public application storage must already be migration-owned with both controlled roles present; safe cluster-wide role names cannot authorize legacy/mixed-owned data. An ownerless restore performed deliberately as the migration role retains the ownership needed for controlled reruns, without an adoption flag. Ordinary API startup never migrates: it verifies the embedded migration ledger and rejects excessive database authority before listening. The migration owner is separate from the runtime DML/TRUNCATE role; schema/role administration and ledger writes are forbidden to runtime. No existing-install superuser transition or automatic credential rotation is implied. Claim-only rotation is an explicit operator configuration change preserving PostgreSQL/HMAC material, followed by API recreation through its existing manager; Go owns persistent claim consumption/admission.

One standard five-service definition orders healthy PostgreSQL, bootstrap and migrate commands using the API image, restricted API, then web. Bootstrap alone receives all database provisioning passwords; migrate gets its own connection, API gets only its runtime connection/HMAC/claim, and web gets none of those secrets. Release Compose assets contain literal immutable web/API digests; source Compose requires explicit `DIETLEDGER_VERSION` rather than implying an unpublished release exists. Exactly two application packages come from GHCR; official pinned PostgreSQL remains allowed. Only web publishes `127.0.0.1:3000` by default. The browser uses same-origin `/api`; wider access requires trusted HTTPS ingress, exact `CORS_ORIGIN` and `AUTH_ALLOW_INSECURE_LOOPBACK=false`.

Portainer CE Docker Standalone Web editor/Upload and Git stacks use the same service definitions with explicit environment entry/import, named storage and no relative binds/Business Edition dependency. Git uses an exact approved ref and Compose path. Both health and successful-completion dependencies must be honored; these are orchestration-time gates, not continuous enforcement after restarts. API startup independently checks authority and migration ledger. Actual Compose/Portainer/image-start verification and publication remain separate pending gates. Provider-issued user keys remain external and use existing encrypted owner storage. See `docker-registry-install.md` and `specs/standard-compose-ghcr-install.md`.

## Runtime Image Dependency Boundary

The web image executes Node directly; no separate setup image is part of the standard deployment. npm/npx/yarn/corepack are build tooling, not runtime dependencies. The web runtime stage removes package-manager libraries/shims and verifies Node 22.23.2 is retained, while dependency/builder stages preserve the locked npm installation. Reviewed same-branch musl/zlib update floors address OS packages without adding a service or changing application ownership. The API retains its pinned Go compiler and direct binary entrypoint, with an existing-library zlib update. PostgreSQL remains an unmodified official upstream image. Actual image scans and exact-binary advisory review remain release evidence, not assumptions derived from a clean application lockfile.

# Authentication and Bootstrap

The Go API and PostgreSQL own admission and browser sessions. First-admin registration requires the installation-specific `SETUP_CLAIM_SECRET` (at least 32 characters). A stable membership lock makes first-user admission and claim consumption transactional. Claim-consumption receipts survive factory reset; after a reset, an operator must configure a newly generated claim and update/recreate the API through its original deployment manager before first-admin setup can succeed. A container restart retains its old environment; see [claim recovery](docker-registry-install.md#reruns-upgrades-and-recovery). Never rotate the persistent HMAC or database credentials as a substitute for claim rotation.

Browser access JWTs last 15 minutes, stay in memory, and identify a PostgreSQL session checked on every authenticated request. Browser cookie-auth operations require cross-tab Web Locks, available in secure contexts throughout the supported Next 16 browser baseline; capability loss fails closed with an informative error instead of an unsafe concurrent fallback. Delayed request retries retain the originating account generation and cannot dispatch after logout/account switch. Each live tab also records its established principal from the server's AuthResult user, so a shared refresh cookie changed by another tab cannot cause old-principal writes to be retried as the new user. A mismatch retires local state without revoking the other principal's server session; an unbound fresh reload may establish the current cookie user. BroadcastChannel notifications are best effort, not the security boundary. Legacy-worker retirement is awaited, and a `reloadRequired` result blocks account switches and visibly warns on logout. A 30-day absolute-lifetime, HttpOnly, SameSite=Strict refresh cookie rotates once per use; replay revokes its family. Logout revokes the current session only after the client confirms its displayed principal still matches the shared cookie under the same Web Lock. A mismatch or unavailable confirmation clears local state but reports server revocation as unconfirmed and does not revoke the other account's session; confirmation tokens are never adopted. Auth responses and private API responses are no-store. Previous stateless tokens and plaintext account API keys cannot authenticate; managed key creation is unavailable until a permission-enforcing implementation is specified, while existing keys may be listed/revoked. No account or application content is deleted by this cutover.

Set `CORS_ORIGIN` to the exact public browser origin(s); wildcard values cannot authorize browser authentication. Auth requests require an allowed Origin; cookie refresh/logout also require the `X-CSRF-Token` custom header. HTTPS refresh cookies use the browser-enforced `__Host-dietledger_refresh` name, Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. Explicit loopback HTTP uses a different cookie name; HTTPS never accepts that name or the retired unprefixed cookie. Ambiguous duplicate selected cookies fail closed. Root Path is required by the host prefix; cookie Path is not a security isolation boundary. Explicit `AUTH_ALLOW_INSECURE_LOOPBACK=true` allows HTTP authentication only for configured localhost or loopback origins, for local development. The operator must keep the Go API private behind the trusted HTTPS ingress: the Origin header is not evidence of encrypted transport to a directly exposed API. See `specs/security-auth-session-verification.md`.

## Scoped personal keys

A reserved personal-key Bearer family is handled separately before the session/public route mux, after ordinary resource admission and limits. PostgreSQL migration 000037 stores only a digest, explicit grants and expiry in `personal_api_keys`; owner/active-key lookup does not load administrator or session authority. The web-session management API issues, lists and revokes caller-owned keys. Issuance requires a configured HTTPS Origin, CSRF marker and current password; revocation needs the same HTTPS/CSRF checks. Go matches an exact method, path and scope before calling personal handlers, with a role-free principal and a read/write store view that disables SQL administrator branches. Legacy keys remain inert, and account deletion and content resets remove the affected key rows. See [the approved contract and verification](specs/scoped-personal-sync-api-keys.md).

# API Resource Admission

Go independently admits complete request bodies before decoding: ordinary requests use 1 MiB, the exact native bundle import endpoint uses 32 MiB, and the exact administrator dataset-upload endpoint uses 512 MiB. Uploads spool to private temporary files and clean up on return. Process-local admission bounds buffering/uploads; explicit 413 and 503 responses reject over-budget work rather than accepting truncated input. Peer limits normalize socket addresses without trusting forwarded headers; login/register account targets use separate hashed buckets. Auth route keys use fixed IDs for login/register/refresh/logout plus one shared unknown-route fallback per peer, never retained raw URL paths. Limiter state is bounded and idle-expiring, with the existing global budget retained.

The public Next transport enters through a dynamic Node-runtime catch-all Route Handler and `src/lib/api-proxy.ts`. This is forwarding only, not frontend-owned API business logic. Middleware/Proxy convention files are absent so Next cannot clone/truncate upload bodies before admission. Transport uses 16 ordinary/native requests plus two bounded upload streams, preserving auth/CSRF headers and separate Set-Cookie values while stripping untrusted forwarding/control headers. No API host port is published. The Docker context admits only this transport route under the otherwise excluded Next API subtree, with an input-contract regression; image execution remains a separate release check. Socket-peer pooling is conservative by default; XFF is not trusted.

The existing dataset processor and uploads share one active worker, a ten-minute job deadline, bounded compressed downloads/ZIP inflation and streamed 500-food database batches. PostgreSQL batch and job-metadata operations honor cancellation, and background job polling has a five-second deadline. Each pending job is atomically claimed with a versioned attempt/deadline marker in the existing checkpoint field. Terminal status uses a fresh five-second cleanup budget even after work/client cancellation; the worker is released afterward whether that write succeeds or fails. The existing processor reconciles only expired versioned active attempts, guarded by exact job ID/checkpoint; it never resets legacy/unmarked or unrelated jobs. During database outages an in-progress status can remain until recovery and attempt expiry, but no worker slot remains held. Previously committed batches can remain after failure; this is not whole-dataset atomicity. No API response is opted into shared caching; Next's HTML frame policy preserves same-origin PDF rendering, with CSP staged report-only and no automatic HSTS.

# Ownership Model

## PostgreSQL Owns

* users
* foods
* recipes
* books
* food logs
* meal plans
* grocery plans
* nutrition data
* health data
* application settings
* USDA food-specific portion weights and per-user defaults for storing matched foods

PostgreSQL is the authoritative source of domain data.

---

## Go API Owns

* validation
* business rules
* authorization
* calculation orchestration
* persistence operations

Business logic belongs in the API. The Go API validates matched-food identities and storage locations, creates a user's first storage default atomically with the first ingredient location edit, and authorizes explicit default updates. Shared USDA food rows do not store user preferences. Cookbook PDF unit formatting in the browser is presentation-only; it reads food-specific USDA portion weights but never changes stored amounts or nutrient snapshots.

---

## React Query Owns

Server state.

Examples:

* recipes
* foods
* profiles
* meal plans
* food logs
* books
* food storage defaults

React Query is the only client-side cache for server-owned data.

---

## Zustand Owns

Transient UI state.

Examples:

* dialogs
* selections
* editor workflows
* drag and drop state
* temporary UI interactions

Zustand does not own authoritative domain data.

---

## React Component State Owns

Local component concerns.

Examples:

* form visibility
* input state
* temporary interactions

Component state should remain local whenever practical.

---

# Data Flow

## Read Flow

```text
PostgreSQL
    ↓
Go API
    ↓
React Query
    ↓
React Components
```

---

## Write Flow

```text
React Components
    ↓
Go API
    ↓
PostgreSQL
    ↓
React Query Invalidation
    ↓
UI Refresh
```

Frontend writes should not bypass the API.

---

# Domain Boundaries

## Frontend Boundary

The frontend may:

* render data
* collect user input
* manage UI state

The frontend should not become the primary location for business rules.

---

## API Boundary

The API is responsible for:

* enforcing business rules
* validating requests
* coordinating persistence
* protecting data integrity

---

## Database Boundary

The database is responsible for:

* persistence
* constraints
* transactional consistency

The database should not contain application business workflows.

---

# Architectural Decisions

The following decisions are considered settled.

## PostgreSQL Is The Sole Source Of Truth

All persistent application data belongs in PostgreSQL.

---

## Server-Authoritative Architecture

The server is authoritative.

The browser is a client.

---

## REST API Architecture

DietLedger uses a REST-based API architecture.

---

## React Query For Server State

Server-owned state belongs in React Query.

---

## Zustand For UI State

Zustand is limited to transient UI concerns.

---

## Single API Architecture

DietLedger operates as a single application with a single API and a single primary database.

---

## Recipe Share Visibility

Shared recipes use a three-tier visibility model (`private`, `users`, `public`)
enforced server-side by the Go API:

* `public` — anyone can view; appears in community gallery
* `users` — any authenticated DietLedger user can view; appears in gallery for logged-in users
* `private` — owner only; never in gallery

The `/api/share/<token>` GET and `/api/community` endpoints use `optionalAuth`
middleware: they accept requests without a token (anonymous) but attach the user
to context when a valid token is present, enabling visibility-tier enforcement.

Frontend public routes (`/share/*`, `/community`) bypass the `(app)/layout.tsx`
auth redirect so unauthenticated visitors can view public-tier content.

Share visibility does not grant mutation authority. Creation, token reads and canonical exports verify the share publisher against the canonical recipe owner; updates/deletes are publisher-scoped, and invalid legacy visibility fails closed. Administrator status does not widen private recipe/custom-food dependency access. Global categories and published default templates are administrator-managed, while private non-default templates remain owner-managed. Template write predicates check PostgreSQL administrator authority and both current/requested publication state atomically. Native imports reuse existing taxonomy or require administrator provisioning, and imported templates remain owned non-default copies. Category parent updates serialize and reject cycles; traversal uses a visited set and finite bound. See `specs/security-sharing-trust-verification.md` and `recipe-package-api.md`.

---

# Historical Decisions

The following systems were intentionally removed:

* IndexedDB persistence
* Offline-first synchronization
* Conflict resolution systems
* Local-first architecture
* SQLite production backend
* Tauri support
* Capacitor support
* Next.js-owned business API routes (the current Route Handler is transport-only to Go)

See DECISIONS.md for rationale and historical context.

---

# Architecture Review Checklist

Testing requirements are defined in TESTING_STRATEGY.md.

Before introducing a significant architectural change:

## Ownership

* Who owns the data?
* Is ownership singular?

## Business Logic

* Does this belong in the API?
* Why not?

## Existing Systems

* Can PostgreSQL solve this?
* Can the Go API solve this?
* Can existing code solve this?

## Complexity

* What complexity is being added?
* Is it justified?

## Maintenance

* Will future contributors understand this?
* Does this increase operational burden?

## Documentation

Must the following be updated?

* ARCHITECTURE.md
* DECISIONS.md
* PROJECT.md
* NUTRITION_DOMAIN.md
* API documentation
