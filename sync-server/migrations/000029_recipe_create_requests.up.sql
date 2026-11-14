-- Reserve a retry key in the same transaction as the recipe and its ingredients.
-- The deferred reference permits claiming the key before inserting the recipe;
-- the primary key serializes simultaneous retries until the first transaction ends.
CREATE TABLE recipe_create_requests (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL,
    request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    PRIMARY KEY (user_id, request_key)
);
CREATE INDEX idx_recipe_create_requests_recipe_id ON recipe_create_requests(recipe_id);
