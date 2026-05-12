# Implementation Plan: Multi-Page Application Conversion

## Overview

Convert NutriLabel from a single-page recipe editor with external links into a multi-page application with a shared navigation shell, welcome/dashboard page, breadcrumbs, and restructured navigation. Expand build targets to include macOS and self-hosted web server. Lay groundwork for future features: Grocery List, Kitchen Helper, Meal Plans, Recipe Synergies, Barcode Scanner, Sync, and Self-Hosted Sync Server.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Shared navigation** | Next.js route group `(app)` + nested layout | Layout persists across route changes (no re-render flash). Route groups don't affect URLs. |
| **Welcome page** | Rich dashboard at `/` with tiles + stats | Acts as the app hub with quick-access tiles and at-a-glance stats. |
| **Recipe editor URL** | `/recipes` (moved from `/`) | Clean separation from the welcome page. |
| **Food DB & Categories** | Moved into Settings dialog | Declutters nav. Categories also accessible from within a recipe (existing behavior). |
| **Primary nav** | Recipes, Books, Meal Plans | Three main sections in the shared header. |
| **Breadcrumbs** | On all sub-pages (book detail, book edit, etc.) | Contextual navigation below the shared header. |
| **Sub-page headers** | Keep nav visible + breadcrumbs | Nav always visible; sub-pages show breadcrumb trail. |
| **Build targets** | Windows, Linux, macOS, Android, iOS, Self-hosted web | macOS via Tauri (cross-compile), self-hosted via `server.js` + Docker/Caddy. |

## Target Route Structure

```
src/app/
  layout.tsx                        # Root layout (fonts, toaster) - unchanged
  page.tsx                          # NEW: Welcome/Dashboard page
  globals.css                       # unchanged
  (app)/
    layout.tsx                      # NEW: Shared nav + breadcrumbs
    recipes/
      page.tsx                      # MOVED from src/app/page.tsx
    books/
      page.tsx                      # MOVED
      [id]/
        page.tsx                    # MOVED
        edit/
          page.tsx                  # MOVED
    meal-plans/
      page.tsx                      # NEW: Placeholder
  api/
    ...                             # unchanged

  (removed routes):
    food-database/page.tsx          # Removed - merged into Settings
    categories/page.tsx             # Removed - accessible via Settings or recipe
```

## Task List

### Phase 1: Shared Navigation Component

- [x] **Task 1: Create `AppNav` shared navigation component**
  - Create `src/components/app-nav.tsx` — a client component that renders the full header: logo, primary nav links (Recipes, Books, Meal Plans), status badges (Local Storage, API Key), and action buttons (Barcode Scanner, Sync, Settings). The Settings button opens an expanded Settings dialog (see Task 2). Uses `usePathname()` to highlight the active section.
  - Acceptance:
    - [x] Component at `src/components/app-nav.tsx`
    - [x] Primary nav: Recipes (`/recipes`), Books (`/books`), Meal Plans (`/meal-plans`)
    - [x] Active section highlighted based on `usePathname()`
    - [x] Status badges: Local Storage, API Key
    - [x] Placeholder Barcode Scanner button (disabled, `ScanBarcode` icon, tooltip)
    - [x] Placeholder Sync button (disabled, `RefreshCw` icon, tooltip)
    - [x] Settings button opens expanded Settings dialog
  - Verify:
    - [x] Component renders without errors
    - [x] All nav links point to correct routes
  - Dependencies: None
  - Files: `src/components/app-nav.tsx` (new)
  - Scope: M (3-5 files)

- [x] **Task 2: Expand Settings dialog with Food DB and Categories**
  - The existing Settings dialog gains two new sections/tabs: "Food Database" (link to or embed the Food DB management) and "Categories" (link to or embed category tree management). The Food DB page (`/food-database`) and Categories page (`/categories`) are removed as standalone routes. Instead, their content is accessible from within Settings. Initially, these can be links that open a full-screen dialog or a separate Settings page route (`/settings`), whichever is cleaner.
  - Acceptance:
    - [x] Settings dialog has sections: API Key, Local Storage, Food Database, Categories, About
    - [x] Food Database accessible from Settings (either inline or via navigation)
    - [x] Categories accessible from Settings (either inline or via navigation)
    - [x] Categories also accessible from within a recipe (existing category assignment popover stays)
    - [x] Old `/food-database` and `/categories` routes removed
  - Verify:
    - [x] Food DB management works from Settings
    - [x] Category management works from Settings
    - [x] Old routes return 404
  - Dependencies: Task 1
  - Files: `src/components/app-nav.tsx`, delete `src/app/food-database/`, delete `src/app/categories/`
  - Scope: M (3-5 files)

