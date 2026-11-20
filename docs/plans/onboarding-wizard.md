# Onboarding / Setup Wizard — Plan

> Status: All phases complete (1–5). Wizard plan done; stale open items resolved.
> Last updated: 2026-07-06

A first-run experience for DietLedger. On a fresh install, the first user is
guided through becoming the admin, installing USDA data, and seeding a demo
cookbook. Subsequent users get a lightweight profile/preferences wizard.

---

## Confirmed decisions (from review)

1. **Admin is set up first.** The first user becomes admin (existing behavior:
   `store_postgres.go:66-72` sets `isAdmin` when `userCount == 0`). Instance
   setup is the first thing that happens on a fresh install.
2. **Admin can disable new account registration.** A new instance-level
   `registration_enabled` toggle, controlled by the admin. Before the first
   admin exists, only the setup flow can create an account; afterwards,
   registration respects the toggle.
3. **USDA data is admin-only.** The USDA download step lives exclusively in the
   admin instance-setup wizard (and re-runnable from Settings). Per-user
   onboarding never touches USDA.
4. **Demo data = a real cookbook with real recipes.** Not synthetic sample rows.
   A curated book of real recipes, built from real ingredients so nutrition is
   computed by the existing recipe nutrition system (per NUTRITION_DOMAIN.md),
   then bundled and imported through the existing import pipeline.

---

## Two flows

| Flow | Who | When |
|---|---|---|
| **Instance setup wizard** | Admin (first user) | Fresh install, before anything else; re-runnable from Settings |
| **Per-user profile wizard** | Every user (skippable) | First login after auth, if `onboardingComplete !== true` |

---

## Architecture rules followed

- Server-authoritative: completion + registration state live in PostgreSQL via
  the Go API. Browser never authoritative.
- Reuse existing endpoints (USDA seed, import, profile, settings). Minimal new
  backend code.
- React Query fetches instance/registration state; Zustand/component state owns
  transient wizard step state.
- USDA + registration are instance-level (new `instance_meta` table); profiles,
  units, theme, `onboardingComplete` stay per-user (existing settings).

---

## Instance setup wizard — admin, first run

Route: `src/app/setup/page.tsx` — top-level, outside the `(app)` group, so
the wizard renders without app chrome while the instance is unconfigured.
Gating lives in `(app)/layout.tsx` and `src/app/page.tsx`: while
`!instance.onboardingComplete`, every visitor is redirected to `/setup`. The
wizard itself renders the admin flow, a "setup in progress" state for
authenticated non-admins, and a sign-in prompt when setup was interrupted
(users already exist but the session is unauthenticated).

### Steps

1. **Welcome** — what will happen; every later step is skippable.
2. **Create admin account** — first user registration (the only registration
   path before setup completes). Becomes admin automatically.
3. **Instance basics** — default units (metric/imperial), theme, default meal
   times (reuses settings mutation).
4. **Registration policy** — "Allow new accounts to register?" toggle. Default
   open; admin can close at any time from Settings.
5. **USDA data (admin-only)** — dataset presets using existing
   `USDA_DATASETS` (`src/lib/usda-datasets.ts`) and the Go catalog:
   - *Quick start* → Foundation (6.5M, ~400 foods)
   - *Recommended* → Foundation + SR Legacy (~8k foods)
   - *Full* → Branded (3.1G, ~1.8M) — size/time warning
   - Optional USDA API key field (replaces `DEMO_KEY`, lifts the 50/day search
     limit)
   - Triggers existing `POST /api/foods/seed`; poll job status; show progress.
6. **Demo cookbook (optional)** — checkbox to install the bundled real-recipe
   book via the existing import endpoint.
7. **Admin profile** — create the admin's first nutrition profile (name, sex,
   birth date, height, activity level — fields `ProfileCard` already consumes
   for BMI/BMR/TDEE).
8. **Done** → `POST /api/instance/onboarding/complete` → redirect to `/`.

---

## Per-user wizard — subsequent logins (skippable)

Shown when `settings.onboardingComplete !== true`:

- Create a nutrition profile
- Pick units + theme
- (Skip) sets `onboardingComplete`

