package main

import (
	"math"
	"testing"

	"github.com/google/uuid"
)

func intPointer(v int) *int { return &v }

func TestIngredientSourceFidelityAtomicCreateAndOrder(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	user := createUser(t, s, "source-fidelity")
	zero := true

	recipe, err := s.CreateRecipe(user.ID, &CreateRecipeRequest{
		Name:     "Ordered zeros",
		Servings: 1,
		Ingredients: []CreateIngredientReq{
			{FdcID: -3, Name: "First", Amount: 1, Unit: "pinch", SourceType: "manual", ZeroNutritionOverride: &zero},
			{FdcID: 0, Name: "Second", Amount: 2, Unit: "g", SourceType: "custom_food", UnresolvedSource: &BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: "origin:food:second"}, UnconfirmedNutrition: &UnconfirmedIngredientNutrition{Basis: "unknown", Unit: "g", Provenance: "legacy package", Nutrients: BundleNutrients{Protein: 1}}},
		},
	})
	if err != nil {
		t.Fatalf("create recipe: %v", err)
	}
	if len(recipe.Ingredients) != 2 || recipe.Ingredients[0].Name != "First" || recipe.Ingredients[1].Name != "Second" {
		t.Fatalf("ingredient order = %#v", recipe.Ingredients)
	}
	if !recipe.Ingredients[0].ZeroNutritionOverride || recipe.Ingredients[1].ZeroNutritionOverride {
		t.Fatalf("zero intent = %#v", recipe.Ingredients)
	}
	if recipe.Ingredients[1].UnresolvedSource == nil || recipe.Ingredients[1].UnconfirmedNutrition == nil || recipe.Ingredients[1].UnconfirmedNutrition.Provenance != "legacy package" {
		t.Fatalf("atomic create lost source facts: %#v", recipe.Ingredients[1])
	}
	if recipe.Ingredients[0].Position != 0 || recipe.Ingredients[1].Position != 1 {
		t.Fatalf("positions = %d, %d", recipe.Ingredients[0].Position, recipe.Ingredients[1].Position)
	}

	added, err := s.CreateIngredient(recipe.ID, &CreateIngredientReq{FdcID: -2, Name: "Third", Amount: 3, Unit: "g", SourceType: "manual"})
	if err != nil {
		t.Fatalf("append ingredient: %v", err)
	}
	if added.Position != 2 {
		t.Fatalf("appended position = %d", added.Position)
	}
}

func TestIngredientSourceFidelityValidation(t *testing.T) {
	zero := true
	if msg := validateIngredient(&CreateIngredientReq{Name: "unknown", Amount: 1, Unit: "g", SourceType: "unknown"}); msg == "" {
		t.Fatal("expected unknown ingredient source type to fail")
	}
	if msg := validateIngredient(&CreateIngredientReq{FdcID: -3, Name: "zero", Amount: 1, Unit: "g", SourceType: "manual", Calories: 1, ZeroNutritionOverride: &zero}); msg == "" {
		t.Fatal("expected nonzero explicit override to fail")
	}
	key := "123"
	if msg := validateIngredient(&CreateIngredientReq{FdcID: -3, Name: "zero", Amount: 1, Unit: "g", SourceType: "manual", SourceKey: &key, ZeroNutritionOverride: &zero}); msg == "" {
		t.Fatal("expected linked explicit override to fail")
	}
	facts := &UnconfirmedIngredientNutrition{Basis: "per100g", Provenance: "package label", Nutrients: BundleNutrients{Calories: math.Inf(1)}}
	if msg := validateIngredient(&CreateIngredientReq{FdcID: 0, Name: "facts", Amount: 1, Unit: "g", SourceType: "manual", UnconfirmedNutrition: facts}); msg == "" {
		t.Fatal("expected invalid unconfirmed nutrition to fail")
	}
}

