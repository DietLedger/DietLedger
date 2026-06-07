# DietLedger Test Coverage Exception Register

Status: Phase 1 coverage baseline
Date: 2026-06-07

## Purpose

Documents files and paths that cannot reasonably reach 100% meaningful test coverage, per `system_requirements.md` section 14.

---

## Frontend Exceptions

### shadcn/ui Component Primitives (`src/components/ui/`)

**Files:** All 48 files in `src/components/ui/`
**Reason:** Third-party shadcn/ui primitives (Radix UI wrappers). Tested upstream.
**Alternative verification:** Build passes; visual regression.

### Static Data and Config (`src/data/`)

**Files:** `template-packs.ts`, `glycemic-index.ts`, `medical-meal-templates.ts`, `allergen-keywords.ts`, `seasonal-produce.ts`, `storage-locations.ts`, `pantry-staples.ts`
**Reason:** Static lookup tables and config data with no meaningful branches.
**Alternative verification:** Consumed correctly by dependent modules which are tested.

### TypeScript Type Definitions

**Files:** `src/lib/types.ts`, `src/types/stream-json.d.ts`
**Reason:** Pure type definitions with no runtime behavior.

### React Query Key Factory

**File:** `src/lib/query-keys.ts`
**Reason:** Pure string factory with no meaningful branches.
**Alternative verification:** Covered indirectly by hook tests that use the keys.

### React Query Client Setup

**File:** `src/lib/query-client.ts`
**Reason:** Framework configuration with no meaningful branches.

### Zustand Store Wiring

**Files:** `src/lib/nutrition-selection.ts`, `src/lib/dietary-selection.ts`
**Reason:** Thin Zustand store wrappers (3 lines of logic each).
**Alternative verification:** Covered by component integration tests.

### API Client HTTP Wrappers

**Files:** `src/lib/api-client-go.ts`, `src/lib/api-client.ts` (interface + factory)
**Reason:** Mechanical HTTP fetch wrappers mapping 1:1 to server endpoints. No business logic.
**Alternative verification:** Tested via `api-client.test.ts` for client selection; handler-level tests verify endpoint behavior.

### Framework/Browser Hooks

**Files:** `src/hooks/use-app-theme.ts`, `src/hooks/use-unit-system.ts`, `src/hooks/use-toast.ts`, `src/hooks/use-mobile.ts`
**Reason:** Thin wrappers around localStorage, CSS, and browser APIs. No business logic.

### React Query Hook Wrappers

**Files:** `src/hooks/use-books.ts`, `src/hooks/use-categories.ts`, `src/hooks/use-meal-plans.ts`, `src/hooks/use-nutrition.ts`, `src/hooks/use-dietary.ts`, `src/hooks/use-templates.ts`, `src/hooks/use-settings.ts`, `src/hooks/use-secrets.ts`
**Reason:** Thin React Query CRUD wrappers with no business logic beyond calling the API client.
**Alternative verification:** Store and handler tests cover the underlying data operations.

### Theme Config

**File:** `src/lib/themes.ts`
**Reason:** Static CSS variable maps.

### USDA Dataset Metadata

**File:** `src/lib/usda-datasets.ts`
**Reason:** Static dataset metadata.

### Next.js Middleware

**File:** `src/proxy.ts`
**Reason:** Next.js middleware for API proxying. Already at 84% coverage. Remaining lines are edge-case proxy paths.

### Component Presentation Layer

**Files:** All `src/components/` non-ui files (e.g., `app-nav.tsx`, `category-tree.tsx`, `breadcrumbs.tsx`, etc.)
**Reason:** Presentation components that delegate business logic to tested lib modules. UI rendering is verified manually.
**Alternative verification:** Build passes; manual visual verification.

---

## Backend Exceptions

### Entry Point

**File:** `main.go`
**Reason:** Thin entry point that reads env vars, wires dependencies, and starts server. No business logic.
**Alternative verification:** Integration tests exercise all wired components.

### Type Definitions

**File:** `models.go`
**Reason:** Pure struct definitions and trivial JSON scan methods.
**Alternative verification:** Covered indirectly by handler and store tests.

### Interface Definition

**File:** `repository.go`
**Reason:** Pure Go interface definition with no behavior.

### Route Wiring

**File:** `server.go` (route definitions, `corsMiddleware`, `writeJSON`, `writeError`, `getUserFromContext`)
**Reason:** Structural wiring tested indirectly by handler tests. Helper functions are trivial.

### Test Infrastructure

**File:** `store_test_helper.go`
**Reason:** Test setup code, not production code.

---

## Covered Files (Not Exempt)

These files contain business logic and MUST have test coverage:

### Frontend

| File | Status | Priority |
|------|--------|----------|
| `src/lib/nutrition-calcs.ts` | No tests | P0 |
| `src/lib/dietary-rules.ts` | No tests | P0 |
| `src/lib/recipe-scaling.ts` | No tests | P0 |
| `src/lib/unit-conversion.ts` | No tests | P0 |
| `src/lib/glycemic-load.ts` | No tests | P1 |
| `src/lib/recipe-synergy.ts` | No tests | P1 |
| `src/hooks/use-recipes.ts` (pure functions) | No tests | P1 |
| `src/lib/export-import.ts` | No tests | P2 |
| `src/lib/format.ts` | No tests | P2 |
| `src/lib/nutrient-map.ts` | No tests | P2 |
| `src/lib/fallback-foods.ts` | No tests | P2 |

### Backend

| File | Status | Priority |
|------|--------|----------|
| `validation.go` | No tests | P0 |
| `auth.go` | No tests | P0 |
| `handlers_sharing.go` | No handler tests | P1 |
| `handlers_crud.go` (meal plans, books, chapters, categories, custom foods, grocery, API keys) | Store tests only, no handler tests | P1 |
| `seed.go` | No tests | P2 |