Never includes USDA or registration controls.

---

## Backend changes (Go API)

### New persistence

- `instance_meta` single-row table: `onboarding_completed_at`,
  `onboarding_version`, `registration_enabled` (default `true`).
- Migration added under `sync-server/migrations/`.
- Add `onboardingComplete` to the existing per-user settings store.

### New / changed endpoints

- `GET /api/instance/state` — returns `{ onboardingComplete, registrationEnabled }`.
  Needed by the layout to gate routing before user context.
- `POST /api/instance/onboarding/complete` — admin-only; stamps
  `onboarding_completed_at`.
- `PATCH /api/instance/registration` — admin-only; sets `registration_enabled`.
- **Registration guard in `auth.go` register handler:** allow account creation
  only when `userCount == 0` (first admin setup) **OR** `registration_enabled`.
  Otherwise `403 Registration is disabled`.
- **No new seed/import code.** USDA uses existing `/api/foods/seed`; demo data
  uses the existing import endpoint with the bundled file.
- `POST /api/instance/demo` (admin-only, optional convenience) — imports the
  bundled demo cookbook server-side. Otherwise the client posts the bundled
  JSON to the existing import endpoint.

### Admin Settings UI additions

- Toggle "Allow new account registration" (writes
  `PATCH /api/instance/registration`).
- User count display (optional: list/disable individual accounts — out of scope
  for v1; "disable new accounts" = registration toggle).
- "Re-run setup" entry (e.g. to re-download USDA or re-seed demo data).

---

## Demo cookbook (real recipes)

Separate content sub-task from the wizard plumbing:

- Curate a real cookbook (e.g. a themed mini-book of ~8–12 real recipes).
- Build each recipe from real ingredients mapped to foods so nutrition is
  **derived** by the existing recipe nutrition calculator — never hand-entered.
  This keeps the demo nutritionally consistent with the rest of the product
  (NUTRITION_DOMAIN.md compliance, high-risk domain).
- Bundle as import-compatible JSON under the repo (e.g.
  `sync-server/demo/demo-cookbook.json` or `public/demo/`).
- Imported under the admin user on opt-in during setup.
- Must not pollute food-stats or appear as system data — clearly owned by the
  admin, deletable like any user data.

---

## Frontend changes

- `src/app/setup/page.tsx` (top-level route) — multi-step wizard (existing
  `Card`, `Button`, `Checkbox` primitives). The per-user wizard lives the
  same way at `src/app/welcome/page.tsx`.
- Gate logic in `src/app/(app)/layout.tsx` and `src/app/page.tsx`:
  - `!instance.onboardingComplete` → `/setup` (any visitor)
  - unauthenticated visit to a non-public route → `/login`
  - authed non-admin, `!settings.onboardingComplete` → `/welcome`
    (per-user wizard)
- New `useInstance()` React Query hook for `GET /api/instance/state`.
- Poll USDA seed job progress via React Query (job endpoints already exist).
- Settings page: registration toggle + re-run setup entry.

---

## Phased delivery

### Phase 1 — Instance setup core (admin) — DONE
- `instance_meta` table + migration (`000020_instance_meta`)
- `GET /api/instance/state`, `POST .../onboarding/complete`,
  `PATCH/PUT /api/instance/registration` (admin-only mutations)
- Registration guard in `auth.go` (first user always allowed; afterwards
  respects `registration_enabled`)
- `/setup` route with steps: welcome → admin account → basics →
  registration policy → **usda** → admin profile → done
- Layout gating in `(app)/layout.tsx` + `app/page.tsx`

### Phase 2 — USDA integration (admin) — DONE
- USDA step wired to existing `/api/foods/seed` (presets: Foundation /
  Foundation+SR Legacy / Branded / Skip). Multi-dataset presets enqueue one
  job per dataset; the background seeder (`seed.go`) processes them.
- Job progress polling UI (inline, non-blocking; wizard never waits on the
  long download — `POST /api/foods/seed` only queues).
