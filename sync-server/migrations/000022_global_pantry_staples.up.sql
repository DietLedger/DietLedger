-- Global pantry staples: a shared, read-only default list alongside the
-- per-account staples. Account staples keep user_id; globals use NULL.
ALTER TABLE pantry_staples ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE pantry_staples ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;

-- Replace the old UNIQUE(user_id, name) with partial uniqueness:
-- global names unique among globals; account names unique per user.
ALTER TABLE pantry_staples DROP CONSTRAINT IF EXISTS pantry_staples_user_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS pantry_staples_global_name_key
    ON pantry_staples(name) WHERE is_global = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS pantry_staples_user_name_key
    ON pantry_staples(user_id, name) WHERE is_global = FALSE;

-- Seed the default global staple list (matches DEFAULT_PANTRY_STAPLES in the UI).
INSERT INTO pantry_staples (id, user_id, name, is_global) VALUES
    (gen_random_uuid(), NULL, 'All-purpose flour', TRUE),
    (gen_random_uuid(), NULL, 'Sugar', TRUE),
    (gen_random_uuid(), NULL, 'Salt', TRUE),
    (gen_random_uuid(), NULL, 'Pepper', TRUE),
    (gen_random_uuid(), NULL, 'Olive oil', TRUE),
    (gen_random_uuid(), NULL, 'Butter', TRUE),
    (gen_random_uuid(), NULL, 'Eggs', TRUE),
    (gen_random_uuid(), NULL, 'Milk', TRUE),
    (gen_random_uuid(), NULL, 'Onions', TRUE),
    (gen_random_uuid(), NULL, 'Garlic', TRUE),
    (gen_random_uuid(), NULL, 'Rice', TRUE),
    (gen_random_uuid(), NULL, 'Pasta', TRUE),
    (gen_random_uuid(), NULL, 'Tomato paste', TRUE),
    (gen_random_uuid(), NULL, 'Chicken broth', TRUE),
    (gen_random_uuid(), NULL, 'Soy sauce', TRUE)
ON CONFLICT DO NOTHING;
