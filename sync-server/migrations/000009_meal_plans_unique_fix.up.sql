ALTER TABLE meal_plans DROP CONSTRAINT IF EXISTS meal_plans_week_start_key;
CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_user_week_unique ON meal_plans(user_id, week_start);
