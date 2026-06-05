# Repository Inventory

**Package name:** `dietledger`
**Version:** `1.0.0-beta.65` (from `package.json:3` and `src-tauri/tauri.conf.json:4`)
**Internal/legacy name:** `NutriLabel` (still referenced in `server.js`, `src-tauri/Cargo.toml`, `server.js` JSDoc comments, `sync-server` binary names)

---

## Top Level Structure

| Directory/File | Purpose |
|---|---|
| `src/` | Next.js web application source (TypeScript, React 19) |
| `src-tauri/` | Tauri v2 desktop application shell (Rust) |
| `sync-server/` | Go API server — server-first backend with auth, CRUD, sharing |
| `prisma/` | Prisma ORM migrations for local-only SQLite mode |
| `public/` | Static web assets (favicon, icons, PWA manifest, service worker, palette swatches) |
| `scripts/` | Build tooling, version syncing, icon generation, Docker prep |
| `deploy/` | Deployment scripts (`deploy.sh`) and systemd unit file (`dietledger.service`) |
| `db/` | Runtime SQLite database (`custom.db`) for local-only mode |
| `docs/` | Design specification documents (AI API keys) |
| `specs/` | Feature specifications |
| `plans/` | Planning documents (`PLAN.md`, `PLAN-server-first.md`) |
| `builds/` | Build output directory — organized by platform target |
| `docker-build/` | Docker build artifacts (ignored in distribution) |
| `builds/` | Build output for all platforms |
| `mini-services/` | Empty directory (placeholder, contains `.gitkeep`) |
| `download/` | Downloaded assets |
| `examples/` | Example data files |
| `final_docs/` | Final documentation output |
| `server.js` | Standalone Node.js production server entry point |
| `middleware.ts` | Next.js middleware — API proxy to Go server |
| `Dockerfile` | Multi-stage Docker build for Next.js web application |
| `docker-compose.yml` | Docker orchestration: postgres + Go API + Next.js web |
| `docker-compose.build.yml` | Docker image build definitions (web + api) |
| `docker-entrypoint.sh` | Docker container startup script |
| `ecosystem.config.cjs` | PM2 process manager config for standalone deployment |
| `capacitor.config.ts` | Capacitor config for Android/iOS mobile builds |
| `components.json` | shadcn/ui component library configuration |
| `tailwind.config.ts` | Tailwind CSS v4 configuration |
| `postcss.config.mjs` | PostCSS configuration for Tailwind |
| `eslint.config.mjs` | ESLint flat config |
| `tsconfig.json` | TypeScript configuration |
| `next.config.ts` | Next.js configuration (static export / standalone toggle) |
| `package.json` | Node.js package manifest and scripts |
| `.env` / `.env.example` | Environment variable configuration |
| `build-all.bat` / `build-all.sh` | Cross-platform build scripts for all targets |
| `dev.bat` | Windows development launcher |

### `src/` Internal Structure

