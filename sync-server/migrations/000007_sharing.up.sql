CREATE TABLE IF NOT EXISTS shared_recipes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL,
    share_token TEXT UNIQUE NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    tags TEXT DEFAULT '',
    recipe_data TEXT NOT NULL,
    view_count INT DEFAULT 0,
    import_count INT DEFAULT 0,
    average_rating DOUBLE PRECISION DEFAULT 0,
    rating_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shared_recipes_user_id ON shared_recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_recipes_token ON shared_recipes(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_recipes_public ON shared_recipes(is_public) WHERE is_public = TRUE;

CREATE TABLE IF NOT EXISTS recipe_ratings (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES shared_recipes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(recipe_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_recipe_id ON recipe_ratings(recipe_id);

CREATE TABLE IF NOT EXISTS community_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL
);
