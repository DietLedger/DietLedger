# Development Plan — Beta Completion & Missing Features

> Status: Draft — awaiting developer approval before implementation begins.
> Last updated: 2026-08-19
> Source of truth for: gap register, sequencing, and acceptance criteria for
> all remaining pre-release work.

This plan consolidates:

1. the feature-gap register produced by the repository audit
   (`docs/feature-completion-worksheet.html`, 26 areas),
2. the cross-cutting requirement that **all user state persists server-side
   in PostgreSQL via the Go API**, and
3. a strategy for **frictionless recipe import with automatic nutrition
   matching**.

Nothing in this plan is implemented yet. Each phase is independently
shippable and must land as its own spec + TDD cycle per AGENTS.md.

---

## Governing rules (apply to every phase)

### R1. Server-authoritative persistence

PostgreSQL is authoritative. The Go API owns business logic and validation.
Consequences for this plan:

- No feature state may live only in `localStorage`, `sessionStorage`, or
  `zustand/persist`. Browser storage may cache server values for paint
  performance (e.g. theme before settings load) but must never be the
  source of truth.
- New persistent state gets a table (or a key in an existing JSON settings
  map, when trivially per-user), Go handlers, and React Query hooks.
- The browser never computes values that the server will later need to
  trust (nutrition, matching decisions, completion state).

### R2. Reuse before building

The repo already has: full-text food search (`food_items.search_vector`),
seed-job infrastructure (`seed.go` + job polling), the import pipeline
(`src/lib/export-import.ts`), `instance_meta` single-row pattern,
registration-toggle admin pattern, and per-user JSON settings. Phases must
reuse these before inventing parallel systems.

### R3. Nutrition domain changes are high-risk

Anything touching nutrient math, matching, or health metrics follows
NUTRITION_DOMAIN.md and lands test-first with known-value fixtures.

---

# Part 1 — Gap Register (documented audit results)

Each row cites the audited area. "Kind" distinguishes missing features
(build) from verification debt (prove) from decisions (decide).

| # | Gap | Area | Kind |
|---|-----|------|------|
| G1 | Account management (list/disable/promote users) | admin-controls | build |
| G2 | Session lifecycle: logout-everywhere / token revocation with stateless JWTs | auth-sessions | decide+build |
| G3 | Auth/API contract drift from backend branch plan | auth-sessions, platform | decide |
| G4 | Server-side validation for nutrition-sensitive inputs | recipe-ingredients, logging | build |
| G5 | Unit conversion constant inconsistencies | recipe-ingredients | build |
| G6 | Vitamin D naming inconsistency (µg vs IU handling) | recipe-ingredients | build |
| G7 | BMI/BMR/TDEE verification against known-value fixtures | health | prove |
| G8 | Grocery category classification beyond fallback | grocery-planning | build |
| G9 | Grocery aggregation/unit-conversion verification vs known recipes | grocery-planning | prove |
| G10 | Pantry staple & leftover exclusion semantics | grocery-planning | decide+prove |
| G11 | Global template read-only refinement unfinished | publishing | decide+build |
| G12 | Sharing rate limits undecided | sharing-community | decide |
| G13 | Kitchen Helper completion state in localStorage (violates R1) | kitchen-helper | build |
| G14 | Meal-plan completion state in localStorage (violates R1) | meal-planning | build |
| G15 | Dietary tag semantics / allergen threshold precedence undocumented; allergen false-positive validation | dietary-compliance | decide+prove |
| G16 | Seasonal data coverage unvalidated by region/month; synergy quality criteria undefined | seasonal-synergies | decide+prove |
| G17 | Import/export round-trip verification for every content type | data-portability | prove |
| G18 | API-key/secret permission matrix untested | developer-api-secrets | prove |
| G19 | Destructive admin flow testing (disposable env only) | admin-controls | prove |
| G20 | Accessibility & responsive manual passes | navigation-shell | prove |
| G21 | Recipe import is build-time script only; no user-facing frictionless import with auto nutrition matching | recipes-core | build (Part 3) |
| G22 | Fresh-setup / factory-reset deployed smoke pass | setup-onboarding, platform | prove |

