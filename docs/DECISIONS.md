# Decisions

> This document records significant architectural, product, and technical decisions made within DietLedger.
>
> ARCHITECTURE.md describes how the system works today.
>
> This document explains why major decisions were made.
>
> Future contributors should consult this document before proposing major architectural changes.

---

# Decision Record Format

Each decision should include:

- Status
- Date (when known)
- Decision
- Rationale
- Consequences

---

# ADR-001: PostgreSQL Is The Sole Source Of Truth

## Status

Accepted

## Decision

PostgreSQL is the only authoritative datastore for DietLedger.

All persistent application data is stored in PostgreSQL.

## Rationale

Multiple persistence systems created:

- synchronization complexity
- data consistency problems
- debugging difficulty
- migration complexity

A single authoritative datastore is simpler and easier to maintain.

## Consequences

Positive:

- simpler architecture
- fewer failure modes
- easier backups
- easier debugging

Negative:

- no offline-first capability
- server dependency for application usage

---

# ADR-002: Server-Authoritative Architecture

## Status

Accepted

## Decision

DietLedger uses a server-authoritative architecture.

```text
Browser
    ↓
Next.js
    ↓
Go API
    ↓
PostgreSQL
```

The browser is a client.

The server owns business logic.

## Rationale

Client-authoritative architectures create:

- synchronization problems
- conflict resolution requirements
- hidden complexity

A server-authoritative model is easier to reason about.

## Consequences

Positive:

- simpler ownership model
- consistent behavior
- easier debugging

Negative:

- reduced offline support

---

# ADR-003: Offline-First Architecture Removed

## Status

Accepted

## Decision

Offline-first architecture was removed.

Removed systems included:

- IndexedDB persistence
- synchronization engine
- write queues
- conflict resolution
- local-first data ownership

## Rationale

The complexity cost exceeded the user value.

The architecture became difficult to maintain for a single developer.

## Consequences

Positive:

- major reduction in complexity
- simpler debugging
- fewer edge cases

Negative:

- offline functionality removed

---

# ADR-004: IndexedDB Removed As Primary Storage

## Status

Accepted

## Decision

IndexedDB is no longer used as authoritative storage.

## Rationale

Maintaining multiple sources of truth created consistency problems.

## Consequences

All authoritative data now resides in PostgreSQL.

---

# ADR-005: Go API Owns Business Logic

## Status

Accepted

## Decision

Business logic belongs in the Go API.

The frontend is responsible for:

- presentation
- interaction
- workflows

The API is responsible for:

- validation
- business rules
- authorization
- persistence orchestration

## Rationale

Business logic scattered across clients becomes difficult to maintain.

A single implementation improves consistency.

## Consequences

Future business rules should be implemented in the API.

---

# ADR-006: Next.js API Routes Removed

## Status

Accepted

## Decision

Application behavior is not implemented using Next.js API routes.

The Go API is the application backend.

## Rationale

Multiple backend implementations create duplication and confusion.

## Consequences

New backend functionality belongs in the Go API.

---

# ADR-007: React Query Owns Server State

## Status

Accepted

## Decision

React Query is the authoritative client-side cache for server-owned data.

Examples:

- recipes
- foods
- meal plans
- profiles
- food logs

## Rationale

React Query provides:

- caching
- invalidation
- synchronization
- loading state

without custom infrastructure.

## Consequences

Server-owned data should not be stored in Zustand.

---

# ADR-008: Zustand Limited To UI State

## Status

Accepted

## Decision

Zustand is limited to transient UI state.

Examples:

- dialogs
- selections
- drag-and-drop state
- editor workflow state

## Rationale

Mixing server state and UI state creates unclear ownership.

## Consequences

Zustand is not a persistence layer.

---

# ADR-009: SQLite Removed From Production Architecture

## Status

Accepted

## Decision

SQLite is not a production datastore.

PostgreSQL is the only production database.

## Rationale

Supporting multiple production databases increased maintenance burden.

## Consequences

Future features should assume PostgreSQL.

---

# ADR-010: Tauri Removed

## Status

Accepted

## Decision

Desktop-native support through Tauri was removed.

## Rationale

The maintenance cost exceeded the value provided.

The web application satisfies the primary use cases.

## Consequences

Desktop-specific functionality is not a current priority.

---

# ADR-011: Capacitor Removed

## Status

Accepted

## Decision

Mobile-native support through Capacitor was removed.

## Rationale

The maintenance burden exceeded available resources.

The project is currently focused on the web platform.

## Consequences

Mobile support is provided through the web experience.

---

# ADR-012: REST API Architecture

## Status

