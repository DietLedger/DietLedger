DROP INDEX IF EXISTS meal_plans_user_week_unique;
ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_week_start_key UNIQUE (week_start);