Manual passes G17–G20, G22 execute against the deployed remote host using
`docs/manual-test-worksheet.html`; findings feed back into build phases.

---

# Part 2 — Persistence Completion (R1 enforcement)

## Phase P1 — Move wizard-state-class client state to the server

**User value:** guided cooking progress and meal-plan "made it" markers
survive device switches, logouts, and browser clears.

### Scope

| State | Today | Target |
|---|---|---|
| Kitchen Helper step completion (`kitchen-helper/page.tsx:34`) | localStorage map | `kitchen_helper_state` per user+recipe (JSONB: step indexes, started/completed timestamps) |
| Meal plan entry completion (`meal-plans/[weekStart]/page.tsx:43`) | localStorage map | column/JSONB on meal plan entries: `completed_at TIMESTAMPTZ` |

### Backend
- Migration: `meal_plan_entries.completed_at`; new `kitchen_helper_state`
  table (`user_id`, `recipe_id`, `state JSONB`, unique key).
- Handlers: `PUT /api/kitchen-helper/state/:recipeId`,
  `GET /api/kitchen-helper/state/:recipeId`; entry completion via existing
  meal-plan entry mutation.
- Optimistic UI (React Query) is allowed; server confirms.

### Frontend
- Replace localStorage reads/writes with hooks; no other UX change.

### Out of scope
- History/analytics of completions (add later only if wanted).

### Acceptance
- Completion survives logout/login and a different browser.
- localStorage keys removed; grep-verify no stray reads.
- Focused Go + component tests.

## Phase P2 — localStorage audit & policy

- Enumerate every remaining `localStorage` use (`use-settings.ts`,
  `unit-conversion.ts`, `use-auth.tsx`, `fda-client.ts`,
  `food-database-panel.tsx`, `use-app-theme.ts`).
- Classify each: token storage (acceptable, auth infra), read-through cache
  of server state (acceptable with server as truth), or feature state
  (must move; none expected after P1).
- Record the classification table in ARCHITECTURE.md so the rule is
  checkable in review.

---

# Part 3 — Recipe Import & Automatic Nutrition Matching

**Goal:** importing a recipe is nearly frictionless, and ingredients arrive
already linked to real food rows so nutrition is derived, not hand-entered.

## Current state

- The only nutrition-aware ingestion is a **build-time** script
  (`scripts/convert-seed-recipes.js`) used for the demo cookbook: it parses
  markdown, then heuristically matches each ingredient against USDA search
  (token overlap with progressive qualifier dropping), env-gated, writing
  `fdcId` into the bundle. Unmatched ingredients get `fdcId: -2` (zero
  nutrition).
- The user-facing importer (`src/lib/export-import.ts`) is client-side and
  trusts whatever food links the bundle carries.
- The server already exposes ranked full-text search over `food_items`
  (`search_vector @@ plainto_tsquery`, `ts_rank` ordering).

## Strategy: server-side matching pipeline, review-gated import

Move the matcher from the demo script into the Go API as the single
matching engine for **all** ingestion paths (user imports, demo re-seed,
future integrations). Browser never decides matches.

### Import flow (target UX)

```text
Paste URL / paste text / upload JSON·zip·md
        ↓  POST /api/import/analyze   (parse + match, dry-run)
Parsed recipe preview:
  title, servings, steps, ingredients with match chips:
    ✔ high-confidence  ~ review needed  ✖ unmatched
        ↓  user resolves review chips (accept suggestion / pick alternative /
           create custom food) — or skips review entirely for ≥high matches
        ↓  POST /api/import/commit     (persist recipes + links)
Recipes land fully linked; nutrition derived by existing calculator.
```

One click from paste → linked recipe when confidence is high; review step
appears only when needed.

### Backend design