Accepted

## Decision

DietLedger uses REST over HTTP.

## Rationale

REST provides:

- simplicity
- browser compatibility
- debuggability
- AI-assisted development friendliness

The complexity of alternatives is not justified.

## Consequences

Browser-facing APIs should remain REST-based.

---

# ADR-013: Optimize For Solo Development

## Status

Accepted

## Decision

The architecture is intentionally optimized for:

- one developer
- AI-assisted development
- maintainability
- understandability

## Rationale

Architectural decisions should reflect actual constraints rather than hypothetical future organizations.

## Consequences

Complexity must justify itself.

---

# ADR-014: Nutrition Calculations Are Protected Functionality

## Status

Accepted

## Decision

The following calculations are considered protected business logic:

- nutrient calculations
- serving calculations
- FDA Daily Values
- BMI
- BMR
- TDEE
- calorie goals
- dietary compliance

## Rationale

These calculations directly impact user trust and product correctness.

## Consequences

Changes require review, validation, and testing.

---

# ADR-015: Snapshot-Based Nutrition Tracking

## Status

Accepted

## Decision

Food log entries store nutrient snapshots.

Historical entries do not automatically update when recipes change.

## Rationale

Food logs represent historical consumption.

Historical records should remain stable.

## Consequences

Recipe edits do not retroactively alter food history.

---

# ADR-016: Fixed Nutrient Model

## Status

Accepted

## Decision

DietLedger uses a canonical 15-nutrient model.

The nutrient set is standardized across:

- foods
- ingredients
- recipes
- food logs

## Rationale

Consistency simplifies calculations, reporting, and validation.

## Consequences

New nutrition features should preserve compatibility with the canonical nutrient model.

---

# ADR-017: Integration Over Feature Expansion

## Status

Accepted

## Decision

Product development prioritizes strengthening existing workflows over expanding feature count.

## Rationale

The value of DietLedger comes from integration between systems.

## Consequences

New features should strengthen:

- recipe workflows
- meal planning
- food logging
- nutrition analysis
- grocery generation
- health tracking

before introducing entirely new domains.

---

# ADR-018: Simplicity Is A First-Class Requirement

## Status

Accepted

## Decision

Architectural simplicity is a product requirement.

## Rationale

Complexity increases:

- maintenance cost
- debugging difficulty
- onboarding time
- AI context requirements

## Consequences

When multiple solutions are viable, prefer the simpler solution.

---

# ADR: Per-User USDA API Key, Local-First Food Search, Admin-Managed Imports

## Status

Accepted

## Decision

1. **The USDA FoodData Central API key is per-user**, stored encrypted in the
   `user_secrets` table (key name `fda-api-key`) and configured in the Settings
   dialog. There is no server-level `FDA_API_KEY` environment variable.

2. **Food search is local-first with live fallback.** `/api/foods/search`
   queries the shared `food_items` table first. On a miss, it calls the live
   USDA FDC API using the requesting user's key and caches the results into
   `food_items`, so subsequent searches for the same item are served locally.

3. **Dataset imports are administrator-only.** Bulk USDA dataset seeding,
   manual upload, and cache clearing are restricted to the administrator
   account. The food data itself remains shared and readable by everyone. The
   first registered user is the administrator (earliest `created_at`).

## Rationale

- The Go server had no live USDA search — it only queried a pre-seeded local
  DB, and the env-var key was dead code. Users with an empty DB saw a
  misleading "rate-limited" message for every search.
- A server-level env var cannot map to individual users' USDA keys in a
  multi-user system; the per-user secret is the correct ownership boundary.
- Bulk imports are an administrative concern; ordinary users only search the
  shared data.

## Consequences

Positive:

- Searches work immediately (no seeding required) once a user adds their key.
- Live results are cached, so the shared local DB grows organically.
- Clear ownership: key = per-user secret, imports = admin, data = shared.

Negative:

- Each user must supply their own USDA key for live fallback.
- `/api/foods*` endpoints now require authentication (no anonymous food lookup).

---

# ADR: Three-Tier Recipe Share Visibility

## Status

Accepted

## Decision

Recipe share links use a three-tier visibility model stored in the
`shared_recipes.visibility` column (`private`, `users`, `public`), replacing
the former binary `is_public` boolean.

* **public** — anyone can open the share link; appears in the community gallery
  for both authenticated and anonymous users.
* **users** — any authenticated DietLedger user can open the link; appears in the
  community gallery only for authenticated users. Anonymous users receive 401.
* **private** — only the owner can open the link; never appears in the community
  gallery. Non-owners receive 403. Soft-deleting a share sets visibility to
  `private`.

