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