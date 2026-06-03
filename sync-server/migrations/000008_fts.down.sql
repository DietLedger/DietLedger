DROP TRIGGER IF EXISTS trg_food_items_search_vector ON food_items;
DROP FUNCTION IF EXISTS food_items_search_vector_update;
DROP INDEX IF EXISTS idx_food_items_search;
ALTER TABLE food_items DROP COLUMN IF EXISTS search_vector;
