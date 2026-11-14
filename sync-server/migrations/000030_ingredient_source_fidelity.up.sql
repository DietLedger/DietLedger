ALTER TABLE ingredients
    ADD COLUMN position INT,
    ADD COLUMN zero_nutrition_override BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN unresolved_source_ref JSONB,
    ADD COLUMN unconfirmed_nutrition JSONB;

WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY recipe_id ORDER BY id) - 1 AS position
    FROM ingredients
)
UPDATE ingredients i SET position = ordered.position FROM ordered WHERE ordered.id = i.id;

ALTER TABLE ingredients ALTER COLUMN position SET NOT NULL;
ALTER TABLE ingredients ALTER COLUMN position SET DEFAULT 0;

UPDATE ingredients
SET zero_nutrition_override = TRUE
WHERE COALESCE(source_type, 'manual') = 'manual'
  AND fdc_id = -3
  AND source_key IS NULL
  AND linked_recipe_id IS NULL
  AND calories = 0 AND total_fat = 0 AND saturated_fat = 0 AND trans_fat = 0
  AND cholesterol = 0 AND sodium = 0 AND total_carbs = 0 AND dietary_fiber = 0
  AND total_sugars = 0 AND added_sugars = 0 AND protein = 0 AND vitamin_d = 0
  AND calcium = 0 AND iron = 0 AND potassium = 0;

ALTER TABLE ingredients ADD CONSTRAINT ingredients_zero_override_valid CHECK (
    NOT zero_nutrition_override OR (
        COALESCE(source_type, 'manual') = 'manual' AND fdc_id = -3
        AND source_key IS NULL AND linked_recipe_id IS NULL AND unresolved_source_ref IS NULL
        AND calories = 0 AND total_fat = 0 AND saturated_fat = 0 AND trans_fat = 0
        AND cholesterol = 0 AND sodium = 0 AND total_carbs = 0 AND dietary_fiber = 0
        AND total_sugars = 0 AND added_sugars = 0 AND protein = 0 AND vitamin_d = 0
        AND calcium = 0 AND iron = 0 AND potassium = 0
    )
);

CREATE INDEX idx_ingredients_recipe_position ON ingredients(recipe_id, position, id);
