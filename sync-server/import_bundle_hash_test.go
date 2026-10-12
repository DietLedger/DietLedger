package main

import "testing"

func TestRecipeBundleContentHashIgnoresLocalPrimaryKeys(t *testing.T) {
	left := minimalRecipeBundle().Recipes[0]
	left.SourceRecipeID = "source-db-recipe-a"
	left.Ingredients[0].SourceIngredientID = "source-db-ingredient-a"

	right := left
	right.SourceRecipeID = "source-db-recipe-b"
	right.Ingredients[0].SourceIngredientID = "source-db-ingredient-b"

	leftHash, err := RecipeBundleContentHash("recipe", left)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(left) error = %v", err)
	}
	rightHash, err := RecipeBundleContentHash("recipe", right)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(right) error = %v", err)
	}
	if leftHash != rightHash {
		t.Fatalf("hash changed when only local primary keys changed: %q != %q", leftHash, rightHash)
	}
}

func TestRecipeBundleContentHashChangesForMeaningfulRecipeContent(t *testing.T) {
	left := minimalRecipeBundle().Recipes[0]
	right := minimalRecipeBundle().Recipes[0]
	right.Ingredients[0].Amount = 150

	leftHash, err := RecipeBundleContentHash("recipe", left)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(left) error = %v", err)
	}
	rightHash, err := RecipeBundleContentHash("recipe", right)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(right) error = %v", err)
	}
	if leftHash == rightHash {
		t.Fatalf("hash did not change when ingredient amount changed: %q", leftHash)
	}
}

func TestRecipeBundleContentHashIsDeterministicForEquivalentBundles(t *testing.T) {
	left := minimalRecipeBundle()
	right := minimalRecipeBundle()

	// Equivalent content but different slice order for top-level arrays whose
	// identity is keyed. The canonical hash must not depend on incidental export
	// ordering when objects have stable bundle IDs.
	left.Categories = []BundleCategory{
		{BundleCategoryID: "cat-b", Name: "B"},
		{BundleCategoryID: "cat-a", Name: "A"},
	}
	right.Categories = []BundleCategory{
		{BundleCategoryID: "cat-a", Name: "A"},
		{BundleCategoryID: "cat-b", Name: "B"},
	}

	leftHash, err := RecipeBundleContentHash("bundle", left)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(left) error = %v", err)
	}
	rightHash, err := RecipeBundleContentHash("bundle", right)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(right) error = %v", err)
	}
	if leftHash != rightHash {
		t.Fatalf("hash differs for equivalent bundle content: %q != %q", leftHash, rightHash)
	}
}

func TestCustomFoodContentHashDedupesEquivalentFoods(t *testing.T) {
	left := BundleCustomFood{
		BundleCustomFoodID: "custom-food-a",
		SourceCustomFoodID: "source-db-id-a",
		Name:               "House Sauce",
		Nutrients:          testNutrients(42),
	}
	right := left
	right.BundleCustomFoodID = "custom-food-b"
	right.SourceCustomFoodID = "source-db-id-b"

	leftHash, err := RecipeBundleContentHash("custom_food", left)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(left) error = %v", err)
	}
	rightHash, err := RecipeBundleContentHash("custom_food", right)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(right) error = %v", err)
	}
	if leftHash != rightHash {
		t.Fatalf("custom food hash changed when only local/bundle IDs changed: %q != %q", leftHash, rightHash)
	}

	right.Nutrients.Sodium = 99
	rightHash, err = RecipeBundleContentHash("custom_food", right)
	if err != nil {
		t.Fatalf("RecipeBundleContentHash(changed right) error = %v", err)
	}
	if leftHash == rightHash {
		t.Fatalf("custom food hash did not change when nutrient content changed: %q", leftHash)
	}
}
