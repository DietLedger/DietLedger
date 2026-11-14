package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// RecipeBundleIdentityConflictError requires an explicit import decision. It is
// never permission to overwrite a local object or silently change its identity.
type RecipeBundleIdentityConflictError struct {
	Kind       string
	PortableID string
}

func (e *RecipeBundleIdentityConflictError) Error() string {
	return fmt.Sprintf("%s identity %s has different local content; retain local, fork incoming, or cancel", e.Kind, e.PortableID)
}

func validatePortableID(id, kind string) error {
	prefix := "dietledger:" + kind + ":"
	if !strings.HasPrefix(id, prefix) {
		return fmt.Errorf("invalid %s portableId %q", kind, id)
	}
	parsed, err := uuid.Parse(strings.TrimPrefix(id, prefix))
	if err != nil || prefix+parsed.String() != id {
		return fmt.Errorf("invalid %s portableId %q", kind, id)
	}
	return nil
}

func (s *PostgresStore) importPortableCustomFoodTx(tx *sql.Tx, userID string, f BundleCustomFood) (string, bool, error) {
	if err := validatePortableID(f.PortableID, "food"); err != nil {
		return "", false, err
	}
	rows, err := tx.Query(`SELECT id,name,calories,total_fat,saturated_fat,trans_fat,cholesterol,sodium,total_carbs,dietary_fiber,total_sugars,added_sugars,protein,vitamin_d,calcium,iron,potassium FROM custom_foods WHERE (user_id=$1 OR shared_with_community) AND portable_id=$2 ORDER BY shared_with_community DESC,id FOR UPDATE`, userID, f.PortableID)
	if err != nil {
		return "", false, err
	}
	defer rows.Close()
	right, err := RecipeBundleContentHash("custom_food", BundleCustomFood{Name: f.Name, Nutrients: f.Nutrients})
	if err != nil {
		return "", false, err
	}
	var id string
	for rows.Next() {
		var local BundleCustomFood
		var candidate string
		if err := rows.Scan(&candidate, &local.Name, &local.Nutrients.Calories, &local.Nutrients.TotalFat, &local.Nutrients.SaturatedFat, &local.Nutrients.TransFat, &local.Nutrients.Cholesterol, &local.Nutrients.Sodium, &local.Nutrients.TotalCarbs, &local.Nutrients.DietaryFiber, &local.Nutrients.TotalSugars, &local.Nutrients.AddedSugars, &local.Nutrients.Protein, &local.Nutrients.VitaminD, &local.Nutrients.Calcium, &local.Nutrients.Iron, &local.Nutrients.Potassium); err != nil {
			return "", false, err
		}
		left, err := RecipeBundleContentHash("custom_food", local)
		if err != nil {
			return "", false, err
		}
		if left != right {
			return "", false, &RecipeBundleIdentityConflictError{Kind: "custom food", PortableID: f.PortableID}
		}
		if id == "" {
			id = candidate
		}
	}
	if err := rows.Err(); err != nil {
		return "", false, err
	}
	if id != "" {
		return id, true, nil
	}
	id = uuid.NewString()
	_, err = tx.Exec(`INSERT INTO custom_foods (id,user_id,portable_id,name,calories,total_fat,saturated_fat,trans_fat,cholesterol,sodium,total_carbs,dietary_fiber,total_sugars,added_sugars,protein,vitamin_d,calcium,iron,potassium) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, id, userID, f.PortableID, f.Name, f.Nutrients.Calories, f.Nutrients.TotalFat, f.Nutrients.SaturatedFat, f.Nutrients.TransFat, f.Nutrients.Cholesterol, f.Nutrients.Sodium, f.Nutrients.TotalCarbs, f.Nutrients.DietaryFiber, f.Nutrients.TotalSugars, f.Nutrients.AddedSugars, f.Nutrients.Protein, f.Nutrients.VitaminD, f.Nutrients.Calcium, f.Nutrients.Iron, f.Nutrients.Potassium)
	return id, false, err
}

func (s *PostgresStore) importPortableRecipeTx(tx *sql.Tx, userID string, r BundleRecipe) (string, bool, error) {
	if err := validatePortableID(r.PortableID, "recipe"); err != nil {
		return "", false, err
	}
	var id string
	err := tx.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND portable_id=$2 FOR UPDATE`, userID, r.PortableID).Scan(&id)
	if err == nil {
		return id, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", false, err
	}
	id = uuid.NewString()
	groups, err := json.Marshal(bundleGroupsToIngredientGroups(r.IngredientGroups))
	if err != nil {
		return "", false, err
	}
	_, err = tx.Exec(`INSERT INTO recipes (id,user_id,portable_id,name,servings,serving_name,prep_time,cook_time,instructions,leftover_storage,ingredient_groups) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, id, userID, r.PortableID, r.Name, r.Servings, emptyDefault(r.ServingName, "serving"), r.PrepTime, r.CookTime, r.Instructions, r.LeftoverStorage, string(groups))
	return id, false, err
}

func validateRecipeReuseTx(tx *sql.Tx, userID, id string, r BundleRecipe, recipeMap, foodMap map[string]string) error {
	local, err := portableRecipeForComparisonTx(tx, userID, id)
	if err != nil {
		return err
	}
	incoming := r
	incoming.Ingredients = append([]BundleIngredient(nil), r.Ingredients...)
	for i := range incoming.Ingredients {
		src := &incoming.Ingredients[i].Source
		if src.Type == "recipe" && recipeMap[src.BundleRecipeID] != "" {
			if err := tx.QueryRow(`SELECT portable_id FROM recipes WHERE id=$1 AND user_id=$2`, recipeMap[src.BundleRecipeID], userID).Scan(&src.BundleRecipeID); err != nil {
				return err
			}
		}
		if src.Type == "custom_food" && foodMap[src.BundleCustomFoodID] != "" {
			if err := tx.QueryRow(`SELECT portable_id FROM custom_foods WHERE id=$1 AND (user_id=$2 OR shared_with_community)`, foodMap[src.BundleCustomFoodID], userID).Scan(&src.BundleCustomFoodID); err != nil {
				return err
			}
		}
	}
	left, err := portableRecipeContentHash(local)
	if err != nil {
		return err
	}
	right, err := portableRecipeContentHash(incoming)
	if err != nil {
		return err
	}
	if left != right {
		key := r.PortableID
		if key == "" {
			key = r.BundleRecipeID
		}
		return &RecipeBundleIdentityConflictError{Kind: "recipe", PortableID: key}
	}
	return nil
}

func validateLegacyCustomFoodReuseTx(tx *sql.Tx, userID, id string, f BundleCustomFood) error {
	var local BundleCustomFood
	err := tx.QueryRow(`SELECT name,calories,total_fat,saturated_fat,trans_fat,cholesterol,sodium,total_carbs,dietary_fiber,total_sugars,added_sugars,protein,vitamin_d,calcium,iron,potassium FROM custom_foods WHERE id=$1 AND (user_id=$2 OR shared_with_community) FOR UPDATE`, id, userID).Scan(&local.Name, &local.Nutrients.Calories, &local.Nutrients.TotalFat, &local.Nutrients.SaturatedFat, &local.Nutrients.TransFat, &local.Nutrients.Cholesterol, &local.Nutrients.Sodium, &local.Nutrients.TotalCarbs, &local.Nutrients.DietaryFiber, &local.Nutrients.TotalSugars, &local.Nutrients.AddedSugars, &local.Nutrients.Protein, &local.Nutrients.VitaminD, &local.Nutrients.Calcium, &local.Nutrients.Iron, &local.Nutrients.Potassium)
	if err != nil {
		return err
	}
	left, err := RecipeBundleContentHash("custom_food", local)
	if err != nil {
		return err
	}
	right, err := RecipeBundleContentHash("custom_food", BundleCustomFood{Name: f.Name, Nutrients: f.Nutrients})
	if err != nil {
		return err
	}
	if left != right {
		return &RecipeBundleIdentityConflictError{Kind: "custom food", PortableID: f.BundleCustomFoodID}
	}
	return nil
}

func portableRecipeForComparisonTx(tx *sql.Tx, userID, id string) (BundleRecipe, error) {
	var r BundleRecipe
	var groups string
	err := tx.QueryRow(`SELECT name,servings,serving_name,prep_time,cook_time,instructions,leftover_storage,COALESCE(ingredient_groups,'[]') FROM recipes WHERE user_id=$1 AND id=$2`, userID, id).Scan(&r.Name, &r.Servings, &r.ServingName, &r.PrepTime, &r.CookTime, &r.Instructions, &r.LeftoverStorage, &groups)
	if err != nil {
		return r, err
	}
	var localGroups []IngredientGroupJSON
	if err := json.Unmarshal([]byte(groups), &localGroups); err != nil {
		return r, err
	}
	for _, g := range localGroups {
		r.IngredientGroups = append(r.IngredientGroups, BundleIngredientGroup{BundleGroupID: g.ID, Title: g.Title})
	}
	ingredients, err := listIngredientsByRecipeQuery(tx, id)
	if err != nil {
		return r, err
	}
	for _, ing := range ingredients {
		src := BundleIngredientSourceRef{Type: emptyDefault(ing.SourceType, "manual")}
		switch {
		case ing.UnresolvedSource != nil:
			src = *ing.UnresolvedSource
		case ing.LinkedRecipeID != nil && *ing.LinkedRecipeID != "":
			src.Type = "recipe"
			if err := tx.QueryRow(`SELECT portable_id FROM recipes WHERE id=$1 AND user_id=$2`, *ing.LinkedRecipeID, userID).Scan(&src.BundleRecipeID); err != nil {
				return r, err
			}
		case ing.SourceType == "custom_food" && ing.SourceKey != nil:
			if err := tx.QueryRow(`SELECT portable_id FROM custom_foods WHERE id=$1 AND (user_id=$2 OR shared_with_community)`, *ing.SourceKey, userID).Scan(&src.BundleCustomFoodID); err != nil {
				return r, err
			}
		case ing.FdcID > 0:
			src.Type = "usda"
			src.FdcID = ing.FdcID
		default:
			src.Type = "manual"
		}
		position := ing.Position
		r.Ingredients = append(r.Ingredients, BundleIngredient{Position: &position, Name: ing.Name, Amount: ing.Amount, Unit: ing.Unit, Description: ing.Description, BundleGroupID: ing.GroupID, PrepInstructions: ing.PrepInstructions, StorageLocation: ing.StorageLocation, Source: src, Nutrients: nutrientsFromIngredient(ing), ZeroNutritionOverride: ing.ZeroNutritionOverride, SuppliedNutrition: ing.UnconfirmedNutrition})
	}
	return r, nil
}

// Local ingredient/group keys are transport details, not object content.
// Ingredient and group order are content; normalize positions to their ordered
// array index so legacy bundles without explicit positions compare safely.
func portableRecipeContentHash(r BundleRecipe) (string, error) {
	r.PortableID = ""
	r.BundleRecipeID = ""
	r.SourceRecipeID = ""
	r.ServingName = emptyDefault(r.ServingName, "serving")
	r.IngredientGroups = append([]BundleIngredientGroup{}, r.IngredientGroups...)
	r.Ingredients = append([]BundleIngredient{}, r.Ingredients...)
	groups := map[string]string{}
	for i := range r.IngredientGroups {
		key := fmt.Sprintf("group:%d", i)
		groups[r.IngredientGroups[i].BundleGroupID] = key
		r.IngredientGroups[i].BundleGroupID = key
	}
	r.Ingredients = orderedBundleIngredients(r.Ingredients)
	for i := range r.Ingredients {
		ing := &r.Ingredients[i]
		ing.BundleIngredientID = ""
		ing.SourceIngredientID = ""
		if ing.BundleGroupID != nil {
			g := groups[*ing.BundleGroupID]
			ing.BundleGroupID = &g
		}
		ing.PrepInstructions = append([]string{}, ing.PrepInstructions...)
		position := i
		ing.Position = &position
	}
	return RecipeBundleContentHash("recipe", r)
}