1. **Parse** (`POST /api/import/analyze`):
   - Accepts JSON (existing export shape), markdown, or plain ingredient
     text. URL fetching is **phase 2** (see "Staged delivery") — start with
     paste/upload, which needs no scraping infra.
   - Reuses the demo script's section/frontmatter parsing, ported to Go.
2. **Match** (the core engine, new `match.go`):
   - For each ingredient line: normalize (lowercase, strip qualifiers,
     unit extraction via existing unit-conversion tables), then query
     `food_items` full-text search with progressively relaxed terms
     (same ladder as the demo script: full text → drop leading words →
     last word).
   - Score = token overlap + ts_rank + data-type preference
     (Foundation > SR Legacy > Branded for generic ingredients; Branded
     preferred when a brand token is present).
   - Emit per-ingredient: `{suggestion, fdcId, confidence: high|review|none,
     alternatives[]}`.
   - Matching runs against the local `food_items` table only — no network
     calls, deterministic, testable with fixtures.
3. **Commit** (`POST /api/import/commit`):
   - Persists recipes + ingredient food links server-side (moves the
     client `export-import.ts` write path into the API; the client keeps
     the orchestration/progress UI).
   - Stores `matched_original_text` and `match_confidence` per ingredient
     for later auditing and re-match tooling.
   - Runs inside a transaction with id remapping (port of the repaired
     importer's graph logic).
4. **Custom food creation inline:** unmatched ingredients can be promoted
   to custom foods during review (reuses existing custom-food endpoints'
   validation).

### Matching quality investment (shared with G4–G6)

- Unit-gram normalization lives in one server module; both matching and
  grocery aggregation (Phase F) consume it.
- Fixture suite: ~30 real ingredient lines with expected fdcIds +
  expected grams (e.g. "2 tbsp butter" → 28.4 g). Regression-gates every
  matcher change.

### Staged delivery

| Stage | Delivers |
|---|---|
| 3a | Go matching engine + fixture suite + `POST /api/import/analyze` (JSON/md input, dry-run) |
| 3b | `POST /api/import/commit` transactional persist; recipe import UI rewired to server pipeline; demo re-seed rerouted through it |
| 3c | Review UI: match chips, alternative picker, inline custom-food creation |
| 3d | URL import (server-side fetch + parse, size/time limits, opt-in setting) |

Stage 3d is deliberately last: scraping is the highest-maintenance path
and paste/upload delivers most of the value first.

### Acceptance

- Importing the demo cookbook through the user pipeline yields identical
  links to the build script for ≥95% of ingredients (measured on the
  fixture corpus).
- A pasted plain-text recipe with common ingredients requires ≤1 review
  interaction to reach fully-linked state.
- Zero browser-side match decisions; all links traceable to stored
  confidence values.

---

# Part 4 — Missing Feature Build-Out

## Phase A — Accounts & session management (G1, G2, G3)

- Decide session model for beta (document in DECISIONS.md):
  - Option 1: short access-token TTL + refresh-token rotation with a
    `revoked_tokens`/`sessions` table → logout-everywhere, device list.
  - Option 2: accept stateless beta limitation, document explicitly.
- Admin accounts page: list users (email, display name, created, last
  seen), disable/enable login, promote/demote admin (guard: cannot disable
  self or the last admin — server-enforced).
- Backend: `GET /api/admin/users`, `PATCH /api/admin/users/:id` (admin
  only); registration guard extended to reject disabled accounts at login.
- Reconcile auth route contract with `plans/die-10-backend-branch-plan.md`
  drift notes; update API docs.

## Phase B — Nutrition correctness hardening (G4–G7)

- Single source of unit-conversion constants server-side; frontend
  consumes or mirrors with shared fixture tests (G5).
- Vitamin D naming/units unified across schema, API, UI, and PDF export
  (G6); migration if stored values need conversion.
- Server-side validation (G4): reject non-numeric/negative nutrient
  values, impossible serving counts, nonsensical amounts at the API
  boundary for recipes, custom foods, logs, and profile metrics.
- BMI/BMR/TDEE known-value fixture suite in Go (G7) — pure functions,
  documented against NUTRITION_DOMAIN.md formulas.

## Phase C — Dietary compliance depth (G15)

- Write the semantics spec first: tag definitions, allergen detection
  rules, threshold precedence, exclude-vs-warn levels → NUTRITION_DOMAIN.md.
- Fixture suite of realistic foods proving no known false
  positives/negatives for the "big 9" allergens.
- Only then any behavior changes.

## Phase D — Grocery planning depth (G8–G10)

- Decide + document staple/leftover exclusion rules (G10).
- Server-side grocery generation verification against hand-computed
  fixture lists (G9), consuming the shared unit module from Phase B.
- Category classification (G8): keyword → category map table in
  PostgreSQL (admin-editable later), seeded generously; unmatched items
  reviewed via the import-review pattern (Phase 3c chips) at list
  generation time rather than silently falling back.

## Phase E — Publishing & sharing hardening (G11, G12)

- Decide global-template behavior (locked system templates vs editable
  copies) — DECISIONS.md entry, then implement.
- Decide share-endpoint rate limits (per-IP token bucket in Go middleware,
  or explicit defer with documented rationale).

## Phase F — Seasonal & synergies quality (G16)

- Validate seasonal coverage table by region/month; surface gaps in an
  admin-visible report rather than silent omissions.
- Define synergy quality criteria + fixture tests before treating
  suggestions as user-facing promises.

## Phase G — Data portability & API-key proof (G17, G18)

- Round-trip verification for every content type (recipes, books, meal
  plans, logs, profiles) as scripted checks, not just manual passes.
- API-key/secret permission matrix as Go integration tests.

---

# Part 5 — Verification Debt Execution (G17–G22)

Sequential manual passes, each producing a findings list that feeds build
phases above:

1. Deployed fresh-setup + factory-reset recovery (G22).
2. Import/export round-trips (G17, after 3b).
3. Destructive admin flows in a disposable environment (G19, after Phase A).
4. Keyboard-only and mobile-width passes over core workflows (G20).
5. PDF/print output across recipes/books/labels (after Phase E).

Worksheet: `docs/manual-test-worksheet.html`. Results recorded next to
each row; nothing is marked done from code inspection alone.

---

# Sequencing & Rationale

```text
P1 → P2                       unblock correctness of "everything persists"
B (nutrition constants)        before 3a — matching needs the unit module
3a → 3b → 3c                   import pipeline (highest user value)
A (accounts/sessions)          independent; parallel track
C, D                           depend on B fixtures; D consumes 3c chips
E, F, G                         independent polish
Part 5 passes                    interleaved after their dependencies ship
```

Priority order when forced: **3a/3b > B > P1 > A > C > D > E/F/G**.
Rationale: import-with-matching is the largest user-facing gap (G21);
nutrition correctness protects the product's core promise; P1 is small and
enforces an architectural invariant; account management matters only when
multi-user instances are real.

---

# Open questions (need decisions before/at spec time)

1. Refresh-token storage model (A) — DB table vs accept beta limitation.
2. Import review UX: modal-in-flow vs dedicated review page (3c).
3. URL import opt-in default and fetch budget (3d).
4. Global templates: lock vs copy-on-edit (E).
5. Rate-limit scope for public share routes (E).
6. Whether meal-plan completion should also timestamp *who* completed
   (family accounts) (P1).
7. Does grocery category map need i18n now or defer (D)?

---

# Documentation duties per phase

| Phase | Updates |
|---|---|
| P1, P2 | ARCHITECTURE.md (persistence policy table) |
| 3a–3d | ARCHITECTURE.md, API docs, plans/demo-cookbook.md (re-route note) |
| A | DECISIONS.md (session model), API docs |
| B, C | NUTRITION_DOMAIN.md |
| D | NUTRITION_DOMAIN.md (exclusion rules), API docs |
| E | DECISIONS.md, PROJECT.md if sharing behavior changes |
| All | TESTING_STRATEGY.md when new fixture suites/policies land |
