package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
)

// CustomRecipeNutrition contains whole-recipe totals, never per-serving facts.
// MissingNutrients distinguishes unreported values from measured zeros.
type CustomRecipeNutrition struct {
	Basis            string          `json:"basis"`
	Nutrients        BundleNutrients `json:"nutrients"`
	Source           string          `json:"source"`
	SourceLabel      string          `json:"sourceLabel,omitempty"`
	MissingNutrients []string        `json:"missingNutrients,omitempty"`
}

func (n *CustomRecipeNutrition) UnmarshalJSON(data []byte) error {
	type plain CustomRecipeNutrition
	var value plain
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	var nutrients map[string]json.RawMessage
	if err := json.Unmarshal(fields["nutrients"], &nutrients); err != nil {
		return errors.New("customNutrition.nutrients is required")
	}
	typ := reflect.TypeOf(BundleNutrients{})
	for i := 0; i < typ.NumField(); i++ {
		key := typ.Field(i).Tag.Get("json")
		raw, ok := nutrients[key]
		if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return fmt.Errorf("customNutrition.nutrients.%s is required", key)
		}
	}
	*n = CustomRecipeNutrition(value)
	return validateCustomRecipeNutrition(n)
}

func (r *UpdateRecipeRequest) UnmarshalJSON(data []byte) error {
	type plain UpdateRecipeRequest
	var value plain
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	*r = UpdateRecipeRequest(value)
	_, r.customNutritionSet = fields["customNutrition"]
	return nil
}

func validateCustomRecipeNutrition(n *CustomRecipeNutrition) error {
	if n == nil {
		return nil
	}
	if n.Basis != "recipeTotal" {
		return errors.New("customNutrition.basis must be recipeTotal")
	}
	if strings.TrimSpace(n.Source) == "" || len(n.Source) > 2000 {
		return errors.New("customNutrition.source must contain 1 to 2000 bytes")
	}
	if len(n.SourceLabel) > 50000 {
		return errors.New("customNutrition.sourceLabel is too long")
	}
	if field := validateNutritionNumbers(n.Nutrients); field != "" {
		return fmt.Errorf("customNutrition.nutrients.%s is invalid", field)
	}
	return validateMissingNutrients(n.MissingNutrients)
}

func validateMissingNutrients(names []string) error {
	valid := map[string]bool{}
	typ := reflect.TypeOf(BundleNutrients{})
	for i := 0; i < typ.NumField(); i++ {
		valid[typ.Field(i).Tag.Get("json")] = true
	}
	seen := map[string]bool{}
	for _, key := range names {
		if !valid[key] || seen[key] {
			return fmt.Errorf("customNutrition.missingNutrients contains invalid or duplicate name %q", key)
		}
		seen[key] = true
	}
	return nil
}

func validateRecipeMetadata(description *string, nutrition *CustomRecipeNutrition) error {
	if description != nil && len(*description) > 100000 {
		return errors.New("recipe description is too long")
	}
	return validateCustomRecipeNutrition(nutrition)
}

// Metadata participates in the same transaction as the recipe and ingredients.
func writeRecipeMetadataTx(tx *sql.Tx, id string, description *string, nutrition *CustomRecipeNutrition, writeNutrition bool) error {
	if err := validateRecipeMetadata(description, nutrition); err != nil {
		return err
	}
	if description != nil {
		if _, err := tx.Exec(`UPDATE recipes SET description=$1 WHERE id=$2`, *description, id); err != nil {
			return err
		}
	}
	if !writeNutrition {
		return nil
	}
	if nutrition == nil {
		_, err := tx.Exec(`DELETE FROM custom_recipe_nutrition WHERE recipe_id=$1`, id)
		return err
	}
	body, err := json.Marshal(nutrition)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO custom_recipe_nutrition (recipe_id, facts) VALUES ($1,$2) ON CONFLICT (recipe_id) DO UPDATE SET facts=EXCLUDED.facts`, id, string(body))
	return err
}

func readRecipeMetadata(q postgresReader, id string) (*string, *CustomRecipeNutrition, error) {
	var description *string
	var facts []byte
	err := q.QueryRow(`SELECT r.description, n.facts FROM recipes r LEFT JOIN custom_recipe_nutrition n ON n.recipe_id=r.id WHERE r.id=$1`, id).Scan(&description, &facts)
	if err != nil {
		return nil, nil, err
	}
	var nutrition *CustomRecipeNutrition
	if len(facts) != 0 {
		nutrition = &CustomRecipeNutrition{}
		if err := json.Unmarshal(facts, nutrition); err != nil {
			return nil, nil, err
		}
	}
	if err := validateRecipeMetadata(description, nutrition); err != nil {
		return nil, nil, err
	}
	return description, nutrition, nil
}

func (s *PostgresStore) loadRecipeMetadata(r *Recipe) error {
	var err error
	r.Description, r.CustomNutrition, err = readRecipeMetadata(s.reader(), r.ID)
	return err
}

func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func unionMissingNutrients(a, b []string) []string {
	seen := map[string]bool{}
	for _, key := range a {
		seen[key] = true
	}
	for _, key := range b {
		seen[key] = true
	}
	result := []string{}
	typ := reflect.TypeOf(BundleNutrients{})
	for i := 0; i < typ.NumField(); i++ {
		key := typ.Field(i).Tag.Get("json")
		if seen[key] {
			result = append(result, key)
		}
	}
	return result
}

func writeIngredientMissingTx(tx *sql.Tx, id string, names []string) error {
	if err := validateMissingNutrients(names); err != nil {
		return err
	}
	if names == nil {
		names = []string{}
	}
	raw, err := json.Marshal(names)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE ingredients SET missing_nutrients=$1 WHERE id=$2`, string(raw), id)
	return err
}

