package main

import (
	"math"
	"testing"
)

// USDA vitamin D arrives in different nutrient numbers depending on the
// dataset: SR Legacy reports IU (nutrient 324), Survey/Branded report IU
// (1114), and Foundation reports micrograms (1166). The stored
// FoodItem.VitaminD field is micrograms everywhere (labels, DV reference of
// 20 mcg, goals in ug) — IU values must be converted (1 ug = 40 IU,
// i.e. IU * 0.025), and a native mcg value must win over a derived one.
func TestConvertUSDAFoodVitaminD(t *testing.T) {
	mkNutrient := func(number string, amount float64) USDANutrient {
		n := USDANutrient{Number: number, Amount: amount}
		return n
	}

	cases := []struct {
		name     string
		nutrient USDANutrient
		want     float64
	}{
		{"SR Legacy IU (324) converts to micrograms", mkNutrient("324", 400), 10},
		{"FDC IU (1114) converts to micrograms", mkNutrient("1114", 400), 10},
		{"native micrograms (1166) pass through", mkNutrient("1166", 12.5), 12.5},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uf := USDAFood{FdcID: 1, Description: "Test food", FoodNutrients: []USDANutrient{tc.nutrient}}
			fi := convertUSDAFood(uf, "test")
			if math.Abs(fi.VitaminD-tc.want) > 1e-9 {
				t.Fatalf("VitaminD = %v, want %v", fi.VitaminD, tc.want)
			}
		})
	}

	t.Run("native micrograms preferred when IU also present", func(t *testing.T) {
		uf := USDAFood{
			FdcID:          2,
			Description:    "Foundation food",
			FoodNutrients:  []USDANutrient{mkNutrient("1166", 12.5), mkNutrient("1114", 500)},
		}
		fi := convertUSDAFood(uf, "foundation")
		if math.Abs(fi.VitaminD-12.5) > 1e-9 {
			t.Fatalf("VitaminD = %v, want 12.5 (native mcg must win over IU-derived)", fi.VitaminD)
		}
	})

	t.Run("no vitamin D nutrient yields zero", func(t *testing.T) {
		uf := USDAFood{FdcID: 3, Description: "Empty food"}
		fi := convertUSDAFood(uf, "test")
		if fi.VitaminD != 0 {
			t.Fatalf("VitaminD = %v, want 0", fi.VitaminD)
		}
	})
}

// Guard the other mapped nutrients still flow through unchanged.
func TestConvertUSDAFoodOtherNutrients(t *testing.T) {
	uf := USDAFood{
		FdcID:       4,
		Description: "Protein food",
		FoodNutrients: []USDANutrient{
			{Number: "203", Amount: 25.5},
			{Number: "208", Amount: 250},
		},
	}
	fi := convertUSDAFood(uf, "sr_legacy")
	if fi.Protein != 25.5 {
		t.Fatalf("Protein = %v, want 25.5", fi.Protein)
	}
	if fi.Calories != 250 {
		t.Fatalf("Calories = %v, want 250", fi.Calories)
	}
}