```
src/
  app/                          # Next.js App Router
    (app)/                      # Main application route group (authenticated)
      books/                    # Recipe book management pages
      community/                # Community/shared recipes pages
      kitchen-helper/           # Kitchen helper feature pages
      meal-plans/               # Meal planning pages
      nutrition/                # Nutrition tracking pages
      recipes/                  # Recipe management pages
      settings/                 # Application settings pages
      share/                    # Recipe sharing pages
      layout.tsx                # Main app layout
    (auth)/                     # Authentication route group
      login/                    # Login page
      register/                 # Registration page
      layout.tsx                # Auth layout
    api/                        # Next.js API routes (local-only mode handlers)
      books/
      categories/
      community/
      fda/                      # FDA FoodData Central proxy
      foods/
      nutrition/
      recipes/
      share/
    globals.css                 # Global styles + Tailwind directives
    layout.tsx                  # Root layout
    page.tsx                    # Root page / redirect
  components/                   # React components
    app-nav.tsx                 # Main navigation
    book-renderer.tsx            # Book/chapter rendering
    breadcrumb-context.tsx      # Breadcrumb state management
    breadcrumbs.tsx             # Breadcrumb display
    categories-panel.tsx        # Category management
    category-tree.tsx            # Category tree display
    community/                   # Community feature components
    custom-foods-panel.tsx      # Custom food management
    dietary/                    # Dietary restrictions components
    food-database-panel.tsx      # Food database search/browse
    grocery/                    # Grocery list components
    kitchen-helper/             # Kitchen helper components
    local-mode-banner.tsx       # Local-only mode indicator
    location-panel.tsx           # Storage location management
    markdown-page.tsx            # Markdown content renderer
    meal-plan/                  # Meal planning components
    nutrition-label.tsx         # FDA nutrition label display
    nutrition/                  # Nutrition tracking components
    pantry-staples-panel.tsx     # Pantry staples management
    print/                      # Print layout components
    recipe-renderer.tsx         # Recipe display renderer
    recipe/                     # Recipe editing/management components
    sync-indicator.tsx          # Sync status indicator
    sync/                       # Sync feature components
    template-editor-panel.tsx   # Template editing
    template-preview.tsx        # Template preview
    ui/                         # shadcn/ui primitives (Radix-based)
  data/                         # Static reference data
    allergen-keywords.ts        # Allergen keyword mappings
    glycemic-index.ts           # Glycemic index reference data
    medical-meal-templates.ts   # Medical diet meal templates
    pantry-staples.ts           # Pantry staple food lists
    seasonal-produce.ts         # Seasonal produce availability
    storage-locations.ts        # Food storage location reference
    template-packs.ts           # Meal template packs
  hooks/                        # Custom React hooks
    use-app-theme.ts            # Theme management hook
    use-auth.tsx                 # Authentication hook
    use-mobile.ts               # Mobile detection hook
    use-toast.ts                # Toast notification hook
    use-unit-system.ts          # Unit system (metric/imperial) hook
  lib/                          # Core business logic and state management
    api-client.ts               # Unified API client (server mode)
    api-client-go.ts            # Go API-specific client
    api-client-local.ts         # Local-only API client (Prisma/SQLite)
    app-settings-store.ts        # Zustand store: app settings
    book-store.ts               # Zustand store: recipe books
    dietary-rules.ts             # Dietary restriction rule engine
    dietary-store.ts             # Zustand store: dietary profiles
    export-import.ts             # Data export/import functionality
    fallback-foods.ts            # Food fallback logic
    fda-client.ts               # FDA FoodData Central API client
    format.ts                   # Number/quantity formatting utilities
    glycemic-load.ts             # Glycemic load calculations
    meal-plan-store.ts           # Zustand store: meal plans
    nutrient-map.ts              # Nutrient ID to name/unit mapping
    nutrition-calcs.ts           # Nutrition calculation engine
    nutrition-store.ts           # Zustand store: nutrition tracking
    pdf-export.ts               # PDF generation (jsPDF)
    read-cache.ts               # Read caching layer
    recipe-scaling.ts           # Recipe ingredient scaling
    recipe-store.ts             # Zustand store: recipes
    recipe-synergy.ts            # Recipe synergy/complement analysis
    storage.ts                   # Browser storage abstraction (IndexedDB)
    sync-conflict.ts            # Sync conflict resolution
    sync-engine.ts              # Sync engine (client-side)
    sync-store.ts               # Zustand store: sync state
    template-store.ts           # Zustand store: templates
    themes.ts                   # Theme definitions
    types.ts                    # Shared TypeScript types/interfaces
    unit-conversion.ts          # Unit conversion logic
    usda-datasets.ts             # USDA dataset handling
    utils.ts                    # General utilities (cn helper for clsx+tailwind-merge)
    write-queue.ts              # Write queue for batched IndexedDB writes
  proxy.ts                      # Next.js middleware proxy to Go API server
  types/                        # TypeScript type declarations
    stream-json.d.ts            # Type declarations for stream-json library
```

### `sync-server/` Internal Structure

