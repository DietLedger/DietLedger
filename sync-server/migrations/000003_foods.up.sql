CREATE TABLE IF NOT EXISTS food_items (
    id SERIAL PRIMARY KEY,
    fdc_id INT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    data_type TEXT NOT NULL,
    brand_owner TEXT,
    gtin_upc TEXT,
    serving_size DOUBLE PRECISION NOT NULL DEFAULT 100,
    serving_size_unit TEXT NOT NULL DEFAULT 'g',
    calories DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    saturated_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    trans_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    cholesterol DOUBLE PRECISION NOT NULL DEFAULT 0,
    sodium DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_carbs DOUBLE PRECISION NOT NULL DEFAULT 0,
    dietary_fiber DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sugars DOUBLE PRECISION NOT NULL DEFAULT 0,
    added_sugars DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein DOUBLE PRECISION NOT NULL DEFAULT 0,
    vitamin_d DOUBLE PRECISION NOT NULL DEFAULT 0,
    calcium DOUBLE PRECISION NOT NULL DEFAULT 0,
    iron DOUBLE PRECISION NOT NULL DEFAULT 0,
    potassium DOUBLE PRECISION NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'usda',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_food_items_description ON food_items(description);
CREATE INDEX IF NOT EXISTS idx_food_items_data_type ON food_items(data_type);
CREATE INDEX IF NOT EXISTS idx_food_items_gtin_upc ON food_items(gtin_upc);

CREATE TABLE IF NOT EXISTS custom_foods (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    calories DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    saturated_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    trans_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    cholesterol DOUBLE PRECISION NOT NULL DEFAULT 0,
    sodium DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_carbs DOUBLE PRECISION NOT NULL DEFAULT 0,
    dietary_fiber DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sugars DOUBLE PRECISION NOT NULL DEFAULT 0,
    added_sugars DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein DOUBLE PRECISION NOT NULL DEFAULT 0,
    vitamin_d DOUBLE PRECISION NOT NULL DEFAULT 0,
    calcium DOUBLE PRECISION NOT NULL DEFAULT 0,
    iron DOUBLE PRECISION NOT NULL DEFAULT 0,
    potassium DOUBLE PRECISION NOT NULL DEFAULT 0,
    shared_with_community BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_foods_user_id ON custom_foods(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_foods_name ON custom_foods(name);
CREATE INDEX IF NOT EXISTS idx_custom_foods_shared ON custom_foods(shared_with_community) WHERE shared_with_community = TRUE;

CREATE TABLE IF NOT EXISTS seed_jobs (
    id SERIAL PRIMARY KEY,
    data_type TEXT NOT NULL,
    release_date TEXT NOT NULL,
    file_name TEXT NOT NULL,
    record_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    progress DOUBLE PRECISION NOT NULL DEFAULT 0,
    error TEXT,
    checkpoint TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
