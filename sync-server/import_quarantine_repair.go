package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
)

func (s *PostgresStore) ResolveQuarantinedIngredient(userID, stagedID, ingredientID string, req CreateIngredientReq) (*RecipeBundleImportSummary, error) {
	if msg := validateIngredient(&req); msg != "" {
		return nil, errors.New(msg)
	}
	raw, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	hash := fmt.Sprintf("%x", sha256.Sum256(raw))
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := lockImportOwner(tx, userID); err != nil {
		return nil, err
	}
	snapshot := &PostgresStore{db: s.db, readTx: tx}
	batches, rows, err := snapshot.loadImportState(userID)
	if err != nil {
		return nil, err
	}
	var retried bool
	if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipe_import_resolutions WHERE user_id=$1 AND staged_recipe_id=$2 AND ingredient_id=$3 AND payload_hash=$4)`, userID, stagedID, ingredientID, hash).Scan(&retried); err != nil {
		return nil, err
	}
	if retried {
		summary, err := s.importStateSummaryTx(tx, userID, nil, batches, rows)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return summary, nil
	}
	var row *stagedImportRecipe
	for _, candidate := range rows {
		if candidate.ID == stagedID {
			row = candidate
		}
	}
	if row == nil {
		return nil, ErrImportNotFound
	}
	var batch *recipeImportBatch
	for _, b := range batches {
		if b.ID == row.BatchID {
			batch = b
		}
	}
	if batch == nil {
		return nil, ErrImportNotFound
	}
	index := -1
	for i, ing := range row.Recipe.Ingredients {
		if ing.BundleIngredientID == ingredientID {
			index = i
		}
	}
	if ingredientID == "new" && len(row.Recipe.Ingredients) == 0 {
		index = 0
		row.Recipe.Ingredients = append(row.Recipe.Ingredients, BundleIngredient{BundleIngredientID: uuid.NewString(), Name: req.Name, Description: req.Description, BundleGroupID: req.GroupID, PrepInstructions: req.PrepInstructions, StorageLocation: req.StorageLocation, SuppliedNutrition: req.UnconfirmedNutrition})
	} else if index < 0 {
		return nil, ErrImportNotFound
	}
	original := row.Recipe.Ingredients[index]
	ing := original
	ing.Amount = req.Amount
	ing.Unit = req.Unit
	ing.Nutrients = nutrientsFromIngredientRequest(req)
	ing.Source = BundleIngredientSourceRef{Type: emptyDefault(req.SourceType, "manual")}
	ing.ZeroNutritionOverride = req.ZeroNutritionOverride != nil && *req.ZeroNutritionOverride
	if req.UnresolvedSource != nil {
		return nil, errors.New("repair requires an available nutrition link or explicit no-nutrition choice")
	}
	switch ing.Source.Type {
	case "usda":
		if req.FdcID <= 0 || req.LinkedRecipeID != nil || (req.SourceKey != nil && *req.SourceKey != fmt.Sprint(req.FdcID)) {
			return nil, errors.New("USDA source identity mismatch")
		}
		ing.Source.FdcID = req.FdcID
		food, err := snapshot.GetFoodByFdcID(req.FdcID)
		if err != nil {
			return nil, err
		}
		if food == nil || !meaningfulImportNutrition(nutrientsFromFoodItem(*food)) {
			return nil, errors.New("selected USDA food is unavailable")
		}
	case "custom_food":
		if req.SourceKey == nil || *req.SourceKey == "" || req.FdcID > 0 || req.LinkedRecipeID != nil {
			return nil, errors.New("custom food source identity is required")
		}
		_, food, err := importCustomFood(tx, userID, *req.SourceKey)
		if err != nil {
			return nil, err
		}
		if food == nil || !meaningfulImportNutrition(food.Nutrients) {
			return nil, errors.New("selected custom food is unavailable")
		}
		ing.Source.BundleCustomFoodID = food.PortableID
	case "recipe":
		if req.LinkedRecipeID == nil || *req.LinkedRecipeID == "" || req.FdcID > 0 || (req.SourceKey != nil && *req.SourceKey != *req.LinkedRecipeID) {
			return nil, errors.New("linked recipe identity is required")
		}
		id, err := authorizedImportRecipeID(tx, userID, *req.LinkedRecipeID)
		if err != nil {
			return nil, err
		}
		if id == "" {
			return nil, errors.New("selected recipe is unavailable")
		}
		var portable string
		if err := tx.QueryRow(`SELECT portable_id FROM recipes WHERE id=$1 AND user_id=$2`, id, userID).Scan(&portable); err != nil {
			return nil, err
		}
		ing.Source.BundleRecipeID = portable
	case "manual":
		if !ing.ZeroNutritionOverride {
			return nil, errors.New("manual repair requires explicit no-nutrition choice")
		}
	default:
		return nil, errors.New("invalid ingredient source")
	}
	evaluator := newImportEvaluator(snapshot, userID, batches, rows)
	ready, nutrients, reason, err := evaluator.ingredient(batch, ing, true)
	if err != nil {
		return nil, err
	}
	if !ready {
		return nil, fmt.Errorf("selected link is unresolved: %s", reason)
	}
	// Recompute from canonical facts; a client nutrient snapshot (even a positive
	// one) cannot invent a source or override its amount/unit conversion.
	ing.Nutrients = nutrients
	ing.MissingNutrients = nil
	if ing.Source.Type == "recipe" {
		dependency, err := evaluator.recipeByIdentity(evaluator.linkedIdentity(batch, ing.Source.BundleRecipeID))
		if err != nil {
			return nil, err
		}
		ing.MissingNutrients = append([]string{}, dependency.missing...)
	}
	row.Recipe.Ingredients[index] = ing
	if recipeHasV4Metadata(row.Recipe) {
		batch.Context.Version = 4
	}
	check := batch.Context
	check.Recipes = []BundleRecipe{row.Recipe}
	check.ChapterRecipes = nil
	check.RecipeCategories = nil
	if err := ValidateRecipeBundle(check); err != nil {
		return nil, err
	}
	payload, err := json.Marshal(row.Recipe)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`UPDATE recipe_import_staged SET recipe=$1 WHERE id=$2 AND user_id=$3`, string(payload), stagedID, userID); err != nil {
		return nil, err
	}
	// Repair is an explicit Keep action, allowing abandoned decision dialogs to
	// resume through the queue without adding a second UI/API state machine.
	batch.Accepted = true
	if err := s.saveImportBatchTx(tx, userID, batch); err != nil {
		return nil, err
	}
	summary := newRecipeBundleImportSummary()
	if err := s.promoteImportsTx(tx, userID, batches, rows, &summary, row.Recipe.PortableID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`INSERT INTO recipe_import_resolutions(user_id,staged_recipe_id,ingredient_id,payload_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, userID, stagedID, ingredientID, hash); err != nil {
		return nil, err
	}
	batches, rows, err = snapshot.loadImportState(userID)
	if err != nil {
		return nil, err
	}
	state, err := s.importStateSummaryTx(tx, userID, batch, batches, rows)
	if err != nil {
		return nil, err
	}
	summary.Quarantined = state.Quarantined
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &summary, nil
}