```
sync-server/
  main.go               # Entry point — HTTP server bootstrap, DB init, signal handling
  server.go             # HTTP router, CORS, auth middleware, request routing
  auth.go               # JWT authentication (register, login, refresh tokens)
  models.go             # Data models / struct definitions
  repository.go         # Store interface definition
  store_postgres.go     # PostgreSQL Store implementation
  store_sqlite.go        # SQLite Store implementation (testing/dev)
  store_sqlite_test.go  # SQLite store tests
  store_test.go         # Store interface tests
  handlers_crud.go      # Generic CRUD handler helpers
  handlers_food.go      # Food search/seed/cache endpoints
  handlers_food_test.go # Food handler tests
  handlers_sharing.go   # Sharing endpoint handlers
  handlers_test.go      # Handler tests
  handlers_old.go.bak   # Deprecated handler code (backup)
  store_old.go.bak      # Deprecated store code (backup)
  validation.go         # Input validation helpers
  ratelimit.go          # Per-IP rate limiter
  migrate.go            # Migration runner (reads embedded SQL files)
  seed.go               # Category seeding
  migrations/           # SQL migration files (12 numbered pairs: up/down)
    000001_init.up.sql
    000001_init.down.sql
    ...
    000012_ingredient_details_groups.up.sql
    000012_ingredient_details_groups.down.sql
  Dockerfile            # Multi-stage Go build → Alpine runtime
  Makefile              # Go build, cross-compile, docker, test targets
  go.mod / go.sum       # Go module definition
  sync.db               # Local SQLite database for testing
```

### `src-tauri/` Internal Structure

```
src-tauri/
  Cargo.toml            # Rust crate config (name: nutrilabel, tauri v2)
  tauri.conf.json       # Tauri app config: window, bundling, identifiers
  build.rs              # Tauri build script
  capabilities/         # Tauri capability permissions
  icons/                # Application icons (PNG, ICO, ICNS)
  src/
    main.rs             # Rust binary entry point — calls nutrilabel_lib::run()
    lib.rs              # Tauri app builder: minimal shell, 2 commands (get_app_version, get_data_dir)
```

---

## Technology Stack

### TypeScript

**Where:** Entire `src/` directory (web application), `scripts/` directory, configuration files.
**Version:** TypeScript 5 (`tsconfig.json`, `package.json:107`).
**Role:** Primary language for the web frontend. Used for React components, Zustand stores, API clients, utility functions, and Next.js API routes.

### Next.js

**Where:** `src/app/`, `middleware.ts`, `next.config.ts`, `server.js`.
**Version:** Next.js 16.1.1 (`package.json:74`).
**Role:** Web application framework using the App Router architecture. Serves as the frontend application host and API proxy layer. Operates in three modes:
1. **Development** — `next dev -p 3000` (`package.json:6`)
2. **Standalone server** — `next build --webpack` with `output: "standalone"` (for Docker/PM2 deployment)
3. **Static export** — `output: "export"` generates an `out/` directory (for Tauri desktop and Capacitor mobile builds)

The `next.config.ts:14` conditionally switches between export and standalone modes based on `NEXT_STATIC_EXPORT` environment variable.

### React

**Where:** `src/components/`, `src/hooks/`, `src/app/` pages.
**Version:** React 19.0.0 (`package.json:79`).
**Role:** UI rendering library. All application views are React Server Components and Client Components within the Next.js App Router. React Query (`@tanstack/react-query`) handles server state fetching and caching.

### Tauri

**Where:** `src-tauri/` directory.
**Version:** Tauri 2 (`src-tauri/Cargo.toml:16`).
**Role:** Desktop application shell for Windows, macOS, and Linux. The Rust side (`src-tauri/src/lib.rs`) is minimal — it creates a Tauri window that loads the Next.js static export (`out/` directory). It exposes two commands: `get_app_version` and `get_data_dir`. All application logic runs in the WebView. Data is stored in the browser's IndexedDB (via `src/lib/storage.ts`).

Bundle targets (from `src-tauri/tauri.conf.json:31`): `"all"` — Windows NSIS, macOS DMG, Linux AppImage/deb.

### Rust

**Where:** `src-tauri/src/` (2 files).
**Role:** Minimal — provides the Tauri desktop wrapper. No business logic in Rust. The crate name is `nutrilabel` (legacy name), package name `nutrilabel_lib`.

### Go

