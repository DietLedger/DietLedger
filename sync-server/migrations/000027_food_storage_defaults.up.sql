CREATE TABLE food_storage_defaults (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('usda', 'custom_food')),
    source_key TEXT NOT NULL CHECK (source_key <> ''),
    -- Cascades when a custom food is deleted; USDA items have no custom-food reference.
    custom_food_id TEXT REFERENCES custom_foods(id) ON DELETE CASCADE,
    location TEXT NOT NULL CHECK (location IN ('Pantry', 'Refrigerator', 'Freezer', 'Countertop')),
    PRIMARY KEY (user_id, source_type, source_key),
    CHECK ((source_type = 'custom_food' AND custom_food_id IS NOT NULL AND custom_food_id = source_key)
        OR (source_type = 'usda' AND custom_food_id IS NULL))
);
