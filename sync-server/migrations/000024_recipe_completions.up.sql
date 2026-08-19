-- Recipe completion ("recipe X was cooked on date Y"), previously stored in
-- browser localStorage ('kitchen-helper-completed') by the Kitchen Helper
-- and the meal-plan week page. Server-side so it survives devices/logouts.
-- One row per user+recipe holding the LATEST completion (matching the old
-- map-overwrite semantics); completed_by is recorded for future
-- family-account attribution.
CREATE TABLE IF NOT EXISTS recipe_completions (
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id      TEXT NOT NULL,
    completed_date DATE NOT NULL,
    completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, recipe_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_completions_user ON recipe_completions(user_id);