## Rationale

* The binary public/private model was too coarse — it didn't support sharing
  within the DietLedger community without exposing recipes to the entire internet.
* A single `visibility` column is simpler than separate boolean flags and maps
  cleanly to a WHERE clause for the community gallery query.
* `optionalAuth` middleware allows public endpoints to behave differently for
  authenticated vs anonymous users without requiring a separate route.

## Consequences

Positive:

* Users can share recipes with the DietLedger community without making them
  fully public.
* The community gallery and share pages work for unauthenticated visitors
  (public-tier recipes only), widening product reach.

Negative:

* `/api/share/<token>` and `/api/community` use `optionalAuth` instead of
  `requireAuth` or no-auth, adding one indirection layer.
* Frontend must attach auth headers on public routes for logged-in users to
  see users-tier content (handled by the API client automatically).

---

# ADR: Food-Specific Portion Weights for Cookbook PDF Units

## Status

Accepted

## Decision

Keep positive USDA `foodPortions` gram weights on shared food rows. The browser may use them for cookbook PDF *display* when a portion unambiguously matches the matched ingredient's measure. Exact weight-to-weight conversions need no USDA portion. Grams PDF mode retains original units with a notice when no reliable match exists; saved recipe amounts, nutrient snapshots, and portable bundle exports remain unchanged.

## Rationale

A generic cup-to-gram water density or a fixed whole-item weight would misstate the weight of many foods. USDA publishes food-specific portions for some, but not all, records; previously imported DietLedger foods discarded those portions, so they must be re-seeded to gain them.

## Consequences

A small PostgreSQL JSONB portion collection and explicit conversion tests add maintenance cost, but avoid fabricating print weights. Existing foods without portions and sparse live-search results safely retain original units; no automatic data rewrite is required.

---

# ADR: Per-User Storage Defaults for Matched Foods

## Status

Accepted

## Decision

Store the default storage location separately from shared USDA foods and recipe ingredient locations, keyed by authenticated user and stable database-food identity. The Go API inserts the first choice atomically with the ingredient location edit and offers an authenticated explicit replacement action. In the ingredient editor, that action saves the selected location on the current ingredient and updates the per-user default. React Query caches defaults; the browser preselects them on subsequent additions. Other existing recipe ingredients are not rewritten.

## Rationale

Milk may normally go in a refrigerator for one user, but individual recipe ingredients can differ. A user-scoped preference prevents users from modifying shared food metadata and preserves per-recipe overrides.

## Consequences

A narrow preference table and API add persistence and tests; first-write-wins prevents incidental recipe edits or rematches from changing a deliberate default. Bundle JSON stays focused on recipe data rather than exporting user-specific preferences.

---

# ADR: Immutable Portable Recipe and Custom-Food Identity

## Status

Accepted; storage implemented incrementally under `specs/recipe-nutrition-quarantine.md`.

## Decision

Persist `dietledger:recipe:<uuid>` and `dietledger:food:<uuid>` identities independently of local primary keys. PostgreSQL assigns them once, protects them from mutation, and enforces owner-scoped uniqueness. Native transfers retain these identities while remapping local keys. Identity—not equal names or nutrients—determines whether two objects are the same. USDA uses its FDC food identifier, not a DietLedger UUID or nutrient-definition identifier. Ambiguous legacy origins are not inferred from content; experimental data may be reset locally without altering the remote instance.

## Consequences

Read/update contracts expose immutable identities. Package support, conflict resolution, database preflight and quarantine are separate verified slices; see the implementation plan for current evidence. No synchronization engine or third-party adapter is introduced.

---

# ADR: Lossless Ingredient Source Fidelity

## Status

Accepted; persistence foundation implemented incrementally under `specs/recipe-nutrition-quarantine.md`.

## Decision

Persist ingredient order, explicit zero-nutrition intent, unresolved typed source identities, and unconfirmed package-supplied nutrition separately from live links and calculated snapshots. Missing package dependencies are structurally valid when their source identity is safe and typed; they do not create dangling foreign keys. Unknown source types and invalid numeric/basis data remain invalid. Native v1/v2 compatibility never infers deliberate zero intent from an all-zero snapshot.

## Consequences

Migration 000030 adds the storage contract and conservative legacy backfill. Native package reimports treat order and source intent as content, so order-only or intent-only changes under an existing portable identity conflict rather than silently overwriting local content. These fields enable later readiness and repair work but do not themselves enable quarantine filtering, standard-database certification, supplied-fact publication, or regular-export exclusions.

---

# ADR: Server-Enumerated Owner Recipe/Book Backup