func TestRecipeBundleIncompleteSourcesFactsZeroAndOrderRoundTrip(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	user := createUser(t, s, "incomplete-package")
	recipePortable := "dietledger:recipe:" + uuid.NewString()
	missingRecipe := "dietledger:recipe:" + uuid.NewString()
	missingFood := "dietledger:food:" + uuid.NewString()
	zero := true
	bundle := RecipeBundle{
		Format: RecipeBundleFormat, Version: RecipeBundleVersion,
		Recipes: []BundleRecipe{{
			PortableID: recipePortable, BundleRecipeID: recipePortable, Name: "Incomplete", Servings: 1,
			Ingredients: []BundleIngredient{
				{BundleIngredientID: "first", Position: intPointer(0), Name: "Missing USDA", Amount: 25, Unit: "g", Source: BundleIngredientSourceRef{Type: "usda", FdcID: 999991}, Nutrients: BundleNutrients{Calories: 5}, SuppliedNutrition: &UnconfirmedIngredientNutrition{Basis: "per100g", Unit: "g", Provenance: "source package", Nutrients: BundleNutrients{Calories: 20}}},
				{BundleIngredientID: "second", Position: intPointer(1), Name: "Missing food", Amount: 1, Unit: "serving", Source: BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: missingFood}, Nutrients: BundleNutrients{Protein: 2}, SuppliedNutrition: &UnconfirmedIngredientNutrition{Basis: "perServing", ServingGramWeight: floatPointer(40), Unit: "serving", Provenance: "manufacturer", Nutrients: BundleNutrients{Protein: 2}}},
				{BundleIngredientID: "third", Position: intPointer(2), Name: "Missing recipe", Amount: .5, Unit: "× recipe", Source: BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: missingRecipe}, Nutrients: BundleNutrients{Calories: 10}},
				{BundleIngredientID: "fourth", Position: intPointer(3), Name: "Intentional zero", Amount: 1, Unit: "pinch", Source: BundleIngredientSourceRef{Type: "manual"}, ZeroNutritionOverride: zero},
			},
		}},
	}
	if err := ValidateRecipeBundle(bundle); err != nil {
		t.Fatalf("structurally valid incomplete package rejected: %v", err)
	}
	if _, err := s.ImportRecipeBundle(user.ID, bundle); err != nil {
		t.Fatalf("import incomplete package: %v", err)
	}
	var localID string
	if err := s.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND portable_id=$2`, user.ID, recipePortable).Scan(&localID); err != nil {
		t.Fatalf("find imported recipe: %v", err)
	}
	recipe, err := s.GetRecipe(user.ID, localID)
	if err != nil {
		t.Fatalf("read imported recipe: %v", err)
	}
	if len(recipe.Ingredients) != 4 {
		t.Fatalf("ingredients = %d", len(recipe.Ingredients))
	}
	for i, name := range []string{"Missing USDA", "Missing food", "Missing recipe", "Intentional zero"} {
		if recipe.Ingredients[i].Name != name || recipe.Ingredients[i].Position != i {
			t.Fatalf("ingredient %d = %#v", i, recipe.Ingredients[i])
		}
	}
	for i := 0; i < 3; i++ {
		if recipe.Ingredients[i].UnresolvedSource == nil {
			t.Fatalf("ingredient %d lost unresolved source", i)
		}
		if recipe.Ingredients[i].LinkedRecipeID != nil || recipe.Ingredients[i].SourceKey != nil || recipe.Ingredients[i].FdcID > 0 {
			t.Fatalf("ingredient %d has dangling live link: %#v", i, recipe.Ingredients[i])
		}
	}
	if recipe.Ingredients[0].UnconfirmedNutrition == nil || recipe.Ingredients[1].UnconfirmedNutrition == nil {
		t.Fatal("supplied facts were not persisted")
	}
	if !recipe.Ingredients[3].ZeroNutritionOverride {
		t.Fatal("explicit zero intent was not persisted")
	}

	exported, err := s.ExportRecipeBundle(user.ID, []string{localID}, nil)
	if err != nil {
		t.Fatalf("reexport: %v", err)
	}
	got := exported.Recipes[0].Ingredients
	if len(got) != 4 || got[0].Source.FdcID != 999991 || got[1].Source.BundleCustomFoodID != missingFood || got[2].Source.BundleRecipeID != missingRecipe || !got[3].ZeroNutritionOverride {
		t.Fatalf("reexported ingredients = %#v", got)
	}
	if got[0].SuppliedNutrition == nil || got[1].SuppliedNutrition == nil {
		t.Fatal("reexport lost supplied nutrition")
	}
	if _, err := s.ImportRecipeBundle(user.ID, *exported); err != nil {
		t.Fatalf("repeat import should reuse unchanged content: %v", err)
	}
	updated, err := s.UpdateIngredient(user.ID, localID, recipe.Ingredients[0].ID, &CreateIngredientReq{FdcID: -3, Name: recipe.Ingredients[0].Name, Amount: recipe.Ingredients[0].Amount, Unit: recipe.Ingredients[0].Unit, SourceType: "manual", ZeroNutritionOverride: &zero})
	if err != nil {
		t.Fatalf("choose explicit zero: %v", err)
	}
	if !updated.ZeroNutritionOverride || updated.UnresolvedSource != nil {
		t.Fatalf("explicit zero did not clear unresolved source: %#v", updated)
	}
}

func TestRecipeBundleLegacyZeroIsAmbiguousAndOrderOnlyReimportConflicts(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	user := createUser(t, s, "legacy-zero-order")
	portable := "dietledger:recipe:" + uuid.NewString()
	bundle := RecipeBundle{Format: RecipeBundleFormat, Version: 1, Recipes: []BundleRecipe{{
		PortableID: portable, BundleRecipeID: portable, Name: "Legacy", Servings: 1,
		Ingredients: []BundleIngredient{
			{BundleIngredientID: "a", Name: "Ambiguous zero", Amount: 1, Unit: "pinch", Source: BundleIngredientSourceRef{Type: "manual"}},
			{BundleIngredientID: "b", Name: "Second", Amount: 1, Unit: "g", Source: BundleIngredientSourceRef{Type: "manual"}, Nutrients: BundleNutrients{Calories: 1}},
		},
	}}}
	if _, err := s.ImportRecipeBundle(user.ID, bundle); err != nil {
		t.Fatalf("import v1: %v", err)
	}
	var id string
	if err := s.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND portable_id=$2`, user.ID, portable).Scan(&id); err != nil {
		t.Fatal(err)
	}
	r, err := s.GetRecipe(user.ID, id)
	if err != nil {
		t.Fatal(err)
	}
	if r.Ingredients[0].ZeroNutritionOverride {
		t.Fatal("v1 all-zero snapshot inferred as explicit intent")
	}

	bundle.Recipes[0].Ingredients[0], bundle.Recipes[0].Ingredients[1] = bundle.Recipes[0].Ingredients[1], bundle.Recipes[0].Ingredients[0]
	if _, err := s.ImportRecipeBundle(user.ID, bundle); err == nil {
		t.Fatal("order-only changed same-identity reimport should conflict")
	}
	after, err := s.GetRecipe(user.ID, id)
	if err != nil {
		t.Fatal(err)
	}
	if after.Ingredients[0].Name != "Ambiguous zero" {
		t.Fatal("conflict changed local ingredient order")
	}
}