- [x] **Task 3: Create breadcrumbs component**
  - Create `src/components/breadcrumbs.tsx` — a client component that reads `usePathname()` and renders a breadcrumb trail. Maps paths to labels (e.g., `/books` -> "Books", `/books/123` -> "Books > Book Title", `/books/123/edit` -> "Books > Book Title > Edit"). Supports dynamic segments via a context/prop for page-specific labels.
  - Acceptance:
    - [x] Component at `src/components/breadcrumbs.tsx`
    - [x] Renders breadcrumb trail for all `(app)` routes
    - [x] Each crumb is a clickable link (except the current page)
    - [x] Supports dynamic labels via props for book titles, recipe names, etc.
    - [x] Uses `ChevronRight` separator, consistent with emerald/stone theme
  - Verify:
    - [x] Breadcrumbs render correctly on all routes
    - [x] Dynamic labels update when navigating between books
  - Dependencies: None
  - Files: `src/components/breadcrumbs.tsx` (new)
  - Scope: S (1-2 files)

### Phase 2: Route Restructuring

- [x] **Task 4: Create `(app)` route group with shared layout**
  - Create `src/app/(app)/layout.tsx` that renders `<AppNav />` + `<Breadcrumbs />` + `{children}`. This layout wraps all section pages.
  - Acceptance:
    - [x] Layout file exists at `src/app/(app)/layout.tsx`
    - [x] Renders shared nav and breadcrumbs above page content
  - Verify:
    - [x] Layout renders without errors
  - Dependencies: Tasks 1, 3
  - Files: `src/app/(app)/layout.tsx` (new)
  - Scope: XS (1 file)

- [x] **Task 5: Move recipe editor to `/recipes`**
  - Move `src/app/page.tsx` to `src/app/(app)/recipes/page.tsx`. Remove the inline header (lines 541-627) since the shared layout handles it. Move Settings dialog state/logic to `AppNav`. Preserve all recipe editor functionality.
  - Acceptance:
    - [x] Recipe editor loads at `/recipes`
    - [x] Inline header removed from recipe page
    - [x] Settings dialog works from shared nav
    - [x] All recipe functionality preserved (ingredients, DnD, nutrition label, etc.)
  - Verify:
    - [x] Navigate to `/recipes`, full recipe editor works
    - [x] Settings dialog opens from shared nav
  - Dependencies: Task 4
  - Files: `src/app/(app)/recipes/page.tsx` (moved + trimmed)
  - Scope: M (removing ~90 lines of header, updating state references)

- [x] **Task 6: Move Books pages into route group**
  - Move all book pages into `src/app/(app)/books/`. Remove their standalone headers. Update back buttons to use breadcrumb navigation or link to `/books`.
  - Acceptance:
    - [x] All book routes work: `/books`, `/books/[id]`, `/books/[id]/edit`
    - [x] Back buttons navigate correctly
    - [x] All book functionality preserved (DnD, chapters, pages, markdown)
  - Verify:
    - [x] Navigate books -> book detail -> book edit and back
    - [x] All features work
  - Dependencies: Task 4
  - Files: `src/app/(app)/books/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx` (moved)
  - Scope: S (move + minor header updates)

### Checkpoint: Route Restructuring
- [x] `npm run build` succeeds
- [x] All existing pages load at correct URLs
- [x] Shared navigation renders with active highlighting
- [x] Breadcrumbs show on all pages
- [x] Settings dialog includes Food DB and Categories
- [x] No broken links

### Phase 3: Welcome Page & Stats Dashboard

