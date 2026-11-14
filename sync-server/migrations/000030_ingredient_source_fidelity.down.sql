DROP INDEX IF EXISTS idx_ingredients_recipe_position;
ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_zero_override_valid;
ALTER TABLE ingredients
    DROP COLUMN IF EXISTS unconfirmed_nutrition,
    DROP COLUMN IF EXISTS unresolved_source_ref,
    DROP COLUMN IF EXISTS zero_nutrition_override,
    DROP COLUMN IF EXISTS position;