## Status

Accepted; backend and both account-deletion UI integrations implemented incrementally under the recipe nutrition quarantine plan.

## Decision

Use a distinct authenticated owner-backup endpoint, not browser-selected export IDs, to enumerate all owned recipes/books. Reuse native v2 serialization and authorized dependency closure. Validate the bundle and verify all enumerated top-level objects are present. Missing ingredient source identities remain representable; operational retrieval failures, inaccessible private dependencies, malformed groups, and missing referenced templates fail backup generation instead of silently losing data.

## Rationale and Consequences

Discovery caches can be stale, loading, or later ready-only; they cannot enumerate content safely before account deletion. Server enumeration prevents those omissions while keeping this backup separate from regular export eligibility. The browser cannot prove that a download reached disk. This endpoint does not promise a complete account-data backup. Owner enumeration and every serialization/authorization read use a read-only PostgreSQL REPEATABLE READ transaction: a consistent snapshot at the first query, not an inconsistent mixture of concurrent edits. A transaction-local reader reuses existing store/export methods without changing ordinary selected exports. This follows PostgreSQL's snapshot isolation contract (https://www.postgresql.org/docs/17/transaction-iso.html#XACT-REPEATABLE-READ). Backup and deletion remain separate requests: no lock, revision token or write freeze protects edits committed after the snapshot but before deletion. Closing that interval requires a separately approved coordinated deletion protocol; this safeguard must not claim it does so. Both deletion UIs now await owner backup and download construction/initiation before deletion, and only successful deletion permits logout/navigation. Browser exceptions stop the flow. UI wording limits coverage to recipes/books and explicitly disclaims confirmed disk persistence. Verification exposed non-restorable category cycles/duplicate sibling names under existing parent/name-based category import reuse; owner backups reject those cases rather than changing category identity or silently losing relationships. Export deduplication requires same-portable-ID food copies to agree on canonical name/nutrients, and malformed stored preparation JSON now propagates a read error instead of silently clearing content. A suspected duplicate-book hash defect was disproved: book hashes retain bundle keys; distinct same-title books are preserved in cross-database tests.

---

# ADR: Separate Import/Quarantine Storage (Revised User Direction)

## Status

Implemented under the revised import-only scope; see the active plan for verification evidence. Supersedes the earlier main-table-derived quarantine architecture. The user confirmed whole-batch cancellation, import-only scope and persistent accumulation across imports; no existing recipe migration or data reset is authorized.

## Decision and Rationale

Stage imported recipes separately, verify actual ingredient links, promote complete recipes into the existing main data, and leave unresolved recipes in quarantine. The quarantine UI reads staging exclusively and reuses existing ingredient search/rematch and recalculation. Offer Stop and undo or Relink later for missing sources rather than build dataset inventory/preflight. Defer ordinary search/book styling, retain/fork UI for recipe/food portable-identity conflicts, and new nutrition workflows. Same-name book import choices are a separate placement decision and do not change recipe/food identity conflict handling. The user explicitly prioritizes delivering this narrow repair workflow over expanding the surrounding architecture.

## Consequences

Preserve native identities, source facts, dependency links and placement across staging/promotion. Extend the completed owner-backup safeguard to include staged records before routing imports into the new storage. Stop-and-undo must not delete unrelated/reused data. Existing main-table recipes and references must not be moved/deleted incidentally. The active spec and implementation plan define acceptance. Stop-and-undo cancels only the incoming batch before promotion; it never clears quarantine belonging to earlier imports.

---

# ADR: Authoritative Published Nutrition on Custom Recipes

## Status

Accepted by explicit user instruction to implement without additional approval; see `specs/custom-recipe-nutrition.md` for implementation evidence.

## Decision and Rationale

Retain published/custom recipe nutrition separately from ingredient-derived snapshots in a one-to-one `custom_recipe_nutrition` table linked to existing recipes. Avoid a duplicate custom-recipe domain or a fake nutrition-only ingredient/custom food. Whole-recipe totals have an explicit basis, source label and missing-value provenance. They are authoritative for recipe servings and existing recipe-as-ingredient references; descriptive ingredients need no food matches. Ordinary recipes remain unchanged. This supersedes the prior deferral of whole-recipe-label support for this explicit custom-recipe workflow, without changing unconfirmed ingredient-fact promotion policy.

## Consequences

Recipe CRUD, staged/native transfer, backups and nutrition consumers must preserve the authority and never double-count ingredients. Yield changes redistribute fixed totals; recipe scaling scales totals. Historical food logs remain snapshots. Version 4 bundles prevent older importers from silently discarding custom facts or descriptions. Unknown nutrients are marked unreported, not presented as measured zeros; source percentages unsupported by the canonical model remain in the original label.

