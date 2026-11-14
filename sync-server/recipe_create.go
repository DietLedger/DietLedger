package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

var errRecipeCreateConflict = errors.New("requestKey already used with a different recipe payload")

// createRecipeAtomic keeps a failed ingredient write from leaving an incomplete recipe.
func (s *PostgresStore) createRecipeAtomic(userID string, req *CreateRecipeRequest) (*Recipe, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	id := uuid.New().String()
	if req.RequestKey != "" {
		// Hash the decoded request, not JSON key ordering or generated row identities.
		payload := *req
		payload.RequestKey = ""
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("hash recipe request: %w", err)
		}
		digest := sha256.Sum256(encoded)
		requestHash := hex.EncodeToString(digest[:])
		// A conflicting insert waits for the other transaction to commit or roll back.
		result, err := tx.Exec(`INSERT INTO recipe_create_requests (user_id, request_key, request_hash, recipe_id) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, request_key) DO NOTHING`, userID, req.RequestKey, requestHash, id)
		if err != nil {
			return nil, fmt.Errorf("reserve recipe request: %w", err)
		}
		inserted, err := result.RowsAffected()
		if err != nil {
			return nil, err
		}
		if inserted == 0 {
			var existingHash string
			if err := tx.QueryRow(`SELECT request_hash, recipe_id FROM recipe_create_requests WHERE user_id=$1 AND request_key=$2`, userID, req.RequestKey).Scan(&existingHash, &id); err != nil {
				return nil, fmt.Errorf("read recipe request: %w", err)
			}
			if existingHash != requestHash {
				return nil, errRecipeCreateConflict
			}
			// Release this transaction before the authoritative read uses the pool.
			if err := tx.Rollback(); err != nil {
				return nil, err
			}
			return s.GetRecipe(userID, id)
		}
	}
	now := time.Now().UTC()
	servingName := req.ServingName
	if servingName == "" {
		servingName = "serving"
	}
	groups := req.IngredientGroups
	if groups == "" {
		groups = "[]"
	}
	// Omit portable_id so its database default generates the immutable identity.
	_, err = tx.Exec(
		`INSERT INTO recipes (id, user_id, name, servings, serving_name, prep_time, cook_time, instructions, leftover_storage, ingredient_groups, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
		id, userID, req.Name, req.Servings, servingName, req.PrepTime, req.CookTime, req.Instructions, req.LeftoverStorage, groups, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert recipe: %w", err)
	}
	for position, ing := range req.Ingredients {
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
		_, err = tx.Exec(
			`INSERT INTO ingredients (id, recipe_id, fdc_id, name, amount, unit, description, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, prep_instructions, storage_location, group_id, linked_recipe_id, source_type, source_key, position, zero_nutrition_override, unresolved_source_ref, unconfirmed_nutrition) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)`,
			uuid.New().String(), id, ing.FdcID, ing.Name, ing.Amount, ing.Unit, ing.Description, ing.Calories, ing.TotalFat, ing.SaturatedFat, ing.TransFat, ing.Cholesterol, ing.Sodium, ing.TotalCarbs, ing.DietaryFiber, ing.TotalSugars, ing.AddedSugars, ing.Protein, ing.VitaminD, ing.Calcium, ing.Iron, ing.Potassium, PrepInstructionsJSON(ing.PrepInstructions), ing.StorageLocation, ing.GroupID, ing.LinkedRecipeID, sourceType, ing.SourceKey, position, requestedZeroOverride(ing.ZeroNutritionOverride), unresolvedJSON, unconfirmedJSON,
		)
		if err != nil {
			return nil, fmt.Errorf("create ingredient: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit recipe: %w", err)
	}
	return s.GetRecipe(userID, id)
}