**Where:** `sync-server/` directory.
**Version:** Go 1.21 (`sync-server/go.mod:3`).
**Role:** Server-first backend API. Handles authentication (JWT), CRUD operations for all data entities (recipes, books, categories, meal plans, nutrition entries, custom foods, food search, grocery lists, sharing, API keys), rate limiting, CORS, and database migrations.

### Capacitor

**Where:** `capacitor.config.ts`, `package.json:13-18` scripts.
**Version:** Capacitor 8.3.1 (`package.json:21-24`).
**Role:** Wraps the Next.js static export into native Android and iOS applications. Config references `webDir: "out"` (`capacitor.config.ts:6`). The Capacitor Android/iOS projects are generated at build time and copied into `builds/android/` and `builds/ios/` for native compilation in Android Studio / Xcode.

### Docker

**Where:** Root `Dockerfile`, `sync-server/Dockerfile`, `docker-compose.yml`, `docker-compose.build.yml`, `docker-entrypoint.sh`, `docker-build.bat`, `docker-build.sh`.
**Role:** Containerized deployment. Three-service stack defined in `docker-compose.yml`:
1. **postgres** — PostgreSQL 17 Alpine (`postgres:17-alpine`)
2. **api** — Go API server (`recipetool-api` image, built from `sync-server/Dockerfile`)
3. **web** — Next.js web application (`recipetool-dietledger` image, built from root `Dockerfile`)

The root Dockerfile uses Node 22 Alpine, multi-stage build (deps → builder → runner), produces a standalone Next.js server.

### PostgreSQL

**Where:** `docker-compose.yml:2-17`, `sync-server/store_postgres.go`, `sync-server/go.mod:7` (pgx driver).
**Version:** PostgreSQL 17 Alpine (Docker image).
**Role:** Primary production database for server mode. Accessed by the Go API server via `jackc/pgx/v5` driver. Schema managed by 12 numbered SQL migration files in `sync-server/migrations/`. Database name/user/password default to `dietledger`.

### SQLite

**Where:** `db/custom.db`, `sync-server/store_sqlite.go`, `sync-server/go.mod:10` (modernc.org/sqlite — pure Go), `prisma/migrations/` (for local-only mode), `deploy/dietledger.service:18`.
**Role:** Used in two contexts:
1. **Local-only mode** — Prisma ORM manages an SQLite database at `db/custom.db` for local-first data storage (`deploy/dietledger.service:18`, `server.js:48`).
2. **Go server testing/development** — The Go server can run with `DB_DRIVER=sqlite` using the `modernc.org/sqlite` pure-Go driver, targeting `sync-server/sync.db`.

### Prisma

**Where:** `prisma/migrations/` directory.
**Role:** ORM for local-only SQLite mode. Provides type-safe database access for the Next.js API routes when `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true`. The Prisma schema file itself is not present in the directory listing (only `migrations/` exists), suggesting the schema may be auto-generated or the directory is incomplete at the time of analysis.

---

## Runtime Components

### 1. Next.js Web Application (Port 3000)

**Entry point:** `server.js` (production) or `next dev` (development, `package.json:6`).
**What it does:** Serves the React SPA and proxies API requests to the Go server.
**Proxy mechanism:** `middleware.ts` → `src/proxy.ts`. The middleware matches `/api/:path*` routes. If `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` is **false** (server mode), it forwards requests to the Go API server at `API_URL` (default: `http://localhost:8080`, `src/proxy.ts:4`).
**Local-only mode:** When `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=true`, the proxy passes through to Next.js API routes defined in `src/app/api/`, which use Prisma/SQLite directly.

### 2. Go API Server (Port 8080)

**Entry point:** `sync-server/main.go`.
**What it does:** Full REST API backend. Serves all data operations when not in local-only mode.
**Key endpoints** (from `sync-server/server.go:32-77`):
- `/api/health`, `/api/about` — unauthenticated
- `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh` — authentication
- `/api/recipes`, `/api/books`, `/api/categories`, `/api/meal-plans`, `/api/entries/`, `/api/profiles`, `/api/custom-foods`, `/api/grocery`, `/api/keys`, `/api/nutrition/sync`, `/api/share`, `/api/foods` — authenticated CRUD
- `/api/community`, `/api/community/categories` — community search (unauthenticated)
**Authentication:** JWT access tokens + refresh tokens. Also supports API key authentication as a fallback (`sync-server/server.go:232`). HMAC-S256 signing (`HMAC_SECRET` env var).

