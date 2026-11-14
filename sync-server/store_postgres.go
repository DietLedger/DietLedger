package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
)

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(connString string) (*PostgresStore, error) {
	db, err := sql.Open("pgx", connString)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &PostgresStore{db: db}, nil
}

func (s *PostgresStore) Close() error {
	return s.db.Close()
}

func (s *PostgresStore) DB() *sql.DB {
	return s.db
}

func generateAPIKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "dl_" + hex.EncodeToString(b), nil
}

// ── Users & Auth ─────────────────────────────────────────────────────

func (s *PostgresStore) CreateUser(email, password, displayName string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	apiKey, err := generateAPIKey()
	if err != nil {
		return nil, fmt.Errorf("generate api key: %w", err)
	}
	id := uuid.New().String()
	now := time.Now().UTC()
	// The first registered user becomes the administrator.
	isAdmin := false
	var userCount int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&userCount); err != nil {
		return nil, fmt.Errorf("count users: %w", err)
	}
	if userCount == 0 {
		isAdmin = true
	}
	_, err = s.db.Exec(
		`INSERT INTO users (id, email, display_name, password_hash, api_key, is_admin, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
		id, email, displayName, string(hash), apiKey, isAdmin, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return &User{ID: id, Email: email, DisplayName: displayName, PasswordHash: string(hash), APIKey: apiKey, IsAdmin: isAdmin, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) GetUserByAPIKey(apiKey string) (*User, error) {
	return s.scanUser(`SELECT id, email, display_name, password_hash, api_key, is_admin, created_at, updated_at FROM users WHERE api_key = $1`, apiKey)
}

func (s *PostgresStore) GetUserByID(id string) (*User, error) {
	return s.scanUser(`SELECT id, email, display_name, password_hash, api_key, is_admin, created_at, updated_at FROM users WHERE id = $1`, id)
}

func (s *PostgresStore) GetUserByEmail(email string) (*User, error) {
	return s.scanUser(`SELECT id, email, display_name, password_hash, api_key, is_admin, created_at, updated_at FROM users WHERE email = $1`, email)
}

func (s *PostgresStore) UpdateUserLastLogin(id string) error {
	_, err := s.db.Exec(`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) UserCount() (int, error) {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

// ── Instance metadata ────────────────────────────────────────────────

func (s *PostgresStore) GetInstanceState() (*InstanceState, error) {
	var (
		st        InstanceState
		completed sql.NullTime
	)
	err := s.db.QueryRow(
		`SELECT m.onboarding_completed_at, m.registration_enabled, m.onboarding_version, m.updated_at,
		        EXISTS(SELECT 1 FROM users LIMIT 1) AS has_users
		 FROM instance_meta m WHERE m.id = 1`,
	).Scan(&completed, &st.RegistrationEnabled, &st.OnboardingVersion, &st.UpdatedAt, &st.HasUsers)
	if err != nil {
		return nil, err
	}
	if completed.Valid {
		st.OnboardingCompletedAt = &completed.Time
		st.OnboardingComplete = true
	}
	return &st, nil
}

func (s *PostgresStore) CompleteOnboarding(version int) error {
	_, err := s.db.Exec(
		`UPDATE instance_meta
		 SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
		     onboarding_version = $1,
		     updated_at = NOW()
		 WHERE id = 1`,
		version,
	)
	return err
}

func (s *PostgresStore) SetRegistrationEnabled(enabled bool) error {
	_, err := s.db.Exec(
		`UPDATE instance_meta SET registration_enabled = $1, updated_at = NOW() WHERE id = 1`,
		enabled,
	)
	return err
}

// userDataTables are the user-generated content tables. Wiped by both resets.
// Reference data (USDA food_items, seed_jobs), accounts (users), preferences
// (user_settings), and instance config (instance_meta) are NOT included here.
var userDataTables = []string{
	"ingredients", "recipes", "recipe_categories", "recipe_ratings",
	"categories", "chapter_recipes", "chapter_pages", "book_pages",
	"chapters", "recipe_books", "shared_recipes", "community_categories",
	"day_plan_entries", "meal_groups", "grocery_checklists", "meal_plans",
	"food_log_entries", "weight_entries", "person_profiles",
	"custom_foods", "food_storage_defaults", "allergen_rules", "dietary_profiles",
	"templates", "brand_kits", "pantry_staples", "seasonal_foods",
	"user_secrets", "user_locations", "devices", "api_keys",
}

// ResetUserData deletes all user-generated content but keeps accounts,
// settings, instance configuration, and the USDA food database intact.
func (s *PostgresStore) ResetUserData() error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(
		fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE", strings.Join(userDataTables, ", ")),
	); err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	// Restore the default global staples (TRUNCATE above cleared them).
	return s.SeedGlobalStaples()
}

// FactoryReset wipes everything user-created AND all accounts/sessions, then
// resets instance onboarding so the next visitor re-runs the setup wizard.
// USDA food data is preserved (re-downloading it is expensive).
func (s *PostgresStore) FactoryReset() error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(
		fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE", strings.Join(userDataTables, ", ")),
	); err != nil {
		tx.Rollback()
		return err
	}
	// accounts + sessions + preferences (users last; cascade handles FKs)
	if _, err := tx.Exec(`TRUNCATE TABLE refresh_tokens, user_settings, users RESTART IDENTITY CASCADE`); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.Exec(
		`UPDATE instance_meta SET onboarding_completed_at = NULL, registration_enabled = TRUE, updated_at = NOW() WHERE id = 1`,
	); err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return s.SeedGlobalStaples()
}

