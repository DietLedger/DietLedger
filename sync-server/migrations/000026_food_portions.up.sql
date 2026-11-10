-- USDA food-specific portion gram weights for accurate presentation conversions.
ALTER TABLE food_items ADD COLUMN portions JSONB NOT NULL DEFAULT '[]'::jsonb;
