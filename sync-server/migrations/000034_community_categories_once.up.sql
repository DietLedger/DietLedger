-- Community defaults are provisioned once, never on startup after a reset.
-- Existing category identities survive upgrades via the unique slug.
INSERT INTO community_categories (id, name, slug) VALUES
    (gen_random_uuid()::text, 'Breakfast', 'breakfast'),
    (gen_random_uuid()::text, 'Lunch', 'lunch'),
    (gen_random_uuid()::text, 'Dinner', 'dinner'),
    (gen_random_uuid()::text, 'Desserts', 'desserts'),
    (gen_random_uuid()::text, 'Snacks', 'snacks'),
    (gen_random_uuid()::text, 'Beverages', 'beverages'),
    (gen_random_uuid()::text, 'Appetizers', 'appetizers'),
    (gen_random_uuid()::text, 'Soups', 'soups'),
    (gen_random_uuid()::text, 'Salads', 'salads'),
    (gen_random_uuid()::text, 'Sides', 'sides')
ON CONFLICT (slug) DO NOTHING;
