package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

// Keep missing references intact for unresolved-source import handling. Existing
// dependencies still require the same access check as a directly exported recipe.
func (s *PostgresStore) addLinkedRecipeToBundle(user *User, recipeID string, bundle *RecipeBundle, seen map[string]bool) (string, error) {
	r, err := s.getRecipeByID(recipeID)
	if err != nil || r == nil {
		return recipeID, err
	}
	ok, err := s.canExportRecipe(user, recipeID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrExportForbidden
	}
	if err := s.addRecipeRecordToBundle(user, r, bundle, seen); err != nil {
		return "", err
	}
	return r.PortableID, nil
}

// Public recipe access does not grant access to canonical private food data.
// Private dependencies must belong to the recipe owner AND be exportable by
// the requester. Do not enumerate any unreferenced foods.
func (s *PostgresStore) addReferencedCustomFoodToBundle(user *User, recipeOwnerID, foodID string, bundle *RecipeBundle) (string, error) {
	var f CustomFood
	err := s.reader().QueryRow(`SELECT id, portable_id, name, calories, total_fat, saturated_fat, trans_fat, cholesterol, sodium, total_carbs, dietary_fiber, total_sugars, added_sugars, protein, vitamin_d, calcium, iron, potassium, user_id, shared_with_community FROM custom_foods WHERE id=$1`, foodID).Scan(
		&f.ID, &f.PortableID, &f.Name, &f.Calories, &f.TotalFat, &f.SaturatedFat, &f.TransFat, &f.Cholesterol, &f.Sodium, &f.TotalCarbs, &f.DietaryFiber, &f.TotalSugars, &f.AddedSugars, &f.Protein, &f.VitaminD, &f.Calcium, &f.Iron, &f.Potassium, &f.UserID, &f.SharedWithCommunity)
	if err == sql.ErrNoRows {
		return foodID, nil
	}
	if err != nil {
		return "", err
	}
	if !f.SharedWithCommunity && (f.UserID != recipeOwnerID || user == nil || (!user.IsAdmin && user.ID != f.UserID)) {
		return "", ErrExportForbidden
	}
	for _, existing := range bundle.CustomFoods {
		if existing.BundleCustomFoodID == f.PortableID {
			return f.PortableID, nil
		}
	}
	bundle.CustomFoods = append(bundle.CustomFoods, BundleCustomFood{PortableID: f.PortableID, BundleCustomFoodID: f.PortableID, SourceCustomFoodID: f.ID, Name: f.Name, Nutrients: nutrientsFromCustomFood(f)})
	return f.PortableID, nil
}

func (s *PostgresStore) addRecipeCategoriesToBundle(r *Recipe, bundle *RecipeBundle) error {
	assignments, err := s.ListRecipeCategories(r.ID)
	if err != nil {
		return err
	}
	for _, assignment := range assignments {
		if err := s.addCategoryToBundle(assignment.CategoryID, bundle); err != nil {
			return err
		}
		bundle.RecipeCategories = append(bundle.RecipeCategories, BundleRecipeCategory{BundleRecipeID: r.PortableID, BundleCategoryID: assignment.CategoryID})
	}
	return nil
}

func (s *PostgresStore) addCategoryToBundle(categoryID string, bundle *RecipeBundle) error {
	for _, existing := range bundle.Categories {
		if existing.BundleCategoryID == categoryID {
			return nil
		}
	}
	var c Category
	err := s.reader().QueryRow(`SELECT id, name, parent_id FROM categories WHERE id=$1`, categoryID).Scan(&c.ID, &c.Name, &c.ParentID)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	// Record before traversing the parent so corrupt category cycles terminate.
	bundle.Categories = append(bundle.Categories, BundleCategory{BundleCategoryID: c.ID, SourceCategoryID: c.ID, Name: c.Name, ParentBundleCategoryID: c.ParentID})
	if c.ParentID != nil && *c.ParentID != "" {
		return s.addCategoryToBundle(*c.ParentID, bundle)
	}
	return nil
}

func (s *PostgresStore) addReferencedTemplateToBundle(bookOwnerID, templateID string, bundle *RecipeBundle) error {
	for _, existing := range bundle.Templates {
		if existing.BundleTemplateID == templateID {
			return nil
		}
	}
	t, err := s.GetTemplate(bookOwnerID, templateID)
	if err != nil {
		return err
	}
	if t == nil {
		return fmt.Errorf("referenced template %q not found", templateID)
	}
	bundle.Templates = append(bundle.Templates, BundleTemplate{BundleTemplateID: t.ID, SourceTemplateID: t.ID, Name: t.Name, Type: t.Type, Layout: json.RawMessage(t.LayoutJSON)})
	return nil
}

func nutrientsFromCustomFood(f CustomFood) BundleNutrients {
	return BundleNutrients{Calories: f.Calories, TotalFat: f.TotalFat, SaturatedFat: f.SaturatedFat, TransFat: f.TransFat, Cholesterol: f.Cholesterol, Sodium: f.Sodium, TotalCarbs: f.TotalCarbs, DietaryFiber: f.DietaryFiber, TotalSugars: f.TotalSugars, AddedSugars: f.AddedSugars, Protein: f.Protein, VitaminD: f.VitaminD, Calcium: f.Calcium, Iron: f.Iron, Potassium: f.Potassium}
}