func recipeMissingNutrients(q postgresReader, id string) ([]string, error) {
	_, custom, err := readRecipeMetadata(q, id)
	if err != nil {
		return nil, err
	}
	if custom != nil {
		return append([]string{}, custom.MissingNutrients...), nil
	}
	var raw []byte
	if err := q.QueryRow(`SELECT COALESCE(jsonb_agg(missing_nutrients),'[]'::jsonb) FROM ingredients WHERE recipe_id=$1`, id).Scan(&raw); err != nil {
		return nil, err
	}
	var lists [][]string
	if err := json.Unmarshal(raw, &lists); err != nil {
		return nil, err
	}
	all := []string{}
	for _, list := range lists {
		if err := validateMissingNutrients(list); err != nil {
			return nil, err
		}
		all = unionMissingNutrients(all, list)
	}
	return all, nil
}

// Copy only canonical nutrient fields into existing snapshot DTOs.
func setCanonicalNutrients(dst interface{}, n BundleNutrients) {
	target := reflect.ValueOf(dst).Elem()
	source := reflect.ValueOf(n)
	typ := source.Type()
	for i := 0; i < source.NumField(); i++ {
		target.FieldByName(typ.Field(i).Name).SetFloat(source.Field(i).Float())
	}
}

func customRecipeSnapshot(q postgresReader, userID, id string, factor float64, perServing bool) (*BundleNutrients, error) {
	var raw []byte
	var owner string
	var servings int
	err := q.QueryRow(`SELECT n.facts,r.user_id,r.servings FROM recipes r JOIN custom_recipe_nutrition n ON n.recipe_id=r.id WHERE r.id=$1`, id).Scan(&raw, &owner, &servings)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if owner != userID {
		return nil, ErrExportForbidden
	}
	var facts CustomRecipeNutrition
	if err := json.Unmarshal(raw, &facts); err != nil {
		return nil, err
	}
	if !validNonNegative(factor) || servings < 1 {
		return nil, errors.New("invalid custom recipe multiplier or yield")
	}
	if perServing {
		factor /= float64(servings)
	}
	n := scaleImportNutrients(facts.Nutrients, factor)
	if field := validateNutritionNumbers(n); field != "" {
		return nil, fmt.Errorf("scaled custom recipe nutrient %s is out of bounds", field)
	}
	return &n, nil
}