### 3. Tauri Desktop Shell

**Entry point:** `src-tauri/src/main.rs` → `src-tauri/src/lib.rs`.
**What it does:** Wraps the Next.js static export (`out/` directory) in a native desktop window. No backend server runs inside the Tauri shell — all data lives in the browser's IndexedDB. The Tauri shell is essentially a Chromium WebView container.
**Window config:** 1280x900 default, min 900x700, centered, resizable (`src-tauri/tauri.conf.json:14-22`).

### 4. Capacitor Mobile Apps (Android/iOS)

**Entry point:** Capacitor config (`capacitor.config.ts`), build scripts in `package.json:13-18`.
**What it does:** Wraps the Next.js static export (`out/` directory) into native mobile app shells. Same local-only architecture as Tauri — no server, data in IndexedDB.
**Build process:** `build-all.sh` lines 105-163. Builds Next.js static export, runs `cap sync`, copies platform projects to `builds/android/` and `builds/ios/` for native IDE compilation.

### 5. Docker Services

**Entry point:** `docker-compose.yml`.
**What it does:** Runs the full server-mode stack: PostgreSQL + Go API + Next.js web, all containerized with health checks and restart policies.

---

## Build Artifacts

Defined by `build-all.sh` (lines 23, 201-213) and organized into `builds/`:

| Artifact | Location | Produced By |
|---|---|---|
| Windows NSIS installer (`.exe`) | `builds/windows/` | `cargo tauri build --bundles nsis` |
| Linux AppImage + `.deb` | `builds/linux/` | `cargo tauri build --bundles appimage,deb` |
| macOS DMG + `.app` | `builds/macos/` | `cargo tauri build --bundles dmg,app` |
| Android project (for APK/AAB) | `builds/android/` | `npx cap sync android` + copy |
| iOS project (for IPA) | `builds/ios/` | `npx cap sync ios` + copy |
| Self-hosted server bundle | `builds/server/` | `next build` standalone + `server.js` |
| Docker image: `recipetool-dietledger` | Docker registry / local | Root `Dockerfile` |
| Docker image: `recipetool-api` | Docker registry / local | `sync-server/Dockerfile` |
| Cross-compiled Go binaries | `sync-server/dist/` | `make build-all` (6 OS/arch combos) |

**Note:** Desktop (Tauri) and mobile (Capacitor) builds use Next.js static export (`output: "export"`). The server build uses Next.js standalone output (`output: "standalone"`). The `build-all.sh` script temporarily modifies `next.config.ts` to toggle between these modes (lines 110, 132, 172-173).

---

## Deployment Targets

### 1. Docker (Primary Production Target)

Evidence: `docker-compose.yml`, `docker-compose.build.yml`, root `Dockerfile`, `sync-server/Dockerfile`, `docker-entrypoint.sh`, `deploy/deploy.sh`.
Configuration: 3-service stack — PostgreSQL 17 + Go API (port 8080) + Next.js web (port 3000). Environment configured via `.env`.

### 2. Standalone Server (PM2 / systemd)

Evidence: `server.js`, `ecosystem.config.cjs`, `deploy/dietledger.service`.
Configuration: PM2 manages the Node.js standalone server. systemd service file runs `server.js` directly. SQLite database at `/opt/dietledger/db/custom.db`. Working directory `/opt/dietledger` (`ecosystem.config.cjs:7`, `deploy/dietledger.service:9`).

### 3. Desktop Applications (Windows, macOS, Linux)

Evidence: `src-tauri/tauri.conf.json`, `build-all.sh` lines 50-101.
Configuration: Tauri native installers. NSIS for Windows, DMG for macOS, AppImage/deb for Linux.

### 4. Mobile Applications (Android, iOS)

Evidence: `capacitor.config.ts`, `build-all.sh` lines 105-163, `package.json:13-18`.
Configuration: Capacitor wraps static export. Requires Android Studio (APK/AAB) or Xcode (IPA) for final compilation.

