package main

import (
	"github.com/google/uuid"
	"testing"
)

func TestValidateRecipeBundlePortableIdentitySafety(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*RecipeBundle)
	}{
		{"invalid recipe namespace", func(b *RecipeBundle) { b.Recipes[0].PortableID = "usda:fdc:2048" }},
		{"invalid recipe UUID", func(b *RecipeBundle) { b.Recipes[0].PortableID = "dietledger:recipe:not-a-uuid" }},
		{"duplicate recipe portable identity", func(b *RecipeBundle) {
			r := b.Recipes[0]
			r.BundleRecipeID = "another"
			b.Recipes = append(b.Recipes, r)
		}},
		{"duplicate transport recipe ID", func(b *RecipeBundle) {
			r := b.Recipes[0]
			r.PortableID = "dietledger:recipe:" + uuid.NewString()
			b.Recipes = append(b.Recipes, r)
		}},
		{"duplicate custom portable identity", func(b *RecipeBundle) {
			id := "dietledger:food:" + uuid.NewString()
			b.CustomFoods = []BundleCustomFood{{BundleCustomFoodID: "a", PortableID: id, Name: "A"}, {BundleCustomFoodID: "b", PortableID: id, Name: "B"}}
		}},
		{"duplicate custom transport ID", func(b *RecipeBundle) {
			b.CustomFoods = []BundleCustomFood{{BundleCustomFoodID: "a", Name: "A"}, {BundleCustomFoodID: "a", Name: "B"}}
		}},
		{"invalid custom namespace", func(b *RecipeBundle) {
			b.CustomFoods = []BundleCustomFood{{BundleCustomFoodID: "a", Name: "A", PortableID: "dietledger:recipe:" + uuid.NewString()}}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := minimalRecipeBundle()
			b.Version = 2
			b.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
			tc.mutate(&b)
			if err := ValidateRecipeBundle(b); err == nil {
				t.Fatal("unsafe identities accepted")
			}
		})
	}
}
