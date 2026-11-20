package main

import (
	"encoding/json"
	"math"
	"testing"
)

func TestAssessRecipeNutrientsUsesRecipeCriteriaSafely(t *testing.T) {
	profile := DietaryProfile{NutrientThresholdsJSON: `[
		{"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"},
		{"nutrient":"sodium","dailyMax":2300,"alertLevel":"warning"},
		{"nutrient":"totalCarbs","perMealMax":20,"alertLevel":"warning"}
	]`}
	tests := []struct {
		name   string
		recipe Recipe
		want   string
	}{
		{"density equality and total carbs cap", Recipe{Servings: 2, Ingredients: []Ingredient{{Calories: 500, DietaryFiber: 7, Sodium: 2400, TotalCarbs: 40}}}, "match"},
		{"density just below", Recipe{Servings: 1, Ingredients: []Ingredient{{Calories: 1000, DietaryFiber: 13.99, TotalCarbs: 0}}}, "noMatch"},
		{"per serving cap", Recipe{Servings: 2, Ingredients: []Ingredient{{Calories: 500, DietaryFiber: 10, TotalCarbs: 42}}}, "noMatch"},
		{"unknown required nutrient takes precedence", Recipe{Servings: 1, Ingredients: []Ingredient{{Calories: 500, DietaryFiber: 10, TotalCarbs: 99, MissingNutrients: []string{"dietaryFiber"}}}}, "notAssessed"},
		{"invalid nutrition", Recipe{Servings: 1, Ingredients: []Ingredient{{Calories: 500, DietaryFiber: 10, TotalCarbs: -1}}}, "notAssessed"},
		{"no ingredients", Recipe{Servings: 1}, "notAssessed"},
		{"invalid servings", Recipe{Servings: 0, Ingredients: []Ingredient{{Calories: 500, DietaryFiber: 10, TotalCarbs: 0}}}, "notAssessed"},
		{"zero calories for density", Recipe{Servings: 1, Ingredients: []Ingredient{{Calories: 0, DietaryFiber: 10, TotalCarbs: 0}}}, "notAssessed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := assessRecipeNutrients(profile, tt.recipe)
			if string(got.Status) != tt.want {
				t.Fatalf("status = %q, want %q; reasons=%v", got.Status, tt.want, got.Reasons)
			}
		})
	}
}

func TestAssessRecipeNutrientsCustomTotalsAndAliases(t *testing.T) {
	profile := DietaryProfile{NutrientThresholdsJSON: `[{"nutrient":"fiber","per1000KcalMin":14,"alertLevel":"warning"},{"nutrient":"sugar","perMealMax":5,"alertLevel":"warning"}]`}
	custom := &CustomRecipeNutrition{Basis: "recipeTotal", Source: "test", Nutrients: BundleNutrients{Calories: 500, DietaryFiber: 7, TotalSugars: 4}}
	got := assessRecipeNutrients(profile, Recipe{Servings: 1, CustomNutrition: custom})
	if got.Status != AssessmentMatch {
		t.Fatalf("custom recipe assessment = %q, want match: %v", got.Status, got.Reasons)
	}
	custom.MissingNutrients = []string{"dietaryFiber"}
	got = assessRecipeNutrients(profile, Recipe{Servings: 1, CustomNutrition: custom})
	if got.Status != AssessmentNotAssessed {
		t.Fatalf("custom missing nutrient status = %q, want notAssessed", got.Status)
	}
}

func TestFiberDensityIsInvariantUnderYieldAndScaling(t *testing.T) {
	profile := DietaryProfile{NutrientThresholdsJSON: `[{"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"}]`}
	for _, servings := range []int{1, 2, 3, 5, 7, 10, 11, 15, 21, 77} {
		for _, factor := range []float64{0.1, 0.5, 1, 2, 3, 10} {
			recipe := Recipe{Servings: servings, Ingredients: []Ingredient{{Calories: 500 * factor, DietaryFiber: 7 * factor}}}
			if got := assessRecipeNutrients(profile, recipe); got.Status != AssessmentMatch {
				t.Fatalf("equal fiber density at servings=%d factor=%v produced %+v", servings, factor, got)
			}
			recipe.Ingredients[0].DietaryFiber = 6.999999 * factor
			if got := assessRecipeNutrients(profile, recipe); got.Status != AssessmentNoMatch {
				t.Fatalf("below-target fiber density at servings=%d factor=%v produced %+v", servings, factor, got)
			}
		}
	}
}

func TestDensityRequiresKnownCalories(t *testing.T) {
	profile := DietaryProfile{NutrientThresholdsJSON: `[{"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"}]`}
	for _, recipe := range []Recipe{
		{Servings: 1, Ingredients: []Ingredient{{Calories: 500, DietaryFiber: 7, MissingNutrients: []string{"calories"}}}},
		{Servings: 1, CustomNutrition: &CustomRecipeNutrition{Basis: "recipeTotal", Source: "published", Nutrients: BundleNutrients{Calories: 500, DietaryFiber: 7}, MissingNutrients: []string{"calories"}}},
	} {
		if got := assessRecipeNutrients(profile, recipe); got.Status != AssessmentNotAssessed {
			t.Fatalf("unknown calories produced %+v", got)
		}
	}
}