---

# ADR: Editable Diabetes-aware Starter and Server-owned Nutrient Screening

## Status

Accepted by user approval of `specs/diabetes-aware-dietary-filter.md`.

## Decision and Rationale

Provision an ordinary user-owned dietary profile once and reuse existing selection/editing, rather than create another diet-management system. The optional recipe screen starts with the ADA 2026 fiber-density recommendation; the UI explicitly distinguishes this application-level screen from clinical guidance for an overall eating pattern. Sodium remains daily guidance and carbohydrate/other per-serving limits are individualized, not invented universal restrictions. Persist edits and deletion without read-time reseeding. Execute each migration and its applied-version record in the same transaction: the starter's random IDs otherwise permit duplicate provisioning if a version write fails after insertion.

Go evaluates stored recipe nutrition and missing facts through a narrow authenticated dietary-profile assessment endpoint. The browser consumes confirmed results and combines them with existing name-based filters, without duplicating the new nutrient evaluator or refactoring unrelated legacy rules. Unknown inputs cannot generate a pass. A failed recipe/profile background refresh also cannot revive a cached pass; assessments participate in both recipe-list and profile-mutation invalidation. The high-fiber screen can exclude suitable individual meal components, so user-visible limitations are essential. No glycemic predictions, medication advice, new dependency, or historical snapshot rewrite is introduced.

---

# ADR: Complete Custom-content Reset, Separate from Account Deletion

## Status

Accepted by the user's explicit instance-wide reset selection; see `specs/complete-custom-data-reset.md` for verification status.

## Decision and Rationale

Reuse the existing administrator/password-gated instance reset for all custom content, including shared global records and import retry/staging state. Keep personal deletion owner-scoped rather than widening its authorization. A reset must remove the request-hash receipts that otherwise falsely classify deleted cookbook content as already imported. Delete atomically without suppressing errors, preserving accounts/settings/sessions and standard imported nutrition. Do not recreate custom pantry staples after reset. Community-category defaults belong in one-time migration initialization, not every server startup, so a reset stays empty after restart.

## Consequences

Administrator controls explicitly say the action affects every user. Schema inventory regression coverage must classify new tables as custom content or intentionally preserved metadata/reference data. Personal deletion still cannot remove another user's content or global records. Factory reset remains distinct; no live reset or deployment is implied by changing the implementation.

---

# ADR: Explicit Decisions for Same-Name Book Imports

## Status

Approved and implemented under `specs/duplicate-book-import-decisions.md`; backend verification and UI workflow evidence are recorded in `sync-server/DUPLICATE_BOOK_IMPORT.md`.

## Decision

Before staging a native bundle that matches an owned book title after trimming and case-insensitive comparison, require an explicit per-book Merge or Replace choice, or let the user cancel the entire bundle. Keep all decisions server-authoritative and revalidate target fingerprints within the owner's transaction. Merge preserves existing metadata and adds structure without inferring chapter identity from names. Replace retains the book row and recipes while replacing structure. Defer structural writes until missing ingredient dependencies are accepted.

Protect candidate matching and replacement from concurrent same-owner book edits by using the existing owner-row transaction lock for ordinary book/placement writes; do not add global table locks. Persist deferred choices and superseded placement claims with import batches so retry, cancellation and owner-backup restore cannot resurrect replaced structure. Keep legacy direct bundle payloads accepted; the current client sends an envelope when decisions are present.

## Rationale and Consequences

Portable identity/content hashes do not define the desired behavior when two independent books share a title. An explicit choice avoids silently creating or overwriting a same-name book, while keeping recipe/food identity conflict policy unchanged. Fingerprints make stale UI choices fail with a retryable conflict rather than silently target changed structure. Merge may intentionally place multiple incoming books into one selected target, while distinct same-title books in a package and in owner backups remain distinct unless the user chooses a merge. Owner backup carries deferred decision state using transport keys and remaps them on restore; recipient-local IDs are never trusted from the file. Completed exact-import receipts are no-ops while their effective content exists; an explicit retry after individual deletion restores only missing recipe and non-superseded placement claims, preserving surviving user edits and never replaying the original Replace decision against a new title match.

---

# ADR: Target-local Persistent Deployment Credentials and Separate Fresh Install

## Status

Historical: installer/credential-generation requirements are superseded by **Standard Compose / GHCR and Operator-supplied Secrets** below and `specs/standard-compose-ghcr-install.md`. Preserve the original 2026-11-19 rationale/security history below; its host prerequisite/installer commands are not current installation instructions.