- [x] **Task 7: Create Welcome/Dashboard page at `/`**
  - Create a new `src/app/page.tsx` as a client component. This page sits outside `(app)` so it does NOT render the shared nav. Instead it has its own minimal header with just the logo and a "Go to App" button that links to `/recipes`. The page has two sections:

  **Section 1 — Quick Access Tiles (2x2 grid):**
  1. Recipes (active, links to `/recipes`) — with recipe count
  2. Current Grocery List (disabled, "Coming Soon")
  3. Kitchen Helper (disabled, "Coming Soon")
  4. Books (active, links to `/books`) — with book count

  **Section 2 — Stats Dashboard:**
  - Number of recipes
  - Number of meal plans (placeholder: "0 — Coming Soon")
  - Number of recipe synergies (placeholder: "0 — Coming Soon")
  - Average recipe length (ingredients count)
  - Latest recipes ticker (scrollable list of last 5-10 recipes added, with dates)
  - Today's meal plan preview (if exists, show with completed items greyed out; if not, show tomorrow's plan; if neither, show "No meal plan — Coming Soon")
  - Acceptance:
    - [x] Welcome page loads at `/`
    - [x] 4 tiles in 2x2 grid: Recipes, Grocery List, Kitchen Helper, Books
    - [x] Recipes and Books tiles are clickable, link to their sections
    - [x] Grocery List and Kitchen Helper tiles are disabled with "Coming Soon"
    - [x] Stats section shows recipe count, avg recipe length, latest recipes
    - [x] Meal plan, synergies stats show as placeholders
    - [x] Meal plan preview shows placeholder
    - [x] Responsive layout
    - [x] Reads data from Zustand stores/IndexedDB
  - Verify:
    - [x] Navigate to `/`, see tiles and stats
    - [x] Click Recipes tile -> `/recipes`
    - [x] Click Books tile -> `/books`
    - [x] Stats reflect actual recipe data
  - Dependencies: Tasks 5, 6
  - Files: `src/app/page.tsx` (replaced with welcome page)
  - Scope: L (break into sub-tasks if needed)

  **Sub-task 7a: Welcome page tiles section**
  - Create the 4-tile grid with links and disabled states
  - Scope: S

  **Sub-task 7b: Welcome page stats section**
  - Create stats cards and latest recipes ticker
  - Scope: M

  **Sub-task 7c: Welcome page meal plan preview**
  - Create the meal plan preview placeholder
  - Scope: S

### Phase 4: Meal Plans Placeholder

- [x] **Task 8: Create Meal Plans placeholder page**
  - Create `src/app/(app)/meal-plans/page.tsx` with a "Coming Soon" placeholder. Brief description of what's planned. Shared nav highlights "Meal Plans."
  - Acceptance:
    - [x] Loads at `/meal-plans`
    - [x] Placeholder content with description
    - [x] Shared nav renders, "Meal Plans" highlighted
  - Verify:
    - [x] Navigate to `/meal-plans`, see placeholder
  - Dependencies: Task 4
  - Files: `src/app/(app)/meal-plans/page.tsx` (new)
  - Scope: XS (1 file, ~30-50 lines)

### Checkpoint: Welcome Page & Meal Plans
- [x] Welcome page at `/` with tiles and stats
- [x] All tile links navigate correctly
- [x] Meal Plans placeholder accessible
- [x] Full flow: Welcome -> Recipes -> create recipe -> back -> Books works
- [x] Breadcrumbs work end-to-end

### Phase 5: Header Buttons & Polish

- [x] **Task 9: Add Sync button to shared navigation**
  - Add a `RefreshCw` icon ghost button in the shared nav, positioned between status badges and Settings button. Disabled with tooltip "Synchronize."
  - Acceptance:
    - [x] Button visible in correct position
    - [x] Tooltip/aria-label present
    - [x] Disabled state (no action)
  - Verify:
    - [x] Button renders, hover shows label, click does nothing
  - Dependencies: Task 1
  - Files: `src/components/app-nav.tsx`
  - Scope: XS (1 file)

- [x] **Task 10: Add Barcode Scanner button to shared navigation**
  - Add a `ScanBarcode` icon ghost button next to Sync button. Disabled with tooltip "Barcode Scanner."
  - Acceptance:
    - [x] Button visible next to Sync button
    - [x] Tooltip/aria-label present
    - [x] Disabled state (no action)
  - Verify:
    - [x] Button renders, hover shows label, click does nothing
  - Dependencies: Task 1
  - Files: `src/components/app-nav.tsx`
  - Scope: XS (1 file)

- [x] **Task 11: Update all internal cross-page links**
  - Search codebase for any links referencing old routes (`/` as recipe page, `/food-database`, `/categories`). Update all to point to new routes. Back buttons updated to `/recipes` or `/` (welcome) as appropriate.
  - Acceptance:
    - [x] No links point to removed routes (`/food-database`, `/categories`)
    - [x] "Back to recipes" links point to `/recipes`
    - [x] Home/logo links point to `/` (welcome page)
  - Verify:
    - [x] Click every navigation link and back button — all go to the right place
  - Dependencies: Tasks 5-8
  - Files: Multiple page files (1-line link updates)
  - Scope: S (scatter of 1-line changes across 4-5 files)

