# DietLedger Data Storage Architecture

## Overview

DietLedger uses a **three-layer data storage architecture** that supports both offline-first local mode and a multi-user server mode. The same domain model is replicated across all three layers, with data synchronized between them.

### The Three Storage Layers

| Layer | Technology | Location | Mode |
|---|---|---|---|
| **Client-side DB** | IndexedDB (via `idb`) | Browser | Local-only mode |
| **Local Server DB** | SQLite via Prisma ORM | Next.js server | Local-only mode |
| **Remote Server DB** | PostgreSQL or SQLite via Go | Go API server | Server mode |

### Mode Selection

The `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` environment variable controls which path is used:

- **`true` / `1`** — `LocalApiClient` delegates to IndexedDB (`src/lib/api-client-local.ts`). The Prisma/SQLite layer is used only for food data seeding and search endpoints.
- **`false` / unset** — `GoApiClient` sends HTTP requests to the Go sync-server (`src/lib/api-client-go.ts`). The Go server uses PostgreSQL (production) or SQLite (dev) selected by `DB_DRIVER`.

The factory is in `src/lib/api-client.ts:getApiClient()`.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser / Tauri Shell                       │
│                                                                   │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐  │
│  │  React UI    │────>│  ApiClient   │────>│  IndexedDB       │  │
│  │  (Zustand)   │     │  (abstract)  │     │  (dietledger-db) │  │
│  └──────────────┘     └──────┬───────┘     └──────────────────┘  │
│                              │                                    │
│              ┌───────────────┼───────────────┐                    │
│              ▼                               ▼                    │
│   NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=false    true                 │
│              │                               │                    │
│              ▼                               ▼                    │
│     ┌────────────────┐              ┌──────────────────┐         │
│     │  GoApiClient   │              │  LocalApiClient  │         │
│     │  (HTTP+JWT)    │              │  (IndexedDB)     │         │
│     └───────┬────────┘              └──────────────────┘         │
│             │                                                    │
└─────────────┼────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Go API Server                                │
│  sync-server/server.go → routes → handlers → Store interface    │
│                                                                   │
│  ┌──────────────────────┐     ┌────────────────────────────┐     │
│  │  PostgresStore       │     │  SQLiteStore               │     │
│  │  (DB_DRIVER=postgres)│     │  (DB_DRIVER=sqlite)        │     │
│  │  pgx/v5 driver       │     │  modernc.org/sqlite driver │     │
│  │  migrations/*.sql    │     │  inline InitDB() schema    │     │
│  └──────────┬───────────┘     └──────────┬─────────────────┘     │
│             │                            │                       │
│             ▼                            ▼                       │
│     PostgreSQL 17                  SQLite (file)                 │
│     Docker volume                  sync.db / custom.db           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              Next.js Server (local mode food data)               │
│  src/lib/db.ts → Prisma Client → SQLite                         │
│  Used only for: food search, food seeding, UPC lookup           │
│  Database file: prisma/dev.db or db/custom.db                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database 1: PostgreSQL (Server Mode — Production)

### Connection

- **Driver**: `pgx/v5`
- **Config**: `DATABASE_URL` env var (e.g., `postgres://dietledger:dietledger@postgres:5432/dietledger`)
- **Migration runner**: `sync-server/migrate.go` — embedded SQL files from `sync-server/migrations/`, tracked in `schema_migrations` table
- **Used by**: `sync-server/store_postgres.go` (`PostgresStore`)

### Schema Source Files

| File | Tables Created |
|---|---|
| `migrations/000001_init.up.sql` | `users`, `devices`, `api_keys`, `refresh_tokens` |
| `migrations/000002_recipes.up.sql` | `recipes`, `ingredients` |
| `migrations/000003_foods.up.sql` | `food_items`, `custom_foods`, `seed_jobs` |
| `migrations/000004_nutrition.up.sql` | `person_profiles`, `food_log_entries`, `weight_entries` |
| `migrations/000005_meal_plans.up.sql` | `meal_plans`, `day_plan_entries`, `meal_groups`, `grocery_checklists` |
| `migrations/000006_books.up.sql` | `categories`, `recipe_books`, `chapters`, `chapter_recipes`, `chapter_pages`, `book_pages`, `recipe_categories` |
| `migrations/000007_sharing.up.sql` | `shared_recipes`, `recipe_ratings`, `community_categories` |
| `migrations/000008_fts.up.sql` | Full-text search (`search_vector` tsvector column + GIN index + trigger on `food_items`) |

### Complete Schema

#### `users`

```
CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    display_name    TEXT,
    password_hash   TEXT NOT NULL,
    api_key         TEXT UNIQUE NOT NULL,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: none beyond PK

#### `devices`

```
CREATE TABLE devices (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name     TEXT,
    device_type     TEXT,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_devices_user_id(user_id)`

#### `api_keys`

```
CREATE TABLE api_keys (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    key_hash        TEXT NOT NULL,
    key_prefix      TEXT NOT NULL,
    permissions     TEXT NOT NULL DEFAULT '',
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(key_hash)
);
```

**Indexes**: `idx_api_keys_user_id(user_id)`, `idx_api_keys_prefix(key_prefix)`

#### `refresh_tokens`

```
CREATE TABLE refresh_tokens (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_refresh_tokens_user_id(user_id)`

#### `recipes`

```
CREATE TABLE recipes (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    servings          INT NOT NULL DEFAULT 1,
    serving_name      TEXT NOT NULL DEFAULT 'serving',
    instructions      TEXT,
    leftover_storage  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_recipes_user_id(user_id)`, `idx_recipes_updated_at(updated_at)`

#### `ingredients`

```
CREATE TABLE ingredients (
    id              TEXT PRIMARY KEY,
    recipe_id       TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    fdc_id          INT NOT NULL,
    name            TEXT NOT NULL,
    amount          DOUBLE PRECISION NOT NULL,
    unit            TEXT NOT NULL,
    calories        DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_fat       DOUBLE PRECISION NOT NULL DEFAULT 0,
    saturated_fat   DOUBLE PRECISION NOT NULL DEFAULT 0,
    trans_fat       DOUBLE PRECISION NOT NULL DEFAULT 0,
    cholesterol     DOUBLE PRECISION NOT NULL DEFAULT 0,
    sodium          DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_carbs     DOUBLE PRECISION NOT NULL DEFAULT 0,
    dietary_fiber   DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sugars    DOUBLE PRECISION NOT NULL DEFAULT 0,
    added_sugars    DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein         DOUBLE PRECISION NOT NULL DEFAULT 0,
    vitamin_d       DOUBLE PRECISION NOT NULL DEFAULT 0,
    calcium         DOUBLE PRECISION NOT NULL DEFAULT 0,
    iron            DOUBLE PRECISION NOT NULL DEFAULT 0,
    potassium       DOUBLE PRECISION NOT NULL DEFAULT 0
);
```

**Indexes**: `idx_ingredients_recipe_id(recipe_id)`

#### `food_items`

```
CREATE TABLE food_items (
    id                 SERIAL PRIMARY KEY,
    fdc_id             INT UNIQUE NOT NULL,
    description        TEXT NOT NULL,
    data_type          TEXT NOT NULL,
    brand_owner        TEXT,
    gtin_upc           TEXT,
    serving_size       DOUBLE PRECISION NOT NULL DEFAULT 100,
    serving_size_unit  TEXT NOT NULL DEFAULT 'g',
    calories           DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_fat          DOUBLE PRECISION NOT NULL DEFAULT 0,
    saturated_fat      DOUBLE PRECISION NOT NULL DEFAULT 0,
    trans_fat          DOUBLE PRECISION NOT NULL DEFAULT 0,
    cholesterol        DOUBLE PRECISION NOT NULL DEFAULT 0,
    sodium             DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_carbs        DOUBLE PRECISION NOT NULL DEFAULT 0,
    dietary_fiber      DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sugars       DOUBLE PRECISION NOT NULL DEFAULT 0,
    added_sugars       DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein            DOUBLE PRECISION NOT NULL DEFAULT 0,
    vitamin_d          DOUBLE PRECISION NOT NULL DEFAULT 0,
    calcium            DOUBLE PRECISION NOT NULL DEFAULT 0,
    iron               DOUBLE PRECISION NOT NULL DEFAULT 0,
    potassium          DOUBLE PRECISION NOT NULL DEFAULT 0,
    source             TEXT NOT NULL DEFAULT 'usda',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_vector      tsvector   -- added by migration 000008
);
```

**Indexes**: `idx_food_items_description(description)`, `idx_food_items_data_type(data_type)`, `idx_food_items_gtin_upc(gtin_upc)`, `idx_food_items_search` (GIN index on `search_vector`)

**Triggers**: `trg_food_items_search_vector` — auto-updates `search_vector` on INSERT/UPDATE of `description` or `brand_owner`

#### `custom_foods`

```
CREATE TABLE custom_foods (
    id                     TEXT PRIMARY KEY,
    user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                   TEXT NOT NULL,
    calories               DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_fat              DOUBLE PRECISION NOT NULL DEFAULT 0,
    saturated_fat          DOUBLE PRECISION NOT NULL DEFAULT 0,
    trans_fat              DOUBLE PRECISION NOT NULL DEFAULT 0,
    cholesterol            DOUBLE PRECISION NOT NULL DEFAULT 0,
    sodium                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_carbs            DOUBLE PRECISION NOT NULL DEFAULT 0,
    dietary_fiber          DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sugars           DOUBLE PRECISION NOT NULL DEFAULT 0,
    added_sugars           DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein                DOUBLE PRECISION NOT NULL DEFAULT 0,
    vitamin_d              DOUBLE PRECISION NOT NULL DEFAULT 0,
    calcium                DOUBLE PRECISION NOT NULL DEFAULT 0,
    iron                   DOUBLE PRECISION NOT NULL DEFAULT 0,
    potassium              DOUBLE PRECISION NOT NULL DEFAULT 0,
    shared_with_community  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_custom_foods_user_id(user_id)`, `idx_custom_foods_name(name)`, `idx_custom_foods_shared` (partial on `shared_with_community = TRUE`)

#### `seed_jobs`

```
CREATE TABLE seed_jobs (
    id            SERIAL PRIMARY KEY,
    data_type     TEXT NOT NULL,
    release_date  TEXT NOT NULL,
    file_name     TEXT NOT NULL,
    record_count  INT NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'pending',
    progress      DOUBLE PRECISION NOT NULL DEFAULT 0,
    error         TEXT,
    checkpoint    TEXT,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `person_profiles`

```
CREATE TABLE person_profiles (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    sex               TEXT NOT NULL CHECK (sex IN ('male', 'female')),
    birth_date        TEXT,
    height_cm         DOUBLE PRECISION,
    activity_level    TEXT NOT NULL DEFAULT 'moderate'
                      CHECK (activity_level IN ('sedentary','light','moderate','active','veryActive')),
    goal_weight_kg    DOUBLE PRECISION,
    goal_date         TEXT,
    bmr_equation      TEXT,
    manual_bmr_value  DOUBLE PRECISION,
    calorie_target    DOUBLE PRECISION,
    protein_goal_g    DOUBLE PRECISION,
    carbs_goal_g      DOUBLE PRECISION,
    fat_goal_g        DOUBLE PRECISION,
    fiber_goal_g      DOUBLE PRECISION,
    sodium_max_mg     DOUBLE PRECISION,
    sugar_max_g       DOUBLE PRECISION,
    vitamin_d_goal_ug DOUBLE PRECISION,
    calcium_goal_mg   DOUBLE PRECISION,
    iron_goal_mg      DOUBLE PRECISION,
    potassium_goal_mg DOUBLE PRECISION,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_profiles_user_id(user_id)`, `idx_profiles_updated_at(updated_at)`

#### `food_log_entries`

```
CREATE TABLE food_log_entries (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id      TEXT NOT NULL REFERENCES person_profiles(id) ON DELETE CASCADE,
    date            TEXT NOT NULL,
    time            TEXT,
    meal_slot       TEXT NOT NULL CHECK (meal_slot IN ('morning','midMorning','noon','afternoon','evening','night','snack')),
    source_type     TEXT NOT NULL CHECK (source_type IN ('recipe','customFood','manual')),
    source_id       TEXT,
    name            TEXT NOT NULL,
    servings        DOUBLE PRECISION NOT NULL DEFAULT 1,
    serving_amount  DOUBLE PRECISION,
    serving_unit    TEXT,
    calories        DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_fat       DOUBLE PRECISION NOT NULL DEFAULT 0,
    saturated_fat   DOUBLE PRECISION NOT NULL DEFAULT 0,
    trans_fat       DOUBLE PRECISION NOT NULL DEFAULT 0,
    cholesterol     DOUBLE PRECISION NOT NULL DEFAULT 0,
    sodium          DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_carbs     DOUBLE PRECISION NOT NULL DEFAULT 0,
    dietary_fiber   DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sugars    DOUBLE PRECISION NOT NULL DEFAULT 0,
    added_sugars    DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein         DOUBLE PRECISION NOT NULL DEFAULT 0,
    vitamin_d       DOUBLE PRECISION NOT NULL DEFAULT 0,
    calcium         DOUBLE PRECISION NOT NULL DEFAULT 0,
    iron            DOUBLE PRECISION NOT NULL DEFAULT 0,
    potassium       DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_food_log_profile_id(profile_id)`, `idx_food_log_date(date)`, `idx_food_log_profile_date(profile_id, date)`, `idx_food_log_source(source_type, source_id)`

#### `weight_entries`

```
CREATE TABLE weight_entries (
    id                          TEXT PRIMARY KEY,
    user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id                  TEXT NOT NULL REFERENCES person_profiles(id) ON DELETE CASCADE,
    date                        TEXT NOT NULL,
    weight_kg                   DOUBLE PRECISION NOT NULL,
    notes                       TEXT,
    blood_sugar                 DOUBLE PRECISION,
    blood_pressure_systolic     DOUBLE PRECISION,
    blood_pressure_diastolic    DOUBLE PRECISION,
    measurement_context         TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(profile_id, date)
);
```

**Indexes**: `idx_weight_profile_id(profile_id)`, `idx_weight_date(date)`

#### `meal_plans`

```
CREATE TABLE meal_plans (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    week_start  TEXT NOT NULL UNIQUE,
    slot_times  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_meal_plans_user_id(user_id)`, `idx_meal_plans_week_start(week_start)`

#### `day_plan_entries`

```
CREATE TABLE day_plan_entries (
    id            TEXT PRIMARY KEY,
    meal_plan_id  TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,
    slot          TEXT NOT NULL CHECK (slot IN ('morning','midMorning','noon','afternoon','evening','night')),
    recipe_id     TEXT,
    position      INT NOT NULL DEFAULT 0,
    group_id      TEXT,
    servings      DOUBLE PRECISION NOT NULL DEFAULT 1,
    is_leftover   BOOLEAN NOT NULL DEFAULT FALSE,
    source_type   TEXT NOT NULL DEFAULT 'recipe',
    food_name     TEXT,
    calories      DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_fat     DOUBLE PRECISION NOT NULL DEFAULT 0,
    saturated_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    trans_fat     DOUBLE PRECISION NOT NULL DEFAULT 0,
    cholesterol   DOUBLE PRECISION NOT NULL DEFAULT 0,
    sodium        DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_carbs   DOUBLE PRECISION NOT NULL DEFAULT 0,
    dietary_fiber DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sugars  DOUBLE PRECISION NOT NULL DEFAULT 0,
    added_sugars  DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein       DOUBLE PRECISION NOT NULL DEFAULT 0,
    vitamin_d     DOUBLE PRECISION NOT NULL DEFAULT 0,
    calcium       DOUBLE PRECISION NOT NULL DEFAULT 0,
    iron          DOUBLE PRECISION NOT NULL DEFAULT 0,
    potassium     DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_day_plan_meal_plan_id(meal_plan_id)`, `idx_day_plan_date(date)`

#### `meal_groups`

```
CREATE TABLE meal_groups (
    id            TEXT PRIMARY KEY,
    meal_plan_id  TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,
    slot          TEXT NOT NULL,
    name          TEXT NOT NULL,
    position      INT NOT NULL DEFAULT 0
);
```

**Indexes**: `idx_meal_groups_meal_plan_id(meal_plan_id)`

#### `grocery_checklists`

```
CREATE TABLE grocery_checklists (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start     TEXT NOT NULL,
    checked_items  TEXT NOT NULL DEFAULT '[]',
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, week_start)
);
```

**Indexes**: `idx_grocery_week_start(week_start)`

#### `categories`

```
CREATE TABLE categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    parent_id   TEXT REFERENCES categories(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_categories_parent_id(parent_id)`

Self-referencing: `parent_id → categories.id` — supports hierarchical category trees.

#### `recipe_books`

```
CREATE TABLE recipe_books (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    cover_color  TEXT NOT NULL DEFAULT '#059669',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_books_user_id(user_id)`, `idx_books_updated_at(updated_at)`

#### `chapters`

```
CREATE TABLE chapters (
    id                   TEXT PRIMARY KEY,
    book_id              TEXT NOT NULL REFERENCES recipe_books(id) ON DELETE CASCADE,
    title                TEXT NOT NULL,
    position             INT NOT NULL DEFAULT 0,
    page_template_id     TEXT,
    recipe_template_id   TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_chapters_book_id(book_id)`, `idx_chapters_position(position)`

#### `chapter_recipes`

```
CREATE TABLE chapter_recipes (
    id          TEXT PRIMARY KEY,
    chapter_id  TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    UNIQUE(chapter_id, recipe_id)
);
```

**Indexes**: `idx_chapter_recipes_chapter_id(chapter_id)`, `idx_chapter_recipes_recipe_id(recipe_id)`

#### `chapter_pages`

```
CREATE TABLE chapter_pages (
    id          TEXT PRIMARY KEY,
    chapter_id  TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    position    INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_chapter_pages_chapter_id(chapter_id)`, `idx_chapter_pages_position(position)`

#### `book_pages`

```
CREATE TABLE book_pages (
    id          TEXT PRIMARY KEY,
    book_id     TEXT NOT NULL REFERENCES recipe_books(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    position    INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_book_pages_book_id(book_id)`

#### `recipe_categories`

```
CREATE TABLE recipe_categories (
    id           TEXT PRIMARY KEY,
    recipe_id    TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(recipe_id, category_id)
);
```

**Indexes**: `idx_recipe_categories_recipe_id(recipe_id)`, `idx_recipe_categories_category_id(category_id)`

#### `shared_recipes`

```
CREATE TABLE shared_recipes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id       TEXT NOT NULL,
    share_token     TEXT UNIQUE NOT NULL,
    is_public       BOOLEAN NOT NULL DEFAULT TRUE,
    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT,
    tags            TEXT DEFAULT '',
    recipe_data     TEXT NOT NULL,
    view_count      INT DEFAULT 0,
    import_count    INT DEFAULT 0,
    average_rating  DOUBLE PRECISION DEFAULT 0,
    rating_count    INT DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**: `idx_shared_recipes_user_id(user_id)`, `idx_shared_recipes_token(share_token)`, `idx_shared_recipes_public` (partial on `is_public = TRUE`)

#### `recipe_ratings`

```
CREATE TABLE recipe_ratings (
    id          TEXT PRIMARY KEY,
    recipe_id   TEXT NOT NULL REFERENCES shared_recipes(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(recipe_id, user_id)
);
```

**Indexes**: `idx_ratings_recipe_id(recipe_id)`

#### `community_categories`

```
CREATE TABLE community_categories (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    slug  TEXT UNIQUE NOT NULL
);
```

#### `schema_migrations`

```
CREATE TABLE schema_migrations (
    version TEXT PRIMARY KEY,
    dirty   BOOLEAN NOT NULL
);
```

Automatically created by the migration runner in `sync-server/migrate.go`.

### Entity-Relationship Diagram

```
users
 ├── devices (user_id)
 ├── api_keys (user_id)
 ├── refresh_tokens (user_id)
 ├── recipes (user_id)
 │    └── ingredients (recipe_id)
 ├── custom_foods (user_id)
 ├── person_profiles (user_id)
 │    ├── food_log_entries (profile_id)
 │    └── weight_entries (profile_id)
 ├── meal_plans (user_id)
 │    ├── day_plan_entries (meal_plan_id)
 │    └── meal_groups (meal_plan_id)
 ├── recipe_books (user_id)
 │    ├── chapters (book_id)
 │    │    ├── chapter_recipes (chapter_id → recipes.id)
 │    │    └── chapter_pages (chapter_id)
 │    └── book_pages (book_id)
 ├── shared_recipes (user_id)
 │    └── recipe_ratings (recipe_id, user_id)
 └── grocery_checklists (user_id)

categories (self-ref: parent_id → categories.id)
recipe_categories (recipe_id → recipes.id, category_id → categories.id)
food_items (standalone — USDA cache)
seed_jobs (standalone)
community_categories (standalone)
```

---

## Database 2: SQLite — Go Sync Server (Dev/Fallback)

### Connection

- **Driver**: `modernc.org/sqlite` (pure Go, no CGO)
- **Config**: `DB_PATH` env var (default: `./sync.db`)
- **Schema**: inline in `sync-server/store_sqlite.go:InitDB()`
- **Used by**: `SQLiteStore` when `DB_DRIVER=sqlite`

### Schema

Identical to the PostgreSQL schema with these adaptations:
- `TIMESTAMPTZ` → `DATETIME`
- `DOUBLE PRECISION` → `REAL`
- `BOOLEAN` → `INT` (0/1)
- `SERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `$1, $2, ...` placeholders → `?` placeholders
- No `search_vector` tsvector column (SQLite uses FTS5 virtual table instead, see below)
- No `CHECK` constraints on enums (stored as plain `TEXT`)
- Additional pragmas: `WAL` journal mode, `foreign_keys=ON`, `busy_timeout=5000`

### SQLite FTS5 for Food Search

In local mode, the Prisma migration in `prisma/fts5-setup.sql` creates:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS food_items_fts USING fts5(
    description,
    brand_owner,
    content='food_items',
    content_rowid='id'
);

CREATE TRIGGER food_items_ai AFTER INSERT ON food_items BEGIN
    INSERT INTO food_items_fts(rowid, description, brand_owner)
    VALUES (new.id, new.description, new.brand_owner);
END;

CREATE TRIGGER food_items_ad AFTER DELETE ON food_items BEGIN
    INSERT INTO food_items_fts(food_items_fts, rowid, description, brand_owner)
    VALUES ('delete', old.id, old.description, old.brand_owner);
END;

CREATE TRIGGER food_items_au AFTER UPDATE ON food_items BEGIN
    INSERT INTO food_items_fts(food_items_fts, rowid, description, brand_owner)
    VALUES ('delete', old.id, old.description, old.brand_owner);
    INSERT INTO food_items_fts(rowid, description, brand_owner)
    VALUES (new.id, new.description, new.brand_owner);
END;
```

---

## Database 3: SQLite — Prisma / Next.js Server (Local Mode)

### Connection

- **Driver**: Prisma Client JS with SQLite provider
- **Config**: `DATABASE_URL` env var, falls back to `file:/app/db/custom.db` (Docker) or `file:~/.recipetool/dev.db` (local dev)
- **Schema**: `prisma/schema.prisma` (18 models)
- **Runtime schema bootstrap**: `src/lib/db.ts:ensureSchema()` creates all tables via raw SQL if they don't exist, then runs incremental column migrations

### Schema Source Files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Prisma model definitions (generates TypeScript client) |
| `src/lib/db.ts` | Runtime table creation (20+ `CREATE TABLE` statements) + incremental `ALTER TABLE` migrations |
| `prisma/migrations/20260422_add_food_item_fts5/migration.sql` | FTS5 virtual table + triggers |
| `prisma/fts5-setup.sql` | FTS5 virtual table + triggers (standalone) |

### Prisma Models (18)

Defined in `prisma/schema.prisma`:

| Model | Primary Key | Key Fields | Relations |
|---|---|---|---|
| `Recipe` | `@id @default(cuid())` | name, servings, servingName, instructions, leftoverStorage | `ingredients: Ingredient[]` |
| `Ingredient` | `@id @default(cuid())` | fdcId, name, amount, unit + 15 nutrient fields | `recipe: Recipe` (CASCADE) |
| `FoodItem` | `@id @default(autoincrement())` | fdcId (unique), description, dataType, brandOwner, gtinUpc, servingSize + 15 nutrients | none |
| `SeedJob` | `@id @default(autoincrement())` | dataType, releaseDate, fileName, status, progress | none |
| `RecipeBook` | `@id @default(cuid())` | title, description, coverColor | `chapters: Chapter[]` |
| `Chapter` | `@id @default(cuid())` | bookId, title, position, pageTemplateId, recipeTemplateId | `book: RecipeBook` (CASCADE), `chapterRecipes`, `chapterPages` |
| `ChapterRecipe` | `@id @default(cuid())` | chapterId, recipeId, position | `chapter: Chapter` (CASCADE), `@@unique([chapterId, recipeId])` |
| `ChapterPage` | `@id @default(cuid())` | chapterId, title, content, position | `chapter: Chapter` (CASCADE) |
| `Category` | `@id @default(cuid())` | name, parentId | self-relation: `parent`/`children` (CASCADE) |
| `RecipeCategory` | `@id @default(cuid())` | recipeId, categoryId | `@@unique([recipeId, categoryId])` |
| `PersonProfile` | `@id` (manual) | name, sex (enum), birthDate, heightCm, activityLevel (enum), 11 macro/micro goals | `foodLogEntries`, `weightEntries` |
| `FoodLogEntry` | `@id` (manual) | profileId, date, time, mealSlot (enum), sourceType (enum), name, servings + 15 nutrients | `profile: PersonProfile` (CASCADE) |
| `WeightEntry` | `@id` (manual) | profileId, date, weightKg, notes, bloodSugar, bloodPressure* | `profile: PersonProfile` (CASCADE), `@@unique([profileId, date])` |
| `MealPlan` | `@id @default(cuid())` | name, weekStart (unique), slotTimes | `entries: DayPlanEntry[]`, `groups: MealGroup[]` |
| `DayPlanEntry` | `@id @default(cuid())` | mealPlanId, date, slot (enum), recipeId, position, groupId, servings, isLeftover, sourceType + 15 nutrients | `mealPlan: MealPlan` (CASCADE) |
| `MealGroup` | `@id @default(cuid())` | mealPlanId, date, slot (enum), name, position | `mealPlan: MealPlan` (CASCADE) |
| `CustomFood` | `@id @default(cuid())` | name + 15 nutrients | none |
| `GroceryChecklist` | `@id @default(cuid())` | weekStart (unique), checkedItems | none |
| `BookPage` | `@id @default(cuid())` | bookId, title, content, position | none |
| `ApiKey` | `@id @default(cuid())` | name, keyHash (unique), keyPrefix, permissions | none |

### Enums (Prisma-only)

| Enum | Values |
|---|---|
| `Sex` | `male`, `female` |
| `ActivityLevel` | `sedentary`, `light`, `moderate`, `active`, `veryActive` |
| `MealSlot` | `morning`, `midMorning`, `noon`, `afternoon`, `evening`, `night`, `snack` |
| `FoodSourceType` | `recipe`, `customFood`, `manual` |
| `DaySlot` | `morning`, `midMorning`, `noon`, `afternoon`, `evening`, `night` |

### Differences from Server Databases

The Prisma/SQLite layer used by Next.js in local mode does **not** have:
- `users` table (no auth in local mode)
- `devices`, `api_keys`, `refresh_tokens` tables (no multi-user/auth)
- `shared_recipes`, `recipe_ratings`, `community_categories` tables (no community sharing)
- `user_id` columns on user-owned tables (single user)
- `CustomFood.sharedWithCommunity` column

---

## Database 4: IndexedDB — Client-Side (Browser)

### Connection

- **Library**: `idb` (IndexedDB wrapper)
- **Database name**: `dietledger-db`
- **Current version**: `13`
- **Schema definition**: `src/lib/storage.ts:DietLedgerDB` interface
- **Used by**: `LocalApiClient` (local mode) and sync engine

### Object Stores (25)

| Store | Key | Indexes | Used By |
|---|---|---|---|
| `recipes` | `id` | `by-updatedAt` | Recipe CRUD |
| `books` | `id` | `by-updatedAt` | Book CRUD |
| `chapters` | `id` | `by-bookId` | Chapter CRUD |
| `chapterRecipes` | `id` | `by-chapterId`, `by-recipeId` | Chapter-recipe junction |
| `categories` | `id` | `by-parentId` | Category tree |
| `recipeCategories` | `id` | `by-recipeId`, `by-categoryId` | Recipe-category junction |
| `chapterPages` | `id` | `by-chapterId` | Chapter page content |
| `bookPages` | `id` | `by-bookId` | Book page content |
| `templates` | `id` | `by-type` | Print/export templates (client-only) |
| `mealPlans` | `id` | `by-weekStart` | Meal plan CRUD |
| `dayPlanEntries` | `id` | `by-mealPlanId`, `by-date` | Day plan entry CRUD |
| `mealGroups` | `id` | `by-mealPlanId` | Meal group CRUD |
| `groceryChecklists` | `id` | `by-weekStart` | Grocery checklist upsert |
| `seasonalFoods` | `id` | `by-country-region-month` (compound) | Client-only seasonal data |
| `pantryStaples` | `id` | `by-name` | Client-only pantry list |
| `userLocation` | `id` | none | Client-only geolocation |
| `customFoods` | `id` | `by-name` | Custom food CRUD |
| `nutritionProfiles` | `id` | `by-updatedAt` | Nutrition profile CRUD |
| `foodLogEntries` | `id` | `by-profileId`, `by-date`, `by-profileId-date` (compound), `by-sourceType-sourceId` (compound) | Food log CRUD |
| `weightEntries` | `id` | `by-profileId`, `by-date`, `by-profileId-date` (compound) | Weight tracking |
| `syncServers` | `id` | none | Sync server configurations |
| `syncChangeLog` | `id` | `by-synced`, `by-storeName`, `by-timestamp` | Offline sync change tracking |
| `dietaryProfiles` | `id` | `by-updatedAt` | Client-only dietary profiles |
| `allergenRules` | `id` | `by-profileId` | Client-only allergen rules |
| `sharedRecipeCache` | `id` | `by-recipeId`, `by-shareToken` | Client-side cache of shared recipes |
| `brandKits` | `id` | `by-updatedAt` | Client-only brand kits |
| `appSettings` | `id` | none | Client-only app settings |

### IndexedDB-Only Stores

These stores exist **only** in IndexedDB and have no server-side counterpart:

| Store | Purpose |
|---|---|
| `templates` | Print/export page layout templates |
| `seasonalFoods` | Seasonal food data by region/month |
| `pantryStaples` | User's pantry staple items |
| `userLocation` | User's country/region for seasonal data |
| `dietaryProfiles` | Dietary restriction profiles |
| `allergenRules` | Allergen rules linked to dietary profiles |
| `sharedRecipeCache` | Local cache of shared recipes for offline viewing |
| `brandKits` | Brand customization kits |
| `appSettings` | App-level settings (default meal slot times, etc.) |
| `syncServers` | Sync server connection configurations |
| `syncChangeLog` | Tracks changes for offline sync |

### Version Migration History

| Version | Stores Added |
|---|---|
| 1 | `recipes` |
| 2 | `books`, `chapters`, `chapterRecipes`, `categories`, `recipeCategories` |
| 3 | `chapterPages` |
| 4 | `bookPages` |
| 5 | `templates` |
| 6 | `mealPlans`, `dayPlanEntries`, `mealGroups`, `groceryChecklists` |
| 7 | `seasonalFoods`, `pantryStaples`, `userLocation` |
| 8 | `customFoods` |
| 9 | `nutritionProfiles`, `foodLogEntries`, `weightEntries` |
| 10 | `syncServers`, `syncChangeLog` |
| 11 | `dietaryProfiles`, `allergenRules`, `sharedRecipeCache`, `brandKits` |
| 12 | Schemaless changes (new optional fields on `nutritionProfiles`) |
| 13 | `appSettings` |

---

## API Routes and Their Database Interactions

### Go API Server Routes

All routes are defined in `sync-server/server.go:Routes()`. Authentication-required routes use `s.requireAuth()` middleware which validates JWT Bearer tokens or API keys.

#### Authentication (Public)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `POST /api/auth/register` | POST | `registerHandler` | `CreateUser` | `users` |
| `POST /api/auth/login` | POST | `loginHandler` | `GetUserByEmail`, password verify, token create | `users`, `refresh_tokens` |
| `POST /api/auth/refresh` | POST | `refreshHandler` | Token refresh | `refresh_tokens` |

#### Recipes (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/recipes` | GET | `listRecipes` | `ListRecipes` | `recipes`, `ingredients` |
| `POST /api/recipes` | POST | `createRecipe` | `CreateRecipe`, `CreateIngredient` (batch) | `recipes`, `ingredients` |
| `GET /api/recipes/{id}` | GET | `getRecipe` | `GetRecipe` | `recipes`, `ingredients` |
| `PUT /api/recipes/{id}` | PUT | `updateRecipe` | `UpdateRecipe`, `ReplaceIngredients` | `recipes`, `ingredients` |
| `DELETE /api/recipes/{id}` | DELETE | `deleteRecipe` | `DeleteRecipe` | `recipes`, `ingredients` |
| `GET /api/recipes/{id}/ingredients` | GET | via `ingredientRouter` | (reads from recipe) | `ingredients` |
| `POST /api/recipes/{id}/ingredients` | POST | via `ingredientRouter` | `CreateIngredient` | `ingredients` |
| `PUT /api/recipes/{id}/ingredients/{ingId}` | PUT | via `ingredientRouter` | `UpdateIngredient` | `ingredients` |
| `DELETE /api/recipes/{id}/ingredients/{ingId}` | DELETE | via `ingredientRouter` | `DeleteIngredient` | `ingredients` |

#### Food Search (Public)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/foods/search` | GET | `foodSearchHandler` | `SearchFoods` | `food_items` |
| `GET /api/foods/{fdcId}` | GET | `foodItemHandler` | `GetFoodByFdcID` | `food_items` |
| `GET /api/foods/upc/{gtinUpc}` | GET | `foodItemHandler` | `GetFoodByGtinUpc` | `food_items` |

#### Nutrition Profiles (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/profiles` | GET | `profilesRouter` | `ListProfiles` | `person_profiles` |
| `POST /api/profiles` | POST | `profilesRouter` | `CreateProfile` | `person_profiles` |
| `GET /api/profiles/{id}` | GET | `profileItemRouter` | `GetProfile` | `person_profiles` |
| `PUT /api/profiles/{id}` | PUT | `profileItemRouter` | `UpdateProfile` | `person_profiles` |
| `DELETE /api/profiles/{id}` | DELETE | `profileItemRouter` | `DeleteProfile` | `person_profiles` |

#### Food Log (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/profiles/{id}/log` | GET | `foodLogRouter` | `ListFoodLogEntries` | `food_log_entries` |
| `POST /api/profiles/{id}/log` | POST | `foodLogRouter` | `CreateFoodLogEntry` | `food_log_entries` |
| `PUT /api/profiles/{id}/log/{entryId}` | PUT | `foodLogEntryRouter` | `UpdateFoodLogEntry` | `food_log_entries` |
| `DELETE /api/profiles/{id}/log/{entryId}` | DELETE | `foodLogEntryRouter` | `DeleteFoodLogEntry` | `food_log_entries` |

#### Weight Tracking (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/profiles/{id}/weight` | GET | `weightRouter` | `ListWeightEntries` | `weight_entries` |
| `POST /api/profiles/{id}/weight` | POST | `weightRouter` | `CreateWeightEntry` | `weight_entries` |
| `PUT /api/profiles/{id}/weight/{entryId}` | PUT | `weightEntryRouter` | `UpdateWeightEntry` | `weight_entries` |
| `DELETE /api/profiles/{id}/weight/{entryId}` | DELETE | `weightEntryRouter` | `DeleteWeightEntry` | `weight_entries` |

#### Meal Plans (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/meal-plans` | GET | `mealPlansRouter` | `ListMealPlans` | `meal_plans` |
| `POST /api/meal-plans` | POST | `mealPlansRouter` | `CreateMealPlan` | `meal_plans` |
| `GET /api/meal-plans/{id}` | GET | `mealPlanItemRouter` | `GetMealPlan` | `meal_plans` |
| `PUT /api/meal-plans/{id}` | PUT | `mealPlanItemRouter` | `UpdateMealPlan` | `meal_plans` |
| `DELETE /api/meal-plans/{id}` | DELETE | `mealPlanItemRouter` | `DeleteMealPlan` | `meal_plans` |
| `GET /api/meal-plans/{id}/entries` | GET | `dayPlanEntriesRouter` | `ListDayPlanEntries` | `day_plan_entries` |
| `POST /api/meal-plans/{id}/entries` | POST | `dayPlanEntriesRouter` | `CreateDayPlanEntry` | `day_plan_entries` |
| `PUT /api/meal-plans/{id}/entries/{entryId}` | PUT | `dayPlanEntryItemRouter` | `UpdateDayPlanEntry` | `day_plan_entries` |
| `DELETE /api/meal-plans/{id}/entries/{entryId}` | DELETE | `dayPlanEntryItemRouter` | `DeleteDayPlanEntry` | `day_plan_entries` |
| `POST /api/meal-plans/{id}/groups` | POST | `mealGroupsRouter` | `CreateMealGroup` | `meal_groups` |
| `DELETE /api/meal-plans/{id}/groups` | DELETE | `mealGroupsRouter` | `DeleteMealGroup` | `meal_groups` |

#### Books (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/books` | GET | `booksRouter` | `ListBooks` | `recipe_books` |
| `POST /api/books` | POST | `booksRouter` | `CreateBook` | `recipe_books` |
| `GET /api/books/{id}` | GET | `bookItemRouter` | `GetBook` | `recipe_books` |
| `PUT /api/books/{id}` | PUT | `bookItemRouter` | `UpdateBook` | `recipe_books` |
| `DELETE /api/books/{id}` | DELETE | `bookItemRouter` | `DeleteBook` | `recipe_books` |
| `GET /api/books/{id}/chapters` | GET | `chaptersRouter` | `ListChapters` | `chapters` |
| `POST /api/books/{id}/chapters` | POST | `chaptersRouter` | `CreateChapter` | `chapters` |
| `PUT /api/books/{id}/chapters/{chapterId}` | PUT | via `chaptersRouter` | `UpdateChapter` | `chapters` |
| `DELETE /api/books/{id}/chapters/{chapterId}` | DELETE | via `chaptersRouter` | `DeleteChapter` | `chapters` |
| `GET /api/books/{id}/chapters/{chId}/recipes` | GET | `chapterRecipesRouter` | `ListChapterRecipes` | `chapter_recipes` |
| `POST /api/books/{id}/chapters/{chId}/recipes` | POST | `chapterRecipesRouter` | `AddChapterRecipe` | `chapter_recipes` |
| `DELETE /api/books/{id}/chapters/{chId}/recipes` | DELETE | `chapterRecipesRouter` | `RemoveChapterRecipe` | `chapter_recipes` |
| `GET /api/books/{id}/chapters/{chId}/pages` | GET | `chapterPagesRouter` | `ListChapterPages` | `chapter_pages` |
| `POST /api/books/{id}/chapters/{chId}/pages` | POST | `chapterPagesRouter` | `CreateChapterPage` | `chapter_pages` |
| `PUT /api/books/{id}/chapters/{chId}/pages/{pageId}` | PUT | `chapterPagesRouter` | `UpdateChapterPage` | `chapter_pages` |
| `DELETE /api/books/{id}/chapters/{chId}/pages/{pageId}` | DELETE | `chapterPagesRouter` | `DeleteChapterPage` | `chapter_pages` |
| `GET /api/books/{id}/pages` | GET | `bookPagesRouter` | `ListBookPages` | `book_pages` |
| `POST /api/books/{id}/pages` | POST | `bookPagesRouter` | `CreateBookPage` | `book_pages` |

#### Categories (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/categories` | GET | `categoriesRouter` | `ListCategories` | `categories` |
| `POST /api/categories` | POST | `categoriesRouter` | `CreateCategory` | `categories` |
| `PUT /api/categories/{id}` | PUT | `categoryItemRouter` | `UpdateCategory` | `categories` |
| `DELETE /api/categories/{id}` | DELETE | `categoryItemRouter` | `DeleteCategory` | `categories` |

#### Custom Foods (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/custom-foods` | GET | `customFoodsRouter` | `ListCustomFoods` | `custom_foods` |
| `POST /api/custom-foods` | POST | `customFoodsRouter` | `CreateCustomFood` | `custom_foods` |
| `PUT /api/custom-foods/{id}` | PUT | `customFoodItemRouter` | `UpdateCustomFood` | `custom_foods` |
| `DELETE /api/custom-foods/{id}` | DELETE | `customFoodItemRouter` | `DeleteCustomFood` | `custom_foods` |
| `POST /api/custom-foods/{id}/share` | POST | `customFoodItemRouter` | `ShareCustomFood` | `custom_foods` |
| `GET /api/custom-foods/community` | GET | `communityCustomFoodsRouter` | `ListSharedCustomFoods` | `custom_foods` |

#### Grocery Checklists (Auth Required)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/grocery` | GET | `groceryRouter` | `GetGroceryChecklist` | `grocery_checklists` |
| `PUT /api/grocery` | PUT/POST | `groceryRouter` | `UpsertGroceryChecklist` | `grocery_checklists` |

#### Sharing (Auth Required for write, public for read)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `POST /api/share` | POST | `createShare` | `CreateSharedRecipe` | `shared_recipes` |
| `GET /api/share` | GET | `listShares` | `GetSharedRecipesByUser` | `shared_recipes` |
| `GET /api/share/{token}` | GET | `getShareByToken` | `GetSharedRecipeByToken`, `IncrementSharedRecipeViews` | `shared_recipes` |
| `DELETE /api/share/{id}` | DELETE | `deleteShare` | `DeleteSharedRecipe` | `shared_recipes` |
| `GET /api/community` | GET | `communitySearch` | `SearchCommunityRecipes` | `shared_recipes` |
| `GET /api/community/categories` | GET | `communityCategories` | `GetCommunityCategories` | `community_categories` |

#### System (Public)

| Endpoint | Methods | Handler | Store Methods | Tables |
|---|---|---|---|---|
| `GET /api/health` | GET | `health` | none | none |
| `GET /api/about` | GET | `about` | none | none |

### Next.js API Routes (Local Mode)

These routes exist under `src/app/api/` and are used in local-only mode. They interact with the Prisma SQLite database (`src/lib/db.ts`) and IndexedDB (`src/lib/storage.ts`).

#### Food Data Routes (Prisma/SQLite)

| Route | Methods | Purpose | Prisma Model |
|---|---|---|---|
| `/api/foods` | GET | List/search foods | `FoodItem` |
| `/api/foods/search` | GET | Full-text food search | `FoodItem` (FTS5) |
| `/api/foods/seed` | POST | Start USDA data import | `SeedJob` |
| `/api/foods/seed/upload` | POST | Upload USDA data file | `SeedJob`, `FoodItem` |
| `/api/foods/seed/[jobId]` | GET | Check seed job status | `SeedJob` |
| `/api/foods/stats` | GET | Food database stats | `FoodItem` |
| `/api/foods/cache` | GET/DELETE | Food cache management | `FoodItem` |
| `/api/foods/upc` | GET | Lookup by barcode | `FoodItem` |
| `/api/fda/search` | GET | Proxy to USDA FoodData Central API | (external) |

#### Recipe Routes (IndexedDB via LocalApiClient)

| Route | Methods | Purpose | IndexedDB Store |
|---|---|---|---|
| `/api/recipes` | GET, POST | List/create recipes | `recipes` |
| `/api/recipes/[id]` | GET, PUT, DELETE | Recipe CRUD | `recipes`, `ingredients` |
| `/api/recipes/[id]/ingredients` | GET, POST | Ingredient management | `recipes` (nested) |
| `/api/recipes/[id]/ingredients/[ingredientId]` | PUT, DELETE | Ingredient update/delete | `recipes` (nested) |

#### Nutrition Routes (IndexedDB via LocalApiClient)

| Route | Methods | Purpose | IndexedDB Store |
|---|---|---|---|
| `/api/nutrition/log` | GET, POST | Food log entries | `foodLogEntries` |
| `/api/nutrition/log/[id]` | PUT, DELETE | Food log entry CRUD | `foodLogEntries` |
| `/api/nutrition/sync` | POST | Sync nutrition data | multiple |
| `/api/nutrition/profiles` | GET, POST | Nutrition profiles | `nutritionProfiles` |
| `/api/nutrition/profiles/[id]` | GET, PUT, DELETE | Profile CRUD | `nutritionProfiles` |
| `/api/nutrition/weight` | GET, POST | Weight entries | `weightEntries` |
| `/api/nutrition/weight/[id]` | PUT, DELETE | Weight entry CRUD | `weightEntries` |

#### Book/Category Routes (IndexedDB via LocalApiClient)

| Route | Methods | Purpose | IndexedDB Store |
|---|---|---|---|
| `/api/books` | GET, POST | Book list/create | `books` |
| `/api/books/[id]` | GET, PUT, DELETE | Book CRUD | `books` |
| `/api/books/[id]/chapters` | GET, POST | Chapter list/create | `chapters` |
| `/api/books/[id]/chapters/[chapterId]` | PUT, DELETE | Chapter update/delete | `chapters` |
| `/api/books/[id]/chapters/[chapterId]/recipes` | GET, POST, DELETE | Chapter-recipe junction | `chapterRecipes` |
| `/api/books/[id]/chapters/[chapterId]/pages` | GET, POST | Chapter pages | `chapterPages` |
| `/api/books/[id]/chapters/[chapterId]/pages/[pageId]` | PUT, DELETE | Chapter page CRUD | `chapterPages` |
| `/api/categories` | GET, POST | Category list/create | `categories` |
| `/api/categories/[id]` | PUT, DELETE | Category update/delete | `categories` |

#### Sharing Routes (Go API proxy)

| Route | Methods | Purpose | Target |
|---|---|---|---|
| `/api/share` | GET, POST | Recipe sharing | Go API `shared_recipes` |
| `/api/share/[shareId]` | GET, DELETE | Share read/delete | Go API `shared_recipes` |
| `/api/community` | GET | Community search | Go API `shared_recipes` |
| `/api/community/[shareId]` | GET | Community recipe detail | Go API `shared_recipes` |

#### API Key Routes

| Route | Methods | Purpose | Table |
|---|---|---|---|
| `/api/keys` | GET, POST | List/create API keys | `api_keys` |
| `/api/keys/[id]` | DELETE | Delete API key | `api_keys` |

#### AI-Assisted Routes (read-through from existing data)

| Route | Methods | Purpose | Data Sources |
|---|---|---|---|
| `/api/ai/recipes` | GET, POST | AI recipe suggestions | `recipes`, `food_items` |
| `/api/ai/recipes/[id]` | GET | AI recipe detail | `recipes` |
| `/api/ai/books` | GET, POST | AI book suggestions | `books` |
| `/api/ai/categories` | GET | AI category suggestions | `categories` |
| `/api/ai/custom-foods` | GET, POST | AI custom food suggestions | `custom_foods` |
| `/api/ai/foods/search` | GET | AI food search | `food_items` |
| `/api/ai/meal-plans` | GET, POST | AI meal plan suggestions | `meal_plans`, `day_plan_entries` |
| `/api/ai/meal-plans/[id]` | GET | AI meal plan detail | `meal_plans` |
| `/api/ai/meal-plans/week/[date]` | GET | AI weekly plan | `meal_plans`, `day_plan_entries` |
| `/api/ai/meal-plans/[id]/entries` | GET | AI plan entries | `day_plan_entries` |
| `/api/ai/nutrition/log` | GET | AI nutrition log analysis | `food_log_entries` |
| `/api/ai/nutrition/profiles` | GET | AI profile suggestions | `nutrition_profiles` |
| `/api/ai/nutrition/profiles/[id]` | GET | AI profile detail | `nutrition_profiles` |
| `/api/ai/nutrition/weight` | GET | AI weight analysis | `weight_entries` |

---

## Sync Engine

The sync engine bridges the IndexedDB client-side store with the Go API server.

### Source Files

| File | Purpose |
|---|---|
| `src/lib/sync-engine.ts` | Push/pull changes between IndexedDB and Go API |
| `src/lib/sync-store.ts` | Sync state management |
| `src/lib/sync-conflict.ts` | Conflict resolution |
| `src/lib/write-queue.ts` | Offline write queue for Go API |
| `src/lib/read-cache.ts` | Read-through cache for Go API |

### How It Works

1. **Change Tracking**: All writes to IndexedDB are logged in the `syncChangeLog` store with the store name, record ID, action (`create`/`update`/`delete`), and a version number.
2. **Push**: The sync engine reads unsynced changes from `syncChangeLog` (where `synced` is false) and pushes them to the Go API.
3. **Pull**: The sync engine fetches records from the Go API that have been updated since the last sync timestamp and writes them to IndexedDB.
4. **Conflict Resolution**: When both local and remote changes exist for the same record, the sync engine resolves conflicts using a last-write-wins strategy with version checking.

---

## Store Interface (Repository Pattern)

The Go API server uses a repository pattern defined in `sync-server/repository.go`:

```go
type Store interface {
    Close() error
    // Users & Auth (5 methods)
    // Recipes (5 methods)
    // Ingredients (4 methods)
    // Food Items (6 methods)
    // Nutrition profiles (5 methods)
    // Food log entries (4 methods)
    // Weight entries (4 methods)
    // Meal plans (5 methods)
    // Day plan entries (4 methods)
    // Meal groups (3 methods)
    // Recipe books (5 methods)
    // Chapters (5 methods)
    // Chapter recipes (3 methods)
    // Chapter pages (4 methods)
    // Categories (4 methods)
    // Recipe categories (3 methods)
    // Custom foods (6 methods)
    // Grocery checklists (2 methods)
    // Book pages (4 methods)
    // API keys (3 methods)
    // Sharing (9 methods)
    // Total: ~85 methods
}
```

Two implementations:

| Implementation | File | Database |
|---|---|---|
| `PostgresStore` | `store_postgres.go` | PostgreSQL via `pgx/v5` |
| `SQLiteStore` | `store_sqlite.go` | SQLite via `modernc.org/sqlite` |

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DB_DRIVER` | `postgres` | Go server: `postgres` or `sqlite` |
| `DATABASE_URL` | — | PostgreSQL connection string or SQLite file path |
| `DB_PATH` | `./sync.db` | SQLite file path for Go server |
| `NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY` | `false` | Frontend: use local IndexedDB/Prisma vs. Go API |
| `HMAC_SECRET` | random UUID | JWT signing key |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `MAX_BODY_MB` | `10` | Max request body size |

---

## File Reference

All database-related source files:

```
sync-server/
  models.go                          # Go struct definitions (all domain models + DTOs)
  repository.go                      # Store interface (repository contract)
  store_postgres.go                  # PostgresStore implementation
  store_sqlite.go                    # SQLiteStore implementation + inline schema
  server.go                          # HTTP route registration
  handlers_crud.go                   # CRUD handlers (recipes, profiles, books, etc.)
  handlers_food.go                   # Food search handlers
  handlers_sharing.go                # Sharing/community handlers
  auth.go                            # JWT auth service
  migrate.go                         # Embedded migration runner
  migrations/
    000001_init.up.sql               # users, devices, api_keys, refresh_tokens
    000002_recipes.up.sql            # recipes, ingredients
    000003_foods.up.sql              # food_items, custom_foods, seed_jobs
    000004_nutrition.up.sql          # person_profiles, food_log_entries, weight_entries
    000005_meal_plans.up.sql         # meal_plans, day_plan_entries, meal_groups, grocery_checklists
    000006_books.up.sql              # categories, recipe_books, chapters, chapter_recipes, chapter_pages, book_pages, recipe_categories
    000007_sharing.up.sql            # shared_recipes, recipe_ratings, community_categories
    000008_fts.up.sql                # tsvector + GIN index + trigger on food_items

prisma/
  schema.prisma                      # Prisma schema (18 models, SQLite)
  dev.db                             # Dev SQLite database
  fts5-setup.sql                     # FTS5 virtual table + triggers
  migrations/
    20260422_add_food_item_fts5/     # FTS5 migration

src/lib/
  db.ts                              # Prisma client + ensureSchema() + runtime migrations
  storage.ts                         # IndexedDB layer (DietLedgerDB, 25 stores, v13)
  api-client.ts                      # ApiClient interface + factory
  api-client-local.ts                # LocalApiClient (IndexedDB)
  api-client-go.ts                   # GoApiClient (HTTP + JWT + write queue + read cache)
  write-queue.ts                     # Offline write queue
  read-cache.ts                      # Read-through cache
  sync-engine.ts                     # Sync engine (push/pull)
  sync-store.ts                      # Sync state management
  sync-conflict.ts                   # Conflict resolution
  proxy.ts                           # Next.js middleware proxy to Go API
```
