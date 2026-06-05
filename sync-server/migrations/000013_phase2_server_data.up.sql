CREATE TABLE IF NOT EXISTS user_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    settings_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('recipe','book-page','book-recipe')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    layout_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);

CREATE TABLE IF NOT EXISTS dietary_profiles (
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
CREATE INDEX IF NOT EXISTS idx_dietary_profiles_user_id ON dietary_profiles(user_id);

CREATE TABLE IF NOT EXISTS allergen_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES dietary_profiles(id) ON DELETE CASCADE,
    allergen TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('avoid','caution')),
    custom_keywords_json JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_allergen_rules_profile_id ON allergen_rules(profile_id);
CREATE INDEX IF NOT EXISTS idx_allergen_rules_user_id ON allergen_rules(user_id);

CREATE TABLE IF NOT EXISTS brand_kits (
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
CREATE INDEX IF NOT EXISTS idx_brand_kits_user_id ON brand_kits(user_id);

CREATE TABLE IF NOT EXISTS pantry_staples (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_pantry_staples_user_id ON pantry_staples(user_id);

CREATE TABLE IF NOT EXISTS user_locations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seasonal_foods (
    id TEXT PRIMARY KEY,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    foods_json JSONB NOT NULL DEFAULT '[]',
    UNIQUE(country, region, month)
);

CREATE TABLE IF NOT EXISTS user_secrets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_name TEXT NOT NULL,
    encrypted_value BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, key_name)
);
CREATE INDEX IF NOT EXISTS idx_user_secrets_user_id ON user_secrets(user_id);
