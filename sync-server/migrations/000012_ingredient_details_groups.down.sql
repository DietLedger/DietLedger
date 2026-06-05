ALTER TABLE ingredients DROP COLUMN IF EXISTS description;
ALTER TABLE ingredients DROP COLUMN IF EXISTS group_id;
ALTER TABLE ingredients DROP COLUMN IF EXISTS linked_recipe_id;
ALTER TABLE recipes DROP COLUMN IF EXISTS ingredient_groups;