## Decision and Rationale

Use one dependency-free Node.js 22+ credential/installation implementation with thin Linux Bash and Windows PowerShell launchers, reusing the repository's Node tooling instead of maintaining two secret-management implementations or adding a service. Generate two independent 32-byte CSPRNG values as URL/dotenv-safe hex on the target installation only, never in distributable images/tars. Create secret files inside an already-private staging directory, publish without overwriting, preserve exact valid existing bytes, and fail closed on weak/placeholder/lost initialized configuration. Keep the current Docker connection environment stable across ownership checks and mutation; bind installer state to daemon identity and require restored state instead of adopting unknown data.

## Consequences

Host prerequisites now include Node.js alongside Docker/Compose/buildx. Fresh installation can build both source images or load the prescribed combined tar; packaged templates leave required secrets empty so copying them unchanged fails Compose interpolation before database initialization. API startup independently validates persistent credentials before migrations, including when RSA JWT signing is configured. Runtime `.env`/installer state and local database/archive/binary artifacts stay outside the publication/build set. Existing Portainer upgrades remain image-load-only with no stack replacement, credential rotation or implicit remote destination. Strong persistent HMAC is supported; provider-issued keys cannot be randomly provisioned locally. Native platform/runtime checks are not inferred from mocked orchestration tests. History scrubbing and application-security changes require their own approved plans.

---

# ADR: Claimed Bootstrap and Revocable Browser Sessions

## Status

Approved security-release implementation; verification and remaining release gates are recorded in `specs/security-auth-session-verification.md`.

## Decision and consequences

Use an installation-specific one-use setup claim, with PostgreSQL claim receipts and a stable membership lock, instead of trusting the network or frontend setup state. Retain claim receipts through factory reset; recovery requires an operator-provided new claim. PostgreSQL sessions back 15-minute memory-only access JWTs and 30-day one-use rotating refresh cookies; replay and logout revoke the current session immediately on subsequent requests. Require exact browser Origins, a CSRF request header and HTTPS except explicitly enabled loopback development. A trusted HTTPS ingress and an inaccessible direct API port remain operator requirements.

Retire plaintext account bearer keys and old stateless tokens without deleting user content. Do not issue managed keys while their declared permissions are unenforced. The change adds one database lookup per authenticated request, forces existing browser sessions to sign in again, and requires explicit origin/claim configuration for fresh installations. Persistent HMAC remains unchanged because it also protects integration secrets. All browser cookie-auth operations require origin-wide Web Locks; missing/disabled locking fails before network dispatch with an informative error. This is compatible with Next 16's documented browser baseline, but still requires a secure context and capability detection. Delayed retries preserve their originating account generation. Refresh results must also match the tab's established principal ID (from AuthResult.user, never client-decoded JWT claims); a shared-cookie mismatch retires only local state and prevents retrying an old user's write under another user. Fresh reloads can establish the current cookie user. BroadcastChannel is not an authorization or principal-isolation boundary. Legacy-worker cleanup's reload-required result is visible and blocks switching accounts until resolved. Browser cookie/refresh loss and untrusted TLS/network topology remain explicit operational considerations, not silently accepted security guarantees.

---

# ADR: Docker-only File Preparation and Separate Migration Authority

## Status

Historical installer portions superseded by **Standard Compose / GHCR and Operator-supplied Secrets** below and `specs/standard-compose-ghcr-install.md`. Separate bootstrap/migration/runtime authority and ownership-refusal decisions remain current. Original implementation was authorized 2026-11-19, not a public release or native-platform certification; no existing deployment adoption is authorized.

## Decision and Rationale

Retain one dependency-free Node file-preparation implementation **inside** a
one-shot setup image; move Docker inspection/orchestration and host permissions
to Bash/PowerShell launchers. This removes host language/build tools from public
installation without adding a privileged installer daemon or two secret generators.
Generate independent bootstrap/migration/runtime passwords, HMAC and setup claim;
preserve initialized state and fail closed rather than rekeying an existing DB.

Run fresh role provisioning and migrations as separate controlled commands/jobs.
Serve only with a restricted role after verifying the migration ledger and role
authority; do not let runtime silently reacquire DDL/superuser privileges. Retain
normal application DML/TRUNCATE for existing administrator workflows. Existing
superuser installations require a separately reviewed transition, not an automatic
installer upgrade. Controlled role names exist cluster-wide and are not database
provenance: bootstrap checks actual public schema/object ownership before grants
or owner changes, refusing legacy/mixed owners without mutation. A deliberate
ownerless offline restore as the migrator is distinguishable by migration-owned
objects and needs no adoption flag. Explicit claim rotation changes only private claim bytes;
persisted claim-consumption history belongs to the Go admission implementation.

