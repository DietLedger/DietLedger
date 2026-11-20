-- Provision the opt-in Diabetes-aware starter profile once for accounts that
-- already exist. There is intentionally no read-time reseeding.
INSERT INTO dietary_profiles (
    id, user_id, name, allergens_json, dietary_tags_json,
    nutrient_thresholds_json, is_active, created_at, updated_at
)
SELECT
    gen_random_uuid()::text,
    u.id,
    'Diabetes-aware',
    '[]'::jsonb,
    '["diabetesAware"]'::jsonb,
    '[{"nutrient":"sodium","dailyMax":2300,"alertLevel":"warning"},{"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"}]'::jsonb,
    FALSE,
    NOW(),
    NOW()
FROM users u;
