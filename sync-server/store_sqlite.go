package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

type SQLiteStore struct {
	db *sql.DB
}

func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(1)
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA cache_size=10000",
		"PRAGMA busy_timeout=5000",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, fmt.Errorf("set pragma %s: %w", p, err)
		}
	}
	return &SQLiteStore{db: db}, nil
}

func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

func (s *SQLiteStore) DB() *sql.DB {
	return s.db
}

func (s *SQLiteStore) InitDB() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE NOT NULL,
		display_name TEXT,
		password_hash TEXT NOT NULL,
		api_key TEXT UNIQUE NOT NULL,
		last_login_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS recipes (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT NOT NULL,
		servings INT NOT NULL DEFAULT 1,
		serving_name TEXT NOT NULL DEFAULT 'serving',
		instructions TEXT,
		leftover_storage TEXT,
		ingredient_groups TEXT NOT NULL DEFAULT '[]',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);
	CREATE INDEX IF NOT EXISTS idx_recipes_updated_at ON recipes(updated_at);
	CREATE TABLE IF NOT EXISTS ingredients (
		id TEXT PRIMARY KEY,
		recipe_id TEXT NOT NULL,
		fdc_id INT NOT NULL,
		name TEXT NOT NULL,
		amount REAL NOT NULL,
		unit TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		calories REAL DEFAULT 0, total_fat REAL DEFAULT 0, saturated_fat REAL DEFAULT 0,
		trans_fat REAL DEFAULT 0, cholesterol REAL DEFAULT 0, sodium REAL DEFAULT 0,
		total_carbs REAL DEFAULT 0, dietary_fiber REAL DEFAULT 0, total_sugars REAL DEFAULT 0,
		added_sugars REAL DEFAULT 0, protein REAL DEFAULT 0, vitamin_d REAL DEFAULT 0,
		calcium REAL DEFAULT 0, iron REAL DEFAULT 0, potassium REAL DEFAULT 0,
		group_id TEXT,
		linked_recipe_id TEXT,
		prep_instructions TEXT NOT NULL DEFAULT '[]',
		storage_location TEXT NOT NULL DEFAULT '',
		FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON ingredients(recipe_id);
	CREATE TABLE IF NOT EXISTS person_profiles (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT NOT NULL,
		sex TEXT NOT NULL,
		birth_date TEXT, height_cm REAL,
		activity_level TEXT DEFAULT 'moderate',
		goal_weight_kg REAL, goal_date TEXT,
		bmr_equation TEXT, manual_bmr_value REAL, calorie_target REAL,
		protein_goal_g REAL, carbs_goal_g REAL, fat_goal_g REAL, fiber_goal_g REAL,
		sodium_max_mg REAL, sugar_max_g REAL, vitamin_d_goal_ug REAL,
		calcium_goal_mg REAL, iron_goal_mg REAL, potassium_goal_mg REAL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON person_profiles(user_id);
	CREATE TABLE IF NOT EXISTS food_log_entries (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		profile_id TEXT NOT NULL,
		date TEXT NOT NULL,
		time TEXT,
		meal_slot TEXT NOT NULL,
		source_type TEXT NOT NULL,
		source_id TEXT,
		name TEXT NOT NULL,
		servings REAL DEFAULT 1,
		serving_amount REAL, serving_unit TEXT,
		calories REAL DEFAULT 0, total_fat REAL DEFAULT 0, saturated_fat REAL DEFAULT 0,
		trans_fat REAL DEFAULT 0, cholesterol REAL DEFAULT 0, sodium REAL DEFAULT 0,
		total_carbs REAL DEFAULT 0, dietary_fiber REAL DEFAULT 0, total_sugars REAL DEFAULT 0,
		added_sugars REAL DEFAULT 0, protein REAL DEFAULT 0, vitamin_d REAL DEFAULT 0,
		calcium REAL DEFAULT 0, iron REAL DEFAULT 0, potassium REAL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (profile_id) REFERENCES person_profiles(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_fle_profile_id ON food_log_entries(profile_id);
	CREATE INDEX IF NOT EXISTS idx_fle_date ON food_log_entries(date);
	CREATE INDEX IF NOT EXISTS idx_fle_profile_date ON food_log_entries(profile_id, date);
	CREATE TABLE IF NOT EXISTS weight_entries (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		profile_id TEXT NOT NULL,
		date TEXT NOT NULL,
		weight_kg REAL NOT NULL,
		notes TEXT,
		blood_sugar REAL, blood_pressure_systolic REAL, blood_pressure_diastolic REAL,
		measurement_context TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (profile_id) REFERENCES person_profiles(id) ON DELETE CASCADE,
		UNIQUE(profile_id, date)
	);
	CREATE INDEX IF NOT EXISTS idx_we_profile_id ON weight_entries(profile_id);
	CREATE INDEX IF NOT EXISTS idx_we_date ON weight_entries(date);
	CREATE TABLE IF NOT EXISTS meal_plans (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT NOT NULL,
		week_start TEXT NOT NULL,
		slot_times TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE(user_id, week_start)
	);
	CREATE INDEX IF NOT EXISTS idx_mp_user_id ON meal_plans(user_id);
	CREATE TABLE IF NOT EXISTS day_plan_entries (
		id TEXT PRIMARY KEY,
		meal_plan_id TEXT NOT NULL,
		date TEXT NOT NULL,
		slot TEXT NOT NULL,
		recipe_id TEXT,
		position INT DEFAULT 0,
		group_id TEXT,
		servings REAL DEFAULT 1,
		is_leftover INT DEFAULT 0,
		source_type TEXT DEFAULT 'recipe',
		food_name TEXT,
		calories REAL DEFAULT 0, total_fat REAL DEFAULT 0, saturated_fat REAL DEFAULT 0,
		trans_fat REAL DEFAULT 0, cholesterol REAL DEFAULT 0, sodium REAL DEFAULT 0,
		total_carbs REAL DEFAULT 0, dietary_fiber REAL DEFAULT 0, total_sugars REAL DEFAULT 0,
		added_sugars REAL DEFAULT 0, protein REAL DEFAULT 0, vitamin_d REAL DEFAULT 0,
		calcium REAL DEFAULT 0, iron REAL DEFAULT 0, potassium REAL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_dpe_meal_plan_id ON day_plan_entries(meal_plan_id);
	CREATE TABLE IF NOT EXISTS meal_groups (
		id TEXT PRIMARY KEY,
		meal_plan_id TEXT NOT NULL,
		date TEXT NOT NULL,
		slot TEXT NOT NULL,
		name TEXT NOT NULL,
		position INT DEFAULT 0,
		FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id) ON DELETE CASCADE
	);
	CREATE TABLE IF NOT EXISTS categories (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		parent_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_cat_parent_id ON categories(parent_id);
	CREATE TABLE IF NOT EXISTS recipe_categories (
		id TEXT PRIMARY KEY,
		recipe_id TEXT NOT NULL,
		category_id TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(recipe_id, category_id),
		FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
		FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_rc_recipe_id ON recipe_categories(recipe_id);
	CREATE INDEX IF NOT EXISTS idx_rc_category_id ON recipe_categories(category_id);
	CREATE TABLE IF NOT EXISTS recipe_books (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		title TEXT NOT NULL,
		description TEXT DEFAULT '',
		cover_color TEXT DEFAULT '#059669',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_rb_user_id ON recipe_books(user_id);
	CREATE TABLE IF NOT EXISTS chapters (
		id TEXT PRIMARY KEY,
		book_id TEXT NOT NULL,
		title TEXT NOT NULL,
		position INT DEFAULT 0,
		page_template_id TEXT,
		recipe_template_id TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (book_id) REFERENCES recipe_books(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_ch_book_id ON chapters(book_id);
	CREATE TABLE IF NOT EXISTS chapter_recipes (
		id TEXT PRIMARY KEY,
		chapter_id TEXT NOT NULL,
		recipe_id TEXT NOT NULL,
		position INT DEFAULT 0,
		UNIQUE(chapter_id, recipe_id),
		FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
		FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
	);
	CREATE TABLE IF NOT EXISTS chapter_pages (
		id TEXT PRIMARY KEY,
		chapter_id TEXT NOT NULL,
		title TEXT NOT NULL,
		content TEXT DEFAULT '',
		position INT DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
	);
	CREATE TABLE IF NOT EXISTS book_pages (
		id TEXT PRIMARY KEY,
		book_id TEXT NOT NULL,
		title TEXT NOT NULL,
		content TEXT DEFAULT '',
		position INT DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (book_id) REFERENCES recipe_books(id) ON DELETE CASCADE
	);
	CREATE TABLE IF NOT EXISTS custom_foods (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT NOT NULL,
		calories REAL DEFAULT 0, total_fat REAL DEFAULT 0, saturated_fat REAL DEFAULT 0,
		trans_fat REAL DEFAULT 0, cholesterol REAL DEFAULT 0, sodium REAL DEFAULT 0,
		total_carbs REAL DEFAULT 0, dietary_fiber REAL DEFAULT 0, total_sugars REAL DEFAULT 0,
		added_sugars REAL DEFAULT 0, protein REAL DEFAULT 0, vitamin_d REAL DEFAULT 0,
		calcium REAL DEFAULT 0, iron REAL DEFAULT 0, potassium REAL DEFAULT 0,
		shared_with_community INT DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_cf_user_id ON custom_foods(user_id);
	CREATE TABLE IF NOT EXISTS grocery_checklists (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		week_start TEXT NOT NULL,
		checked_items TEXT DEFAULT '[]',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, week_start),
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE TABLE IF NOT EXISTS food_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		fdc_id INT UNIQUE NOT NULL,
		description TEXT NOT NULL,
		data_type TEXT NOT NULL,
		brand_owner TEXT,
		gtin_upc TEXT,
		serving_size REAL DEFAULT 100,
		serving_size_unit TEXT DEFAULT 'g',
		calories REAL DEFAULT 0, total_fat REAL DEFAULT 0, saturated_fat REAL DEFAULT 0,
		trans_fat REAL DEFAULT 0, cholesterol REAL DEFAULT 0, sodium REAL DEFAULT 0,
		total_carbs REAL DEFAULT 0, dietary_fiber REAL DEFAULT 0, total_sugars REAL DEFAULT 0,
		added_sugars REAL DEFAULT 0, protein REAL DEFAULT 0, vitamin_d REAL DEFAULT 0,
		calcium REAL DEFAULT 0, iron REAL DEFAULT 0, potassium REAL DEFAULT 0,
		source TEXT DEFAULT 'usda',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_fi_description ON food_items(description);
	CREATE INDEX IF NOT EXISTS idx_fi_gtin_upc ON food_items(gtin_upc);
	CREATE TABLE IF NOT EXISTS seed_jobs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		data_type TEXT NOT NULL,
		release_date TEXT NOT NULL,
		file_name TEXT NOT NULL,
		record_count INT DEFAULT 0,
		status TEXT DEFAULT 'pending',
		progress REAL DEFAULT 0,
		error TEXT,
		checkpoint TEXT,
		started_at DATETIME,
		completed_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS shared_recipes (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		recipe_id TEXT NOT NULL,
		share_token TEXT UNIQUE NOT NULL,
		is_public INT DEFAULT 1,
		title TEXT NOT NULL,
		description TEXT,
		category TEXT,
		tags TEXT DEFAULT '',
		recipe_data TEXT NOT NULL,
		view_count INT DEFAULT 0,
		import_count INT DEFAULT 0,
		average_rating REAL DEFAULT 0,
		rating_count INT DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_sr_user_id ON shared_recipes(user_id);
	CREATE INDEX IF NOT EXISTS idx_sr_token ON shared_recipes(share_token);
	CREATE TABLE IF NOT EXISTS recipe_ratings (
		id TEXT PRIMARY KEY,
		recipe_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		rating INT NOT NULL CHECK(rating >= 1 AND rating <= 5),
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (recipe_id) REFERENCES shared_recipes(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE(recipe_id, user_id)
	);
	CREATE TABLE IF NOT EXISTS community_categories (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		slug TEXT UNIQUE NOT NULL
	);
	CREATE TABLE IF NOT EXISTS api_keys (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT NOT NULL,
		key_hash TEXT NOT NULL,
		key_prefix TEXT NOT NULL,
		permissions TEXT DEFAULT '',
		last_used_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(key_hash),
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_ak_user_id ON api_keys(user_id);
	CREATE TABLE IF NOT EXISTS refresh_tokens (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		expires_at DATETIME NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_rt_user_id ON refresh_tokens(user_id);
	`
	_, err := s.db.Exec(schema)
	return err
}

// The SQLiteStore reuses the same Store interface methods with SQLite-compatible SQL.
// For brevity, the implementation delegates to the PostgresStore patterns
// but with SQLite syntax ($1→? placeholders). Since the logic is identical,
// we use a helper that adapts query placeholders.

func (s *SQLiteStore) queryPlaceholders(query string) string {
	n := 1
	var result strings.Builder
	for i := 0; i < len(query); i++ {
		if i+1 < len(query) && query[i] == '$' && query[i+1] >= '0' && query[i+1] <= '9' {
			result.WriteByte('?')
			i++
			continue
		}
		result.WriteByte(query[i])
		_ = n
	}
	return result.String()
}

// ── Users ──

func (s *SQLiteStore) CreateUser(email, password, displayName string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	apiKey, err := generateAPIKey()
	if err != nil {
		return nil, err
	}
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err = s.db.Exec(`INSERT INTO users (id, email, display_name, password_hash, api_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
		id, email, displayName, string(hash), apiKey, now, now)
	if err != nil {
		return nil, err
	}
	return &User{ID: id, Email: email, DisplayName: displayName, PasswordHash: string(hash), APIKey: apiKey, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *SQLiteStore) GetUserByAPIKey(apiKey string) (*User, error) {
	return s.scanUser(`SELECT id, email, display_name, password_hash, api_key, created_at, updated_at FROM users WHERE api_key = ?`, apiKey)
}

func (s *SQLiteStore) GetUserByID(id string) (*User, error) {
	return s.scanUser(`SELECT id, email, display_name, password_hash, api_key, created_at, updated_at FROM users WHERE id = ?`, id)
}

func (s *SQLiteStore) GetUserByEmail(email string) (*User, error) {
	return s.scanUser(`SELECT id, email, display_name, password_hash, api_key, created_at, updated_at FROM users WHERE email = ?`, email)
}

func (s *SQLiteStore) UpdateUserLastLogin(id string) error {
	_, err := s.db.Exec(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id)
	return err
}

func (s *SQLiteStore) scanUser(query string, args ...interface{}) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(query, args...).Scan(&u.ID, &u.Email, &u.DisplayName, &u.PasswordHash, &u.APIKey, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

// ── Remaining methods follow same pattern as PostgresStore but with ? placeholders ──
// For each method, the SQL is identical except $N → ?
// The implementations below cover all Store interface methods.

func (s *SQLiteStore) ListRecipes(userID string, page, perPage int) ([]Recipe, int, error) {
	if perPage <= 0 { perPage = 20 }
	if page <= 0 { page = 1 }
	var total int
	s.db.QueryRow(`SELECT COUNT(*) FROM recipes WHERE user_id = ?`, userID).Scan(&total)
	offset := (page - 1) * perPage
	rows, err := s.db.Query(`SELECT id, user_id, name, servings, serving_name, instructions, leftover_storage, COALESCE(ingredient_groups,'[]'), created_at, updated_at FROM recipes WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`, userID, perPage, offset)
	if err != nil { return nil, 0, err }
	var recipes []Recipe
	for rows.Next() {
		var r Recipe
		var groupsJSON string
		rows.Scan(&r.ID, &r.UserID, &r.Name, &r.Servings, &r.ServingName, &r.Instructions, &r.LeftoverStorage, &groupsJSON, &r.CreatedAt, &r.UpdatedAt)
		r.ScanIngredientGroups(groupsJSON)
		recipes = append(recipes, r)
	}
	rows.Close()
	for i := range recipes {
		ings, _ := s.listIngredientsByRecipe(recipes[i].ID)
		recipes[i].Ingredients = ings
	}
	return recipes, total, nil
}

func (s *SQLiteStore) GetRecipe(userID, id string) (*Recipe, error) {
	r := &Recipe{}
	var groupsJSON string
	err := s.db.QueryRow(`SELECT id, user_id, name, servings, serving_name, instructions, leftover_storage, COALESCE(ingredient_groups,'[]'), created_at, updated_at FROM recipes WHERE user_id = ? AND id = ?`, userID, id).Scan(&r.ID, &r.UserID, &r.Name, &r.Servings, &r.ServingName, &r.Instructions, &r.LeftoverStorage, &groupsJSON, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	r.ScanIngredientGroups(groupsJSON)
	ings, _ := s.listIngredientsByRecipe(r.ID)
	r.Ingredients = ings
	return r, nil
}

func (s *SQLiteStore) CreateRecipe(userID string, req *CreateRecipeRequest) (*Recipe, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	sn := "serving"
	if req.ServingName != "" { sn = req.ServingName }
	_, err := s.db.Exec(`INSERT INTO recipes (id, user_id, name, servings, serving_name, instructions, leftover_storage, ingredient_groups, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, id, userID, req.Name, req.Servings, sn, req.Instructions, req.LeftoverStorage, "[]", now, now)
	if err != nil { return nil, err }
	var ings []Ingredient
	for _, ing := range req.Ingredients {
		c, err := s.CreateIngredient(id, &ing)
		if err != nil { return nil, err }
		ings = append(ings, *c)
	}
	return &Recipe{ID: id, UserID: userID, Name: req.Name, Servings: req.Servings, ServingName: sn, Instructions: req.Instructions, LeftoverStorage: req.LeftoverStorage, IngredientGroupsJSON: "[]", CreatedAt: now, UpdatedAt: now, Ingredients: ings}, nil
}

func (s *SQLiteStore) UpdateRecipe(userID, id string, req *UpdateRecipeRequest) (*Recipe, error) {
	setClauses := []string{"updated_at=CURRENT_TIMESTAMP"}
	args := []interface{}{}
	if req.Name != nil { setClauses = append(setClauses, "name=?"); args = append(args, *req.Name) }
	if req.Servings != nil { setClauses = append(setClauses, "servings=?"); args = append(args, *req.Servings) }
	if req.ServingName != nil { setClauses = append(setClauses, "serving_name=?"); args = append(args, *req.ServingName) }
	if req.Instructions != nil { setClauses = append(setClauses, "instructions=?"); args = append(args, *req.Instructions) }
	if req.LeftoverStorage != nil { setClauses = append(setClauses, "leftover_storage=?"); args = append(args, *req.LeftoverStorage) }
	if req.IngredientGroups != nil { setClauses = append(setClauses, "ingredient_groups=?"); args = append(args, *req.IngredientGroups) }
	args = append(args, userID, id)
	_, err := s.db.Exec(`UPDATE recipes SET `+strings.Join(setClauses, ",")+` WHERE user_id=? AND id=?`, args...)
	if err != nil { return nil, err }
	if req.Ingredients != nil { s.ReplaceIngredients(id, *req.Ingredients) }
	return s.GetRecipe(userID, id)
}

func (s *SQLiteStore) DeleteRecipe(userID, id string) error {
	_, err := s.db.Exec(`DELETE FROM recipes WHERE user_id = ? AND id = ?`, userID, id)
	if err != nil {
		return err
	}
	_, _ = s.db.Exec(`DELETE FROM day_plan_entries WHERE recipe_id = ?`, id)
	_, _ = s.db.Exec(`DELETE FROM chapter_recipes WHERE recipe_id = ?`, id)
	_, _ = s.db.Exec(`DELETE FROM recipe_categories WHERE recipe_id = ?`, id)
	return nil
}

func (s *SQLiteStore) listIngredientsByRecipe(recipeID string) ([]Ingredient, error) {
	rows, err := s.db.Query(`SELECT id, recipe_id, fdc_id, name, amount, unit, COALESCE(description,''), calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, COALESCE(prep_instructions,'[]'), COALESCE(storage_location,''), group_id, linked_recipe_id FROM ingredients WHERE recipe_id = ?`, recipeID)
	if err != nil { return nil, err }
	defer rows.Close()
	var ings []Ingredient
	for rows.Next() {
		var i Ingredient
		var prepJSON string
		rows.Scan(&i.ID, &i.RecipeID, &i.FdcID, &i.Name, &i.Amount, &i.Unit, &i.Description, &i.Calories, &i.TotalFat, &i.SaturatedFat, &i.TransFat, &i.Cholesterol, &i.Sodium, &i.TotalCarbs, &i.DietaryFiber, &i.TotalSugars, &i.AddedSugars, &i.Protein, &i.VitaminD, &i.Calcium, &i.Iron, &i.Potassium, &prepJSON, &i.StorageLocation, &i.GroupID, &i.LinkedRecipeID)
		i.ScanPrepInstructions(prepJSON)
		ings = append(ings, i)
	}
	return ings, nil
}

func (s *SQLiteStore) CreateIngredient(recipeID string, ing *CreateIngredientReq) (*Ingredient, error) {
	id := uuid.New().String()
	prepJSON := PrepInstructionsJSON(ing.PrepInstructions)
	_, err := s.db.Exec(`INSERT INTO ingredients (id, recipe_id, fdc_id, name, amount, unit, description, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, prep_instructions, storage_location, group_id, linked_recipe_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, recipeID, ing.FdcID, ing.Name, ing.Amount, ing.Unit, ing.Description, ing.Calories, ing.TotalFat, ing.SaturatedFat, ing.TransFat, ing.Cholesterol, ing.Sodium, ing.TotalCarbs, ing.DietaryFiber, ing.TotalSugars, ing.AddedSugars, ing.Protein, ing.VitaminD, ing.Calcium, ing.Iron, ing.Potassium, prepJSON, ing.StorageLocation, ing.GroupID, ing.LinkedRecipeID)
	if err != nil { return nil, err }
	return &Ingredient{ID: id, RecipeID: recipeID, FdcID: ing.FdcID, Name: ing.Name, Amount: ing.Amount, Unit: ing.Unit, Description: ing.Description, Calories: ing.Calories, TotalFat: ing.TotalFat, SaturatedFat: ing.SaturatedFat, TransFat: ing.TransFat, Cholesterol: ing.Cholesterol, Sodium: ing.Sodium, TotalCarbs: ing.TotalCarbs, DietaryFiber: ing.DietaryFiber, TotalSugars: ing.TotalSugars, AddedSugars: ing.AddedSugars, Protein: ing.Protein, VitaminD: ing.VitaminD, Calcium: ing.Calcium, Iron: ing.Iron, Potassium: ing.Potassium, GroupID: ing.GroupID, LinkedRecipeID: ing.LinkedRecipeID, PrepInstructions: ing.PrepInstructions, StorageLocation: ing.StorageLocation}, nil
}

func (s *SQLiteStore) UpdateIngredient(id string, ing *CreateIngredientReq) (*Ingredient, error) {
	prepJSON := PrepInstructionsJSON(ing.PrepInstructions)
	s.db.Exec(`UPDATE ingredients SET fdc_id=?, name=?, amount=?, unit=?, description=?, calories=?, total_fat=?, saturated_fat=?, trans_fat=?, cholesterol=?, sodium=?, total_carbs=?, dietary_fiber=?, total_sugars=?, added_sugars=?, protein=?, vitamin_d=?, calcium=?, iron=?, potassium=?, prep_instructions=?, storage_location=?, group_id=?, linked_recipe_id=? WHERE id=?`,
		ing.FdcID, ing.Name, ing.Amount, ing.Unit, ing.Description, ing.Calories, ing.TotalFat, ing.SaturatedFat, ing.TransFat, ing.Cholesterol, ing.Sodium, ing.TotalCarbs, ing.DietaryFiber, ing.TotalSugars, ing.AddedSugars, ing.Protein, ing.VitaminD, ing.Calcium, ing.Iron, ing.Potassium, prepJSON, ing.StorageLocation, ing.GroupID, ing.LinkedRecipeID, id)
	return &Ingredient{ID: id, FdcID: ing.FdcID, Name: ing.Name, Amount: ing.Amount, Unit: ing.Unit, Description: ing.Description, GroupID: ing.GroupID, LinkedRecipeID: ing.LinkedRecipeID, PrepInstructions: ing.PrepInstructions, StorageLocation: ing.StorageLocation}, nil
}

func (s *SQLiteStore) DeleteIngredient(id string) error { _, err := s.db.Exec(`DELETE FROM ingredients WHERE id = ?`, id); return err }

func (s *SQLiteStore) ReplaceIngredients(recipeID string, ingredients []CreateIngredientReq) error {
	tx, _ := s.db.Begin()
	tx.Exec(`DELETE FROM ingredients WHERE recipe_id = ?`, recipeID)
	for _, ing := range ingredients {
		id := uuid.New().String()
		prepJSON := PrepInstructionsJSON(ing.PrepInstructions)
		tx.Exec(`INSERT INTO ingredients (id, recipe_id, fdc_id, name, amount, unit, description, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, prep_instructions, storage_location, group_id, linked_recipe_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			id, recipeID, ing.FdcID, ing.Name, ing.Amount, ing.Unit, ing.Description, ing.Calories, ing.TotalFat, ing.SaturatedFat, ing.TransFat, ing.Cholesterol, ing.Sodium, ing.TotalCarbs, ing.DietaryFiber, ing.TotalSugars, ing.AddedSugars, ing.Protein, ing.VitaminD, ing.Calcium, ing.Iron, ing.Potassium, prepJSON, ing.StorageLocation, ing.GroupID, ing.LinkedRecipeID)
	}
	return tx.Commit()
}

func (s *SQLiteStore) SearchFoods(query string, page, perPage int) ([]FoodItem, int, error) {
	if perPage <= 0 { perPage = 20 }
	if page <= 0 { page = 1 }
	var total int
	countQ := `SELECT COUNT(*) FROM food_items`
	countArgs := []interface{}{}
	if query != "" { countQ += ` WHERE description LIKE ?`; countArgs = append(countArgs, "%"+query+"%") }
	s.db.QueryRow(countQ, countArgs...).Scan(&total)
	offset := (page - 1) * perPage
	sel := `SELECT id, fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at FROM food_items`
	var selArgs []interface{}
	if query != "" { sel += ` WHERE description LIKE ? ORDER BY description LIMIT ? OFFSET ?`; selArgs = append(selArgs, "%"+query+"%", perPage, offset) } else { sel += ` ORDER BY description LIMIT ? OFFSET ?`; selArgs = append(selArgs, perPage, offset) }
	rows, err := s.db.Query(sel, selArgs...)
	if err != nil { return nil, 0, err }
	defer rows.Close()
	var foods []FoodItem
	for rows.Next() {
		var f FoodItem
		rows.Scan(&f.ID, &f.FdcID, &f.Description, &f.DataType, &f.BrandOwner, &f.GtinUpc, &f.ServingSize, &f.ServingSizeUnit, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.Source, &f.CreatedAt, &f.UpdatedAt)
		foods = append(foods, f)
	}
	return foods, total, nil
}

func (s *SQLiteStore) GetFoodByFdcID(fdcID int) (*FoodItem, error) {
	f := &FoodItem{}
	err := s.db.QueryRow(`SELECT id, fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at FROM food_items WHERE fdc_id = ?`, fdcID).Scan(&f.ID, &f.FdcID, &f.Description, &f.DataType, &f.BrandOwner, &f.GtinUpc, &f.ServingSize, &f.ServingSizeUnit, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.Source, &f.CreatedAt, &f.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return f, nil
}

func (s *SQLiteStore) GetFoodByGtinUpc(gtinUpc string) (*FoodItem, error) {
	f := &FoodItem{}
	err := s.db.QueryRow(`SELECT id, fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at FROM food_items WHERE gtin_upc = ?`, gtinUpc).Scan(&f.ID, &f.FdcID, &f.Description, &f.DataType, &f.BrandOwner, &f.GtinUpc, &f.ServingSize, &f.ServingSizeUnit, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.Source, &f.CreatedAt, &f.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return f, nil
}

func (s *SQLiteStore) CreateFoodItem(f *FoodItem) (*FoodItem, error) {
	now := time.Now().UTC()
	res, err := s.db.Exec(`INSERT INTO food_items (fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		f.FdcID, f.Description, f.DataType, f.BrandOwner, f.GtinUpc, f.ServingSize, f.ServingSizeUnit, f.Calories, f.TotalFat, f.SaturatedFat, f.TransFat, f.Cholesterol, f.Sodium, f.TotalCarbs, f.DietaryFiber, f.TotalSugars, f.AddedSugars, f.Protein, f.VitaminD, f.Calcium, f.Iron, f.Potassium, f.Source, now, now)
	if err != nil { return nil, err }
	id, _ := res.LastInsertId()
	f.ID = int(id)
	f.CreatedAt = now
	f.UpdatedAt = now
	return f, nil
}

func (s *SQLiteStore) ListSeedJobs() ([]SeedJob, error) {
	rows, err := s.db.Query(`SELECT id, data_type, release_date, file_name, record_count, status, progress, error, checkpoint, started_at, completed_at, created_at FROM seed_jobs ORDER BY created_at DESC`)
	if err != nil { return nil, err }
	defer rows.Close()
	var jobs []SeedJob
	for rows.Next() {
		var j SeedJob
		rows.Scan(&j.ID, &j.DataType, &j.ReleaseDate, &j.FileName, &j.RecordCount, &j.Status, &j.Progress, &j.Error, &j.Checkpoint, &j.StartedAt, &j.CompletedAt, &j.CreatedAt)
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func (s *SQLiteStore) CreateSeedJob(dataType, releaseDate, fileName string) (*SeedJob, error) {
	now := time.Now().UTC()
	res, err := s.db.Exec(`INSERT INTO seed_jobs (data_type, release_date, file_name, status, created_at) VALUES (?,?,?,?,?)`, dataType, releaseDate, fileName, "pending", now)
	if err != nil { return nil, err }
	id, _ := res.LastInsertId()
	return &SeedJob{ID: int(id), DataType: dataType, ReleaseDate: releaseDate, FileName: fileName, Status: "pending", CreatedAt: now}, nil
}

func (s *SQLiteStore) UpdateSeedJob(id int, status string, recordCount int, progress float64, errorMsg string) error {
	_, err := s.db.Exec(`UPDATE seed_jobs SET status=?, record_count=?, progress=?, error=CASE WHEN ?='failed' THEN ? ELSE error END WHERE id=?`, status, recordCount, progress, status, errorMsg, id)
	return err
}

func (s *SQLiteStore) GetFoodStats() (*FoodStats, error) {
	stats := &FoodStats{}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM food_items`).Scan(&stats.TotalFoods); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT data_type, COUNT(*) as cnt FROM food_items GROUP BY data_type ORDER BY cnt DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var tc FoodTypeCount
		if err := rows.Scan(&tc.DataType, &tc.Count); err != nil {
			return nil, err
		}
		stats.ByDataType = append(stats.ByDataType, tc)
	}
	rows2, err := s.db.Query(`SELECT source, COUNT(*) as cnt FROM food_items GROUP BY source ORDER BY cnt DESC`)
	if err != nil {
		return nil, err
	}
	defer rows2.Close()
	for rows2.Next() {
		var sc FoodSourceCount
		if err := rows2.Scan(&sc.Source, &sc.Count); err != nil {
			return nil, err
		}
		stats.BySource = append(stats.BySource, sc)
	}
	return stats, nil
}

func (s *SQLiteStore) DeleteAllFoods() error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM food_items`); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM seed_jobs`); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (s *SQLiteStore) CreateFoodItems(items []FoodItem) (int, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	now := time.Now().UTC()
	inserted := 0
	for _, f := range items {
		var existingID int
		err := tx.QueryRow(`SELECT id FROM food_items WHERE fdc_id = ?`, f.FdcID).Scan(&existingID)
		if err == nil {
			_, err := tx.Exec(
				`UPDATE food_items SET description=?, data_type=?, brand_owner=?, gtin_upc=?, serving_size=?, serving_size_unit=?, calories=?, total_fat=?, saturated_fat=?, trans_fat=?, cholesterol=?, sodium=?, total_carbs=?, dietary_fiber=?, total_sugars=?, added_sugars=?, protein=?, vitamin_d=?, calcium=?, iron=?, potassium=?, source=?, updated_at=? WHERE fdc_id=?`,
				f.Description, f.DataType, f.BrandOwner, f.GtinUpc, f.ServingSize, f.ServingSizeUnit,
				f.Calories, f.TotalFat, f.SaturatedFat, f.TransFat, f.Cholesterol, f.Sodium,
				f.TotalCarbs, f.DietaryFiber, f.TotalSugars, f.AddedSugars, f.Protein,
				f.VitaminD, f.Calcium, f.Iron, f.Potassium, f.Source, now, f.FdcID,
			)
			if err != nil {
				tx.Rollback()
				return inserted, err
			}
			inserted++
			continue
		}
		_, err = tx.Exec(
			`INSERT INTO food_items (fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			f.FdcID, f.Description, f.DataType, f.BrandOwner, f.GtinUpc, f.ServingSize, f.ServingSizeUnit,
			f.Calories, f.TotalFat, f.SaturatedFat, f.TransFat, f.Cholesterol, f.Sodium,
			f.TotalCarbs, f.DietaryFiber, f.TotalSugars, f.AddedSugars, f.Protein,
			f.VitaminD, f.Calcium, f.Iron, f.Potassium, f.Source, now, now,
		)
		if err != nil {
			tx.Rollback()
			return inserted, err
		}
		inserted++
	}
	return inserted, tx.Commit()
}

// ── Profiles ──

func (s *SQLiteStore) ListProfiles(userID string) ([]PersonProfile, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, sex, birth_date, height_cm, activity_level, goal_weight_kg, goal_date, bmr_equation, manual_bmr_value, calorie_target, protein_goal_g, carbs_goal_g, fat_goal_g, fiber_goal_g, sodium_max_mg, sugar_max_g, vitamin_d_goal_ug, calcium_goal_mg, iron_goal_mg, potassium_goal_mg, created_at, updated_at FROM person_profiles WHERE user_id = ? ORDER BY updated_at DESC`, userID)
	if err != nil { return nil, err }
	defer rows.Close()
	var profiles []PersonProfile
	for rows.Next() {
		var p PersonProfile
		rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Sex, &p.BirthDate, &p.HeightCm, &p.ActivityLevel, &p.GoalWeightKg, &p.GoalDate, &p.BMREquation, &p.ManualBMRValue, &p.CalorieTarget, &p.ProteinGoalG, &p.CarbsGoalG, &p.FatGoalG, &p.FiberGoalG, &p.SodiumMaxMg, &p.SugarMaxG, &p.VitaminDGoalUg, &p.CalciumGoalMg, &p.IronGoalMg, &p.PotassiumGoalMg, &p.CreatedAt, &p.UpdatedAt)
		profiles = append(profiles, p)
	}
	return profiles, nil
}

func (s *SQLiteStore) GetProfile(userID, id string) (*PersonProfile, error) {
	p := &PersonProfile{}
	err := s.db.QueryRow(`SELECT id, user_id, name, sex, birth_date, height_cm, activity_level, goal_weight_kg, goal_date, bmr_equation, manual_bmr_value, calorie_target, protein_goal_g, carbs_goal_g, fat_goal_g, fiber_goal_g, sodium_max_mg, sugar_max_g, vitamin_d_goal_ug, calcium_goal_mg, iron_goal_mg, potassium_goal_mg, created_at, updated_at FROM person_profiles WHERE user_id = ? AND id = ?`, userID, id).Scan(&p.ID, &p.UserID, &p.Name, &p.Sex, &p.BirthDate, &p.HeightCm, &p.ActivityLevel, &p.GoalWeightKg, &p.GoalDate, &p.BMREquation, &p.ManualBMRValue, &p.CalorieTarget, &p.ProteinGoalG, &p.CarbsGoalG, &p.FatGoalG, &p.FiberGoalG, &p.SodiumMaxMg, &p.SugarMaxG, &p.VitaminDGoalUg, &p.CalciumGoalMg, &p.IronGoalMg, &p.PotassiumGoalMg, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return p, nil
}

func (s *SQLiteStore) CreateProfile(userID string, req *CreateProfileRequest) (*PersonProfile, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	al := "moderate"
	if req.ActivityLevel != "" { al = req.ActivityLevel }
	_, err := s.db.Exec(`INSERT INTO person_profiles (id, user_id, name, sex, birth_date, height_cm, activity_level, goal_weight_kg, goal_date, bmr_equation, manual_bmr_value, calorie_target, protein_goal_g, carbs_goal_g, fat_goal_g, fiber_goal_g, sodium_max_mg, sugar_max_g, vitamin_d_goal_ug, calcium_goal_mg, iron_goal_mg, potassium_goal_mg, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, userID, req.Name, req.Sex, req.BirthDate, req.HeightCm, al, req.GoalWeightKg, req.GoalDate, req.BMREquation, req.ManualBMRValue, req.CalorieTarget, req.ProteinGoalG, req.CarbsGoalG, req.FatGoalG, req.FiberGoalG, req.SodiumMaxMg, req.SugarMaxG, req.VitaminDGoalUg, req.CalciumGoalMg, req.IronGoalMg, req.PotassiumGoalMg, now, now)
	if err != nil { return nil, err }
	return s.GetProfile(userID, id)
}

func (s *SQLiteStore) UpdateProfile(userID, id string, req *CreateProfileRequest) (*PersonProfile, error) {
	_, err := s.db.Exec(`UPDATE person_profiles SET name=?, sex=?, birth_date=?, height_cm=?, activity_level=?, goal_weight_kg=?, goal_date=?, bmr_equation=?, manual_bmr_value=?, calorie_target=?, protein_goal_g=?, carbs_goal_g=?, fat_goal_g=?, fiber_goal_g=?, sodium_max_mg=?, sugar_max_g=?, vitamin_d_goal_ug=?, calcium_goal_mg=?, iron_goal_mg=?, potassium_goal_mg=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`,
		req.Name, req.Sex, req.BirthDate, req.HeightCm, req.ActivityLevel, req.GoalWeightKg, req.GoalDate, req.BMREquation, req.ManualBMRValue, req.CalorieTarget, req.ProteinGoalG, req.CarbsGoalG, req.FatGoalG, req.FiberGoalG, req.SodiumMaxMg, req.SugarMaxG, req.VitaminDGoalUg, req.CalciumGoalMg, req.IronGoalMg, req.PotassiumGoalMg, userID, id)
	if err != nil { return nil, err }
	return s.GetProfile(userID, id)
}

func (s *SQLiteStore) DeleteProfile(userID, id string) error { _, err := s.db.Exec(`DELETE FROM person_profiles WHERE user_id = ? AND id = ?`, userID, id); return err }

// ── Stubs for remaining methods — same pattern, SQLite syntax ──
// Food log, weight, meal plans, books, chapters, categories, custom foods, grocery, book pages, api keys, sharing

func (s *SQLiteStore) ListFoodLogEntries(profileID, date string) ([]FoodLogEntry, error) {
	q := `SELECT id, user_id, profile_id, date, time, meal_slot, source_type, source_id, name, servings, serving_amount, serving_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at FROM food_log_entries WHERE profile_id = ?`
	args := []interface{}{profileID}
	if date != "" { q += ` AND date = ? ORDER BY time ASC`; args = append(args, date) } else { q += ` ORDER BY date DESC, time ASC` }
	rows, err := s.db.Query(q, args...)
	if err != nil { return nil, err }
	defer rows.Close()
	var entries []FoodLogEntry
	for rows.Next() {
		var e FoodLogEntry
		rows.Scan(&e.ID, &e.UserID, &e.ProfileID, &e.Date, &e.Time, &e.MealSlot, &e.SourceType, &e.SourceID, &e.Name, &e.Servings, &e.ServingAmount, &e.ServingUnit, &e.Calories, &e.TotalFat, &e.SaturatedFat, &e.TransFat, &e.Cholesterol, &e.Sodium, &e.TotalCarbs, &e.DietaryFiber, &e.TotalSugars, &e.AddedSugars, &e.Protein, &e.VitaminD, &e.Calcium, &e.Iron, &e.Potassium, &e.CreatedAt, &e.UpdatedAt)
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *SQLiteStore) ListFoodLogEntriesByDateRange(profileID, startDate, endDate string) ([]FoodLogEntry, error) {
	q := `SELECT id, user_id, profile_id, date, time, meal_slot, source_type, source_id, name, servings, serving_amount, serving_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at FROM food_log_entries WHERE profile_id = ? AND date >= ? AND date <= ? ORDER BY date ASC, time ASC`
	rows, err := s.db.Query(q, profileID, startDate, endDate)
	if err != nil { return nil, err }
	defer rows.Close()
	var entries []FoodLogEntry
	for rows.Next() {
		var e FoodLogEntry
		rows.Scan(&e.ID, &e.UserID, &e.ProfileID, &e.Date, &e.Time, &e.MealSlot, &e.SourceType, &e.SourceID, &e.Name, &e.Servings, &e.ServingAmount, &e.ServingUnit, &e.Calories, &e.TotalFat, &e.SaturatedFat, &e.TransFat, &e.Cholesterol, &e.Sodium, &e.TotalCarbs, &e.DietaryFiber, &e.TotalSugars, &e.AddedSugars, &e.Protein, &e.VitaminD, &e.Calcium, &e.Iron, &e.Potassium, &e.CreatedAt, &e.UpdatedAt)
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *SQLiteStore) CreateFoodLogEntry(userID, profileID string, req *CreateFoodLogRequest) (*FoodLogEntry, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO food_log_entries (id, user_id, profile_id, date, time, meal_slot, source_type, source_id, name, servings, serving_amount, serving_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, userID, profileID, req.Date, req.Time, req.MealSlot, req.SourceType, req.SourceID, req.Name, req.Servings, req.ServingAmount, req.ServingUnit, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, now, now)
	if err != nil { return nil, err }
	return &FoodLogEntry{ID: id, UserID: userID, ProfileID: profileID, Date: req.Date, Time: req.Time, MealSlot: req.MealSlot, SourceType: req.SourceType, SourceID: req.SourceID, Name: req.Name, Servings: req.Servings, Calories: req.Calories, Protein: req.Protein, TotalCarbs: req.TotalCarbs, TotalFat: req.TotalFat, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *SQLiteStore) UpdateFoodLogEntry(id string, req *CreateFoodLogRequest) (*FoodLogEntry, error) {
	s.db.Exec(`UPDATE food_log_entries SET date=?, time=?, meal_slot=?, name=?, servings=?, calories=?, total_fat=?, saturated_fat=?, trans_fat=?, cholesterol=?, sodium=?, total_carbs=?, dietary_fiber=?, total_sugars=?, added_sugars=?, protein=?, vitamin_d=?, calcium=?, iron=?, potassium=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		req.Date, req.Time, req.MealSlot, req.Name, req.Servings, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, id)
	return &FoodLogEntry{ID: id, Date: req.Date, MealSlot: req.MealSlot, Name: req.Name, Servings: req.Servings, Calories: req.Calories}, nil
}

func (s *SQLiteStore) DeleteFoodLogEntry(id string) error { _, err := s.db.Exec(`DELETE FROM food_log_entries WHERE id = ?`, id); return err }

func (s *SQLiteStore) ListWeightEntries(profileID, fromDate, toDate string) ([]WeightEntry, error) {
	q := `SELECT id, user_id, profile_id, date, weight_kg, notes, blood_sugar, blood_pressure_systolic, blood_pressure_diastolic, measurement_context, created_at, updated_at FROM weight_entries WHERE profile_id = ?`
	args := []interface{}{profileID}
	if fromDate != "" { q += ` AND date >= ?`; args = append(args, fromDate) }
	if toDate != "" { q += ` AND date <= ?`; args = append(args, toDate) }
	q += ` ORDER BY date ASC`
	rows, err := s.db.Query(q, args...)
	if err != nil { return nil, err }
	defer rows.Close()
	var entries []WeightEntry
	for rows.Next() {
		var e WeightEntry
		rows.Scan(&e.ID, &e.UserID, &e.ProfileID, &e.Date, &e.WeightKg, &e.Notes, &e.BloodSugar, &e.BloodPressureSystolic, &e.BloodPressureDiastolic, &e.MeasurementContext, &e.CreatedAt, &e.UpdatedAt)
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *SQLiteStore) CreateWeightEntry(userID, profileID string, req *CreateWeightEntryRequest) (*WeightEntry, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO weight_entries (id, user_id, profile_id, date, weight_kg, notes, blood_sugar, blood_pressure_systolic, blood_pressure_diastolic, measurement_context, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, userID, profileID, req.Date, req.WeightKg, req.Notes, req.BloodSugar, req.BloodPressureSystolic, req.BloodPressureDiastolic, req.MeasurementContext, now, now)
	if err != nil { return nil, err }
	return &WeightEntry{ID: id, UserID: userID, ProfileID: profileID, Date: req.Date, WeightKg: req.WeightKg, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *SQLiteStore) UpdateWeightEntry(id string, req *CreateWeightEntryRequest) (*WeightEntry, error) {
	s.db.Exec(`UPDATE weight_entries SET date=?, weight_kg=?, notes=?, blood_sugar=?, blood_pressure_systolic=?, blood_pressure_diastolic=?, measurement_context=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		req.Date, req.WeightKg, req.Notes, req.BloodSugar, req.BloodPressureSystolic, req.BloodPressureDiastolic, req.MeasurementContext, id)
	return &WeightEntry{ID: id, Date: req.Date, WeightKg: req.WeightKg}, nil
}

func (s *SQLiteStore) DeleteWeightEntry(id string) error { _, err := s.db.Exec(`DELETE FROM weight_entries WHERE id = ?`, id); return err }

func (s *SQLiteStore) ListMealPlans(userID string) ([]MealPlan, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, week_start, slot_times, created_at, updated_at FROM meal_plans WHERE user_id = ? ORDER BY week_start DESC`, userID)
	if err != nil { return nil, err }
	defer rows.Close()
	var plans []MealPlan
	for rows.Next() {
		var p MealPlan
		rows.Scan(&p.ID, &p.UserID, &p.Name, &p.WeekStart, &p.SlotTimes, &p.CreatedAt, &p.UpdatedAt)
		plans = append(plans, p)
	}
	return plans, nil
}

func (s *SQLiteStore) GetMealPlan(userID, id string) (*MealPlan, error) {
	p := &MealPlan{}
	err := s.db.QueryRow(`SELECT id, user_id, name, week_start, slot_times, created_at, updated_at FROM meal_plans WHERE user_id = ? AND id = ?`, userID, id).Scan(&p.ID, &p.UserID, &p.Name, &p.WeekStart, &p.SlotTimes, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return p, nil
}

func (s *SQLiteStore) GetMealPlanByWeekStart(userID, weekStart string) (*MealPlan, error) {
	p := &MealPlan{}
	err := s.db.QueryRow(`SELECT id, user_id, name, week_start, slot_times, created_at, updated_at FROM meal_plans WHERE user_id = ? AND week_start = ?`, userID, weekStart).Scan(&p.ID, &p.UserID, &p.Name, &p.WeekStart, &p.SlotTimes, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return p, nil
}

func (s *SQLiteStore) CreateMealPlan(userID string, req *CreateMealPlanRequest) (*MealPlan, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO meal_plans (id, user_id, name, week_start, slot_times, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, id, userID, req.Name, req.WeekStart, req.SlotTimes, now, now)
	if err != nil { return nil, err }
	return &MealPlan{ID: id, UserID: userID, Name: req.Name, WeekStart: req.WeekStart, SlotTimes: req.SlotTimes, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *SQLiteStore) UpdateMealPlan(userID, id string, req *CreateMealPlanRequest) (*MealPlan, error) {
	s.db.Exec(`UPDATE meal_plans SET name=?, slot_times=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`, req.Name, req.SlotTimes, userID, id)
	return s.GetMealPlan(userID, id)
}

func (s *SQLiteStore) DeleteMealPlan(userID, id string) error { _, err := s.db.Exec(`DELETE FROM meal_plans WHERE user_id = ? AND id = ?`, userID, id); return err }

func (s *SQLiteStore) ListDayPlanEntries(mealPlanID string) ([]DayPlanEntry, error) {
	rows, err := s.db.Query(`SELECT id, meal_plan_id, date, slot, recipe_id, position, group_id, servings, is_leftover, source_type, food_name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at FROM day_plan_entries WHERE meal_plan_id = ? ORDER BY date, position`, mealPlanID)
	if err != nil { return nil, err }
	defer rows.Close()
	var entries []DayPlanEntry
	for rows.Next() {
		var e DayPlanEntry
		rows.Scan(&e.ID, &e.MealPlanID, &e.Date, &e.Slot, &e.RecipeID, &e.Position, &e.GroupID, &e.Servings, &e.IsLeftover, &e.SourceType, &e.FoodName, &e.Calories, &e.TotalFat, &e.SaturatedFat, &e.TransFat, &e.Cholesterol, &e.Sodium, &e.TotalCarbs, &e.DietaryFiber, &e.TotalSugars, &e.AddedSugars, &e.Protein, &e.VitaminD, &e.Calcium, &e.Iron, &e.Potassium, &e.CreatedAt, &e.UpdatedAt)
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *SQLiteStore) CreateDayPlanEntry(mealPlanID string, req *CreateDayPlanEntryRequest) (*DayPlanEntry, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO day_plan_entries (id, meal_plan_id, date, slot, recipe_id, position, group_id, servings, is_leftover, source_type, food_name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, mealPlanID, req.Date, req.Slot, req.RecipeID, req.Position, req.GroupID, req.Servings, req.IsLeftover, req.SourceType, req.FoodName, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, now, now)
	if err != nil { return nil, err }
	return &DayPlanEntry{ID: id, MealPlanID: mealPlanID, Date: req.Date, Slot: req.Slot, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *SQLiteStore) UpdateDayPlanEntry(id string, req *CreateDayPlanEntryRequest) (*DayPlanEntry, error) {
	_, err := s.db.Exec(`UPDATE day_plan_entries SET date=?, slot=?, recipe_id=?, position=?, servings=?, is_leftover=?, source_type=?, food_name=?, calories=?, total_fat=?, saturated_fat=?, trans_fat=?, cholesterol=?, sodium=?, total_carbs=?, dietary_fiber=?, total_sugars=?, added_sugars=?, protein=?, vitamin_d=?, calcium=?, iron=?, potassium=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		req.Date, req.Slot, req.RecipeID, req.Position, req.Servings, req.IsLeftover, req.SourceType, req.FoodName, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, id)
	if err != nil {
		return nil, err
	}
	return s.getDayPlanEntryByID(id)
}

func (s *SQLiteStore) getDayPlanEntryByID(id string) (*DayPlanEntry, error) {
	var e DayPlanEntry
	err := s.db.QueryRow(`SELECT id, meal_plan_id, date, slot, recipe_id, position, group_id, servings, is_leftover, source_type, food_name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium FROM day_plan_entries WHERE id = ?`, id).
		Scan(&e.ID, &e.MealPlanID, &e.Date, &e.Slot, &e.RecipeID, &e.Position, &e.GroupID, &e.Servings, &e.IsLeftover, &e.SourceType, &e.FoodName, &e.Calories, &e.TotalFat, &e.SaturatedFat, &e.TransFat, &e.Cholesterol, &e.Sodium, &e.TotalCarbs, &e.DietaryFiber, &e.TotalSugars, &e.AddedSugars, &e.Protein, &e.VitaminD, &e.Calcium, &e.Iron, &e.Potassium)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *SQLiteStore) DeleteDayPlanEntry(id string) error { _, err := s.db.Exec(`DELETE FROM day_plan_entries WHERE id = ?`, id); return err }
func (s *SQLiteStore) ListMealGroups(mealPlanID string) ([]MealGroup, error) {
	rows, err := s.db.Query(`SELECT id, meal_plan_id, date, slot, name, position FROM meal_groups WHERE meal_plan_id = ? ORDER BY position`, mealPlanID)
	if err != nil { return nil, err }
	defer rows.Close()
	var groups []MealGroup
	for rows.Next() { var g MealGroup; rows.Scan(&g.ID, &g.MealPlanID, &g.Date, &g.Slot, &g.Name, &g.Position); groups = append(groups, g) }
	return groups, nil
}
func (s *SQLiteStore) CreateMealGroup(mealPlanID, name, date, slot string, position int) (*MealGroup, error) {
	id := uuid.New().String()
	_, err := s.db.Exec(`INSERT INTO meal_groups (id, meal_plan_id, date, slot, name, position) VALUES (?,?,?,?,?,?)`, id, mealPlanID, date, slot, name, position)
	if err != nil { return nil, err }
	return &MealGroup{ID: id, MealPlanID: mealPlanID, Date: date, Slot: slot, Name: name, Position: position}, nil
}
func (s *SQLiteStore) DeleteMealGroup(id string) error { _, err := s.db.Exec(`DELETE FROM meal_groups WHERE id = ?`, id); return err }

func (s *SQLiteStore) ListBooks(userID string) ([]RecipeBook, error) {
	rows, err := s.db.Query(`SELECT id, user_id, title, description, cover_color, created_at, updated_at FROM recipe_books WHERE user_id = ? ORDER BY updated_at DESC`, userID)
	if err != nil { return nil, err }
	defer rows.Close()
	var books []RecipeBook
	for rows.Next() { var b RecipeBook; rows.Scan(&b.ID, &b.UserID, &b.Title, &b.Description, &b.CoverColor, &b.CreatedAt, &b.UpdatedAt); books = append(books, b) }
	return books, nil
}
func (s *SQLiteStore) GetBook(userID, id string) (*RecipeBook, error) {
	b := &RecipeBook{}
	err := s.db.QueryRow(`SELECT id, user_id, title, description, cover_color, created_at, updated_at FROM recipe_books WHERE user_id = ? AND id = ?`, userID, id).Scan(&b.ID, &b.UserID, &b.Title, &b.Description, &b.CoverColor, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return b, nil
}
func (s *SQLiteStore) CreateBook(userID string, req *CreateBookRequest) (*RecipeBook, error) {
	id := uuid.New().String(); now := time.Now().UTC(); cc := "#059669"; if req.CoverColor != "" { cc = req.CoverColor }
	_, err := s.db.Exec(`INSERT INTO recipe_books (id, user_id, title, description, cover_color, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, id, userID, req.Title, req.Description, cc, now, now)
	if err != nil { return nil, err }
	return &RecipeBook{ID: id, UserID: userID, Title: req.Title, Description: req.Description, CoverColor: cc, CreatedAt: now, UpdatedAt: now}, nil
}
func (s *SQLiteStore) UpdateBook(userID, id string, req *CreateBookRequest) (*RecipeBook, error) {
	s.db.Exec(`UPDATE recipe_books SET title=?, description=?, cover_color=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?`, req.Title, req.Description, req.CoverColor, userID, id)
	return s.GetBook(userID, id)
}
func (s *SQLiteStore) DeleteBook(userID, id string) error { _, err := s.db.Exec(`DELETE FROM recipe_books WHERE user_id = ? AND id = ?`, userID, id); return err }
func (s *SQLiteStore) ListChapters(bookID string) ([]Chapter, error) {
	rows, err := s.db.Query(`SELECT id, book_id, title, position, page_template_id, recipe_template_id, created_at, updated_at FROM chapters WHERE book_id = ? ORDER BY position`, bookID)
	if err != nil { return nil, err }
	defer rows.Close()
	var chapters []Chapter
	for rows.Next() { var c Chapter; rows.Scan(&c.ID, &c.BookID, &c.Title, &c.Position, &c.PageTemplateID, &c.RecipeTemplateID, &c.CreatedAt, &c.UpdatedAt); chapters = append(chapters, c) }
	return chapters, nil
}
func (s *SQLiteStore) CreateChapter(bookID string, req *CreateChapterRequest) (*Chapter, error) {
	id := uuid.New().String(); now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO chapters (id, book_id, title, position, page_template_id, recipe_template_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`, id, bookID, req.Title, req.Position, req.PageTemplateID, req.RecipeTemplateID, now, now)
	if err != nil { return nil, err }
	return &Chapter{ID: id, BookID: bookID, Title: req.Title, Position: req.Position, CreatedAt: now, UpdatedAt: now}, nil
}
func (s *SQLiteStore) UpdateChapter(id string, req *CreateChapterRequest) (*Chapter, error) {
	s.db.Exec(`UPDATE chapters SET title=?, position=?, page_template_id=?, recipe_template_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, req.Title, req.Position, req.PageTemplateID, req.RecipeTemplateID, id)
	return &Chapter{ID: id, Title: req.Title, Position: req.Position}, nil
}
func (s *SQLiteStore) DeleteChapter(id string) error { _, err := s.db.Exec(`DELETE FROM chapters WHERE id = ?`, id); return err }
func (s *SQLiteStore) ReorderChapters(bookID string, chapterIDs []string) error {
	tx, _ := s.db.Begin()
	for i, chID := range chapterIDs { tx.Exec(`UPDATE chapters SET position = ? WHERE id = ? AND book_id = ?`, i, chID, bookID) }
	return tx.Commit()
}
func (s *SQLiteStore) ListChapterRecipes(chapterID string) ([]ChapterRecipe, error) {
	rows, err := s.db.Query(`SELECT id, chapter_id, recipe_id, position FROM chapter_recipes WHERE chapter_id = ? ORDER BY position`, chapterID)
	if err != nil { return nil, err }
	defer rows.Close()
	var crs []ChapterRecipe
	for rows.Next() { var cr ChapterRecipe; rows.Scan(&cr.ID, &cr.ChapterID, &cr.RecipeID, &cr.Position); crs = append(crs, cr) }
	return crs, nil
}
func (s *SQLiteStore) AddChapterRecipe(chapterID, recipeID string, position int) (*ChapterRecipe, error) {
	id := uuid.New().String()
	_, err := s.db.Exec(`INSERT INTO chapter_recipes (id, chapter_id, recipe_id, position) VALUES (?,?,?,?)`, id, chapterID, recipeID, position)
	if err != nil { return nil, err }
	return &ChapterRecipe{ID: id, ChapterID: chapterID, RecipeID: recipeID, Position: position}, nil
}
func (s *SQLiteStore) RemoveChapterRecipe(chapterID, recipeID string) error { _, err := s.db.Exec(`DELETE FROM chapter_recipes WHERE chapter_id = ? AND recipe_id = ?`, chapterID, recipeID); return err }
func (s *SQLiteStore) ListChapterPages(chapterID string) ([]ChapterPage, error) {
	rows, err := s.db.Query(`SELECT id, chapter_id, title, content, position, created_at, updated_at FROM chapter_pages WHERE chapter_id = ? ORDER BY position`, chapterID)
	if err != nil { return nil, err }
	defer rows.Close()
	var pages []ChapterPage
	for rows.Next() { var p ChapterPage; rows.Scan(&p.ID, &p.ChapterID, &p.Title, &p.Content, &p.Position, &p.CreatedAt, &p.UpdatedAt); pages = append(pages, p) }
	return pages, nil
}
func (s *SQLiteStore) CreateChapterPage(chapterID, title, content string, position int) (*ChapterPage, error) {
	id := uuid.New().String(); now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO chapter_pages (id, chapter_id, title, content, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, id, chapterID, title, content, position, now, now)
	if err != nil { return nil, err }
	return &ChapterPage{ID: id, ChapterID: chapterID, Title: title, Content: content, Position: position, CreatedAt: now, UpdatedAt: now}, nil
}
func (s *SQLiteStore) UpdateChapterPage(id, title, content string, position int) (*ChapterPage, error) {
	s.db.Exec(`UPDATE chapter_pages SET title=?, content=?, position=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, title, content, position, id)
	return &ChapterPage{ID: id, Title: title, Content: content, Position: position}, nil
}
func (s *SQLiteStore) DeleteChapterPage(id string) error { _, err := s.db.Exec(`DELETE FROM chapter_pages WHERE id = ?`, id); return err }
func (s *SQLiteStore) ListCategories() ([]Category, error) {
	rows, err := s.db.Query(`SELECT id, name, parent_id, created_at, updated_at FROM categories ORDER BY name`)
	if err != nil { return nil, err }
	defer rows.Close()
	var cats []Category
	for rows.Next() { var c Category; rows.Scan(&c.ID, &c.Name, &c.ParentID, &c.CreatedAt, &c.UpdatedAt); cats = append(cats, c) }
	return cats, nil
}
func (s *SQLiteStore) CreateCategory(req *CreateCategoryRequest) (*Category, error) {
	id := uuid.New().String(); now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO categories (id, name, parent_id, created_at, updated_at) VALUES (?,?,?,?,?)`, id, req.Name, req.ParentID, now, now)
	if err != nil { return nil, err }
	return &Category{ID: id, Name: req.Name, ParentID: req.ParentID, CreatedAt: now, UpdatedAt: now}, nil
}
func (s *SQLiteStore) UpdateCategory(id string, req *CreateCategoryRequest) (*Category, error) {
	s.db.Exec(`UPDATE categories SET name=?, parent_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, req.Name, req.ParentID, id)
	return &Category{ID: id, Name: req.Name, ParentID: req.ParentID}, nil
}
func (s *SQLiteStore) DeleteCategory(id string) error { _, err := s.db.Exec(`DELETE FROM categories WHERE id = ?`, id); return err }
func (s *SQLiteStore) ListRecipeCategories(recipeID string) ([]RecipeCategory, error) {
	rows, err := s.db.Query(`SELECT id, recipe_id, category_id FROM recipe_categories WHERE recipe_id = ?`, recipeID)
	if err != nil { return nil, err }
	defer rows.Close()
	var rcs []RecipeCategory
	for rows.Next() { var rc RecipeCategory; rows.Scan(&rc.ID, &rc.RecipeID, &rc.CategoryID); rcs = append(rcs, rc) }
	return rcs, nil
}
func (s *SQLiteStore) AddRecipeCategory(recipeID, categoryID string) (*RecipeCategory, error) {
	id := uuid.New().String()
	_, err := s.db.Exec(`INSERT INTO recipe_categories (id, recipe_id, category_id) VALUES (?,?,?)`, id, recipeID, categoryID)
	if err != nil { return nil, err }
	return &RecipeCategory{ID: id, RecipeID: recipeID, CategoryID: categoryID}, nil
}
func (s *SQLiteStore) RemoveRecipeCategory(recipeID, categoryID string) error { _, err := s.db.Exec(`DELETE FROM recipe_categories WHERE recipe_id = ? AND category_id = ?`, recipeID, categoryID); return err }
func (s *SQLiteStore) ListCustomFoods(userID string) ([]CustomFood, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, shared_with_community, created_at FROM custom_foods WHERE user_id = ? ORDER BY name`, userID)
	if err != nil { return nil, err }
	defer rows.Close()
	var foods []CustomFood
	for rows.Next() {
		var f CustomFood
		rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.SharedWithCommunity, &f.CreatedAt)
		foods = append(foods, f)
	}
	return foods, nil
}
func (s *SQLiteStore) GetCustomFood(userID, id string) (*CustomFood, error) {
	f := &CustomFood{}
	err := s.db.QueryRow(`SELECT id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, shared_with_community, created_at FROM custom_foods WHERE user_id = ? AND id = ?`, userID, id).Scan(&f.ID, &f.UserID, &f.Name, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.SharedWithCommunity, &f.CreatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return f, nil
}
func (s *SQLiteStore) CreateCustomFood(userID string, req *CreateCustomFoodRequest) (*CustomFood, error) {
	id := uuid.New().String(); now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO custom_foods (id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, userID, req.Name, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, now)
	if err != nil { return nil, err }
	return &CustomFood{ID: id, UserID: userID, Name: req.Name, Calories: req.Calories, CreatedAt: now}, nil
}
func (s *SQLiteStore) UpdateCustomFood(userID, id string, req *CreateCustomFoodRequest) (*CustomFood, error) {
	s.db.Exec(`UPDATE custom_foods SET name=?, calories=?, total_fat=?, saturated_fat=?, trans_fat=?, cholesterol=?, sodium=?, total_carbs=?, dietary_fiber=?, total_sugars=?, added_sugars=?, protein=?, vitamin_d=?, calcium=?, iron=?, potassium=? WHERE user_id=? AND id=?`,
		req.Name, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, userID, id)
	return s.GetCustomFood(userID, id)
}
func (s *SQLiteStore) DeleteCustomFood(userID, id string) error { _, err := s.db.Exec(`DELETE FROM custom_foods WHERE user_id = ? AND id = ?`, userID, id); return err }
func (s *SQLiteStore) ShareCustomFood(userID, id string) error { _, err := s.db.Exec(`UPDATE custom_foods SET shared_with_community = 1 WHERE user_id = ? AND id = ?`, userID, id); return err }
func (s *SQLiteStore) ListSharedCustomFoods(page, perPage int) ([]CustomFood, int, error) {
	if perPage <= 0 { perPage = 20 }; if page <= 0 { page = 1 }
	var total int; s.db.QueryRow(`SELECT COUNT(*) FROM custom_foods WHERE shared_with_community = 1`).Scan(&total)
	offset := (page - 1) * perPage
	rows, err := s.db.Query(`SELECT id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, shared_with_community, created_at FROM custom_foods WHERE shared_with_community = 1 ORDER BY name LIMIT ? OFFSET ?`, perPage, offset)
	if err != nil { return nil, 0, err }
	defer rows.Close()
	var foods []CustomFood
	for rows.Next() {
		var f CustomFood
		rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.SharedWithCommunity, &f.CreatedAt)
		foods = append(foods, f)
	}
	return foods, total, nil
}
func (s *SQLiteStore) GetGroceryChecklist(userID, weekStart string) (*GroceryChecklist, error) {
	g := &GroceryChecklist{}
	err := s.db.QueryRow(`SELECT id, user_id, week_start, checked_items, updated_at FROM grocery_checklists WHERE user_id = ? AND week_start = ?`, userID, weekStart).Scan(&g.ID, &g.UserID, &g.WeekStart, &g.CheckedItems, &g.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return g, nil
}
func (s *SQLiteStore) UpsertGroceryChecklist(userID string, g *GroceryChecklist) (*GroceryChecklist, error) {
	id := uuid.New().String(); now := time.Now().UTC()
	s.db.Exec(`INSERT INTO grocery_checklists (id, user_id, week_start, checked_items, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id, week_start) DO UPDATE SET checked_items=?, updated_at=?`,
		id, userID, g.WeekStart, g.CheckedItems, now, g.CheckedItems, now)
	return s.GetGroceryChecklist(userID, g.WeekStart)
}
func (s *SQLiteStore) ListBookPages(bookID string) ([]BookPage, error) {
	rows, err := s.db.Query(`SELECT id, book_id, title, content, position, created_at, updated_at FROM book_pages WHERE book_id = ? ORDER BY position`, bookID)
	if err != nil { return nil, err }
	defer rows.Close()
	var pages []BookPage
	for rows.Next() { var p BookPage; rows.Scan(&p.ID, &p.BookID, &p.Title, &p.Content, &p.Position, &p.CreatedAt, &p.UpdatedAt); pages = append(pages, p) }
	return pages, nil
}
func (s *SQLiteStore) CreateBookPage(bookID, title, content string, position int) (*BookPage, error) {
	id := uuid.New().String(); now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO book_pages (id, book_id, title, content, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, id, bookID, title, content, position, now, now)
	if err != nil { return nil, err }
	return &BookPage{ID: id, BookID: bookID, Title: title, Content: content, Position: position, CreatedAt: now, UpdatedAt: now}, nil
}
func (s *SQLiteStore) UpdateBookPage(id, title, content string, position int) (*BookPage, error) {
	s.db.Exec(`UPDATE book_pages SET title=?, content=?, position=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, title, content, position, id)
	return &BookPage{ID: id, Title: title, Content: content, Position: position}, nil
}
func (s *SQLiteStore) DeleteBookPage(id string) error { _, err := s.db.Exec(`DELETE FROM book_pages WHERE id = ?`, id); return err }
func (s *SQLiteStore) ListAPIKeys(userID string) ([]ApiKey, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, key_hash, key_prefix, permissions, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil { return nil, err }
	defer rows.Close()
	var keys []ApiKey
	for rows.Next() { var k ApiKey; rows.Scan(&k.ID, &k.UserID, &k.Name, &k.KeyHash, &k.KeyPrefix, &k.Permissions, &k.LastUsedAt, &k.CreatedAt); keys = append(keys, k) }
	return keys, nil
}
func (s *SQLiteStore) CreateAPIKey(userID, name, permissions string) (*ApiKey, string, error) {
	key, err := generateAPIKey(); if err != nil { return nil, "", err }
	hash, err := bcrypt.GenerateFromPassword([]byte(key), bcrypt.DefaultCost); if err != nil { return nil, "", err }
	id := uuid.New().String(); now := time.Now().UTC(); prefix := key[:8]
	_, err = s.db.Exec(`INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, permissions, created_at) VALUES (?,?,?,?,?,?,?)`, id, userID, name, string(hash), prefix, permissions, now)
	if err != nil { return nil, "", err }
	return &ApiKey{ID: id, UserID: userID, Name: name, KeyPrefix: prefix, Permissions: permissions, CreatedAt: now}, key, nil
}
func (s *SQLiteStore) DeleteAPIKey(userID, id string) error { _, err := s.db.Exec(`DELETE FROM api_keys WHERE user_id = ? AND id = ?`, userID, id); return err }

// ── Sharing (same as existing store.go) ──

func (s *SQLiteStore) CreateSharedRecipe(userID, recipeID, title, description, category, tags, recipeData string, isPublic bool) (*SharedRecipe, error) {
	id := uuid.New().String(); shareToken := uuid.New().String(); now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO shared_recipes (id, user_id, recipe_id, share_token, is_public, title, description, category, tags, recipe_data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		id, userID, recipeID, shareToken, isPublic, title, description, category, tags, recipeData, now, now)
	if err != nil { return nil, err }
	return &SharedRecipe{ID: id, UserID: userID, RecipeID: recipeID, ShareToken: shareToken, IsPublic: isPublic, Title: title, Description: description, Category: category, Tags: tags, RecipeData: recipeData, CreatedAt: now, UpdatedAt: now}, nil
}
func (s *SQLiteStore) GetSharedRecipeByToken(shareToken string) (*SharedRecipe, error) {
	r := &SharedRecipe{}
	err := s.db.QueryRow(`SELECT id, user_id, recipe_id, share_token, is_public, title, description, category, tags, recipe_data, view_count, import_count, average_rating, rating_count, created_at, updated_at FROM shared_recipes WHERE share_token = ?`, shareToken).Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.IsPublic, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	return r, nil
}
func (s *SQLiteStore) GetSharedRecipesByUser(userID string) ([]SharedRecipe, error) {
	rows, err := s.db.Query(`SELECT id, user_id, recipe_id, share_token, is_public, title, description, category, tags, recipe_data, view_count, import_count, average_rating, rating_count, created_at, updated_at FROM shared_recipes WHERE user_id = ? ORDER BY updated_at DESC`, userID)
	if err != nil { return nil, err }
	defer rows.Close()
	var recipes []SharedRecipe
	for rows.Next() { var r SharedRecipe; rows.Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.IsPublic, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt); recipes = append(recipes, r) }
	return recipes, nil
}
func (s *SQLiteStore) SetSharedRecipePublic(id string, isPublic bool) error { _, err := s.db.Exec(`UPDATE shared_recipes SET is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, isPublic, id); return err }
func (s *SQLiteStore) DeleteSharedRecipe(id string) error { _, err := s.db.Exec(`UPDATE shared_recipes SET is_public = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id); return err }
func (s *SQLiteStore) IncrementSharedRecipeViews(id string) error { _, err := s.db.Exec(`UPDATE shared_recipes SET view_count = view_count + 1 WHERE id = ?`, id); return err }
func (s *SQLiteStore) IncrementSharedRecipeImports(id string) error { _, err := s.db.Exec(`UPDATE shared_recipes SET import_count = import_count + 1 WHERE id = ?`, id); return err }
func (s *SQLiteStore) UpsertRecipeRating(recipeID, userID string, rating int) error {
	now := time.Now().UTC()
	s.db.Exec(`INSERT INTO recipe_ratings (id, recipe_id, user_id, rating, created_at, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(recipe_id, user_id) DO UPDATE SET rating = ?, updated_at = ?`,
		uuid.New().String(), recipeID, userID, rating, now, now, rating, now)
	return s.recalcAvgRating(recipeID)
}
func (s *SQLiteStore) recalcAvgRating(recipeID string) error {
	var avg float64; var count int
	s.db.QueryRow(`SELECT COALESCE(AVG(rating), 0), COUNT(*) FROM recipe_ratings WHERE recipe_id = ?`, recipeID).Scan(&avg, &count)
	_, err := s.db.Exec(`UPDATE shared_recipes SET average_rating = ?, rating_count = ? WHERE id = ?`, avg, count, recipeID)
	return err
}
func (s *SQLiteStore) SearchCommunityRecipes(query, category, sort string, page, perPage int) ([]SharedRecipe, error) {
	if perPage <= 0 { perPage = 20 }; if page <= 0 { page = 1 }
	offset := (page - 1) * perPage
	orderClause := "ORDER BY s.created_at DESC"
	if sort == "rating" { orderClause = "ORDER BY s.average_rating DESC" }
	if sort == "most_imported" { orderClause = "ORDER BY s.import_count DESC" }
	whereClause := "WHERE s.is_public = 1"
	args := []interface{}{}
	if query != "" { whereClause += " AND s.title LIKE ?"; args = append(args, "%"+query+"%") }
	if category != "" { whereClause += " AND s.category = ?"; args = append(args, category) }
	args = append(args, perPage, offset)
	rows, err := s.db.Query(`SELECT s.id, s.user_id, s.recipe_id, s.share_token, s.is_public, s.title, s.description, s.category, s.tags, '' as recipe_data, s.view_count, s.import_count, s.average_rating, s.rating_count, s.created_at, s.updated_at FROM shared_recipes s `+whereClause+` `+orderClause+` LIMIT ? OFFSET ?`, args...)
	if err != nil { return nil, err }
	defer rows.Close()
	var recipes []SharedRecipe
	for rows.Next() { var r SharedRecipe; rows.Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.IsPublic, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt); recipes = append(recipes, r) }
	return recipes, nil
}
func (s *SQLiteStore) GetCommunityCategories() ([]CommunityCategory, error) {
	rows, err := s.db.Query(`SELECT id, name, slug FROM community_categories ORDER BY name`)
	if err != nil { return nil, err }
	defer rows.Close()
	var cats []CommunityCategory
	for rows.Next() { var c CommunityCategory; rows.Scan(&c.ID, &c.Name, &c.Slug); cats = append(cats, c) }
	return cats, nil
}
func (s *SQLiteStore) SeedCategories() error {
	cats := []CommunityCategory{
		{ID: uuid.New().String(), Name: "Breakfast", Slug: "breakfast"},
		{ID: uuid.New().String(), Name: "Lunch", Slug: "lunch"},
		{ID: uuid.New().String(), Name: "Dinner", Slug: "dinner"},
		{ID: uuid.New().String(), Name: "Desserts", Slug: "desserts"},
		{ID: uuid.New().String(), Name: "Snacks", Slug: "snacks"},
		{ID: uuid.New().String(), Name: "Beverages", Slug: "beverages"},
		{ID: uuid.New().String(), Name: "Appetizers", Slug: "appetizers"},
		{ID: uuid.New().String(), Name: "Soups", Slug: "soups"},
		{ID: uuid.New().String(), Name: "Salads", Slug: "salads"},
		{ID: uuid.New().String(), Name: "Sides", Slug: "sides"},
	}
	for _, c := range cats { s.db.Exec(`INSERT OR IGNORE INTO community_categories (id, name, slug) VALUES (?, ?, ?)`, c.ID, c.Name, c.Slug) }
	return nil
}

func init() { log.Println("[SQLiteStore] Registered") }