## Consequences

Public source contains an unreleased manifest until a manually approved sanitized
beta produces real coordinated digests. Explicit local images permit pre-GHCR
manual tests. Portainer is a distinct prepare/import route with its own runtime
verification. CI PR jobs stay read-only; image/release publication requires manual
test and sanitized-source confirmations, an exact beta tag and scoped tokens.
Host Docker admins remain trusted; native Windows ACLs, exact Portainer behavior,
final-image scans and anonymous pulls remain release gates rather than inferred
from mocks. See `docker-registry-install.md` for environment/recovery contracts.

---

# ADR: Standard Compose / GHCR and Operator-supplied Secrets

## Status

Accepted by explicit owner requirement under `specs/standard-compose-ghcr-install.md`. Repository implementation does not certify runtime, approve publication or authorize changes to existing stacks/history. Supersedes the two earlier ADRs' host installers, setup image, automatic credential generation and installer ownership state, not their database/security boundaries.

## Decision and Rationale

Use standard Compose and Portainer CE Docker Standalone, pulling exactly web/API GHCR application packages and pinned official PostgreSQL. Reuse the API image for separate bootstrap and migrate jobs; keep least-secret environment mapping and restricted runtime authority. This removes a separate preparation system and required Node/Git/buildx/login from public installation while retaining server-owned validation.

Operators supply five independent CSPRNG values, recommended as 32 bytes rendered as 64 lowercase hex. Migration/runtime passwords must be distinct and exactly that format; URL-safe values avoid connection-URL interpolation errors. Leave all five template secrets empty. No automatic generation/rotation, unknown-database adoption or missing-credential replacement. Protect configuration with restrictive permissions/Windows ACLs and encrypted offline backups together with PostgreSQL; the original HMAC is indispensable for decrypting restored provider settings.

Source Compose explicitly requires `DIETLEDGER_VERSION`; approved release assets embed literal built/scanned/pushed digests with matching source/version metadata. Only web publishes loopback port 3000. Wider access needs trusted HTTPS ingress, exact browser origin and disabled insecure-loopback mode; browser API stays same-origin.

## Consequences

Portainer Web editor/Upload and exact-approved-ref Git stacks use the same health/completion dependencies, named storage and explicit environment UI/import, not implicit host `.env`, relative binds or Business Edition. Source-reviewed CE 2.45.4 LTS is a candidate, not a certified minimum/runtime. Orchestration dependencies do not continuously enforce restarts; API startup independently validates its ledger/authority. Actual fresh Compose/Portainer lifecycle, scans, anonymous pulls, manual testing, history adoption and publication retain separate gates. See `docker-registry-install.md` for procedures and source evidence.

---

# ADR: Owner Publication and Unconfirmed Native Standard-food Facts

## Status

Accepted by the owner under M4/M5 security remediation, 2026-11-19. Verification: `specs/security-sharing-trust-verification.md`.

## Decision and Rationale

A canonical recipe share must be published by its actual owner; visibility never grants mutation permission, and an administrator flag does not grant private recipe/custom-food dependency access. Global categories and published default templates require administrator write authority, with native-import taxonomy reuse and non-default owned template copies. Template predicates check current publication state and database administrator authority during the write, preventing owner/publication races. Category graph mutations serialize in PostgreSQL and reject cycles; traversal also terminates on malformed legacy graphs.

Native standard-food facts are unconfirmed input, not a shared USDA ingestion channel. Reuse existing catalog rows without overwriting them and retain absent FDC facts/portions in the existing owner batch context/quarantine. Offline owner-backup restoration means no data loss, not automatic publication. A recipient missing previously trusted sources retains affected recipes in quarantine until trusted ingestion and explicit source verification permit promotion. Complete custom whole-recipe nutrition retains its already-approved separate authority, not global food certification.

## Consequences

No new datastore, schema, migration, provider request or legacy data cleanup is needed. Standard-food package context survives owner backup even without staged rows; ingredient quantities/snapshots, missing-nutrient metadata and historical logs are preserved. Existing trusted-promotion/portion fixtures explicitly seed recipient canonical records; empty-catalog tests instead require retained unconfirmed facts and placement. Ordinary imports needing new global categories fail materialization atomically until an administrator provisions taxonomy. These rules supersede earlier wording that allowed packaged food facts or blanket administrator exports to establish trust.

---

# ADR: Finite API Admission and Dataset Work

## Status

