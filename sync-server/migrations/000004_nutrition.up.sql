CREATE TABLE IF NOT EXISTS person_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
    birth_date TEXT,
    height_cm DOUBLE PRECISION,
    activity_level TEXT NOT NULL DEFAULT 'moderate' CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'veryActive')),
    goal_weight_kg DOUBLE PRECISION,
    goal_date TEXT,
    bmr_equation TEXT,
    manual_bmr_value DOUBLE PRECISION,
    calorie_target DOUBLE PRECISION,
    protein_goal_g DOUBLE PRECISION,
    carbs_goal_g DOUBLE PRECISION,
    fat_goal_g DOUBLE PRECISION,
    fiber_goal_g DOUBLE PRECISION,
    sodium_max_mg DOUBLE PRECISION,
    sugar_max_g DOUBLE PRECISION,
    vitamin_d_goal_ug DOUBLE PRECISION,
    calcium_goal_mg DOUBLE PRECISION,
    iron_goal_mg DOUBLE PRECISION,
    potassium_goal_mg DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON person_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON person_profiles(updated_at);

CREATE TABLE IF NOT EXISTS food_log_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES person_profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    time TEXT,
    meal_slot TEXT NOT NULL CHECK (meal_slot IN ('morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night', 'snack')),
    source_type TEXT NOT NULL CHECK (source_type IN ('recipe', 'customFood', 'manual')),
    source_id TEXT,
    name TEXT NOT NULL,
    servings DOUBLE PRECISION NOT NULL DEFAULT 1,
    serving_amount DOUBLE PRECISION,
    serving_unit TEXT,
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
CREATE INDEX IF NOT EXISTS idx_food_log_profile_id ON food_log_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_food_log_date ON food_log_entries(date);
CREATE INDEX IF NOT EXISTS idx_food_log_profile_date ON food_log_entries(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_food_log_source ON food_log_entries(source_type, source_id);

CREATE TABLE IF NOT EXISTS weight_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES person_profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    weight_kg DOUBLE PRECISION NOT NULL,
    notes TEXT,
    blood_sugar DOUBLE PRECISION,
    blood_pressure_systolic DOUBLE PRECISION,
    blood_pressure_diastolic DOUBLE PRECISION,
    measurement_context TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(profile_id, date)
);
CREATE INDEX IF NOT EXISTS idx_weight_profile_id ON weight_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_weight_date ON weight_entries(date);