### 5. Local-Only (No Server)

Evidence: `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` env var (`.env.example:13`, `src/proxy.ts:43`, `Dockerfile:4`, `docker-compose.yml:56`).
Configuration: All data stored in browser IndexedDB + server-side SQLite via Prisma. No Go server or PostgreSQL needed.

### 6. Development

Evidence: `package.json:6` (`next dev`), `dev.bat`, `src-tauri/tauri.conf.json:8` (`beforeDevCommand: "bun run dev"`).
Configuration: Next.js dev server on port 3000, Go API on port 8080 (optional for server mode).

---

## External Dependencies

### Major Third-Party Libraries (Frontend — `package.json`)

#### UI Framework

| Library | Version | Purpose |
|---|---|---|
| `next` | ^16.1.1 | Web application framework (App Router, SSR, API routes, static export) |
| `react` / `react-dom` | ^19.0.0 | UI rendering library |
| `tailwindcss` | ^4 | Utility-first CSS framework |
| `@tailwindcss/postcss` | ^4 | Tailwind CSS PostCSS integration |
| `tw-animate-css` | ^1.3.5 | Tailwind CSS animation utilities |
| `tailwindcss-animate` | ^1.0.7 | Tailwind animation plugin |
| `class-variance-authority` | ^0.7.1 | Component variant management |
| `clsx` | ^2.1.1 | Conditional CSS class composition |
| `tailwind-merge` | ^3.3.1 | Tailwind class deduplication |

#### shadcn/ui + Radix Primitives

| Library | Purpose |
|---|---|
| `@radix-ui/react-accordion` | Accessible accordion component |
| `@radix-ui/react-alert-dialog` | Alert dialogs |
| `@radix-ui/react-aspect-ratio` | Aspect ratio container |
| `@radix-ui/react-avatar` | Avatar component |
| `@radix-ui/react-checkbox` | Checkbox component |
| `@radix-ui/react-collapsible` | Collapsible sections |
| `@radix-ui/react-context-menu` | Context menus |
| `@radix-ui/react-dialog` | Modal dialogs |
| `@radix-ui/react-dropdown-menu` | Dropdown menus |
| `@radix-ui/react-hover-card` | Hover card tooltips |
| `@radix-ui/react-label` | Form labels |
| `@radix-ui/react-menubar` | Menu bar |
| `@radix-ui/react-navigation-menu` | Navigation menus |
| `@radix-ui/react-popover` | Popover overlays |
| `@radix-ui/react-progress` | Progress bars |
| `@radix-ui/react-radio-group` | Radio button groups |
| `@radix-ui/react-scroll-area` | Custom scrollable areas |
| `@radix-ui/react-select` | Select dropdowns |
| `@radix-ui/react-separator` | Visual separators |
| `@radix-ui/react-slider` | Slider inputs |
| `@radix-ui/react-slot` | Component slot composition |
| `@radix-ui/react-switch` | Toggle switches |
| `@radix-ui/react-tabs` | Tab navigation |
| `@radix-ui/react-toast` | Toast notifications |
| `@radix-ui/react-toggle` / `toggle-group` | Toggle buttons |
| `@radix-ui/react-tooltip` | Tooltips |

All Radix primitives serve as the accessible foundation for shadcn/ui components (`components.json:1`).

#### State Management

| Library | Version | Purpose |
|---|---|---|
| `zustand` | ^5.0.6 | Client-side state management (used by all `*-store.ts` files in `src/lib/`) |
| `@tanstack/react-query` | ^5.82.0 | Server state management (data fetching, caching, synchronization) |

#### Data / Forms

| Library | Version | Purpose |
|---|---|---|
| `zod` | ^4.0.2 | Schema validation (forms, API responses) |
| `react-hook-form` | ^7.60.0 | Form state management |
| `@hookform/resolvers` | ^5.1.1 | Zod integration for react-hook-form |

#### Nutrition / Food

| Library | Version | Purpose |
|---|---|---|
| `date-fns` | ^4.1.0 | Date formatting for meal planning, nutrition tracking |
| `recharts` | ^2.15.4 | Charts for nutrition data visualization |

#### Document / Rendering