Owner-authorized, 2026-11-19. Backend limits and staged response policy are implemented; built Next 16.4.6 loopback transport compatibility is verified separately from production deployment.

## Decision and Rationale

Use a thin dynamic Node-runtime Route Handler for the existing public API forwarding transport, with its implementation at `src/lib/api-proxy.ts`, not convention-reserved `src/proxy.ts` or middleware. Next 16.4.6 automatically clones/buffers middleware request bodies before user admission, and its cap silently truncates. A Route Handler avoids that clone and supports bounded upload streams without another service/framework or frontend business logic. Test the built middleware manifest, narrow Docker-context inclusion of the transport route, and large native/multipart transport, not only direct function calls. Preserve all end-to-end auth/CSRF headers and separate upstream cookies; strip untrusted forwarding/control headers.

Use standard-library bounded readers, private temporary upload/download spools, the existing in-process limiter and dataset processor, not another queue/service. Reject entire over-budget request bodies explicitly before handler decode, including valid JSON prefixes with oversized tails. Keep native bundle and administrator upload exceptions explicit. Bound limiter state; derive default identity from the socket peer, not client forwarding headers. Hash separate account-target buckets without changing authentication/session semantics.

Stream datasets into the existing 500-item commits under a single worker/deadline and context-aware PostgreSQL writes. Claim attempts atomically using a versioned deadline marker in the existing checkpoint field. Use a fresh five-second terminal cleanup context after work expiry, then release the worker even on database failure. Reconcile only expired matching attempts on existing processor polls; do not broadly reset legacy or arbitrary jobs. Reject oversized compressed/inflated inputs and clean temporary files. This avoids full inflated-dataset copies while preserving existing food conversion and partial-batch failure semantics. All API responses are no-store; enforce MIME/frame/referrer headers, retain same-origin Next export frames and stage CSP report-only. Do not enable HSTS without an intentional HTTPS deployment contract.

## Consequences

Limits can reject future larger legitimate datasets/backups; revise the reviewed policy instead of silently truncating. Saturation returns retryable 429/503. Limits are per process, not a distributed quota or total-heap guarantee. Shared proxy peers conservatively share socket-peer buckets unless an explicit trusted identity contract is configured. Report-only CSP is rollout evidence, not an enforced injection fix. Running-deployment/TLS/browser compatibility remains a separate gate.

---

# ADR: Generic Registration Conflict With Explicit Existence Disclosure

## Status

Accepted for this security candidate after the owner delegated the response-policy choice.

## Decision and Rationale

Keep successful registration at HTTP 201 and duplicate-account registration at HTTP 409 with the same generic `unable to register account` message and no SQL, address or internal diagnostic details. Login uses uniform invalid-credential responses and dummy password verification for unknown accounts; auth/account throttling remains required.

The registration status difference still reveals whether an address is available. Do not describe this as complete enumeration resistance. Making successful and duplicate registration indistinguishable would require a broader verified-account/admission workflow rather than fake success followed by an observable authentication failure. No email service or speculative verification infrastructure is added here. Operators with sensitive membership should disable public registration.

## Consequences

Protect the generic error body with a focused HTTP assertion and retain the disclosed residual in the release review. This is an explicit product/privacy tradeoff, not a claim that throttling eliminates enumeration.

---

# ADR: Owner-scoped Sync API Keys Separate from Sessions

## Status

Owner approved; candidate implementation, not released. See [spec and evidence](specs/scoped-personal-sync-api-keys.md).

## Decision and consequences

Use expiring, explicitly granted credentials in a new digest-only PostgreSQL relation, not legacy key rows or a shortcut around DB-backed sessions. The personal-key route allowlist denies access by default; its owner identity never confers admin authority, including in SQL predicates. Offer full personal workflow access (including sharing and record-level deletes) or narrower grants in web; keep destructive account actions and credential management web-session-only. Preserve browser/session behavior and the private Go/database boundary behind trusted HTTPS ingress. Account and content resets retain existing revocation intent. The release gate includes isolated HTTPS transport and session compatibility; deployment and publication are separate decisions.

---

# Future Decision Guidelines

Before creating a new architectural decision:

## Ownership

- Who owns the data?
- Is ownership singular?

## Complexity

- What complexity is being introduced?
- Is it justified?

## Existing Systems

- Can PostgreSQL solve this?
- Can the Go API solve this?
- Can existing code solve this?

## Product Alignment

- Does this improve nutrition workflows?
- Does this improve user outcomes?

## Maintenance

- Does this increase maintenance burden?
- Is the tradeoff worthwhile?

Document significant decisions before implementation whenever practical.