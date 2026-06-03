CREATE TABLE IF NOT EXISTS meal_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    week_start TEXT NOT NULL UNIQUE,
    slot_times TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_week_start ON meal_plans(week_start);

CREATE TABLE IF NOT EXISTS day_plan_entries (
    id TEXT PRIMARY KEY,
    meal_plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night')),
    recipe_id TEXT,
    position INT NOT NULL DEFAULT 0,
    group_id TEXT,
    servings DOUBLE PRECISION NOT NULL DEFAULT 1,
    is_leftover BOOLEAN NOT NULL DEFAULT FALSE,
    source_type TEXT NOT NULL DEFAULT 'recipe',
    food_name TEXT,
    calories DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    saturated_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    trans_fat DOUBLE PRECISION NOT NULL DEFAULT 0,
    cholesterol DOUBLE PRECISION NOT NULL DEFAULT 0,
    sodium DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_carbs DOUBLE PRECISION NOT NULL DEFAULT 0,
    dietary_fiber DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_sugars DOUBLE PRECISION NOT NULL DEFAULT 0,
    added_sugars DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein DOUBLE PRECISION NOT NULL DEFAULT 0,
    vitamin_d DOUBLE PRECISION NOT NULL DEFAULT 0,
    calcium DOUBLE PRECISION NOT NULL DEFAULT 0,
    iron DOUBLE PRECISION NOT NULL DEFAULT 0,
    potassium DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_day_plan_meal_plan_id ON day_plan_entries(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_day_plan_date ON day_plan_entries(date);

CREATE TABLE IF NOT EXISTS meal_groups (
    id TEXT PRIMARY KEY,
    meal_plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    slot TEXT NOT NULL,
    name TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_meal_groups_meal_plan_id ON meal_groups(meal_plan_id);

CREATE TABLE IF NOT EXISTS grocery_checklists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    checked_items TEXT NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_grocery_week_start ON grocery_checklists(week_start);