### Phase 6: Build Target Expansion

- [x] **Task 12: Add macOS Tauri build configuration**
  - Update `src-tauri/tauri.conf.json` bundle targets to include macOS (`dmg`, `app`). Add macOS-specific build step to `build-all.bat` and create a `build-all.sh` for Linux/macOS hosts that can natively build macOS targets. Add `builds/macos` output directory.
  - Acceptance:
    - [x] `tauri.conf.json` includes macOS bundle targets
    - [x] `build-all.bat` has macOS build step (with cross-compile note like Linux)
    - [x] `build-all.sh` created for Unix hosts with native macOS build
    - [x] Output directory `builds/macos` configured
  - Verify:
    - [x] Build scripts reference macOS targets
    - [x] `tauri.conf.json` valid JSON
  - Dependencies: None (independent of route changes)
  - Files: `src-tauri/tauri.conf.json`, `build-all.bat`, `build-all.sh` (new)
  - Scope: S (1-2 files)

- [x] **Task 13: Add self-hosted web server build target**
  - Create a Dockerfile and docker-compose.yml for self-hosted deployment. Update `server.js` to support configurable bind address (`0.0.0.0` for Docker). Add build scripts for producing a deployable server bundle. Update `build-all.bat` with a "server" build step that produces a standalone deployable directory.
  - Acceptance:
    - [x] `Dockerfile` exists, builds and runs the Next.js standalone server
    - [x] `docker-compose.yml` exists for easy deployment
    - [x] `server.js` binds to `0.0.0.0` when `DOCKER` env var is set
    - [x] `build-all.bat` has a server build step producing `builds/server/`
    - [x] Caddyfile updated or documented for reverse proxy setup
  - Verify:
    - [x] Dockerfile and docker-compose.yml are syntactically valid
    - [x] Server build step present in both build scripts
  - Dependencies: None (independent of route changes)
  - Files: `Dockerfile` (new), `docker-compose.yml` (new), `server.js`, `build-all.bat`, `Caddyfile`
  - Scope: M (3-5 files)

### Checkpoint: Complete
- [x] `npm run build` succeeds
- [x] All routes correct: `/` (welcome), `/recipes`, `/books`, `/meal-plans`
- [x] `/food-database` and `/categories` removed (in Settings)
- [x] Shared nav on all section pages with active highlighting
- [x] Breadcrumbs on all sub-pages
- [x] Sync + Barcode buttons visible (disabled)
- [x] Welcome page tiles and stats working
- [x] Build targets: Windows, Linux, macOS, Android, iOS, Server
- [x] No broken links or 404s

## Future Features (Not Implemented Now, Referenced in Placeholders)

| Feature | Where Referenced | Status |
|---|---|---|
| **Meal Plans** | `/meal-plans` placeholder, welcome stats, welcome meal plan preview | Placeholder — spec TBD |
| **Grocery List** | Welcome page tile (disabled, "Coming Soon") | Placeholder — spec TBD |
| **Kitchen Helper** | Welcome page tile (disabled, "Coming Soon") | Placeholder — spec TBD |
| **Recipe Synergies** | Welcome stats card (shows "0 — Coming Soon") | Placeholder — spec TBD |
| **Barcode Scanner** | Nav button (disabled) | Placeholder — spec TBD |
| **Synchronize** | Nav button (disabled) | Placeholder — spec TBD |
| **Self-Hosted Sync Server** | Referenced in architecture docs | Placeholder — spec TBD |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Moving 1674-line recipe page breaks references | High | Move as single file first, then surgically remove header. Test after each step. |
| Settings dialog state coupled to home page | Medium | Settings state moves to `AppNav` component. Self-contained dialog. |
| Food DB page content doesn't fit in Settings dialog | Medium | Use a full-screen dialog or dedicated `/settings` page route instead of cramming into a small modal. |
| Welcome page stats need IndexedDB reads on mount | Low | Use existing Zustand stores (already hydrated from IndexedDB). Lazy-load stats section. |
| macOS Tauri build requires Apple dev environment | Low | Document requirement. Cross-compile like Linux — note in build script. |
| Docker/Server build needs standalone Next.js output | Low | `next.config.ts` already has commented `output: "standalone"` option. Server build uses it. |