func TestAssessmentIngredientSourceIntent(t *testing.T) {
	profile := DietaryProfile{NutrientThresholdsJSON: `[{"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"}]`}
	tests := []struct {
		name       string
		ingredient Ingredient
		want       AssessmentStatus
	}{
		{"unresolved source", Ingredient{UnresolvedSource: &BundleIngredientSourceRef{Type: "usda", FdcID: 100}}, AssessmentNotAssessed},
		{"unconfirmed nutrition", Ingredient{Calories: 1, UnconfirmedNutrition: &UnconfirmedIngredientNutrition{Basis: "unknown"}}, AssessmentNotAssessed},
		{"ambiguous zero", Ingredient{FdcID: -2, SourceType: "manual"}, AssessmentNotAssessed},
		{"explicit no nutrition", Ingredient{FdcID: -3, SourceType: "manual", ZeroNutritionOverride: true}, AssessmentMatch},
		{"known legacy snapshot", Ingredient{FdcID: -2, Calories: 10, DietaryFiber: 1}, AssessmentMatch},
		{"linked missing nutrient union", Ingredient{SourceType: "recipe", LinkedRecipeID: strPtr("linked-recipe"), Calories: 1, MissingNutrients: []string{"dietaryFiber"}}, AssessmentNotAssessed},
		{"invalid nonfinite", Ingredient{Calories: math.NaN()}, AssessmentNotAssessed},
		{"invalid positive infinity", Ingredient{Calories: math.Inf(1)}, AssessmentNotAssessed},
		{"out-of-bounds stored fact", Ingredient{Calories: 100, DietaryFiber: 1_000_001}, AssessmentNotAssessed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recipe := Recipe{Servings: 1, Ingredients: []Ingredient{{Calories: 500, DietaryFiber: 10}, tt.ingredient}}
			if got := assessRecipeNutrients(profile, recipe); got.Status != tt.want {
				t.Fatalf("got %+v; want %s", got, tt.want)
			}
		})
	}
}

func TestClearedThresholdRowIsInert(t *testing.T) {
	raw := `[{"nutrient":"dietaryFiber","alertLevel":"warning"}]`
	if err := validateNutrientThresholds(raw); err != nil {
		t.Fatalf("clearing all optional threshold numbers should be allowed: %v", err)
	}
	got := assessRecipeNutrients(DietaryProfile{NutrientThresholdsJSON: raw}, Recipe{Servings: 1, Ingredients: []Ingredient{{Calories: 500, DietaryFiber: 10}}})
	if got.Status != AssessmentNotAssessed {
		t.Fatalf("inert threshold row generated %+v", got)
	}
}

func TestRecipeYieldAndDailyMaxSemantics(t *testing.T) {
	profile := DietaryProfile{NutrientThresholdsJSON: `[{"nutrient":"sodium","dailyMax":2300,"alertLevel":"warning"},{"nutrient":"totalCarbs","perMealMax":20,"alertLevel":"warning"}]`}
	recipe := Recipe{Servings: 1, Ingredients: []Ingredient{{Sodium: 4000, TotalCarbs: 20}}}
	if got := assessRecipeNutrients(profile, recipe); got.Status != AssessmentMatch {
		t.Fatalf("dailyMax was applied to a recipe: %+v", got)
	}
	recipe.Servings = 2
	if got := assessRecipeNutrients(profile, recipe); got.Status != AssessmentMatch {
		t.Fatalf("per-serving criteria changed unexpectedly at larger yield: %+v", got)
	}
	recipe.Ingredients[0].TotalCarbs = 42
	if got := assessRecipeNutrients(profile, recipe); got.Status != AssessmentNoMatch {
		t.Fatalf("per-serving cap should fail after yield adjustment: %+v", got)
	}
}

func TestDailyMaximumAloneIsNotRecipeAssessment(t *testing.T) {
	profile := DietaryProfile{NutrientThresholdsJSON: `[{"nutrient":"sodium","dailyMax":2300,"alertLevel":"warning"}]`}
	got := assessRecipeNutrients(profile, Recipe{Servings: 1, Ingredients: []Ingredient{{Calories: 100, Sodium: 1}}})
	if got.Status != AssessmentNotAssessed {
		t.Fatalf("daily-only profile status = %q, want notAssessed", got.Status)
	}
}

func TestValidateNutrientThresholdsRejectsUntrustedCriteria(t *testing.T) {
	invalid := []string{
		`[{"nutrient":"madeUp","perMealMax":4,"alertLevel":"warning"}]`,
		`[{"nutrient":"sodium","per1000KcalMin":-1,"alertLevel":"warning"}]`,
		`[{"nutrient":"sodium","perMealMax":1e100,"alertLevel":"warning"}]`,
		`[{"nutrient":"sodium","perMealMax":5,"unknownPass":true,"alertLevel":"warning"}]`,
		`[{"nutrient":"sodium","perMealMax":NaN,"alertLevel":"warning"}]`,
		`[{"nutrient":"sodium","perMealMax":4,"alertLevel":"unsupported"}]`,
		`[{"nutrient":"sodium","perMealMax":4,"alertLevel":"warning"}] []`,
		`null`,
		`{}`,
	}
	for _, raw := range invalid {
		t.Run(raw, func(t *testing.T) {
			if err := validateNutrientThresholds(raw); err == nil {
				t.Fatal("expected invalid nutrient thresholds to be rejected")
			}
		})
	}
	if err := validateNutrientThresholds(`[{"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"}]`); err != nil {
		t.Fatalf("valid threshold rejected: %v", err)
	}
}

func TestAssessmentResultJSONContract(t *testing.T) {
	b, err := json.Marshal(RecipeAssessment{RecipeID: "r1", Status: AssessmentNotAssessed, Reasons: []string{}})
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `{"recipeId":"r1","status":"notAssessed","reasons":[]}` {
		t.Fatalf("unexpected JSON contract: %s", b)
	}
}