func (s *PostgresStore) scanUser(query string, args ...interface{}) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(query, args...).Scan(&u.ID, &u.Email, &u.DisplayName, &u.PasswordHash, &u.APIKey, &u.IsAdmin, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

// ── Recipes ──────────────────────────────────────────────────────────

func (s *PostgresStore) ListRecipes(userID string, page, perPage int) ([]Recipe, int, error) {
	if perPage <= 0 {
		perPage = 20
	}
	if page <= 0 {
		page = 1
	}
	var total int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM recipes WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * perPage
	rows, err := s.db.Query(
		`SELECT id, user_id, name, servings, serving_name, prep_time, cook_time, instructions, leftover_storage, COALESCE(ingredient_groups,'[]'), created_at, updated_at, portable_id FROM recipes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
		userID, perPage, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var recipes []Recipe
	for rows.Next() {
		var r Recipe
		var groupsJSON string
		if err := rows.Scan(&r.ID, &r.UserID, &r.Name, &r.Servings, &r.ServingName, &r.PrepTime, &r.CookTime, &r.Instructions, &r.LeftoverStorage, &groupsJSON, &r.CreatedAt, &r.UpdatedAt, &r.PortableID); err != nil {
			return nil, 0, err
		}
		r.ScanIngredientGroups(groupsJSON)
		ings, err := s.listIngredientsByRecipe(r.ID)
		if err != nil {
			return nil, 0, err
		}
		r.Ingredients = ings
		recipes = append(recipes, r)
	}
	return recipes, total, nil
}

func (s *PostgresStore) GetRecipe(userID, id string) (*Recipe, error) {
	r := &Recipe{}
	var groupsJSON string
	err := s.db.QueryRow(
		`SELECT id, user_id, name, servings, serving_name, prep_time, cook_time, instructions, leftover_storage, COALESCE(ingredient_groups,'[]'), created_at, updated_at, portable_id FROM recipes WHERE user_id = $1 AND id = $2`,
		userID, id,
	).Scan(&r.ID, &r.UserID, &r.Name, &r.Servings, &r.ServingName, &r.PrepTime, &r.CookTime, &r.Instructions, &r.LeftoverStorage, &groupsJSON, &r.CreatedAt, &r.UpdatedAt, &r.PortableID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.ScanIngredientGroups(groupsJSON)
	ings, err := s.listIngredientsByRecipe(r.ID)
	if err != nil {
		return nil, err
	}
	r.Ingredients = ings
	return r, nil
}

func (s *PostgresStore) CreateRecipe(userID string, req *CreateRecipeRequest) (*Recipe, error) {
	return s.createRecipeAtomic(userID, req)
}

func (s *PostgresStore) UpdateRecipe(userID, id string, req *UpdateRecipeRequest) (*Recipe, error) {
	now := time.Now().UTC()
	setClauses := []string{"updated_at = $1"}
	args := []interface{}{now}
	argN := 2
	if req.Name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", argN))
		args = append(args, *req.Name)
		argN++
	}
	if req.Servings != nil {
		setClauses = append(setClauses, fmt.Sprintf("servings = $%d", argN))
		args = append(args, *req.Servings)
		argN++
	}
	if req.ServingName != nil {
		setClauses = append(setClauses, fmt.Sprintf("serving_name = $%d", argN))
		args = append(args, *req.ServingName)
		argN++
	}
	if req.PrepTime != nil {
		setClauses = append(setClauses, fmt.Sprintf("prep_time = $%d", argN))
		args = append(args, *req.PrepTime)
		argN++
	}
	if req.CookTime != nil {
		setClauses = append(setClauses, fmt.Sprintf("cook_time = $%d", argN))
		args = append(args, *req.CookTime)
		argN++
	}
	if req.Instructions != nil {
		setClauses = append(setClauses, fmt.Sprintf("instructions = $%d", argN))
		args = append(args, *req.Instructions)
		argN++
	}
	if req.LeftoverStorage != nil {
		setClauses = append(setClauses, fmt.Sprintf("leftover_storage = $%d", argN))
		args = append(args, *req.LeftoverStorage)
		argN++
	}
	if req.IngredientGroups != nil {
		setClauses = append(setClauses, fmt.Sprintf("ingredient_groups = $%d", argN))
		args = append(args, *req.IngredientGroups)
		argN++
	}
	args = append(args, userID, id)
	query := fmt.Sprintf("UPDATE recipes SET %s WHERE user_id = $%d AND id = $%d", strings.Join(setClauses, ", "), argN, argN+1)
	res, err := s.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, nil
	}
	if req.Ingredients != nil {
		if err := s.ReplaceIngredients(id, *req.Ingredients); err != nil {
			return nil, err
		}
	}
	return s.GetRecipe(userID, id)
}

func (s *PostgresStore) DeleteRecipe(userID, id string) error {
	res, err := s.db.Exec(`DELETE FROM recipes WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("recipe not found")
	}
	_, _ = s.db.Exec(`DELETE FROM day_plan_entries WHERE recipe_id = $1`, id)
	_, _ = s.db.Exec(`DELETE FROM chapter_recipes WHERE recipe_id = $1`, id)
	_, _ = s.db.Exec(`DELETE FROM recipe_categories WHERE recipe_id = $1`, id)
	return nil
}

// ── Ingredients ──────────────────────────────────────────────────────

func ingredientSourceJSON(v interface{}) (interface{}, error) {
	if v == nil || (reflect.ValueOf(v).Kind() == reflect.Ptr && reflect.ValueOf(v).IsNil()) {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func requestedZeroOverride(v *bool) bool { return v != nil && *v }

func (s *PostgresStore) listIngredientsByRecipe(recipeID string) ([]Ingredient, error) {
	return listIngredientsByRecipeQuery(s.db, recipeID)
}

func listIngredientsByRecipeQuery(q interface {
	Query(string, ...interface{}) (*sql.Rows, error)
}, recipeID string) ([]Ingredient, error) {
	rows, err := q.Query(
		`SELECT id, recipe_id, fdc_id, name, amount, unit, COALESCE(description,''), calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, COALESCE(prep_instructions,'[]'), COALESCE(storage_location,''), group_id, linked_recipe_id, COALESCE(source_type,'manual'), source_key, position, zero_nutrition_override, unresolved_source_ref, unconfirmed_nutrition FROM ingredients WHERE recipe_id = $1 ORDER BY position, id`,
		recipeID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ings []Ingredient
	for rows.Next() {
		var i Ingredient
		var prepJSON string
		var unresolvedJSON, unconfirmedJSON []byte
		if err := rows.Scan(&i.ID, &i.RecipeID, &i.FdcID, &i.Name, &i.Amount, &i.Unit, &i.Description, &i.Calories, &i.TotalFat, &i.SaturatedFat, &i.TransFat, &i.Cholesterol, &i.Sodium, &i.TotalCarbs, &i.DietaryFiber, &i.TotalSugars, &i.AddedSugars, &i.Protein, &i.VitaminD, &i.Calcium, &i.Iron, &i.Potassium, &prepJSON, &i.StorageLocation, &i.GroupID, &i.LinkedRecipeID, &i.SourceType, &i.SourceKey, &i.Position, &i.ZeroNutritionOverride, &unresolvedJSON, &unconfirmedJSON); err != nil {
			return nil, err
		}
		i.ScanPrepInstructions(prepJSON)
		if len(unresolvedJSON) > 0 && string(unresolvedJSON) != "null" {
			i.UnresolvedSource = &BundleIngredientSourceRef{}
			if err := json.Unmarshal(unresolvedJSON, i.UnresolvedSource); err != nil {
				return nil, err
			}
		}
		if len(unconfirmedJSON) > 0 && string(unconfirmedJSON) != "null" {
			i.UnconfirmedNutrition = &UnconfirmedIngredientNutrition{}
			if err := json.Unmarshal(unconfirmedJSON, i.UnconfirmedNutrition); err != nil {
				return nil, err
			}
		}
		ings = append(ings, i)
	}
	return ings, nil
}

func (s *PostgresStore) CreateIngredient(recipeID string, ing *CreateIngredientReq) (*Ingredient, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var lockedRecipeID string
	if err := tx.QueryRow(`SELECT id FROM recipes WHERE id=$1 FOR UPDATE`, recipeID).Scan(&lockedRecipeID); err != nil {
		return nil, err
	}
	position := 0
	if err := tx.QueryRow(`SELECT COALESCE(MAX(position), -1) + 1 FROM ingredients WHERE recipe_id=$1`, recipeID).Scan(&position); err != nil {
		return nil, err
	}
	id := uuid.New().String()
	prepJSON := PrepInstructionsJSON(ing.PrepInstructions)
	sourceType := ing.SourceType
	if sourceType == "" {
		sourceType = "manual"
	}
	unresolvedJSON, err := ingredientSourceJSON(ing.UnresolvedSource)
	if err != nil {
		return nil, err
	}
	unconfirmedJSON, err := ingredientSourceJSON(ing.UnconfirmedNutrition)
	if err != nil {
		return nil, err
	}
	zero := requestedZeroOverride(ing.ZeroNutritionOverride)
	_, err = tx.Exec(
		`INSERT INTO ingredients (id, recipe_id, fdc_id, name, amount, unit, description, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, prep_instructions, storage_location, group_id, linked_recipe_id, source_type, source_key, position, zero_nutrition_override, unresolved_source_ref, unconfirmed_nutrition) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)`,
		id, recipeID, ing.FdcID, ing.Name, ing.Amount, ing.Unit, ing.Description, ing.Calories, ing.TotalFat, ing.SaturatedFat, ing.TransFat, ing.Cholesterol, ing.Sodium, ing.TotalCarbs, ing.DietaryFiber, ing.TotalSugars, ing.AddedSugars, ing.Protein, ing.VitaminD, ing.Calcium, ing.Iron, ing.Potassium, prepJSON, ing.StorageLocation, ing.GroupID, ing.LinkedRecipeID, sourceType, ing.SourceKey, position, zero, unresolvedJSON, unconfirmedJSON,
	)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &Ingredient{ID: id, RecipeID: recipeID, FdcID: ing.FdcID, Name: ing.Name, Amount: ing.Amount, Unit: ing.Unit, Description: ing.Description, Calories: ing.Calories, TotalFat: ing.TotalFat, SaturatedFat: ing.SaturatedFat, TransFat: ing.TransFat, Cholesterol: ing.Cholesterol, Sodium: ing.Sodium, TotalCarbs: ing.TotalCarbs, DietaryFiber: ing.DietaryFiber, TotalSugars: ing.TotalSugars, AddedSugars: ing.AddedSugars, Protein: ing.Protein, VitaminD: ing.VitaminD, Calcium: ing.Calcium, Iron: ing.Iron, Potassium: ing.Potassium, GroupID: ing.GroupID, LinkedRecipeID: ing.LinkedRecipeID, SourceType: sourceType, SourceKey: ing.SourceKey, PrepInstructions: ing.PrepInstructions, StorageLocation: ing.StorageLocation, Position: position, ZeroNutritionOverride: zero, UnresolvedSource: ing.UnresolvedSource, UnconfirmedNutrition: ing.UnconfirmedNutrition}, nil
}

func (s *PostgresStore) UpdateIngredient(userID, recipeID, id string, ing *CreateIngredientReq) (*Ingredient, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Lock the existing ingredient: both authorization and the first-choice
	// transition must refer to this same row, even under concurrent updates.
	var oldLocation, oldType string
	var oldKey sql.NullString
	var oldFdcID, position int
	var oldLinkedRecipe sql.NullString
	var oldZero bool
	var oldUnresolvedJSON, oldUnconfirmedJSON []byte
	err = tx.QueryRow(`SELECT COALESCE(i.storage_location,''), COALESCE(i.source_type,'manual'), i.source_key, i.fdc_id, i.linked_recipe_id, i.position, i.zero_nutrition_override, i.unresolved_source_ref, i.unconfirmed_nutrition
		FROM ingredients i JOIN recipes r ON r.id = i.recipe_id
		WHERE i.id=$1 AND i.recipe_id=$2 AND r.user_id=$3 FOR UPDATE OF i`, id, recipeID, userID).
		Scan(&oldLocation, &oldType, &oldKey, &oldFdcID, &oldLinkedRecipe, &position, &oldZero, &oldUnresolvedJSON, &oldUnconfirmedJSON)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	prepJSON := PrepInstructionsJSON(ing.PrepInstructions)
	sourceType := ing.SourceType
	if sourceType == "" {
		sourceType = "manual"
	}
	unresolvedJSON := interface{}(nil)
	if ing.UnresolvedSource != nil {
		unresolvedJSON, err = ingredientSourceJSON(ing.UnresolvedSource)
		if err != nil {
			return nil, err
		}
	} else if ing.SourceKey == nil && ing.LinkedRecipeID == nil && ing.FdcID <= 0 && len(oldUnresolvedJSON) > 0 {
		unresolvedJSON = string(oldUnresolvedJSON)
	}
	unconfirmedJSON := interface{}(nil)
	if ing.UnconfirmedNutrition != nil {
		unconfirmedJSON, err = ingredientSourceJSON(ing.UnconfirmedNutrition)
		if err != nil {
			return nil, err
		}
	} else if len(oldUnconfirmedJSON) > 0 {
		unconfirmedJSON = string(oldUnconfirmedJSON)
	}
	zero := oldZero
	if ing.ZeroNutritionOverride != nil {
		zero = *ing.ZeroNutritionOverride
	}
	if ing.FdcID > 0 || ing.SourceKey != nil || ing.LinkedRecipeID != nil {
		zero = false
	}
	if zero {
		unresolvedJSON = nil
	}
	_, err = tx.Exec(
		`UPDATE ingredients SET fdc_id=$1, name=$2, amount=$3, unit=$4, description=$5, calories=$6, total_fat=$7, saturated_fat=$8, trans_fat=$9, cholesterol=$10, sodium=$11, total_carbs=$12, dietary_fiber=$13, total_sugars=$14, added_sugars=$15, protein=$16, vitamin_d=$17, calcium=$18, iron=$19, potassium=$20, prep_instructions=$21, storage_location=$22, group_id=$23, linked_recipe_id=$24, source_type=$25, source_key=$26, zero_nutrition_override=$27, unresolved_source_ref=$28, unconfirmed_nutrition=$29 WHERE id=$30 AND recipe_id=$31`,
		ing.FdcID, ing.Name, ing.Amount, ing.Unit, ing.Description, ing.Calories, ing.TotalFat, ing.SaturatedFat, ing.TransFat, ing.Cholesterol, ing.Sodium, ing.TotalCarbs, ing.DietaryFiber, ing.TotalSugars, ing.AddedSugars, ing.Protein, ing.VitaminD, ing.Calcium, ing.Iron, ing.Potassium, prepJSON, ing.StorageLocation, ing.GroupID, ing.LinkedRecipeID, sourceType, ing.SourceKey, zero, unresolvedJSON, unconfirmedJSON, id, recipeID,
	)
	if err != nil {
		return nil, err
	}

	// A rematch is not a first choice for the new item. USDA identity is its
	// FDC ID (an absent legacy source_key is fine); custom identity is its ID.
	if oldLocation == "" && validFoodStorageLocation(ing.StorageLocation) && !oldLinkedRecipe.Valid && ing.LinkedRecipeID == nil && sourceType == oldType {
		key := ""
		switch sourceType {
		case "usda":
			key = strconv.Itoa(ing.FdcID)
			if ing.FdcID <= 0 || oldFdcID != ing.FdcID || (oldKey.Valid && oldKey.String != "" && oldKey.String != key) || (ing.SourceKey != nil && *ing.SourceKey != key) {
				key = ""
			}
		case "custom_food":
			if oldKey.Valid && oldKey.String != "" && ing.SourceKey != nil && *ing.SourceKey == oldKey.String {
				key = oldKey.String
			}
		}
		if key != "" {
			_, err = tx.Exec(`INSERT INTO food_storage_defaults (user_id, source_type, source_key, custom_food_id, location)
				SELECT $1, $2, $3, CASE WHEN $2 = 'custom_food' THEN $3 ELSE NULL END, $4
				WHERE ($2 = 'usda' AND EXISTS (SELECT 1 FROM food_items WHERE fdc_id = $5))
				   OR ($2 = 'custom_food' AND EXISTS (SELECT 1 FROM custom_foods WHERE id = $3 AND user_id = $1))
				ON CONFLICT (user_id, source_type, source_key) DO NOTHING`, userID, sourceType, key, ing.StorageLocation, ing.FdcID)
			if err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	updated, err := listIngredientsByRecipeQuery(s.db, recipeID)
	if err != nil {
		return nil, err
	}
	for i := range updated {
		if updated[i].ID == id {
			return &updated[i], nil
		}
	}
	return nil, nil
}

func (s *PostgresStore) DeleteIngredient(userID, recipeID, id string) error {
	res, err := s.db.Exec(`DELETE FROM ingredients i USING recipes r WHERE i.id=$1 AND i.recipe_id=$2 AND r.id=$2 AND r.user_id=$3`, id, recipeID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *PostgresStore) ListFoodStorageDefaults(userID string) ([]FoodStorageDefault, error) {
	rows, err := s.db.Query(`SELECT source_type, source_key, location FROM food_storage_defaults WHERE user_id=$1 ORDER BY source_type, source_key`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	defaults := []FoodStorageDefault{}
	for rows.Next() {
		var d FoodStorageDefault
		if err := rows.Scan(&d.SourceType, &d.SourceKey, &d.Location); err != nil {
			return nil, err
		}
		defaults = append(defaults, d)
	}
	return defaults, rows.Err()
}

func (s *PostgresStore) UpsertFoodStorageDefault(userID, sourceType, sourceKey, location string) (*FoodStorageDefault, error) {
	fdcID, _ := strconv.Atoi(sourceKey) // Handler validates positive canonical FDC IDs.
	var d FoodStorageDefault
	err := s.db.QueryRow(`INSERT INTO food_storage_defaults (user_id, source_type, source_key, custom_food_id, location)
		SELECT $1, $2, $3, CASE WHEN $2 = 'custom_food' THEN $3 ELSE NULL END, $4
		WHERE ($2 = 'usda' AND EXISTS (SELECT 1 FROM food_items WHERE fdc_id = $5))
		   OR ($2 = 'custom_food' AND EXISTS (SELECT 1 FROM custom_foods WHERE id=$3 AND user_id=$1))
		ON CONFLICT (user_id, source_type, source_key) DO UPDATE SET location=EXCLUDED.location
		RETURNING source_type, source_key, location`, userID, sourceType, sourceKey, location, fdcID).Scan(&d.SourceType, &d.SourceKey, &d.Location)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (s *PostgresStore) ReplaceIngredients(recipeID string, ingredients []CreateIngredientReq) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM ingredients WHERE recipe_id = $1`, recipeID); err != nil {
		tx.Rollback()
		return err
	}
	for position, ing := range ingredients {
		id := uuid.New().String()
		prepJSON := PrepInstructionsJSON(ing.PrepInstructions)
		sourceType := ing.SourceType
		if sourceType == "" {
			sourceType = "manual"
		}
		unresolvedJSON, err := ingredientSourceJSON(ing.UnresolvedSource)
		if err != nil {
			tx.Rollback()
			return err
		}
		unconfirmedJSON, err := ingredientSourceJSON(ing.UnconfirmedNutrition)
		if err != nil {
			tx.Rollback()
			return err
		}
		if _, err := tx.Exec(
			`INSERT INTO ingredients (id, recipe_id, fdc_id, name, amount, unit, description, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, prep_instructions, storage_location, group_id, linked_recipe_id, source_type, source_key, position, zero_nutrition_override, unresolved_source_ref, unconfirmed_nutrition) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)`,
			id, recipeID, ing.FdcID, ing.Name, ing.Amount, ing.Unit, ing.Description, ing.Calories, ing.TotalFat, ing.SaturatedFat, ing.TransFat, ing.Cholesterol, ing.Sodium, ing.TotalCarbs, ing.DietaryFiber, ing.TotalSugars, ing.AddedSugars, ing.Protein, ing.VitaminD, ing.Calcium, ing.Iron, ing.Potassium, prepJSON, ing.StorageLocation, ing.GroupID, ing.LinkedRecipeID, sourceType, ing.SourceKey, position, requestedZeroOverride(ing.ZeroNutritionOverride), unresolvedJSON, unconfirmedJSON,
		); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ── Food Items ───────────────────────────────────────────────────────

// Live search may carry only a subset of a food's portions. Retain existing
// weights for the same measure and append genuinely new portions without
// creating ambiguous duplicate weights for a previously known measure.
func mergeLivePortions(existing, incoming []FoodPortion) []FoodPortion {
	merged := append([]FoodPortion{}, existing...)
	for _, candidate := range incoming {
		found := false
		for _, saved := range merged {
			if saved.Amount == candidate.Amount && saved.MeasureUnit == candidate.MeasureUnit &&
				saved.Modifier == candidate.Modifier && saved.PortionDescription == candidate.PortionDescription {
				found = true
				break
			}
		}
		if !found {
			merged = append(merged, candidate)
		}
	}
	return merged
}

func foodPortionsJSON(portions []FoodPortion) (string, error) {
	if portions == nil {
		portions = []FoodPortion{}
	}
	data, err := json.Marshal(portions)
	return string(data), err
}

func (f *FoodItem) scanPortions(data []byte) error {
	if err := json.Unmarshal(data, &f.Portions); err != nil {
		return err
	}
	if f.Portions == nil {
		f.Portions = []FoodPortion{}
	}
	return nil
}

const meaningfulFoodNutritionSQL = `(calories > 0 OR total_fat > 0 OR saturated_fat > 0 OR trans_fat > 0 OR
	cholesterol > 0 OR sodium > 0 OR total_carbs > 0 OR dietary_fiber > 0 OR total_sugars > 0 OR
	added_sugars > 0 OR protein > 0 OR vitamin_d > 0 OR calcium > 0 OR iron > 0 OR potassium > 0)`

// Literal matches outrank English full-text stemming. In particular, the
// exact token "salt" in "Salt, table" should beat broad descriptions that
// merely contain or stem from the query.
const foodSearchRelevanceOrderSQL = `CASE
	WHEN btrim(regexp_replace(lower(description), '[^[:alnum:]]+', ' ', 'g')) = btrim(regexp_replace(lower($1), '[^[:alnum:]]+', ' ', 'g')) THEN 0
	WHEN strpos(btrim(regexp_replace(lower(description), '[^[:alnum:]]+', ' ', 'g')) || ' ', btrim(regexp_replace(lower($1), '[^[:alnum:]]+', ' ', 'g')) || ' ') = 1 THEN 1
	WHEN strpos(' ' || btrim(regexp_replace(lower(description), '[^[:alnum:]]+', ' ', 'g')) || ' ', ' ' || btrim(regexp_replace(lower($1), '[^[:alnum:]]+', ' ', 'g')) || ' ') > 0 THEN 2
	ELSE 3
END,
ts_rank(search_vector, plainto_tsquery('english', $1)) DESC,
description ASC`

func (s *PostgresStore) SearchFoods(query string, page, perPage int) ([]FoodItem, int, error) {
	if perPage <= 0 {
		perPage = 20
	}
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * perPage
	var total int
	var rows *sql.Rows
	var err error
	args := []interface{}{}
	if query != "" {
		if err := s.db.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM food_items WHERE %s AND search_vector @@ plainto_tsquery('english', $1)`, meaningfulFoodNutritionSQL), query).Scan(&total); err != nil {
			return nil, 0, err
		}
		args = []interface{}{query, perPage, offset}
		rows, err = s.db.Query(
			fmt.Sprintf(`SELECT id, fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at, portions FROM food_items WHERE %s AND search_vector @@ plainto_tsquery('english', $1) ORDER BY %s LIMIT $2 OFFSET $3`, meaningfulFoodNutritionSQL, foodSearchRelevanceOrderSQL),
			args...,
		)
	} else {
		if err := s.db.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM food_items WHERE %s`, meaningfulFoodNutritionSQL)).Scan(&total); err != nil {
			return nil, 0, err
		}
		args = []interface{}{perPage, offset}
		rows, err = s.db.Query(
			fmt.Sprintf(`SELECT id, fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at, portions FROM food_items WHERE %s ORDER BY description LIMIT $1 OFFSET $2`, meaningfulFoodNutritionSQL),
			args...,
		)
	}
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var foods []FoodItem
	for rows.Next() {
		var f FoodItem
		var portions []byte
		if err := rows.Scan(&f.ID, &f.FdcID, &f.Description, &f.DataType, &f.BrandOwner, &f.GtinUpc, &f.ServingSize, &f.ServingSizeUnit, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.Source, &f.CreatedAt, &f.UpdatedAt, &portions); err != nil {
			return nil, 0, err
		}
		if err := f.scanPortions(portions); err != nil {
			return nil, 0, err
		}
		foods = append(foods, f)
	}
	return foods, total, nil
}

func (s *PostgresStore) GetFoodByFdcID(fdcID int) (*FoodItem, error) {
	f := &FoodItem{}
	var portions []byte
	err := s.db.QueryRow(
		`SELECT id, fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at, portions FROM food_items WHERE fdc_id = $1`,
		fdcID,
	).Scan(&f.ID, &f.FdcID, &f.Description, &f.DataType, &f.BrandOwner, &f.GtinUpc, &f.ServingSize, &f.ServingSizeUnit, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.Source, &f.CreatedAt, &f.UpdatedAt, &portions)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := f.scanPortions(portions); err != nil {
		return nil, err
	}
	return f, nil
}

func (s *PostgresStore) GetFoodByGtinUpc(gtinUpc string) (*FoodItem, error) {
	f := &FoodItem{}
	var portions []byte
	err := s.db.QueryRow(
		`SELECT id, fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at, portions FROM food_items WHERE gtin_upc = $1`,
		gtinUpc,
	).Scan(&f.ID, &f.FdcID, &f.Description, &f.DataType, &f.BrandOwner, &f.GtinUpc, &f.ServingSize, &f.ServingSizeUnit, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.Source, &f.CreatedAt, &f.UpdatedAt, &portions)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := f.scanPortions(portions); err != nil {
		return nil, err
	}
	return f, nil
}

func (s *PostgresStore) CreateFoodItem(f *FoodItem) (*FoodItem, error) {
	portions, err := foodPortionsJSON(f.Portions)
	if err != nil {
		return nil, err
	}
	if f.Portions == nil {
		f.Portions = []FoodPortion{}
	}
	now := time.Now().UTC()
	err = s.db.QueryRow(
		`INSERT INTO food_items (fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at, portions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$24,$25) RETURNING id`,
		f.FdcID, f.Description, f.DataType, f.BrandOwner, f.GtinUpc, f.ServingSize, f.ServingSizeUnit, f.Calories, f.TotalFat, f.SaturatedFat, f.TransFat, f.Cholesterol, f.Sodium, f.TotalCarbs, f.DietaryFiber, f.TotalSugars, f.AddedSugars, f.Protein, f.VitaminD, f.Calcium, f.Iron, f.Potassium, f.Source, now, portions,
	).Scan(&f.ID)
	if err != nil {
		return nil, err
	}
	f.CreatedAt = now
	f.UpdatedAt = now
	return f, nil
}

func (s *PostgresStore) ListSeedJobs() ([]SeedJob, error) {
	rows, err := s.db.Query(`SELECT id, data_type, release_date, file_name, record_count, status, progress, error, checkpoint, started_at, completed_at, created_at FROM seed_jobs ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var jobs []SeedJob
	for rows.Next() {
		var j SeedJob
		if err := rows.Scan(&j.ID, &j.DataType, &j.ReleaseDate, &j.FileName, &j.RecordCount, &j.Status, &j.Progress, &j.Error, &j.Checkpoint, &j.StartedAt, &j.CompletedAt, &j.CreatedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func (s *PostgresStore) CreateSeedJob(dataType, releaseDate, fileName string) (*SeedJob, error) {
	now := time.Now().UTC()
	var id int
	err := s.db.QueryRow(
		`INSERT INTO seed_jobs (data_type, release_date, file_name, status, created_at) VALUES ($1,$2,$3,'pending',$4) RETURNING id`,
		dataType, releaseDate, fileName, now,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return &SeedJob{ID: id, DataType: dataType, ReleaseDate: releaseDate, FileName: fileName, Status: "pending", CreatedAt: now}, nil
}

func (s *PostgresStore) UpdateSeedJob(id int, status string, recordCount int, progress float64, errorMsg string) error {
	_, err := s.db.Exec(
		`UPDATE seed_jobs SET status=$1, record_count=$2, progress=$3, error=CASE WHEN $1='failed' THEN $5 ELSE error END, started_at=CASE WHEN $1='running' THEN NOW() ELSE started_at END, completed_at=CASE WHEN $1 IN ('completed','failed') THEN NOW() ELSE completed_at END WHERE id=$4`,
		status, recordCount, progress, id, errorMsg,
	)
	return err
}

func (s *PostgresStore) GetFoodStats() (*FoodStats, error) {
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

func (s *PostgresStore) DeleteAllFoods() error {
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

func (s *PostgresStore) CreateFoodItems(items []FoodItem) (int, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	now := time.Now().UTC()
	inserted := 0
	for _, f := range items {
		portions, err := foodPortionsJSON(f.Portions)
		if err != nil {
			tx.Rollback()
			return inserted, err
		}
		var existingID int
		var existingPortions []byte
		err = tx.QueryRow(`SELECT id, portions FROM food_items WHERE fdc_id = $1 FOR UPDATE`, f.FdcID).Scan(&existingID, &existingPortions)
		if err == nil {
			if f.Source == "usda" && len(f.Portions) > 0 {
				var saved []FoodPortion
				if err := json.Unmarshal(existingPortions, &saved); err != nil {
					tx.Rollback()
					return inserted, err
				}
				portions, err = foodPortionsJSON(mergeLivePortions(saved, f.Portions))
				if err != nil {
					tx.Rollback()
					return inserted, err
				}
			}
			_, err := tx.Exec(
				`UPDATE food_items SET description=$1, data_type=$2, brand_owner=$3, gtin_upc=$4, serving_size=$5, serving_size_unit=$6, calories=$7, total_fat=$8, saturated_fat=$9, trans_fat=$10, cholesterol=$11, sodium=$12, total_carbs=$13, dietary_fiber=$14, total_sugars=$15, added_sugars=$16, protein=$17, vitamin_d=$18, calcium=$19, iron=$20, potassium=$21, source=$22, updated_at=$23, portions=CASE WHEN $25::jsonb = '[]'::jsonb THEN portions ELSE $25::jsonb END WHERE fdc_id=$24`,
				f.Description, f.DataType, f.BrandOwner, f.GtinUpc, f.ServingSize, f.ServingSizeUnit,
				f.Calories, f.TotalFat, f.SaturatedFat, f.TransFat, f.Cholesterol, f.Sodium,
				f.TotalCarbs, f.DietaryFiber, f.TotalSugars, f.AddedSugars, f.Protein,
				f.VitaminD, f.Calcium, f.Iron, f.Potassium, f.Source, now, f.FdcID, portions,
			)
			if err != nil {
				tx.Rollback()
				return inserted, err
			}
			inserted++
			continue
		}
		if err != sql.ErrNoRows {
			tx.Rollback()
			return inserted, err
		}
		_, err = tx.Exec(
			`INSERT INTO food_items (fdc_id, description, data_type, brand_owner, gtin_upc, serving_size, serving_size_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, source, created_at, updated_at, portions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$24,$25)`,
			f.FdcID, f.Description, f.DataType, f.BrandOwner, f.GtinUpc, f.ServingSize, f.ServingSizeUnit,
			f.Calories, f.TotalFat, f.SaturatedFat, f.TransFat, f.Cholesterol, f.Sodium,
			f.TotalCarbs, f.DietaryFiber, f.TotalSugars, f.AddedSugars, f.Protein,
			f.VitaminD, f.Calcium, f.Iron, f.Potassium, f.Source, now, portions,
		)
		if err != nil {
			tx.Rollback()
			return inserted, err
		}
		inserted++
	}
	return inserted, tx.Commit()
}

// ── Nutrition Profiles ───────────────────────────────────────────────

func (s *PostgresStore) ListProfiles(userID string) ([]PersonProfile, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, name, sex, birth_date, height_cm, activity_level, goal_weight_kg, goal_date, bmr_equation, manual_bmr_value, calorie_target, protein_goal_g, carbs_goal_g, fat_goal_g, fiber_goal_g, sodium_max_mg, sugar_max_g, vitamin_d_goal_ug, calcium_goal_mg, iron_goal_mg, potassium_goal_mg, created_at, updated_at FROM person_profiles WHERE user_id = $1 ORDER BY updated_at DESC`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var profiles []PersonProfile
	for rows.Next() {
		var p PersonProfile
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Sex, &p.BirthDate, &p.HeightCm, &p.ActivityLevel, &p.GoalWeightKg, &p.GoalDate, &p.BMREquation, &p.ManualBMRValue, &p.CalorieTarget, &p.ProteinGoalG, &p.CarbsGoalG, &p.FatGoalG, &p.FiberGoalG, &p.SodiumMaxMg, &p.SugarMaxG, &p.VitaminDGoalUg, &p.CalciumGoalMg, &p.IronGoalMg, &p.PotassiumGoalMg, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, nil
}

func (s *PostgresStore) GetProfile(userID, id string) (*PersonProfile, error) {
	p := &PersonProfile{}
	err := s.db.QueryRow(
		`SELECT id, user_id, name, sex, birth_date, height_cm, activity_level, goal_weight_kg, goal_date, bmr_equation, manual_bmr_value, calorie_target, protein_goal_g, carbs_goal_g, fat_goal_g, fiber_goal_g, sodium_max_mg, sugar_max_g, vitamin_d_goal_ug, calcium_goal_mg, iron_goal_mg, potassium_goal_mg, created_at, updated_at FROM person_profiles WHERE user_id = $1 AND id = $2`, userID, id,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Sex, &p.BirthDate, &p.HeightCm, &p.ActivityLevel, &p.GoalWeightKg, &p.GoalDate, &p.BMREquation, &p.ManualBMRValue, &p.CalorieTarget, &p.ProteinGoalG, &p.CarbsGoalG, &p.FatGoalG, &p.FiberGoalG, &p.SodiumMaxMg, &p.SugarMaxG, &p.VitaminDGoalUg, &p.CalciumGoalMg, &p.IronGoalMg, &p.PotassiumGoalMg, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (s *PostgresStore) CreateProfile(userID string, req *CreateProfileRequest) (*PersonProfile, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	al := "moderate"
	if req.ActivityLevel != "" {
		al = req.ActivityLevel
	}
	_, err := s.db.Exec(
		`INSERT INTO person_profiles (id, user_id, name, sex, birth_date, height_cm, activity_level, goal_weight_kg, goal_date, bmr_equation, manual_bmr_value, calorie_target, protein_goal_g, carbs_goal_g, fat_goal_g, fiber_goal_g, sodium_max_mg, sugar_max_g, vitamin_d_goal_ug, calcium_goal_mg, iron_goal_mg, potassium_goal_mg, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)`,
		id, userID, req.Name, req.Sex, req.BirthDate, req.HeightCm, al, req.GoalWeightKg, req.GoalDate, req.BMREquation, req.ManualBMRValue, req.CalorieTarget, req.ProteinGoalG, req.CarbsGoalG, req.FatGoalG, req.FiberGoalG, req.SodiumMaxMg, req.SugarMaxG, req.VitaminDGoalUg, req.CalciumGoalMg, req.IronGoalMg, req.PotassiumGoalMg, now,
	)
	if err != nil {
		return nil, err
	}
	return s.GetProfile(userID, id)
}

func (s *PostgresStore) UpdateProfile(userID, id string, req *CreateProfileRequest) (*PersonProfile, error) {
	_, err := s.db.Exec(
		`UPDATE person_profiles SET name=$1, sex=$2, birth_date=$3, height_cm=$4, activity_level=$5, goal_weight_kg=$6, goal_date=$7, bmr_equation=$8, manual_bmr_value=$9, calorie_target=$10, protein_goal_g=$11, carbs_goal_g=$12, fat_goal_g=$13, fiber_goal_g=$14, sodium_max_mg=$15, sugar_max_g=$16, vitamin_d_goal_ug=$17, calcium_goal_mg=$18, iron_goal_mg=$19, potassium_goal_mg=$20, updated_at=NOW() WHERE user_id=$21 AND id=$22`,
		req.Name, req.Sex, req.BirthDate, req.HeightCm, req.ActivityLevel, req.GoalWeightKg, req.GoalDate, req.BMREquation, req.ManualBMRValue, req.CalorieTarget, req.ProteinGoalG, req.CarbsGoalG, req.FatGoalG, req.FiberGoalG, req.SodiumMaxMg, req.SugarMaxG, req.VitaminDGoalUg, req.CalciumGoalMg, req.IronGoalMg, req.PotassiumGoalMg, userID, id,
	)
	if err != nil {
		return nil, err
	}
	return s.GetProfile(userID, id)
}

func (s *PostgresStore) DeleteProfile(userID, id string) error {
	res, err := s.db.Exec(`DELETE FROM person_profiles WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("profile not found")
	}
	return nil
}

// ── Food Log Entries ─────────────────────────────────────────────────

func (s *PostgresStore) ListFoodLogEntries(profileID, date string) ([]FoodLogEntry, error) {
	query := `SELECT id, user_id, profile_id, date, time, meal_slot, source_type, source_id, name, servings, serving_amount, serving_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at FROM food_log_entries WHERE profile_id = $1`
	args := []interface{}{profileID}
	if date != "" {
		query += ` AND date = $2 ORDER BY time ASC`
		args = append(args, date)
	} else {
		query += ` ORDER BY date DESC, time ASC`
	}
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []FoodLogEntry
	for rows.Next() {
		var e FoodLogEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.ProfileID, &e.Date, &e.Time, &e.MealSlot, &e.SourceType, &e.SourceID, &e.Name, &e.Servings, &e.ServingAmount, &e.ServingUnit, &e.Calories, &e.TotalFat, &e.SaturatedFat, &e.TransFat, &e.Cholesterol, &e.Sodium, &e.TotalCarbs, &e.DietaryFiber, &e.TotalSugars, &e.AddedSugars, &e.Protein, &e.VitaminD, &e.Calcium, &e.Iron, &e.Potassium, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *PostgresStore) ListFoodLogEntriesByDateRange(profileID, startDate, endDate string) ([]FoodLogEntry, error) {
	query := `SELECT id, user_id, profile_id, date, time, meal_slot, source_type, source_id, name, servings, serving_amount, serving_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at FROM food_log_entries WHERE profile_id = $1 AND date >= $2 AND date <= $3 ORDER BY date ASC, time ASC`
	rows, err := s.db.Query(query, profileID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []FoodLogEntry
	for rows.Next() {
		var e FoodLogEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.ProfileID, &e.Date, &e.Time, &e.MealSlot, &e.SourceType, &e.SourceID, &e.Name, &e.Servings, &e.ServingAmount, &e.ServingUnit, &e.Calories, &e.TotalFat, &e.SaturatedFat, &e.TransFat, &e.Cholesterol, &e.Sodium, &e.TotalCarbs, &e.DietaryFiber, &e.TotalSugars, &e.AddedSugars, &e.Protein, &e.VitaminD, &e.Calcium, &e.Iron, &e.Potassium, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *PostgresStore) CreateFoodLogEntry(userID, profileID string, req *CreateFoodLogRequest) (*FoodLogEntry, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`INSERT INTO food_log_entries (id, user_id, profile_id, date, time, meal_slot, source_type, source_id, name, servings, serving_amount, serving_unit, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$28)`,
		id, userID, profileID, req.Date, req.Time, req.MealSlot, req.SourceType, req.SourceID, req.Name, req.Servings, req.ServingAmount, req.ServingUnit, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, now,
	)
	if err != nil {
		return nil, err
	}
	e := &FoodLogEntry{ID: id, UserID: userID, ProfileID: profileID, Date: req.Date, Time: req.Time, MealSlot: req.MealSlot, SourceType: req.SourceType, SourceID: req.SourceID, Name: req.Name, Servings: req.Servings, ServingAmount: req.ServingAmount, ServingUnit: req.ServingUnit, Calories: req.Calories, TotalFat: req.TotalFat, SaturatedFat: req.SaturatedFat, TransFat: req.TransFat, Cholesterol: req.Cholesterol, Sodium: req.Sodium, TotalCarbs: req.TotalCarbs, DietaryFiber: req.DietaryFiber, TotalSugars: req.TotalSugars, AddedSugars: req.AddedSugars, Protein: req.Protein, VitaminD: req.VitaminD, Calcium: req.Calcium, Iron: req.Iron, Potassium: req.Potassium, CreatedAt: now, UpdatedAt: now}
	return e, nil
}

func (s *PostgresStore) UpdateFoodLogEntry(id string, req *CreateFoodLogRequest) (*FoodLogEntry, error) {
	_, err := s.db.Exec(
		`UPDATE food_log_entries SET date=$1, time=$2, meal_slot=$3, source_type=$4, source_id=$5, name=$6, servings=$7, serving_amount=$8, serving_unit=$9, calories=$10, total_fat=$11, saturated_fat=$12, trans_fat=$13, cholesterol=$14, sodium=$15, total_carbs=$16, dietary_fiber=$17, total_sugars=$18, added_sugars=$19, protein=$20, vitamin_d=$21, calcium=$22, iron=$23, potassium=$24, updated_at=NOW() WHERE id=$25`,
		req.Date, req.Time, req.MealSlot, req.SourceType, req.SourceID, req.Name, req.Servings, req.ServingAmount, req.ServingUnit, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, id,
	)
	if err != nil {
		return nil, err
	}
	e := &FoodLogEntry{ID: id, Date: req.Date, Time: req.Time, MealSlot: req.MealSlot, SourceType: req.SourceType, SourceID: req.SourceID, Name: req.Name, Servings: req.Servings, ServingAmount: req.ServingAmount, ServingUnit: req.ServingUnit, Calories: req.Calories, TotalFat: req.TotalFat, SaturatedFat: req.SaturatedFat, TransFat: req.TransFat, Cholesterol: req.Cholesterol, Sodium: req.Sodium, TotalCarbs: req.TotalCarbs, DietaryFiber: req.DietaryFiber, TotalSugars: req.TotalSugars, AddedSugars: req.AddedSugars, Protein: req.Protein, VitaminD: req.VitaminD, Calcium: req.Calcium, Iron: req.Iron, Potassium: req.Potassium}
	return e, nil
}

func (s *PostgresStore) DeleteFoodLogEntry(id string) error {
	_, err := s.db.Exec(`DELETE FROM food_log_entries WHERE id = $1`, id)
	return err
}

// ── Weight Entries ───────────────────────────────────────────────────

func (s *PostgresStore) ListWeightEntries(profileID, fromDate, toDate string) ([]WeightEntry, error) {
	query := `SELECT id, user_id, profile_id, date, time, COALESCE(weight_kg,0), notes, blood_sugar, blood_pressure_systolic, blood_pressure_diastolic, measurement_context, created_at, updated_at FROM weight_entries WHERE profile_id = $1`
	args := []interface{}{profileID}
	n := 2
	if fromDate != "" {
		query += fmt.Sprintf(` AND date >= $%d`, n)
		args = append(args, fromDate)
		n++
	}
	if toDate != "" {
		query += fmt.Sprintf(` AND date <= $%d`, n)
		args = append(args, toDate)
		n++
	}
	query += ` ORDER BY date ASC`
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []WeightEntry
	for rows.Next() {
		var e WeightEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.ProfileID, &e.Date, &e.Time, &e.WeightKg, &e.Notes, &e.BloodSugar, &e.BloodPressureSystolic, &e.BloodPressureDiastolic, &e.MeasurementContext, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *PostgresStore) CreateWeightEntry(userID, profileID string, req *CreateWeightEntryRequest) (*WeightEntry, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	var weightVal interface{} = req.WeightKg
	if req.WeightKg == 0 {
		weightVal = nil
	}
	_, err := s.db.Exec(
		`INSERT INTO weight_entries (id, user_id, profile_id, date, time, weight_kg, notes, blood_sugar, blood_pressure_systolic, blood_pressure_diastolic, measurement_context, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
		id, userID, profileID, req.Date, req.Time, weightVal, req.Notes, req.BloodSugar, req.BloodPressureSystolic, req.BloodPressureDiastolic, req.MeasurementContext, now,
	)
	if err != nil {
		return nil, err
	}
	return &WeightEntry{ID: id, UserID: userID, ProfileID: profileID, Date: req.Date, Time: req.Time, WeightKg: req.WeightKg, Notes: req.Notes, BloodSugar: req.BloodSugar, BloodPressureSystolic: req.BloodPressureSystolic, BloodPressureDiastolic: req.BloodPressureDiastolic, MeasurementContext: req.MeasurementContext, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateWeightEntry(id string, req *CreateWeightEntryRequest) (*WeightEntry, error) {
	_, err := s.db.Exec(
		`UPDATE weight_entries SET date=$1, time=$2, weight_kg=$3, notes=$4, blood_sugar=$5, blood_pressure_systolic=$6, blood_pressure_diastolic=$7, measurement_context=$8, updated_at=NOW() WHERE id=$9`,
		req.Date, req.Time, req.WeightKg, req.Notes, req.BloodSugar, req.BloodPressureSystolic, req.BloodPressureDiastolic, req.MeasurementContext, id,
	)
	if err != nil {
		return nil, err
	}
	return &WeightEntry{ID: id, Date: req.Date, Time: req.Time, WeightKg: req.WeightKg, Notes: req.Notes, BloodSugar: req.BloodSugar, BloodPressureSystolic: req.BloodPressureSystolic, BloodPressureDiastolic: req.BloodPressureDiastolic, MeasurementContext: req.MeasurementContext}, nil
}

func (s *PostgresStore) DeleteWeightEntry(id string) error {
	_, err := s.db.Exec(`DELETE FROM weight_entries WHERE id = $1`, id)
	return err
}

// ── Meal Plans ───────────────────────────────────────────────────────

func (s *PostgresStore) ListMealPlans(userID string) ([]MealPlan, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, week_start, slot_times, created_at, updated_at FROM meal_plans WHERE user_id = $1 ORDER BY week_start DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var plans []MealPlan
	for rows.Next() {
		var p MealPlan
		var slotTimes sql.NullString
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.WeekStart, &slotTimes, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.SlotTimes = json.RawMessage(slotTimes.String)
		plans = append(plans, p)
	}
	return plans, nil
}

func (s *PostgresStore) GetMealPlan(userID, id string) (*MealPlan, error) {
	p := &MealPlan{}
	var slotTimes sql.NullString
	err := s.db.QueryRow(`SELECT id, user_id, name, week_start, slot_times, created_at, updated_at FROM meal_plans WHERE user_id = $1 AND id = $2`, userID, id).Scan(&p.ID, &p.UserID, &p.Name, &p.WeekStart, &slotTimes, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.SlotTimes = json.RawMessage(slotTimes.String)
	return p, nil
}

func (s *PostgresStore) GetMealPlanByWeekStart(userID, weekStart string) (*MealPlan, error) {
	p := &MealPlan{}
	var slotTimes sql.NullString
	err := s.db.QueryRow(`SELECT id, user_id, name, week_start, slot_times, created_at, updated_at FROM meal_plans WHERE user_id = $1 AND week_start = $2`, userID, weekStart).Scan(&p.ID, &p.UserID, &p.Name, &p.WeekStart, &slotTimes, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.SlotTimes = json.RawMessage(slotTimes.String)
	return p, nil
}

func slotTimesString(r json.RawMessage) string {
	if len(r) == 0 || string(r) == "null" {
		return ""
	}
	return string(r)
}

func (s *PostgresStore) CreateMealPlan(userID string, req *CreateMealPlanRequest) (*MealPlan, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO meal_plans (id, user_id, name, week_start, slot_times, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, id, userID, req.Name, req.WeekStart, slotTimesString(req.SlotTimes), now)
	if err != nil {
		return nil, err
	}
	return &MealPlan{ID: id, UserID: userID, Name: req.Name, WeekStart: req.WeekStart, SlotTimes: req.SlotTimes, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateMealPlan(userID, id string, req *CreateMealPlanRequest) (*MealPlan, error) {
	_, err := s.db.Exec(`UPDATE meal_plans SET name=$1, slot_times=$2, updated_at=NOW() WHERE user_id=$3 AND id=$4`, req.Name, slotTimesString(req.SlotTimes), userID, id)
	if err != nil {
		return nil, err
	}
	return s.GetMealPlan(userID, id)
}

func (s *PostgresStore) DeleteMealPlan(userID, id string) error {
	res, err := s.db.Exec(`DELETE FROM meal_plans WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("meal plan not found")
	}
	return nil
}

// ── Day Plan Entries ─────────────────────────────────────────────────

func (s *PostgresStore) ListDayPlanEntries(mealPlanID string) ([]DayPlanEntry, error) {
	rows, err := s.db.Query(
		`SELECT id, meal_plan_id, date, slot, recipe_id, position, group_id, servings, is_leftover, source_type, food_name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at FROM day_plan_entries WHERE meal_plan_id = $1 ORDER BY date, position`, mealPlanID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []DayPlanEntry
	for rows.Next() {
		var e DayPlanEntry
		if err := rows.Scan(&e.ID, &e.MealPlanID, &e.Date, &e.Slot, &e.RecipeID, &e.Position, &e.GroupID, &e.Servings, &e.IsLeftover, &e.SourceType, &e.FoodName, &e.Calories, &e.TotalFat, &e.SaturatedFat, &e.TransFat, &e.Cholesterol, &e.Sodium, &e.TotalCarbs, &e.DietaryFiber, &e.TotalSugars, &e.AddedSugars, &e.Protein, &e.VitaminD, &e.Calcium, &e.Iron, &e.Potassium, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *PostgresStore) GetDayPlanEntryByID(id string) (*DayPlanEntry, error) {
	var e DayPlanEntry
	err := s.db.QueryRow(
		`SELECT id, meal_plan_id, date, slot, recipe_id, position, group_id, servings, is_leftover, source_type, food_name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at FROM day_plan_entries WHERE id = $1`, id,
	).Scan(&e.ID, &e.MealPlanID, &e.Date, &e.Slot, &e.RecipeID, &e.Position, &e.GroupID, &e.Servings, &e.IsLeftover, &e.SourceType, &e.FoodName, &e.Calories, &e.TotalFat, &e.SaturatedFat, &e.TransFat, &e.Cholesterol, &e.Sodium, &e.TotalCarbs, &e.DietaryFiber, &e.TotalSugars, &e.AddedSugars, &e.Protein, &e.VitaminD, &e.Calcium, &e.Iron, &e.Potassium, &e.CreatedAt, &e.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *PostgresStore) CreateDayPlanEntry(mealPlanID string, req *CreateDayPlanEntryRequest) (*DayPlanEntry, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`INSERT INTO day_plan_entries (id, meal_plan_id, date, slot, recipe_id, position, group_id, servings, is_leftover, source_type, food_name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$27)`,
		id, mealPlanID, req.Date, req.Slot, req.RecipeID, req.Position, req.GroupID, req.Servings, req.IsLeftover, req.SourceType, req.FoodName, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, now,
	)
	if err != nil {
		return nil, err
	}
	return &DayPlanEntry{ID: id, MealPlanID: mealPlanID, Date: req.Date, Slot: req.Slot, RecipeID: req.RecipeID, Position: req.Position, GroupID: req.GroupID, Servings: req.Servings, IsLeftover: req.IsLeftover, SourceType: req.SourceType, FoodName: req.FoodName, Calories: req.Calories, TotalFat: req.TotalFat, SaturatedFat: req.SaturatedFat, TransFat: req.TransFat, Cholesterol: req.Cholesterol, Sodium: req.Sodium, TotalCarbs: req.TotalCarbs, DietaryFiber: req.DietaryFiber, TotalSugars: req.TotalSugars, AddedSugars: req.AddedSugars, Protein: req.Protein, VitaminD: req.VitaminD, Calcium: req.Calcium, Iron: req.Iron, Potassium: req.Potassium, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateDayPlanEntry(id string, req *CreateDayPlanEntryRequest) (*DayPlanEntry, error) {
	_, err := s.db.Exec(
		`UPDATE day_plan_entries SET date=$1, slot=$2, recipe_id=$3, position=$4, group_id=$5, servings=$6, is_leftover=$7, source_type=$8, food_name=$9, calories=$10, total_fat=$11, saturated_fat=$12, trans_fat=$13, cholesterol=$14, sodium=$15, total_carbs=$16, dietary_fiber=$17, total_sugars=$18, added_sugars=$19, protein=$20, vitamin_d=$21, calcium=$22, iron=$23, potassium=$24, updated_at=NOW() WHERE id=$25`,
		req.Date, req.Slot, req.RecipeID, req.Position, req.GroupID, req.Servings, req.IsLeftover, req.SourceType, req.FoodName, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, id,
	)
	if err != nil {
		return nil, err
	}
	return &DayPlanEntry{ID: id, Date: req.Date, Slot: req.Slot, RecipeID: req.RecipeID, Position: req.Position, GroupID: req.GroupID, Servings: req.Servings, IsLeftover: req.IsLeftover, SourceType: req.SourceType, FoodName: req.FoodName, Calories: req.Calories, TotalFat: req.TotalFat, SaturatedFat: req.SaturatedFat, TransFat: req.TransFat, Cholesterol: req.Cholesterol, Sodium: req.Sodium, TotalCarbs: req.TotalCarbs, DietaryFiber: req.DietaryFiber, TotalSugars: req.TotalSugars, AddedSugars: req.AddedSugars, Protein: req.Protein, VitaminD: req.VitaminD, Calcium: req.Calcium, Iron: req.Iron, Potassium: req.Potassium}, nil
}

func (s *PostgresStore) DeleteDayPlanEntry(id string) error {
	_, err := s.db.Exec(`DELETE FROM day_plan_entries WHERE id = $1`, id)
	return err
}

// ── Meal Groups ──────────────────────────────────────────────────────

func (s *PostgresStore) ListMealGroups(mealPlanID string) ([]MealGroup, error) {
	rows, err := s.db.Query(`SELECT id, meal_plan_id, date, slot, name, position FROM meal_groups WHERE meal_plan_id = $1 ORDER BY position`, mealPlanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var groups []MealGroup
	for rows.Next() {
		var g MealGroup
		if err := rows.Scan(&g.ID, &g.MealPlanID, &g.Date, &g.Slot, &g.Name, &g.Position); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, nil
}

func (s *PostgresStore) CreateMealGroup(mealPlanID, name, date, slot string, position int) (*MealGroup, error) {
	id := uuid.New().String()
	_, err := s.db.Exec(`INSERT INTO meal_groups (id, meal_plan_id, date, slot, name, position) VALUES ($1,$2,$3,$4,$5,$6)`, id, mealPlanID, date, slot, name, position)
	if err != nil {
		return nil, err
	}
	return &MealGroup{ID: id, MealPlanID: mealPlanID, Date: date, Slot: slot, Name: name, Position: position}, nil
}

func (s *PostgresStore) DeleteMealGroup(id string) error {
	_, err := s.db.Exec(`DELETE FROM meal_groups WHERE id = $1`, id)
	return err
}

// ── Recipe Books ─────────────────────────────────────────────────────

func (s *PostgresStore) ListBooks(userID string) ([]RecipeBook, error) {
	rows, err := s.db.Query(`SELECT id, user_id, title, description, cover_color, created_at, updated_at FROM recipe_books WHERE user_id = $1 ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var books []RecipeBook
	for rows.Next() {
		var b RecipeBook
		if err := rows.Scan(&b.ID, &b.UserID, &b.Title, &b.Description, &b.CoverColor, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		books = append(books, b)
	}
	return books, nil
}

func (s *PostgresStore) GetBook(userID, id string) (*RecipeBook, error) {
	b := &RecipeBook{}
	err := s.db.QueryRow(`SELECT id, user_id, title, description, cover_color, created_at, updated_at FROM recipe_books WHERE user_id = $1 AND id = $2`, userID, id).Scan(&b.ID, &b.UserID, &b.Title, &b.Description, &b.CoverColor, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}

func (s *PostgresStore) CreateBook(userID string, req *CreateBookRequest) (*RecipeBook, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	coverColor := "#059669"
	if req.CoverColor != "" {
		coverColor = req.CoverColor
	}
	_, err := s.db.Exec(`INSERT INTO recipe_books (id, user_id, title, description, cover_color, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, id, userID, req.Title, req.Description, coverColor, now)
	if err != nil {
		return nil, err
	}
	return &RecipeBook{ID: id, UserID: userID, Title: req.Title, Description: req.Description, CoverColor: coverColor, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateBook(userID, id string, req *CreateBookRequest) (*RecipeBook, error) {
	_, err := s.db.Exec(`UPDATE recipe_books SET title=$1, description=$2, cover_color=$3, updated_at=NOW() WHERE user_id=$4 AND id=$5`, req.Title, req.Description, req.CoverColor, userID, id)
	if err != nil {
		return nil, err
	}
	return s.GetBook(userID, id)
}

func (s *PostgresStore) DeleteBook(userID, id string) error {
	res, err := s.db.Exec(`DELETE FROM recipe_books WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("book not found")
	}
	return nil
}

// ── Chapters ─────────────────────────────────────────────────────────

func (s *PostgresStore) ListChapters(bookID string) ([]Chapter, error) {
	rows, err := s.db.Query(`SELECT id, book_id, title, position, page_template_id, recipe_template_id, created_at, updated_at FROM chapters WHERE book_id = $1 ORDER BY position`, bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var chapters []Chapter
	for rows.Next() {
		var c Chapter
		if err := rows.Scan(&c.ID, &c.BookID, &c.Title, &c.Position, &c.PageTemplateID, &c.RecipeTemplateID, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		chapters = append(chapters, c)
	}
	return chapters, nil
}

func (s *PostgresStore) CreateChapter(bookID string, req *CreateChapterRequest) (*Chapter, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO chapters (id, book_id, title, position, page_template_id, recipe_template_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`, id, bookID, req.Title, req.Position, req.PageTemplateID, req.RecipeTemplateID, now)
	if err != nil {
		return nil, err
	}
	return &Chapter{ID: id, BookID: bookID, Title: req.Title, Position: req.Position, PageTemplateID: req.PageTemplateID, RecipeTemplateID: req.RecipeTemplateID, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateChapter(id string, req *CreateChapterRequest) (*Chapter, error) {
	_, err := s.db.Exec(`UPDATE chapters SET title=$1, position=$2, page_template_id=$3, recipe_template_id=$4, updated_at=NOW() WHERE id=$5`, req.Title, req.Position, req.PageTemplateID, req.RecipeTemplateID, id)
	if err != nil {
		return nil, err
	}
	return &Chapter{ID: id, Title: req.Title, Position: req.Position, PageTemplateID: req.PageTemplateID, RecipeTemplateID: req.RecipeTemplateID}, nil
}

func (s *PostgresStore) DeleteChapter(id string) error {
	_, err := s.db.Exec(`DELETE FROM chapters WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) ReorderChapters(bookID string, chapterIDs []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	for i, chID := range chapterIDs {
		if _, err := tx.Exec(`UPDATE chapters SET position = $1 WHERE id = $2 AND book_id = $3`, i, chID, bookID); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// ── Chapter Recipes ──────────────────────────────────────────────────

func (s *PostgresStore) ListChapterRecipes(chapterID string) ([]ChapterRecipe, error) {
	rows, err := s.db.Query(`SELECT id, chapter_id, recipe_id, position FROM chapter_recipes WHERE chapter_id = $1 ORDER BY position`, chapterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var crs []ChapterRecipe
	for rows.Next() {
		var cr ChapterRecipe
		if err := rows.Scan(&cr.ID, &cr.ChapterID, &cr.RecipeID, &cr.Position); err != nil {
			return nil, err
		}
		crs = append(crs, cr)
	}
	return crs, nil
}

func (s *PostgresStore) AddChapterRecipe(chapterID, recipeID string, position int) (*ChapterRecipe, error) {
	id := uuid.New().String()
	_, err := s.db.Exec(`INSERT INTO chapter_recipes (id, chapter_id, recipe_id, position) VALUES ($1,$2,$3,$4)`, id, chapterID, recipeID, position)
	if err != nil {
		return nil, err
	}
	return &ChapterRecipe{ID: id, ChapterID: chapterID, RecipeID: recipeID, Position: position}, nil
}

func (s *PostgresStore) RemoveChapterRecipe(chapterID, recipeID string) error {
	_, err := s.db.Exec(`DELETE FROM chapter_recipes WHERE chapter_id = $1 AND recipe_id = $2`, chapterID, recipeID)
	return err
}

// ── Chapter Pages ────────────────────────────────────────────────────

func (s *PostgresStore) ListChapterPages(chapterID string) ([]ChapterPage, error) {
	rows, err := s.db.Query(`SELECT id, chapter_id, title, content, position, created_at, updated_at FROM chapter_pages WHERE chapter_id = $1 ORDER BY position`, chapterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pages []ChapterPage
	for rows.Next() {
		var p ChapterPage
		if err := rows.Scan(&p.ID, &p.ChapterID, &p.Title, &p.Content, &p.Position, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		pages = append(pages, p)
	}
	return pages, nil
}

func (s *PostgresStore) CreateChapterPage(chapterID, title, content string, position int) (*ChapterPage, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO chapter_pages (id, chapter_id, title, content, position, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, id, chapterID, title, content, position, now)
	if err != nil {
		return nil, err
	}
	return &ChapterPage{ID: id, ChapterID: chapterID, Title: title, Content: content, Position: position, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateChapterPage(id, title, content string, position int) (*ChapterPage, error) {
	_, err := s.db.Exec(`UPDATE chapter_pages SET title=$1, content=$2, position=$3, updated_at=NOW() WHERE id=$4`, title, content, position, id)
	if err != nil {
		return nil, err
	}
	return &ChapterPage{ID: id, Title: title, Content: content, Position: position}, nil
}

func (s *PostgresStore) DeleteChapterPage(id string) error {
	_, err := s.db.Exec(`DELETE FROM chapter_pages WHERE id = $1`, id)
	return err
}

// ── Categories ───────────────────────────────────────────────────────

func (s *PostgresStore) ListCategories() ([]Category, error) {
	rows, err := s.db.Query(`SELECT id, name, parent_id, created_at, updated_at FROM categories ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cats []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.ParentID, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, nil
}

func (s *PostgresStore) CreateCategory(req *CreateCategoryRequest) (*Category, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO categories (id, name, parent_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$4)`, id, req.Name, req.ParentID, now)
	if err != nil {
		return nil, err
	}
	return &Category{ID: id, Name: req.Name, ParentID: req.ParentID, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateCategory(id string, req *CreateCategoryRequest) (*Category, error) {
	_, err := s.db.Exec(`UPDATE categories SET name=$1, parent_id=$2, updated_at=NOW() WHERE id=$3`, req.Name, req.ParentID, id)
	if err != nil {
		return nil, err
	}
	return &Category{ID: id, Name: req.Name, ParentID: req.ParentID}, nil
}

func (s *PostgresStore) DeleteCategory(id string) error {
	_, err := s.db.Exec(`DELETE FROM categories WHERE id = $1`, id)
	return err
}

// ── Recipe Categories ────────────────────────────────────────────────

func (s *PostgresStore) ListRecipeCategories(recipeID string) ([]RecipeCategory, error) {
	rows, err := s.db.Query(`SELECT id, recipe_id, category_id FROM recipe_categories WHERE recipe_id = $1`, recipeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rcs []RecipeCategory
	for rows.Next() {
		var rc RecipeCategory
		if err := rows.Scan(&rc.ID, &rc.RecipeID, &rc.CategoryID); err != nil {
			return nil, err
		}
		rcs = append(rcs, rc)
	}
	return rcs, nil
}

func (s *PostgresStore) AddRecipeCategory(recipeID, categoryID string) (*RecipeCategory, error) {
	id := uuid.New().String()
	_, err := s.db.Exec(`INSERT INTO recipe_categories (id, recipe_id, category_id) VALUES ($1,$2,$3)`, id, recipeID, categoryID)
	if err != nil {
		return nil, err
	}
	return &RecipeCategory{ID: id, RecipeID: recipeID, CategoryID: categoryID}, nil
}

func (s *PostgresStore) RemoveRecipeCategory(recipeID, categoryID string) error {
	_, err := s.db.Exec(`DELETE FROM recipe_categories WHERE recipe_id = $1 AND category_id = $2`, recipeID, categoryID)
	return err
}

func (s *PostgresStore) RecipeCategoriesByCategory(categoryID string) ([]RecipeCategory, error) {
	rows, err := s.db.Query(`SELECT id, recipe_id, category_id FROM recipe_categories WHERE category_id = $1`, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rcs []RecipeCategory
	for rows.Next() {
		var rc RecipeCategory
		if err := rows.Scan(&rc.ID, &rc.RecipeID, &rc.CategoryID); err != nil {
			return nil, err
		}
		rcs = append(rcs, rc)
	}
	return rcs, nil
}

// ── Custom Foods ─────────────────────────────────────────────────────

func (s *PostgresStore) ListCustomFoods(userID string) ([]CustomFood, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, shared_with_community, created_at, portable_id FROM custom_foods WHERE user_id = $1 ORDER BY name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var foods []CustomFood
	for rows.Next() {
		var f CustomFood
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.SharedWithCommunity, &f.CreatedAt, &f.PortableID); err != nil {
			return nil, err
		}
		foods = append(foods, f)
	}
	return foods, nil
}

func (s *PostgresStore) GetCustomFood(userID, id string) (*CustomFood, error) {
	f := &CustomFood{}
	err := s.db.QueryRow(`SELECT id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, shared_with_community, created_at, portable_id FROM custom_foods WHERE user_id = $1 AND id = $2`, userID, id).Scan(&f.ID, &f.UserID, &f.Name, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.SharedWithCommunity, &f.CreatedAt, &f.PortableID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return f, nil
}

func (s *PostgresStore) CreateCustomFood(userID string, req *CreateCustomFoodRequest) (*CustomFood, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`INSERT INTO custom_foods (id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		id, userID, req.Name, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, now,
	)
	if err != nil {
		return nil, err
	}
	return s.GetCustomFood(userID, id)
}

func (s *PostgresStore) UpdateCustomFood(userID, id string, req *CreateCustomFoodRequest) (*CustomFood, error) {
	_, err := s.db.Exec(
		`UPDATE custom_foods SET name=$1, calories=$2, total_fat=$3, saturated_fat=$4, trans_fat=$5, cholesterol=$6, sodium=$7, total_carbs=$8, dietary_fiber=$9, total_sugars=$10, added_sugars=$11, protein=$12, vitamin_d=$13, calcium=$14, iron=$15, potassium=$16 WHERE user_id=$17 AND id=$18`,
		req.Name, req.Calories, req.TotalFat, req.SaturatedFat, req.TransFat, req.Cholesterol, req.Sodium, req.TotalCarbs, req.DietaryFiber, req.TotalSugars, req.AddedSugars, req.Protein, req.VitaminD, req.Calcium, req.Iron, req.Potassium, userID, id,
	)
	if err != nil {
		return nil, err
	}
	return s.GetCustomFood(userID, id)
}

func (s *PostgresStore) DeleteCustomFood(userID, id string) error {
	res, err := s.db.Exec(`DELETE FROM custom_foods WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("custom food not found")
	}
	return nil
}

func (s *PostgresStore) ShareCustomFood(userID, id string) error {
	res, err := s.db.Exec(`UPDATE custom_foods SET shared_with_community = TRUE WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("custom food not found")
	}
	return nil
}

func (s *PostgresStore) ListSharedCustomFoods(page, perPage int) ([]CustomFood, int, error) {
	if perPage <= 0 {
		perPage = 20
	}
	if page <= 0 {
		page = 1
	}
	var total int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM custom_foods WHERE shared_with_community = TRUE`).Scan(&total); err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * perPage
	rows, err := s.db.Query(`SELECT id, user_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, shared_with_community, created_at, portable_id FROM custom_foods WHERE shared_with_community = TRUE ORDER BY name LIMIT $1 OFFSET $2`, perPage, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var foods []CustomFood
	for rows.Next() {
		var f CustomFood
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.SharedWithCommunity, &f.CreatedAt, &f.PortableID); err != nil {
			return nil, 0, err
		}
		foods = append(foods, f)
	}
	return foods, total, nil
}

// ── Grocery Checklists ───────────────────────────────────────────────

func (s *PostgresStore) GetGroceryChecklist(userID, weekStart string) (*GroceryChecklist, error) {
	g := &GroceryChecklist{}
	err := s.db.QueryRow(`SELECT id, user_id, week_start, checked_items, updated_at FROM grocery_checklists WHERE user_id = $1 AND week_start = $2`, userID, weekStart).Scan(&g.ID, &g.UserID, &g.WeekStart, &g.CheckedItems, &g.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return g, nil
}

func (s *PostgresStore) UpsertGroceryChecklist(userID string, g *GroceryChecklist) (*GroceryChecklist, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`INSERT INTO grocery_checklists (id, user_id, week_start, checked_items, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, week_start) DO UPDATE SET checked_items = $4, updated_at = $5`,
		id, userID, g.WeekStart, g.CheckedItems, now,
	)
	if err != nil {
		return nil, err
	}
	return s.GetGroceryChecklist(userID, g.WeekStart)
}

// ── Book Pages ───────────────────────────────────────────────────────

func (s *PostgresStore) ListBookPages(bookID string) ([]BookPage, error) {
	rows, err := s.db.Query(`SELECT id, book_id, title, content, position, created_at, updated_at FROM book_pages WHERE book_id = $1 ORDER BY position`, bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pages []BookPage
	for rows.Next() {
		var p BookPage
		if err := rows.Scan(&p.ID, &p.BookID, &p.Title, &p.Content, &p.Position, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		pages = append(pages, p)
	}
	return pages, nil
}

func (s *PostgresStore) CreateBookPage(bookID, title, content string, position int) (*BookPage, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO book_pages (id, book_id, title, content, position, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, id, bookID, title, content, position, now)
	if err != nil {
		return nil, err
	}
	return &BookPage{ID: id, BookID: bookID, Title: title, Content: content, Position: position, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateBookPage(id, title, content string, position int) (*BookPage, error) {
	_, err := s.db.Exec(`UPDATE book_pages SET title=$1, content=$2, position=$3, updated_at=NOW() WHERE id=$4`, title, content, position, id)
	if err != nil {
		return nil, err
	}
	return &BookPage{ID: id, Title: title, Content: content, Position: position}, nil
}

func (s *PostgresStore) DeleteBookPage(id string) error {
	_, err := s.db.Exec(`DELETE FROM book_pages WHERE id = $1`, id)
	return err
}

// ── Book/chapter ordering & moves ────────────────────────────────────
//
// Positions only need to reflect relative order; gaps are harmless because
// every list query uses ORDER BY position. Reorders rewrite positions across
// the interleaved tables by index; moves shift items at/after the insertion
// index to make room, then place the moved row.

func (s *PostgresStore) ReorderBookLevelItems(bookID string, items []BookLevelItem) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	for i, item := range items {
		switch item.Type {
		case "chapter":
			if _, err := tx.Exec(`UPDATE chapters SET position = $1 WHERE id = $2 AND book_id = $3`, i, item.ID, bookID); err != nil {
				tx.Rollback()
				return err
			}
		case "book-page":
			if _, err := tx.Exec(`UPDATE book_pages SET position = $1 WHERE id = $2 AND book_id = $3`, i, item.ID, bookID); err != nil {
				tx.Rollback()
				return err
			}
		}
	}
	return tx.Commit()
}

func (s *PostgresStore) ReorderChapterItems(chapterID string, items []ChapterItem) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	for i, item := range items {
		switch item.Type {
		case "recipe":
			if item.RecipeID == "" {
				continue
			}
			if _, err := tx.Exec(`UPDATE chapter_recipes SET position = $1 WHERE chapter_id = $2 AND recipe_id = $3`, i, chapterID, item.RecipeID); err != nil {
				tx.Rollback()
				return err
			}
		case "page":
			if item.PageID == "" {
				continue
			}
			if _, err := tx.Exec(`UPDATE chapter_pages SET position = $1 WHERE id = $2 AND chapter_id = $3`, i, item.PageID, chapterID); err != nil {
				tx.Rollback()
				return err
			}
		}
	}
	return tx.Commit()
}

func (s *PostgresStore) MoveRecipeBetweenChapters(chapterRecipeID, targetChapterID string, position int) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	// Make room at the insertion index in the target chapter.
	if _, err := tx.Exec(`UPDATE chapter_recipes SET position = position + 1 WHERE chapter_id = $1 AND position >= $2 AND id <> $3`, targetChapterID, position, chapterRecipeID); err != nil {
		tx.Rollback()
		return err
	}
	// Move the recipe into the target chapter at the requested position.
	if _, err := tx.Exec(`UPDATE chapter_recipes SET chapter_id = $1, position = $2 WHERE id = $3`, targetChapterID, position, chapterRecipeID); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (s *PostgresStore) MovePageBetweenChapters(pageID, targetChapterID string, position int) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	// Make room at the insertion index in the target chapter.
	if _, err := tx.Exec(`UPDATE chapter_pages SET position = position + 1 WHERE chapter_id = $1 AND position >= $2 AND id <> $3`, targetChapterID, position, pageID); err != nil {
		tx.Rollback()
		return err
	}
	// Move the page into the target chapter at the requested position.
	if _, err := tx.Exec(`UPDATE chapter_pages SET chapter_id = $1, position = $2 WHERE id = $3`, targetChapterID, position, pageID); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (s *PostgresStore) ConvertChapterPageToBookPage(pageID, bookID string, position int) (*BookPage, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	var title, content string
	if err := tx.QueryRow(`SELECT title, content FROM chapter_pages WHERE id = $1`, pageID).Scan(&title, &content); err != nil {
		tx.Rollback()
		return nil, err
	}
	// Make room at the insertion index across the merged book-level list.
	if _, err := tx.Exec(`UPDATE chapters SET position = position + 1 WHERE book_id = $1 AND position >= $2`, bookID, position); err != nil {
		tx.Rollback()
		return nil, err
	}
	if _, err := tx.Exec(`UPDATE book_pages SET position = position + 1 WHERE book_id = $1 AND position >= $2`, bookID, position); err != nil {
		tx.Rollback()
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM chapter_pages WHERE id = $1`, pageID); err != nil {
		tx.Rollback()
		return nil, err
	}
	now := time.Now().UTC()
	if _, err := tx.Exec(`INSERT INTO book_pages (id, book_id, title, content, position, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, pageID, bookID, title, content, position, now); err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &BookPage{ID: pageID, BookID: bookID, Title: title, Content: content, Position: position, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) ConvertBookPageToChapterPage(pageID, chapterID string, position int) (*ChapterPage, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	var title, content string
	if err := tx.QueryRow(`SELECT title, content FROM book_pages WHERE id = $1`, pageID).Scan(&title, &content); err != nil {
		tx.Rollback()
		return nil, err
	}
	// Make room at the insertion index across the merged chapter list.
	if _, err := tx.Exec(`UPDATE chapter_recipes SET position = position + 1 WHERE chapter_id = $1 AND position >= $2`, chapterID, position); err != nil {
		tx.Rollback()
		return nil, err
	}
	if _, err := tx.Exec(`UPDATE chapter_pages SET position = position + 1 WHERE chapter_id = $1 AND position >= $2`, chapterID, position); err != nil {
		tx.Rollback()
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM book_pages WHERE id = $1`, pageID); err != nil {
		tx.Rollback()
		return nil, err
	}
	now := time.Now().UTC()
	if _, err := tx.Exec(`INSERT INTO chapter_pages (id, chapter_id, title, content, position, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, pageID, chapterID, title, content, position, now); err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &ChapterPage{ID: pageID, ChapterID: chapterID, Title: title, Content: content, Position: position, CreatedAt: now, UpdatedAt: now}, nil
}

// ── API Keys ─────────────────────────────────────────────────────────

func (s *PostgresStore) ListAPIKeys(userID string) ([]ApiKey, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, key_hash, key_prefix, permissions, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []ApiKey
	for rows.Next() {
		var k ApiKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.Name, &k.KeyHash, &k.KeyPrefix, &k.Permissions, &k.LastUsedAt, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, nil
}

func (s *PostgresStore) CreateAPIKey(userID, name, permissions string) (*ApiKey, string, error) {
	key, err := generateAPIKey()
	if err != nil {
		return nil, "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(key), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}
	id := uuid.New().String()
	now := time.Now().UTC()
	prefix := key[:8]
	_, err = s.db.Exec(`INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, permissions, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, userID, name, string(hash), prefix, permissions, now)
	if err != nil {
		return nil, "", err
	}
	return &ApiKey{ID: id, UserID: userID, Name: name, KeyPrefix: prefix, Permissions: permissions, CreatedAt: now}, key, nil
}

func (s *PostgresStore) DeleteAPIKey(userID, id string) error {
	res, err := s.db.Exec(`DELETE FROM api_keys WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("api key not found")
	}
	return nil
}

// ── Sharing (from existing store) ────────────────────────────────────

func (s *PostgresStore) CreateSharedRecipe(userID, recipeID, title, description, category, tags, recipeData, visibility string) (*SharedRecipe, error) {
	id := uuid.New().String()
	shareToken := uuid.New().String()
	now := time.Now().UTC()
	visibility = normalizeVisibility(visibility)
	_, err := s.db.Exec(
		`INSERT INTO shared_recipes (id, user_id, recipe_id, share_token, visibility, title, description, category, tags, recipe_data, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
		id, userID, recipeID, shareToken, visibility, title, description, category, tags, recipeData, now,
	)
	if err != nil {
		return nil, err
	}
	return &SharedRecipe{ID: id, UserID: userID, RecipeID: recipeID, ShareToken: shareToken, Visibility: visibility, Title: title, Description: description, Category: category, Tags: tags, RecipeData: recipeData, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) GetSharedRecipeByToken(shareToken string) (*SharedRecipe, error) {
	r := &SharedRecipe{}
	err := s.db.QueryRow(
		`SELECT id, user_id, recipe_id, share_token, visibility, title, description, category, tags, recipe_data, view_count, import_count, average_rating, rating_count, created_at, updated_at FROM shared_recipes WHERE share_token = $1`, shareToken,
	).Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.Visibility, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (s *PostgresStore) GetSharedRecipesByUser(userID string) ([]SharedRecipe, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, recipe_id, share_token, visibility, title, description, category, tags, recipe_data, view_count, import_count, average_rating, rating_count, created_at, updated_at FROM shared_recipes WHERE user_id = $1 ORDER BY updated_at DESC`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var recipes []SharedRecipe
	for rows.Next() {
		var r SharedRecipe
		if err := rows.Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.Visibility, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		recipes = append(recipes, r)
	}
	return recipes, nil
}

func (s *PostgresStore) SetSharedRecipeVisibility(id string, visibility string) error {
	_, err := s.db.Exec(`UPDATE shared_recipes SET visibility = $1, updated_at = NOW() WHERE id = $2`, normalizeVisibility(visibility), id)
	return err
}

func (s *PostgresStore) DeleteSharedRecipe(id string) error {
	_, err := s.db.Exec(`UPDATE shared_recipes SET visibility = $1, updated_at = NOW() WHERE id = $2`, VisibilityPrivate, id)
	return err
}

func (s *PostgresStore) IncrementSharedRecipeViews(id string) error {
	_, err := s.db.Exec(`UPDATE shared_recipes SET view_count = view_count + 1 WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) IncrementSharedRecipeImports(id string) error {
	_, err := s.db.Exec(`UPDATE shared_recipes SET import_count = import_count + 1 WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) UpsertRecipeRating(recipeID, userID string, rating int) error {
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`INSERT INTO recipe_ratings (id, recipe_id, user_id, rating, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5) ON CONFLICT (recipe_id, user_id) DO UPDATE SET rating = $4, updated_at = $5`,
		uuid.New().String(), recipeID, userID, rating, now,
	)
	if err != nil {
		return err
	}
	return s.recalcAverageRating(recipeID)
}

func (s *PostgresStore) recalcAverageRating(recipeID string) error {
	var avg float64
	var count int
	if err := s.db.QueryRow(`SELECT COALESCE(AVG(rating), 0), COUNT(*) FROM recipe_ratings WHERE recipe_id = $1`, recipeID).Scan(&avg, &count); err != nil {
		return err
	}
	_, err := s.db.Exec(`UPDATE shared_recipes SET average_rating = $1, rating_count = $2 WHERE id = $3`, avg, count, recipeID)
	return err
}

func (s *PostgresStore) SearchCommunityRecipes(query, category, sort string, authenticated bool, page, perPage int) ([]SharedRecipe, error) {
	if perPage <= 0 {
		perPage = 20
	}
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * perPage
	orderClause := "ORDER BY s.created_at DESC"
	switch sort {
	case "rating":
		orderClause = "ORDER BY s.average_rating DESC"
	case "most_imported":
		orderClause = "ORDER BY s.import_count DESC"
	}
	visibilityFilter := "s.visibility = 'public'"
	if authenticated {
		visibilityFilter = "s.visibility IN ('public','users')"
	}
	whereClause := "WHERE " + visibilityFilter
	args := []interface{}{}
	argN := 1
	if query != "" {
		whereClause += fmt.Sprintf(` AND s.title ILIKE $%d`, argN)
		args = append(args, "%"+query+"%")
		argN++
	}
	if category != "" {
		whereClause += fmt.Sprintf(` AND s.category = $%d`, argN)
		args = append(args, category)
		argN++
	}
	args = append(args, perPage, offset)
	rows, err := s.db.Query(
		fmt.Sprintf(`SELECT s.id, s.user_id, s.recipe_id, s.share_token, s.visibility, s.title, s.description, s.category, s.tags, '' as recipe_data, s.view_count, s.import_count, s.average_rating, s.rating_count, s.created_at, s.updated_at FROM shared_recipes s %s %s LIMIT $%d OFFSET $%d`, whereClause, orderClause, argN, argN+1),
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var recipes []SharedRecipe
	for rows.Next() {
		var r SharedRecipe
		if err := rows.Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.Visibility, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		recipes = append(recipes, r)
	}
	return recipes, nil
}

func (s *PostgresStore) GetCommunityCategories() ([]CommunityCategory, error) {
	rows, err := s.db.Query(`SELECT id, name, slug FROM community_categories ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cats []CommunityCategory
	for rows.Next() {
		var c CommunityCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, nil
}

func (s *PostgresStore) SeedCategories() error {
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
	for _, c := range cats {
		s.db.Exec(`INSERT INTO community_categories (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING`, c.ID, c.Name, c.Slug)
	}
	return nil
}

// ── Grocery Checklists user_id unique constraint ────────────────────
// NOTE: The grocery_checklists table has UNIQUE(user_id, week_start) via the migration.
// The UpsertGroceryChecklist method uses ON CONFLICT for this.
// However, the migration only has UNIQUE(week_start). Let me fix the upsert.

func init() {
	log.Println("[PostgresStore] Registering pgx driver")
}

// ── User Settings ────────────────────────────────────────────────────

func (s *PostgresStore) GetSettings(userID string) (*UserSettings, error) {
	var us UserSettings
	err := s.db.QueryRow(`SELECT id, user_id, settings_json, updated_at FROM user_settings WHERE user_id = $1`, userID).Scan(&us.ID, &us.UserID, &us.SettingsJSON, &us.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &us, nil
}

func (s *PostgresStore) UpsertSettings(userID string, settingsJSON string) (*UserSettings, error) {
	// Settings is a free-form JSON object and callers send partial updates, so
	// merge the incoming keys into any existing settings rather than replacing
	// the whole document (which would drop keys other callers depend on, e.g.
	// onboardingComplete, unitSystem, theme).
	merged := map[string]interface{}{}
	if existing, err := s.GetSettings(userID); err != nil {
		return nil, err
	} else if existing != nil && existing.SettingsJSON != "" {
		_ = json.Unmarshal([]byte(existing.SettingsJSON), &merged)
	}
	if settingsJSON != "" {
		incoming := map[string]interface{}{}
		if err := json.Unmarshal([]byte(settingsJSON), &incoming); err != nil {
			return nil, err
		}
		for k, v := range incoming {
			merged[k] = v
		}
	}
	mergedBytes, err := json.Marshal(merged)
	if err != nil {
		return nil, err
	}
	mergedJSON := string(mergedBytes)

	id := uuid.New().String()
	now := time.Now().UTC()
	var us UserSettings
	err = s.db.QueryRow(`
		INSERT INTO user_settings (id, user_id, settings_json, updated_at) VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id) DO UPDATE SET settings_json = $3, updated_at = $4
		RETURNING id, user_id, settings_json, updated_at`,
		id, userID, mergedJSON, now,
	).Scan(&us.ID, &us.UserID, &us.SettingsJSON, &us.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &us, nil
}

// ── Templates ────────────────────────────────────────────────────────

func (s *PostgresStore) ListTemplates(userID string) ([]Template, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, type, is_default, layout_json, created_at, updated_at FROM templates WHERE user_id = $1 OR is_default = TRUE ORDER BY name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var templates []Template
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name, &t.Type, &t.IsDefault, &t.LayoutJSON, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}
	return templates, nil
}

func (s *PostgresStore) ListTemplatesByType(userID, tmplType string) ([]Template, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, type, is_default, layout_json, created_at, updated_at FROM templates WHERE (user_id = $1 OR is_default = TRUE) AND type = $2 ORDER BY name`, userID, tmplType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var templates []Template
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.UserID, &t.Name, &t.Type, &t.IsDefault, &t.LayoutJSON, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}
	return templates, nil
}

func (s *PostgresStore) GetTemplate(userID, id string) (*Template, error) {
	var t Template
	err := s.db.QueryRow(`SELECT id, user_id, name, type, is_default, layout_json, created_at, updated_at FROM templates WHERE id = $1 AND (user_id = $2 OR is_default = TRUE)`, id, userID).Scan(&t.ID, &t.UserID, &t.Name, &t.Type, &t.IsDefault, &t.LayoutJSON, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *PostgresStore) CreateTemplate(userID string, req *CreateTemplateRequest) (*Template, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO templates (id, user_id, name, type, is_default, layout_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`, id, userID, req.Name, req.Type, req.IsDefault, req.Layout, now)
	if err != nil {
		return nil, err
	}
	return &Template{ID: id, UserID: &userID, Name: req.Name, Type: req.Type, IsDefault: req.IsDefault, LayoutJSON: req.Layout, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateTemplate(userID, id string, req *UpdateTemplateRequest) (*Template, error) {
	existing, err := s.GetTemplate(userID, id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("template not found")
	}
	name := existing.Name
	if req.Name != nil {
		name = *req.Name
	}
	layout := existing.LayoutJSON
	if req.Layout != nil {
		layout = *req.Layout
	}
	isDefault := existing.IsDefault
	if req.IsDefault != nil {
		isDefault = *req.IsDefault
	}
	_, err = s.db.Exec(`UPDATE templates SET name=$1, layout_json=$2, is_default=$3, updated_at=NOW() WHERE id=$4 AND (user_id=$5 OR is_default=TRUE)`, name, layout, isDefault, id, userID)
	if err != nil {
		return nil, err
	}
	return &Template{ID: id, UserID: existing.UserID, Name: name, Type: existing.Type, IsDefault: isDefault, LayoutJSON: layout, CreatedAt: existing.CreatedAt, UpdatedAt: time.Now().UTC()}, nil
}

func (s *PostgresStore) DeleteTemplate(userID, id string) error {
	_, err := s.db.Exec(`DELETE FROM templates WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ── Dietary Profiles ─────────────────────────────────────────────────

func (s *PostgresStore) ListDietaryProfiles(userID string) ([]DietaryProfile, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, allergens_json, dietary_tags_json, nutrient_thresholds_json, is_active, created_at, updated_at FROM dietary_profiles WHERE user_id = $1 ORDER BY name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var profiles []DietaryProfile
	for rows.Next() {
		var p DietaryProfile
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.AllergensJSON, &p.DietaryTagsJSON, &p.NutrientThresholdsJSON, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, nil
}

func (s *PostgresStore) GetDietaryProfile(userID, id string) (*DietaryProfile, error) {
	var p DietaryProfile
	err := s.db.QueryRow(`SELECT id, user_id, name, allergens_json, dietary_tags_json, nutrient_thresholds_json, is_active, created_at, updated_at FROM dietary_profiles WHERE id = $1 AND user_id = $2`, id, userID).Scan(&p.ID, &p.UserID, &p.Name, &p.AllergensJSON, &p.DietaryTagsJSON, &p.NutrientThresholdsJSON, &p.IsActive, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *PostgresStore) CreateDietaryProfile(userID string, req *CreateDietaryProfileRequest) (*DietaryProfile, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO dietary_profiles (id, user_id, name, allergens_json, dietary_tags_json, nutrient_thresholds_json, is_active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`, id, userID, req.Name, req.Allergens, req.DietaryTags, req.NutrientThresholds, req.IsActive, now)
	if err != nil {
		return nil, err
	}
	return &DietaryProfile{ID: id, UserID: userID, Name: req.Name, AllergensJSON: req.Allergens, DietaryTagsJSON: req.DietaryTags, NutrientThresholdsJSON: req.NutrientThresholds, IsActive: req.IsActive, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateDietaryProfile(userID, id string, req *UpdateDietaryProfileRequest) (*DietaryProfile, error) {
	existing, err := s.GetDietaryProfile(userID, id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("dietary profile not found")
	}
	name := existing.Name
	if req.Name != nil {
		name = *req.Name
	}
	allergens := existing.AllergensJSON
	if req.Allergens != nil {
		allergens = *req.Allergens
	}
	tags := existing.DietaryTagsJSON
	if req.DietaryTags != nil {
		tags = *req.DietaryTags
	}
	thresholds := existing.NutrientThresholdsJSON
	if req.NutrientThresholds != nil {
		thresholds = *req.NutrientThresholds
	}
	active := existing.IsActive
	if req.IsActive != nil {
		active = *req.IsActive
	}
	_, err = s.db.Exec(`UPDATE dietary_profiles SET name=$1, allergens_json=$2, dietary_tags_json=$3, nutrient_thresholds_json=$4, is_active=$5, updated_at=NOW() WHERE id=$6 AND user_id=$7`, name, allergens, tags, thresholds, active, id, userID)
	if err != nil {
		return nil, err
	}
	return &DietaryProfile{ID: id, UserID: userID, Name: name, AllergensJSON: allergens, DietaryTagsJSON: tags, NutrientThresholdsJSON: thresholds, IsActive: active, CreatedAt: existing.CreatedAt, UpdatedAt: time.Now().UTC()}, nil
}

func (s *PostgresStore) DeleteDietaryProfile(userID, id string) error {
	_, err := s.db.Exec(`DELETE FROM dietary_profiles WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ── Allergen Rules ───────────────────────────────────────────────────

func (s *PostgresStore) ListAllergenRules(userID, profileID string) ([]AllergenRule, error) {
	rows, err := s.db.Query(`SELECT id, user_id, profile_id, allergen, severity, custom_keywords_json, created_at, updated_at FROM allergen_rules WHERE user_id = $1 AND profile_id = $2 ORDER BY allergen`, userID, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rules []AllergenRule
	for rows.Next() {
		var r AllergenRule
		if err := rows.Scan(&r.ID, &r.UserID, &r.ProfileID, &r.Allergen, &r.Severity, &r.CustomKeywordsJSON, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, nil
}

func (s *PostgresStore) CreateAllergenRule(userID, profileID string, req *CreateAllergenRuleRequest) (*AllergenRule, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO allergen_rules (id, user_id, profile_id, allergen, severity, custom_keywords_json, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`, id, userID, profileID, req.Allergen, req.Severity, req.CustomKeywords, now)
	if err != nil {
		return nil, err
	}
	return &AllergenRule{ID: id, UserID: userID, ProfileID: profileID, Allergen: req.Allergen, Severity: req.Severity, CustomKeywordsJSON: req.CustomKeywords, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateAllergenRule(userID, id string, req *UpdateAllergenRuleRequest) (*AllergenRule, error) {
	var existing AllergenRule
	err := s.db.QueryRow(`SELECT id, user_id, profile_id, allergen, severity, custom_keywords_json, created_at, updated_at FROM allergen_rules WHERE id = $1 AND user_id = $2`, id, userID).Scan(&existing.ID, &existing.UserID, &existing.ProfileID, &existing.Allergen, &existing.Severity, &existing.CustomKeywordsJSON, &existing.CreatedAt, &existing.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("allergen rule not found")
	}
	if err != nil {
		return nil, err
	}
	allergen := existing.Allergen
	if req.Allergen != nil {
		allergen = *req.Allergen
	}
	severity := existing.Severity
	if req.Severity != nil {
		severity = *req.Severity
	}
	keywords := existing.CustomKeywordsJSON
	if req.CustomKeywords != nil {
		keywords = *req.CustomKeywords
	}
	_, err = s.db.Exec(`UPDATE allergen_rules SET allergen=$1, severity=$2, custom_keywords_json=$3, updated_at=NOW() WHERE id=$4 AND user_id=$5`, allergen, severity, keywords, id, userID)
	if err != nil {
		return nil, err
	}
	return &AllergenRule{ID: id, UserID: userID, ProfileID: existing.ProfileID, Allergen: allergen, Severity: severity, CustomKeywordsJSON: keywords, CreatedAt: existing.CreatedAt, UpdatedAt: time.Now().UTC()}, nil
}

func (s *PostgresStore) DeleteAllergenRule(userID, id string) error {
	_, err := s.db.Exec(`DELETE FROM allergen_rules WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ── Brand Kits ───────────────────────────────────────────────────────

func (s *PostgresStore) ListBrandKits(userID string) ([]BrandKit, error) {
	rows, err := s.db.Query(`SELECT id, user_id, name, logo_data_url, primary_color, secondary_color, font_family, tagline, created_at, updated_at FROM brand_kits WHERE user_id = $1 ORDER BY name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var kits []BrandKit
	for rows.Next() {
		var k BrandKit
		if err := rows.Scan(&k.ID, &k.UserID, &k.Name, &k.LogoDataURL, &k.PrimaryColor, &k.SecondaryColor, &k.FontFamily, &k.Tagline, &k.CreatedAt, &k.UpdatedAt); err != nil {
			return nil, err
		}
		kits = append(kits, k)
	}
	return kits, nil
}

func (s *PostgresStore) GetBrandKit(userID, id string) (*BrandKit, error) {
	var k BrandKit
	err := s.db.QueryRow(`SELECT id, user_id, name, logo_data_url, primary_color, secondary_color, font_family, tagline, created_at, updated_at FROM brand_kits WHERE id = $1 AND user_id = $2`, id, userID).Scan(&k.ID, &k.UserID, &k.Name, &k.LogoDataURL, &k.PrimaryColor, &k.SecondaryColor, &k.FontFamily, &k.Tagline, &k.CreatedAt, &k.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &k, nil
}

func (s *PostgresStore) CreateBrandKit(userID string, req *CreateBrandKitRequest) (*BrandKit, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO brand_kits (id, user_id, name, logo_data_url, primary_color, secondary_color, font_family, tagline, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`, id, userID, req.Name, req.LogoDataURL, req.PrimaryColor, req.SecondaryColor, req.FontFamily, req.Tagline, now)
	if err != nil {
		return nil, err
	}
	return &BrandKit{ID: id, UserID: userID, Name: req.Name, LogoDataURL: req.LogoDataURL, PrimaryColor: req.PrimaryColor, SecondaryColor: req.SecondaryColor, FontFamily: req.FontFamily, Tagline: req.Tagline, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *PostgresStore) UpdateBrandKit(userID, id string, req *UpdateBrandKitRequest) (*BrandKit, error) {
	existing, err := s.GetBrandKit(userID, id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("brand kit not found")
	}
	name := existing.Name
	if req.Name != nil {
		name = *req.Name
	}
	logo := existing.LogoDataURL
	if req.LogoDataURL != nil {
		logo = req.LogoDataURL
	}
	primary := existing.PrimaryColor
	if req.PrimaryColor != nil {
		primary = *req.PrimaryColor
	}
	secondary := existing.SecondaryColor
	if req.SecondaryColor != nil {
		secondary = *req.SecondaryColor
	}
	font := existing.FontFamily
	if req.FontFamily != nil {
		font = *req.FontFamily
	}
	tagline := existing.Tagline
	if req.Tagline != nil {
		tagline = req.Tagline
	}
	_, err = s.db.Exec(`UPDATE brand_kits SET name=$1, logo_data_url=$2, primary_color=$3, secondary_color=$4, font_family=$5, tagline=$6, updated_at=NOW() WHERE id=$7 AND user_id=$8`, name, logo, primary, secondary, font, tagline, id, userID)
	if err != nil {
		return nil, err
	}
	return &BrandKit{ID: id, UserID: userID, Name: name, LogoDataURL: logo, PrimaryColor: primary, SecondaryColor: secondary, FontFamily: font, Tagline: tagline, CreatedAt: existing.CreatedAt, UpdatedAt: time.Now().UTC()}, nil
}

func (s *PostgresStore) DeleteBrandKit(userID, id string) error {
	_, err := s.db.Exec(`DELETE FROM brand_kits WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ── Pantry Staples ───────────────────────────────────────────────────

func (s *PostgresStore) ListPantryStaples(userID string) ([]PantryStaple, error) {
	// Global staples (shared, read-only) plus this account's own staples.
	// Global rows have NULL user_id — scan through sql.NullString.
	rows, err := s.db.Query(`SELECT id, user_id, name, is_global FROM pantry_staples WHERE user_id = $1 OR is_global = TRUE ORDER BY is_global DESC, name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var staples []PantryStaple
	for rows.Next() {
		var ps PantryStaple
		var uid sql.NullString
		if err := rows.Scan(&ps.ID, &uid, &ps.Name, &ps.IsGlobal); err != nil {
			return nil, err
		}
		ps.UserID = uid.String
		staples = append(staples, ps)
	}
	return staples, nil
}

func (s *PostgresStore) AddPantryStaple(userID, name string) (*PantryStaple, error) {
	id := uuid.New().String()
	_, err := s.db.Exec(`INSERT INTO pantry_staples (id, user_id, name, is_global) VALUES ($1, $2, $3, FALSE) ON CONFLICT DO NOTHING`, id, userID, name)
	if err != nil {
		return nil, err
	}
	return &PantryStaple{ID: id, UserID: userID, Name: name}, nil
}

func (s *PostgresStore) RemovePantryStaple(userID, name string) error {
	// Only account staples are removable; globals are read-only.
	_, err := s.db.Exec(`DELETE FROM pantry_staples WHERE user_id = $1 AND is_global = FALSE AND LOWER(name) = LOWER($2)`, userID, name)
	return err
}

// SeedGlobalStaples is idempotent; called at startup and after instance-wide
// resets so the default global staple list always exists.
func (s *PostgresStore) SeedGlobalStaples() error {
	defaults := []string{
		"All-purpose flour", "Sugar", "Salt", "Pepper", "Olive oil",
		"Butter", "Eggs", "Milk", "Onions", "Garlic",
		"Rice", "Pasta", "Tomato paste", "Chicken broth", "Soy sauce",
	}
	for _, name := range defaults {
		id := uuid.New().String()
		if _, err := s.db.Exec(`INSERT INTO pantry_staples (id, user_id, name, is_global) VALUES ($1, NULL, $2, TRUE) ON CONFLICT DO NOTHING`, id, name); err != nil {
			return err
		}
	}
	return nil
}

// DeleteAccount removes the user; FK ON DELETE CASCADE drops all their content.
func (s *PostgresStore) DeleteAccount(userID string) error {
	res, err := s.db.Exec(`DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// DeleteUserData wipes the caller's own content but keeps their account and
// settings (a personal reset). Global data (categories, global staples/templates,
// USDA) is untouched. Each top-level user-scoped table is deleted; dependents
// (ingredients→recipes, chapters→books, entries→plans) cascade via FK rules.
// A savepoint per table isolates any table missing a user_id column.
func (s *PostgresStore) DeleteUserData(userID string) error {
	tables := []string{
		"recipes", "recipe_books", "meal_plans", "person_profiles",
		"food_log_entries", "weight_entries", "dietary_profiles", "allergen_rules",
		"custom_foods", "templates", "brand_kits", "shared_recipes",
		"recipe_ratings", "pantry_staples", "user_secrets", "user_locations", "api_keys", "food_storage_defaults",
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	for _, t := range tables {
		if _, err := tx.Exec(fmt.Sprintf("SAVEPOINT del_%s", t)); err != nil {
			tx.Rollback()
			return err
		}
		if _, err := tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE user_id = $1", t), userID); err != nil {
			// Table has no user_id column (cascades from a parent) — release and move on.
			if _, rbErr := tx.Exec(fmt.Sprintf("ROLLBACK TO SAVEPOINT del_%s", t)); rbErr != nil {
				tx.Rollback()
				return rbErr
			}
			continue
		}
	}
	return tx.Commit()
}

func (s *PostgresStore) ListUsers() ([]UserListEntry, error) {
	rows, err := s.db.Query(`SELECT id, email, display_name, is_admin FROM users ORDER BY display_name, email`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []UserListEntry
	for rows.Next() {
		var u UserListEntry
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsAdmin); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (s *PostgresStore) SetUserAdmin(userID string, isAdmin bool) error {
	_, err := s.db.Exec(`UPDATE users SET is_admin = $1, updated_at = NOW() WHERE id = $2`, isAdmin, userID)
	return err
}

func (s *PostgresStore) AdminCount() (int, error) {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE is_admin = TRUE`).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

// ── User Location ────────────────────────────────────────────────────

func (s *PostgresStore) GetLocation(userID string) (*UserLocation, error) {
	var loc UserLocation
	err := s.db.QueryRow(`SELECT id, user_id, country, region, updated_at FROM user_locations WHERE user_id = $1`, userID).Scan(&loc.ID, &loc.UserID, &loc.Country, &loc.Region, &loc.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &loc, nil
}

func (s *PostgresStore) UpsertLocation(userID string, req *UpdateLocationRequest) (*UserLocation, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	var loc UserLocation
	err := s.db.QueryRow(`
		INSERT INTO user_locations (id, user_id, country, region, updated_at) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id) DO UPDATE SET country = $3, region = $4, updated_at = $5
		RETURNING id, user_id, country, region, updated_at`,
		id, userID, req.Country, req.Region, now,
	).Scan(&loc.ID, &loc.UserID, &loc.Country, &loc.Region, &loc.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &loc, nil
}

// ── Seasonal Foods ───────────────────────────────────────────────────

func (s *PostgresStore) GetSeasonalFoods(country, region string, month int) ([]string, error) {
	var foodsJSON string
	err := s.db.QueryRow(`SELECT foods_json FROM seasonal_foods WHERE country = $1 AND region = $2 AND month = $3`, country, region, month).Scan(&foodsJSON)
	if err == sql.ErrNoRows {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	var foods []string
	json.Unmarshal([]byte(foodsJSON), &foods)
	return foods, nil
}

func (s *PostgresStore) SetSeasonalFoods(country, region string, month int, foods string) error {
	id := uuid.New().String()
	_, err := s.db.Exec(`
		INSERT INTO seasonal_foods (id, country, region, month, foods_json) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (country, region, month) DO UPDATE SET foods_json = $5`,
		id, country, region, month, foods,
	)
	return err
}

// ── User Secrets ─────────────────────────────────────────────────────

func (s *PostgresStore) ListSecrets(userID string) ([]UserSecret, error) {
	rows, err := s.db.Query(`SELECT id, user_id, key_name, created_at, updated_at FROM user_secrets WHERE user_id = $1 ORDER BY key_name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var secrets []UserSecret
	for rows.Next() {
		var sec UserSecret
		if err := rows.Scan(&sec.ID, &sec.UserID, &sec.KeyName, &sec.CreatedAt, &sec.UpdatedAt); err != nil {
			return nil, err
		}
		secrets = append(secrets, sec)
	}
	return secrets, nil
}

func (s *PostgresStore) CreateSecret(userID string, req *CreateSecretRequest, encryptedValue []byte) (*UserSecret, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	var sec UserSecret
	err := s.db.QueryRow(`
		INSERT INTO user_secrets (id, user_id, key_name, encrypted_value, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $5)
		ON CONFLICT (user_id, key_name)
		DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, updated_at = EXCLUDED.updated_at
		RETURNING id, user_id, key_name, created_at, updated_at`, id, userID, req.KeyName, encryptedValue, now).Scan(
		&sec.ID, &sec.UserID, &sec.KeyName, &sec.CreatedAt, &sec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &sec, nil
}

func (s *PostgresStore) GetSecret(userID, keyName string) ([]byte, error) {
	var val []byte
	err := s.db.QueryRow(`SELECT encrypted_value FROM user_secrets WHERE user_id = $1 AND key_name = $2`, userID, keyName).Scan(&val)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return val, nil
}

func (s *PostgresStore) DeleteSecret(userID, id string) error {
	_, err := s.db.Exec(`DELETE FROM user_secrets WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ── Recipe Completions ────────────────────────────────────────────────

func (s *PostgresStore) ListRecipeCompletions(userID string) ([]RecipeCompletion, error) {
	rows, err := s.db.Query(
		`SELECT user_id, recipe_id, completed_date::TEXT, completed_at, completed_by
		   FROM recipe_completions WHERE user_id = $1 ORDER BY completed_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var completions []RecipeCompletion
	for rows.Next() {
		var c RecipeCompletion
		if err := rows.Scan(&c.UserID, &c.RecipeID, &c.CompletedDate, &c.CompletedAt, &c.CompletedBy); err != nil {
			return nil, err
		}
		completions = append(completions, c)
	}
	return completions, nil
}

func (s *PostgresStore) UpsertRecipeCompletion(userID, recipeID, date string) error {
	_, err := s.db.Exec(
		`INSERT INTO recipe_completions (user_id, recipe_id, completed_date, completed_at, completed_by, updated_at)
		 VALUES ($1, $2, $3, NOW(), $1, NOW())
		 ON CONFLICT (user_id, recipe_id)
		 DO UPDATE SET completed_date = EXCLUDED.completed_date,
		               completed_at = NOW(),
		               completed_by = EXCLUDED.completed_by,
		               updated_at = NOW()`,
		userID, recipeID, date)
	return err
}

func (s *PostgresStore) DeleteRecipeCompletion(userID, recipeID string) error {
	_, err := s.db.Exec(`DELETE FROM recipe_completions WHERE user_id = $1 AND recipe_id = $2`, userID, recipeID)
	return err
}
