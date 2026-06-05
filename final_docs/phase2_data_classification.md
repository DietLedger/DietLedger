# Phase 2: Client-Persisted Data Classification

Status: Complete
Date: 2026-06-05

## Classification Checklist

Every data type currently stored outside PostgreSQL, classified and mapped to its server destination.

### Persistent User Data (MUST move to PostgreSQL)

| # | Data Type | Current Storage | Go API Destination | PostgreSQL Table | Notes |
|---|---|---|---|---|---|
| 1 | App settings (meal slot times, unit system, theme) | IndexedDB `appSettings` + localStorage | `GET/PUT /api/settings` | `user_settings` | Per-account. Includes unit system and theme. |
| 2 | Templates | IndexedDB `templates` | `GET/POST/PUT/DELETE /api/templates` | `templates` | User-owned or system default. 6 defaults seeded via migration. |
| 3 | Dietary profiles | IndexedDB `dietaryProfiles` | `GET/POST/PUT/DELETE /api/dietary-profiles` | `dietary_profiles` | User-owned. Complex JSON fields for arrays. |
| 4 | Allergen rules | IndexedDB `allergenRules` | `GET/POST/PUT/DELETE /api/dietary-profiles/{id}/allergen-rules` | `allergen_rules` | Scoped to dietary profile and user. |
| 5 | Brand kits | IndexedDB `brandKits` | `GET/POST/PUT/DELETE /api/brand-kits` | `brand_kits` | User-owned. Logo stored as data URL. |
| 6 | Pantry staples | IndexedDB `pantryStaples` | `GET/POST/DELETE /api/pantry-staples` | `pantry_staples` | Per-account list. Default staples seeded. |
| 7 | User location | IndexedDB `userLocation` | `GET/PUT /api/settings/location` | `user_locations` | One row per user. Country + region. |
| 8 | Seasonal foods | IndexedDB `seasonalFoods` | `GET /api/settings/seasonal-foods` | `seasonal_foods` | Shared reference data, not per-user. Seeded from `seasonal-produce.ts`. |
| 9 | FDA API key (user secret) | localStorage `dietledger-fda-api-key` | `POST/GET/DELETE /api/secrets` | `user_secrets` | Encrypted at rest. Separate from auth `api_keys` table. |

### Cache / UI State (acceptable in localStorage per system requirements)

| # | Data Type | Current Storage | Decision | Notes |
|---|---|---|---|---|
| 1 | JWT access token | localStorage `dietledger_access_token` | Keep in localStorage | Auth token, not persistent data. |
| 2 | JWT refresh token | localStorage `dietledger_refresh_token` | Keep in localStorage | Auth token, not persistent data. |
| 3 | Unit system preference | localStorage `dietledger-unit-system` | Move to app settings (item 1) | Must follow user across devices. |
| 4 | Theme preference | localStorage `dietledger-theme` | Move to app settings (item 1) | Must follow user across devices. |

### Not Phase 2 Scope (handled in later phases)

| # | Data Type | Current Storage | Phase | Notes |
|---|---|---|---|---|
| 1 | Sync server configs | IndexedDB `syncServers` | Phase 3 | Removed with sync infrastructure. |
| 2 | Sync change log | IndexedDB `syncChangeLog` | Phase 3 | Removed with sync infrastructure. |
| 3 | Shared recipe cache | IndexedDB `sharedRecipeCache` | Phase 4 | Cache of server data, removed with IndexedDB. |

## Storage Points Confirmed

Search confirms all client persistence points are accounted for:

- `src/lib/storage.ts` — IndexedDB stores: `appSettings`, `templates`, `dietaryProfiles`, `allergenRules`, `brandKits`, `pantryStaples`, `userLocation`, `seasonalFoods`
- `src/lib/storage.ts` — localStorage: `dietledger-fda-api-key`
- `src/lib/api-client-go.ts` — localStorage: `dietledger_access_token`, `dietledger_refresh_token`
- `src/lib/unit-conversion.ts` — localStorage: `dietledger-unit-system`
- `src/hooks/use-app-theme.ts` — localStorage: `dietledger-theme`

## PostgreSQL Table Design

### user_settings
```sql
CREATE TABLE user_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    settings_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### templates
```sql
CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('recipe','book-page','book-recipe')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    layout_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_type ON templates(type);
```

### dietary_profiles
```sql
CREATE TABLE dietary_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    allergens_json JSONB NOT NULL DEFAULT '[]',
    dietary_tags_json JSONB NOT NULL DEFAULT '[]',
    nutrient_thresholds_json JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dietary_profiles_user_id ON dietary_profiles(user_id);
```

### allergen_rules
```sql
CREATE TABLE allergen_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES dietary_profiles(id) ON DELETE CASCADE,
    allergen TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('avoid','caution')),
    custom_keywords_json JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_allergen_rules_profile_id ON allergen_rules(profile_id);
CREATE INDEX idx_allergen_rules_user_id ON allergen_rules(user_id);
```

### brand_kits
```sql
CREATE TABLE brand_kits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    logo_data_url TEXT,
    primary_color TEXT NOT NULL DEFAULT '#000000',
    secondary_color TEXT NOT NULL DEFAULT '#333333',
    font_family TEXT NOT NULL DEFAULT 'sans-serif',
    tagline TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_brand_kits_user_id ON brand_kits(user_id);
```

### pantry_staples
```sql
CREATE TABLE pantry_staples (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
);
CREATE INDEX idx_pantry_staples_user_id ON pantry_staples(user_id);
```

### user_locations
```sql
CREATE TABLE user_locations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### seasonal_foods
```sql
CREATE TABLE seasonal_foods (
    id TEXT PRIMARY KEY,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    foods_json JSONB NOT NULL DEFAULT '[]',
    UNIQUE(country, region, month)
);
```

### user_secrets
```sql
CREATE TABLE user_secrets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_name TEXT NOT NULL,
    encrypted_value BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, key_name)
);
CREATE INDEX idx_user_secrets_user_id ON user_secrets(user_id);
```