| Library | Version | Purpose |
|---|---|---|
| `@mdxeditor/editor` | ^3.39.1 | MDX/Markdown editor (recipe descriptions, notes) |
| `react-markdown` | ^10.1.0 | Markdown rendering |
| `react-syntax-highlighter` | ^15.6.1 | Code syntax highlighting in markdown |

#### Export / Capture

| Library | Version | Purpose |
|---|---|---|
| `jspdf` | ^4.2.1 | PDF generation (recipe/nutrition label export) |
| `html-to-image` | ^1.11.13 | HTML-to-image capture |
| `html2canvas` | ^1.4.1 | HTML-to-canvas capture (backup/complementary) |

#### Storage / Sync

| Library | Version | Purpose |
|---|---|---|
| `idb` | ^8.0.3 | IndexedDB wrapper (browser-side persistent storage for local mode) |
| `stream-chain` / `stream-json` | ^3.6.3 / ^2.1.0 | Streaming JSON parsing (USDA dataset import) |

#### Interaction

| Library | Version | Purpose |
|---|---|---|
| `@dnd-kit/core` / `sortable` / `utilities` | ^6.3.1 / ^10.0.0 / ^3.2.2 | Drag-and-drop for recipe reordering, meal planning |
| `framer-motion` | ^12.23.2 | Animation library |
| `embla-carousel-react` | ^8.6.0 | Carousel component |
| `react-day-picker` | ^9.8.0 | Calendar date picker |
| `react-resizable-panels` | ^3.0.3 | Resizable panel layout |
| `input-otp` | ^1.4.2 | One-time password input |
| `cmdk` | ^1.1.1 | Command palette (⌘K menu) |
| `vaul` | ^1.1.2 | Drawer component |
| `qrcode.react` | ^4.2.0 | QR code generation |
| `sonner` | ^2.0.6 | Toast notification system |
| `lucide-react` | ^0.525.0 | Icon library |

#### Desktop / Mobile Shell

| Library | Version | Purpose |
|---|---|---|
| `@capacitor/core` | ^8.3.1 | Capacitor native bridge |
| `@capacitor/cli` | ^8.3.1 | Capacitor build CLI |
| `@capacitor/android` | ^8.3.1 | Android platform |
| `@capacitor/ios` | ^8.3.1 | iOS platform |

#### Utilities

| Library | Version | Purpose |
|---|---|---|
| `uuid` | ^11.1.0 | UUID generation |
| `sharp` | ^0.34.3 | Image processing (server-side, referenced in `next.config.ts:25` as external package) |
| `adm-zip` | ^0.5.17 | ZIP file handling (export/import) |
| `@reactuses/core` | ^6.0.5 | React utility hooks |
| `@tanstack/react-table` | ^8.21.3 | Data table component |
| `next-intl` | ^4.3.4 | Internationalization |
| `next-themes` | ^0.4.6 | Dark/light theme switching |
| `z-ai-web-dev-sdk` | ^0.0.17 | UNKNOWN — no usage found in `src/` directory at time of analysis |

### Major Third-Party Libraries (Go Backend — `sync-server/go.mod`)

| Library | Version | Purpose |
|---|---|---|
| `github.com/jackc/pgx/v5` | v5.7.4 | PostgreSQL driver |
| `modernc.org/sqlite` | v1.34.5 | Pure Go SQLite driver (no CGO) |
| `github.com/golang-jwt/jwt/v5` | v5.2.2 | JWT token generation and validation |
| `github.com/google/uuid` | v1.6.0 | UUID generation |
| `golang.org/x/crypto` | v0.33.0 | Cryptographic utilities (bcrypt password hashing) |
| `golang.org/x/time` | v0.10.0 | Rate limiting (token bucket) |

### Major Third-Party Libraries (Rust Desktop — `src-tauri/Cargo.toml`)

| Library | Version | Purpose |
|---|---|---|
| `tauri` | 2 | Desktop application framework |
| `tauri-plugin-opener` | 2 | OS default app opener plugin |
| `serde` | 1 | JSON serialization/deserialization |
| `serde_json` | 1 | JSON handling |
| `tauri-build` | 2 | Build-time Tauri configuration |