func (s *PostgresStore) canonicalizeLinkedCustomIngredient(tx *sql.Tx, parentID string, ing *CreateIngredientReq) error {
	if s.personalOnly {
		var owner string
		if err := tx.QueryRow(`SELECT user_id FROM recipes WHERE id=$1`, parentID).Scan(&owner); err != nil {
			return err
		}
		checked := *s
		checked.writeTx = tx
		if err := checked.requirePersonalSource(owner, "recipe", ing.LinkedRecipeID); err != nil {
			return err
		}
		kind := ing.SourceType
		if kind == "custom_food" {
			kind = "customFood"
		}
		if err := checked.requirePersonalSource(owner, kind, ing.SourceKey); err != nil {
			return err
		}
	}
	key := ing.LinkedRecipeID
	if key == nil && ing.SourceType == "recipe" {
		key = ing.SourceKey
	}
	if key == nil || *key == "" || ing.UnresolvedSource != nil {
		return nil
	}
	var owner string
	if err := tx.QueryRow(`SELECT user_id FROM recipes WHERE id=$1`, parentID).Scan(&owner); err != nil {
		return err
	}
	n, err := customRecipeSnapshot(tx, owner, *key, ing.Amount, false)
	if err != nil {
		return err
	}
	if n != nil {
		setCanonicalNutrients(ing, *n)
		ing.LinkedRecipeID = key
		ing.SourceType = "recipe"
	}
	// Ordinary recipe links keep their existing nutrient snapshots, but cannot
	// lose missing-value provenance inherited from a custom dependency.
	var exists bool
	if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipes WHERE id=$1 AND user_id=$2)`, *key, owner).Scan(&exists); err != nil {
		return err
	}
	if exists {
		var err error
		ing.MissingNutrients, err = recipeMissingNutrients(tx, *key)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) requirePersonalSource(userID, kind string, id *string) error {
	if !s.personalOnly || id == nil {
		return nil
	}
	var exists bool
	var err error
	switch kind {
	case "recipe":
		err = s.reader().QueryRow(`SELECT EXISTS (SELECT 1 FROM recipes WHERE id=$1 AND user_id=$2)`, *id, userID).Scan(&exists)
	case "customFood":
		err = s.reader().QueryRow(`SELECT EXISTS (SELECT 1 FROM custom_foods WHERE id=$1 AND (user_id=$2 OR shared_with_community))`, *id, userID).Scan(&exists)
	default:
		return nil
	}
	if err != nil {
		return err
	}
	if !exists {
		return sql.ErrNoRows
	}
	return nil
}

func (s *PostgresStore) canonicalizeCustomLog(userID string, req *CreateFoodLogRequest) error {
	if err := s.requirePersonalSource(userID, req.SourceType, req.SourceID); err != nil {
		return err
	}
	if req.SourceType != "recipe" || req.SourceID == nil {
		return nil
	}
	n, err := customRecipeSnapshot(s.reader(), userID, *req.SourceID, req.Servings, true)
	if err != nil {
		return err
	}
	if n != nil {
		setCanonicalNutrients(req, *n)
	}
	return nil
}

// A metadata-only log edit must not rebase a historical snapshot. Changing the
// selected recipe or consumed amount is an explicit request for current facts.
func (s *PostgresStore) canonicalizeCustomLogUpdate(id string, req *CreateFoodLogRequest) error {
	var userID string
	var old CreateFoodLogRequest
	var n BundleNutrients
	var custom bool
	err := s.reader().QueryRow(`SELECT e.user_id,e.source_type,e.source_id,e.servings,e.serving_amount,e.serving_unit,e.calories,e.total_fat,e.saturated_fat,e.trans_fat,e.cholesterol,e.sodium,e.total_carbs,e.dietary_fiber,e.total_sugars,e.added_sugars,e.protein,e.vitamin_d,e.calcium,e.iron,e.potassium,EXISTS(SELECT 1 FROM custom_recipe_nutrition c WHERE c.recipe_id=e.source_id) FROM food_log_entries e WHERE e.id=$1`, id).Scan(&userID, &old.SourceType, &old.SourceID, &old.Servings, &old.ServingAmount, &old.ServingUnit, &n.Calories, &n.TotalFat, &n.SaturatedFat, &n.TransFat, &n.Cholesterol, &n.Sodium, &n.TotalCarbs, &n.DietaryFiber, &n.TotalSugars, &n.AddedSugars, &n.Protein, &n.VitaminD, &n.Calcium, &n.Iron, &n.Potassium, &custom)
	if err != nil {
		return err
	}
	if custom && old.SourceType == "recipe" && req.SourceType == old.SourceType && reflect.DeepEqual(old.SourceID, req.SourceID) && old.Servings == req.Servings && reflect.DeepEqual(old.ServingAmount, req.ServingAmount) && reflect.DeepEqual(old.ServingUnit, req.ServingUnit) {
		setCanonicalNutrients(req, n)
		return nil
	}
	return s.canonicalizeCustomLog(userID, req)
}

func (s *PostgresStore) canonicalizeCustomDayPlan(mealPlanID string, req *CreateDayPlanEntryRequest) error {
	if req.RecipeID == nil || (req.SourceType != "" && req.SourceType != "recipe") {
		return nil
	}
	var userID string
	if err := s.reader().QueryRow(`SELECT user_id FROM meal_plans WHERE id=$1`, mealPlanID).Scan(&userID); err != nil {
		return err
	}
	if err := s.requirePersonalSource(userID, "recipe", req.RecipeID); err != nil {
		return err
	}
	n, err := customRecipeSnapshot(s.reader(), userID, *req.RecipeID, req.Servings, true)
	if err != nil {
		return err
	}
	if n != nil {
		setCanonicalNutrients(req, *n)
	}
	return nil
}

// Native restore preserves ordinary historical ingredient facts, but a custom
// child's authoritative total must win over a stale linked snapshot even there.
func normalizeBundleCustomLinks(tx *sql.Tx, userID string, b RecipeBundle, refs map[string]string) (RecipeBundle, error) {
	custom := map[string]*CustomRecipeNutrition{}
	for _, r := range b.Recipes {
		if r.CustomNutrition != nil {
			custom[r.BundleRecipeID] = r.CustomNutrition
			custom[r.PortableID] = r.CustomNutrition
		}
	}
	b.Recipes = append([]BundleRecipe(nil), b.Recipes...)
	for i := range b.Recipes {
		r := &b.Recipes[i]
		r.Ingredients = append([]BundleIngredient(nil), r.Ingredients...)
		for j := range r.Ingredients {
			ing := &r.Ingredients[j]
			if ing.Source.Type != "recipe" {
				continue
			}
			var n *BundleNutrients
			if facts := custom[ing.Source.BundleRecipeID]; facts != nil {
				scaled := scaleImportNutrients(facts.Nutrients, ing.Amount)
				n = &scaled
				ing.MissingNutrients = append([]string{}, facts.MissingNutrients...)
			} else {
				id := refs[ing.Source.BundleRecipeID]
				if id == "" {
					var err error
					id, err = authorizedImportRecipeID(tx, userID, ing.Source.BundleRecipeID)
					if err != nil {
						return b, err
					}
				}
				if id != "" {
					var err error
					n, err = customRecipeSnapshot(tx, userID, id, ing.Amount, false)
					if err != nil {
						return b, err
					}
					missing, err := recipeMissingNutrients(tx, id)
					if err != nil {
						return b, err
					}
					if n != nil {
						ing.MissingNutrients = missing
					} else {
						ing.MissingNutrients = unionMissingNutrients(ing.MissingNutrients, missing)
					}
				}
			}
			if n != nil {
				if field := validateNutritionNumbers(*n); field != "" {
					return b, fmt.Errorf("derived nutrient %s exceeds allowed bounds", field)
				}
				ing.Nutrients = *n
			}
		}
	}
	// Propagate missing-value provenance through ordinary recipe snapshots in
	// source order-independent packages without recalculating normal nutrients.
	for pass := 0; pass < len(b.Recipes); pass++ {
		missingByKey := map[string][]string{}
		for _, r := range b.Recipes {
			missing := []string{}
			if r.CustomNutrition != nil {
				missing = r.CustomNutrition.MissingNutrients
			} else {
				for _, ing := range r.Ingredients {
					missing = unionMissingNutrients(missing, ing.MissingNutrients)
				}
			}
			missingByKey[r.BundleRecipeID] = missing
			if r.PortableID != "" {
				missingByKey[r.PortableID] = missing
			}
		}
		for i := range b.Recipes {
			for j := range b.Recipes[i].Ingredients {
				ing := &b.Recipes[i].Ingredients[j]
				if ing.Source.Type == "recipe" {
					ing.MissingNutrients = unionMissingNutrients(ing.MissingNutrients, missingByKey[ing.Source.BundleRecipeID])
				}
			}
		}
	}
	if bundleHasV4Metadata(b) {
		b.Version = 4
	}
	return b, nil
}

func recipeHasV4Metadata(r BundleRecipe) bool {
	for _, ing := range r.Ingredients {
		if len(ing.MissingNutrients) > 0 {
			return true
		}
	}
	return r.CustomNutrition != nil || r.Description != nil
}

func bundleHasV4Metadata(b RecipeBundle) bool {
	for _, r := range b.Recipes {
		if recipeHasV4Metadata(r) {
			return true
		}
	}
	if b.PendingImports != nil {
		for _, row := range b.PendingImports.Recipes {
			if recipeHasV4Metadata(row.Recipe) {
				return true
			}
		}
		for _, batch := range b.PendingImports.Batches {
			if bundleHasV4Metadata(batch.Context) {
				return true
			}
		}
	}
	return false
}
