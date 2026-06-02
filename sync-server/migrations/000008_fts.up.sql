ALTER TABLE food_items ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE food_items SET search_vector = to_tsvector('english', COALESCE(description, '') || ' ' || COALESCE(brand_owner, ''));

CREATE INDEX IF NOT EXISTS idx_food_items_search ON food_items USING GIN(search_vector);

CREATE OR REPLACE FUNCTION food_items_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.brand_owner, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_food_items_search_vector
    BEFORE INSERT OR UPDATE OF description, brand_owner ON food_items
    FOR EACH ROW EXECUTE FUNCTION food_items_search_vector_update();
