ALTER TABLE recipes ADD COLUMN description TEXT;
ALTER TABLE ingredients ADD COLUMN missing_nutrients JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missing_nutrients) = 'array');

-- A separate one-to-one record makes authoritative published totals explicit.
-- The Go API validates the complete canonical nutrient/source contract.
CREATE TABLE custom_recipe_nutrition (
    recipe_id TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
    facts JSONB NOT NULL,
    CONSTRAINT custom_recipe_nutrition_basis CHECK (facts->>'basis' = 'recipeTotal'),
    CONSTRAINT custom_recipe_nutrition_object CHECK (jsonb_typeof(facts) = 'object')
);