func TestRecipeBundleRejectsUnknownSourcesInvalidFactsAndMixedPositions(t *testing.T) {
	base := RecipeBundle{Format: RecipeBundleFormat, Version: RecipeBundleVersion, Recipes: []BundleRecipe{{BundleRecipeID: "r", Name: "R", Servings: 1}}}
	base.Recipes[0].Ingredients = []BundleIngredient{{BundleIngredientID: "i", Name: "I", Amount: 1, Unit: "g", Source: BundleIngredientSourceRef{Type: "unknown"}}}
	if err := ValidateRecipeBundle(base); err == nil {
		t.Fatal("unknown source type accepted")
	}
	base.Recipes[0].Ingredients = []BundleIngredient{{BundleIngredientID: "i", Name: "I", Amount: math.NaN(), Unit: "g", Source: BundleIngredientSourceRef{Type: "manual"}}}
	if err := ValidateRecipeBundle(base); err == nil {
		t.Fatal("invalid ingredient amount accepted")
	}
	base.Recipes[0].Ingredients = []BundleIngredient{{BundleIngredientID: "i", Name: "I", Amount: 1, Unit: "g", Source: BundleIngredientSourceRef{Type: "manual"}, SuppliedNutrition: &UnconfirmedIngredientNutrition{Basis: "perServing", ServingGramWeight: floatPointer(0)}}}
	if err := ValidateRecipeBundle(base); err == nil {
		t.Fatal("invalid serving basis accepted")
	}
	base.Recipes[0].Ingredients = []BundleIngredient{
		{BundleIngredientID: "i1", Position: intPointer(0), Name: "I1", Amount: 1, Unit: "g", Source: BundleIngredientSourceRef{Type: "manual"}},
		{BundleIngredientID: "i2", Name: "I2", Amount: 1, Unit: "g", Source: BundleIngredientSourceRef{Type: "manual"}},
	}
	if err := ValidateRecipeBundle(base); err == nil {
		t.Fatal("mixed explicit/implicit positions accepted")
	}
}

func floatPointer(v float64) *float64 { return &v }
