-- Import-only staging. No existing main recipes are moved or reclassified.
CREATE TABLE recipe_import_batches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_hash TEXT NOT NULL,
    accepted BOOLEAN NOT NULL DEFAULT FALSE,
    materialized BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    context JSONB NOT NULL,
    placements JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, request_hash)
);
CREATE TABLE recipe_import_staged (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES recipe_import_batches(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portable_id TEXT NOT NULL,
    bundle_recipe_id TEXT NOT NULL,
    recipe JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, portable_id),
    UNIQUE (batch_id, bundle_recipe_id)
);
CREATE INDEX recipe_import_staged_owner ON recipe_import_staged(user_id, created_at, id);
-- Successful repair receipts survive promotion for response-loss retries.
CREATE TABLE recipe_import_resolutions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    staged_recipe_id TEXT NOT NULL,
    ingredient_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    PRIMARY KEY (user_id, staged_recipe_id, ingredient_id, payload_hash)
);