- **USDA API key capture: deferred.** The USDA API key is a per-user secret
  used only for live search fallback (`usda_live.go`), not bulk seeding
  (which uses public dataset URLs). It does not belong in the instance
  setup wizard; it remains configurable per-user where live search lives.
- Re-run setup entry in Settings: tracked under Phase 5. The existing
  `FoodDatabasePanel` already lets admins re-seed USDA data at any time.

### Phase 3 — Demo cookbook — wizard step DONE; Settings re-run = Phase 5
> Detailed plan, content API reference, and seed-file format: [`demo-cookbook.md`](./demo-cookbook.md)

- Curate + build real recipes — DONE (`scripts/convert-seed-recipes.js`;
  408 recipes bundled at `public/demo/demo-cookbook.zip`). Nutrition is
  best-effort via USDA auto-match (env-gated; zero until matched).
- Bundle JSON — DONE (reuses the repaired importer in `src/lib/export-import.ts`;
  `importData` now takes an `onProgress` callback).
- Demo install step in the wizard — DONE (`demo` step between `usda` and
  `profile`; fetches `/demo/demo-cookbook.zip` → `importFromZip`, opt-in with
  progress; completes before advancing).
- Re-run from Settings — tracked under Phase 5.

### Phase 4 — Per-user wizard — DONE
- `onboardingComplete` per-user flag stored in per-user settings (generic
  JSON map; no schema change).
- `UpsertSettings` now **merges** instead of replacing (prevents partial
  updates — e.g. changing a meal time — from dropping `onboardingComplete`).
- `useAppSettings` exposes `onboardingComplete` + accepts `{ enabled }`.
- `/welcome` route + `UserWizard` (welcome → optional profile → units/theme
  → finish). Skip completes immediately. Gated in `(app)/layout.tsx` and
  `app/page.tsx`: authed + instance ready + `!onboardingComplete` → `/welcome`.
- Admin finishing instance setup also stamps their `onboardingComplete`, so
  they aren't sent to `/welcome` next.

### Phase 5 — Admin controls polish — DONE
- Registration toggle in Settings (admin-only card; `Switch` bound to
  `instance.registrationEnabled`, writes via `useSetRegistrationEnabled`).
- Demo cookbook re-seed in Settings (admin-only; confirm dialog → fetch
  `/demo/demo-cookbook.zip` → `importFromZip`, invalidates books/recipes).
- "Re-run setup" intent is covered in place: USDA re-download via the existing
  `FoodDatabasePanel`, demo re-seed via the new card — no forced wizard mode.
- User count / account management: deferred (marked optional/beyond v1).

---

## Risks / validation

- **USDA import is long-running** (Branded = 3.1G). Must stay async with job
  polling (already supported) and not block the wizard UI. Confirm resumability.
- **Nutrition profiles feed BMI/BMR/TDEE** — treat as nutrition-domain code;
  validate against NUTRITION_DOMAIN.md (high-risk per AGENTS.md).
- **Demo cookbook nutrition** must be derived, not hand-entered, to stay
  consistent with the calculator.
- **Registration race:** a second visitor registering before admin finishes
  setup must be blocked — covered by the `userCount == 0` exception.
- **Instance-meta single-row invariant** — enforce one row (DB constraint or
  upsert).

---

## Resolved open items

- **Registration default:** `registration_enabled` defaults to `true` in
  migration `000020_instance_meta`, and admins may close registration from
  Settings (`useSetRegistrationEnabled`). This matches
  `../final_docs/system_requirements.md`, which requires registration support and
  admin disablement.
- **Demo cookbook selection:** the bundled demo content is the curated
  import-compatible cookbook at `public/demo/demo-cookbook.zip`, generated from
  `seed-recipes/` by `scripts/convert-seed-recipes.js` as documented in
  `demo-cookbook.md`. It is admin-owned user data and re-seedable from
  Settings; re-seeding may create duplicates by design.
- **Non-admin setup gate:** non-admin users are blocked while instance setup is
  incomplete. The setup wizard shows "Setup in progress" to authenticated
  non-admin users; unauthenticated visitors on a partially configured instance
  are sent to admin sign-in rather than allowed to create another account.
