CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    servings INT NOT NULL DEFAULT 1,
    serving_name TEXT NOT NULL DEFAULT 'serving',
    instructions TEXT,
    leftover_storage TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_updated_at ON recipes(updated_at);

CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    fdc_id INT NOT NULL,
    name TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    unit TEXT NOT NULL,
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
    potassium DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON ingredients(recipe_id);

-- recipe_categories created in 000006_books after categories table exists
