package main

import (
	"strings"
	"testing"
)

func TestValidateRecipeBundleAcceptsMinimalValidBundle(t *testing.T) {
	bundle := minimalRecipeBundle()

	if err := ValidateRecipeBundle(bundle); err != nil {
		t.Fatalf("ValidateRecipeBundle() error = %v, want nil", err)
	}
}

func TestValidateRecipeBundleRejectsUnsupportedFormatAndVersion(t *testing.T) {
	t.Run("unknown format", func(t *testing.T) {
		bundle := minimalRecipeBundle()
		bundle.Format = "other.recipe-bundle"

		err := ValidateRecipeBundle(bundle)
		if err == nil || !strings.Contains(err.Error(), "format") {
			t.Fatalf("ValidateRecipeBundle() error = %v, want format error", err)
		}
	})

	t.Run("unsupported version", func(t *testing.T) {
		bundle := minimalRecipeBundle()
		bundle.Version = 99

		err := ValidateRecipeBundle(bundle)
		if err == nil || !strings.Contains(err.Error(), "version") {
			t.Fatalf("ValidateRecipeBundle() error = %v, want version error", err)
		}
	})
}

func TestValidateRecipeBundleRejectsMissingRecipeFields(t *testing.T) {
	bundle := minimalRecipeBundle()
	bundle.Recipes[0].Name = ""

	err := ValidateRecipeBundle(bundle)
	if err == nil || !strings.Contains(err.Error(), "recipe") || !strings.Contains(err.Error(), "name") {
		t.Fatalf("ValidateRecipeBundle() error = %v, want recipe name error", err)
	}
}

func TestValidateRecipeBundleRejectsIngredientWithInvalidSourceMetadata(t *testing.T) {
	tests := []struct {
		name string
		ref  BundleIngredientSourceRef
	}{
		{"usda without fdc id", BundleIngredientSourceRef{Type: "usda"}},
		{"custom food without bundle food id", BundleIngredientSourceRef{Type: "custom_food"}},
		{"recipe without linked recipe id", BundleIngredientSourceRef{Type: "recipe"}},
		{"unknown source type", BundleIngredientSourceRef{Type: "not-a-source"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bundle := minimalRecipeBundle()
			bundle.Recipes[0].Ingredients[0].Source = tt.ref

			err := ValidateRecipeBundle(bundle)
			if err == nil || !strings.Contains(err.Error(), "source") {
				t.Fatalf("ValidateRecipeBundle() error = %v, want source metadata error", err)
			}
		})
	}
}

func TestValidateRecipeBundleRejectsDanglingReferences(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*RecipeBundle)
		want   string
	}{
		{
			name: "chapter references missing book",
			mutate: func(b *RecipeBundle) {
				b.Chapters = []BundleChapter{{BundleChapterID: "chapter-1", BundleBookID: "missing-book", Title: "Chapter", Position: 0}}
			},
			want: "book",
		},
		{
			name: "chapter recipe references missing recipe",
			mutate: func(b *RecipeBundle) {
				b.Books = []BundleBook{{BundleBookID: "book-1", Title: "Book"}}
				b.Chapters = []BundleChapter{{BundleChapterID: "chapter-1", BundleBookID: "book-1", Title: "Chapter", Position: 0}}
				b.ChapterRecipes = []BundleChapterRecipe{{BundleChapterID: "chapter-1", BundleRecipeID: "missing-recipe", Position: 0}}
			},
			want: "recipe",
		},
		{
			name: "recipe category references missing category",
			mutate: func(b *RecipeBundle) {
				b.RecipeCategories = []BundleRecipeCategory{{BundleRecipeID: "recipe-1", BundleCategoryID: "missing-category"}}
			},
			want: "category",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bundle := minimalRecipeBundle()
			tt.mutate(&bundle)

			err := ValidateRecipeBundle(bundle)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("ValidateRecipeBundle() error = %v, want dangling %s error", err, tt.want)
			}
		})
	}
}

func minimalRecipeBundle() RecipeBundle {
	return RecipeBundle{
		Format:     "dietledger.recipe-bundle",
		Version:    1,
		ExportedAt: "2026-01-01T00:00:00Z",
		Source:     RecipeBundleSource{App: "DietLedger", Version: "test"},
		FoodItems: []BundleFoodItem{
			{
				FdcID:           12345,
				Description:     "Test USDA food",
				DataType:        "Foundation",
				ServingSize:     100,
				ServingSizeUnit: "g",
				Source:          "usda",
				Nutrients:       testNutrients(100),
			},
		},
		Recipes: []BundleRecipe{
			{
				BundleRecipeID: "recipe-1",
				Name:           "Test Recipe",
				Servings:       2,
				ServingName:    "serving",
				Ingredients: []BundleIngredient{
					{
						BundleIngredientID: "ingredient-1",
						Name:               "Test USDA food",
						Amount:             100,
						Unit:               "g",
						Source:             BundleIngredientSourceRef{Type: "usda", FdcID: 12345},
						Nutrients:          testNutrients(100),
					},
				},
			},
		},
	}
}

func testNutrients(calories float64) BundleNutrients {
	return BundleNutrients{
		Calories:     calories,
		TotalFat:     1,
		SaturatedFat: 0.5,
		TransFat:     0,
		Cholesterol:  0,
		Sodium:       10,
		TotalCarbs:   20,
		DietaryFiber: 3,
		TotalSugars:  4,
		AddedSugars:  0,
		Protein:      5,
		VitaminD:     0,
		Calcium:      20,
		Iron:         1,
		Potassium:    100,
	}
}
