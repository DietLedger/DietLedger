package main

import (
	"encoding/json"
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
			FdcID:         2,
			Description:   "Foundation food",
			FoodNutrients: []USDANutrient{mkNutrient("1166", 12.5), mkNutrient("1114", 500)},
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

func TestConvertUSDAFoodFoundationEnergy(t *testing.T) {
	cases := []struct {
		name      string
		nutrients string
		want      float64
	}{
		{"specific preferred over general and legacy", `[{"nutrient":{"id":2047,"number":"957","unitName":"kcal"},"amount":64.7},{"nutrient":{"id":2048,"number":"958","unitName":"kcal"},"amount":58.2},{"nutrient":{"id":1008,"number":"208","unitName":"kcal"},"amount":55}]`, 58.2},
		{"general when specific missing", `[{"nutrient":{"id":2047,"number":"957","unitName":"kcal"},"amount":64.7}]`, 64.7},
		{"legacy when Atwater missing", `[{"nutrient":{"id":1008,"number":"208","unitName":"kcal"},"amount":55}]`, 55},
		{"ignore kJ", `[{"nutrient":{"id":2048,"number":"958","unitName":"kJ"},"amount":243}]`, 0},
		{"missing energy stays zero", `[]`, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var uf USDAFood
			if err := json.Unmarshal([]byte(`{"fdcId":1750340,"foodNutrients":`+tc.nutrients+`}`), &uf); err != nil {
				t.Fatal(err)
			}
			if got := convertUSDAFood(uf, "foundation").Calories; got != tc.want {
				t.Fatalf("Calories = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestFoodsWithMeaningfulNutrition(t *testing.T) {
	foods := foodsWithMeaningfulNutrition([]FoodItem{
		{FdcID: 1},
		{FdcID: 2, Calories: 52},
		{FdcID: 3, Sodium: 38758},
		{FdcID: 4, Calories: -1, Sodium: -1},
	})
	if len(foods) != 2 || foods[0].FdcID != 2 || foods[1].FdcID != 3 {
		t.Fatalf("got %+v; want positive-calorie apple and zero-calorie sodium-bearing salt", foods)
	}
}

func TestParseFoodJSONKeepsMeaningfulZeroCalorieSalt(t *testing.T) {
	payload := `{"SRLegacyFoods":[
		{"fdcId":173468,"description":"Salt, table","foodNutrients":[{"nutrient":{"number":"307"},"amount":38758}]},

		{"fdcId":1750349,"description":"Empty food","foodNutrients":[]},
		{"fdcId":123,"description":"Apple, raw","foodNutrients":[{"nutrient":{"id":2048,"number":"958","unitName":"kcal"},"amount":52}]}
	]}`
	foods, err := parseFoodJSON([]byte(payload), "sr_legacy")
	if err != nil {
		t.Fatal(err)
	}
	if len(foods) != 2 || foods[0].FdcID != 173468 || foods[0].Calories != 0 || foods[0].Sodium != 38758 || foods[1].FdcID != 123 {
		t.Fatalf("got foods %+v; want meaningful salt and apple, excluding empty record", foods)
	}
}

func TestConvertUSDAFoodLiveSearchNutrients(t *testing.T) {
	// USDA /fdc/v1/foods/search uses flat nutrientNumber/value, not nested nutrient/amount.
	var uf USDAFood
	if err := json.Unmarshal([]byte(`{"fdcId":1750340,"foodNutrients":[{"nutrientId":1003,"nutrientNumber":"203","value":0.148,"unitName":"G"},{"nutrientId":2048,"nutrientNumber":"958","value":58.2,"unitName":"KCAL"},{"nutrientId":2047,"nutrientNumber":"957","value":64.7,"unitName":"KCAL"}]}`), &uf); err != nil {
		t.Fatal(err)
	}
	food := convertUSDAFood(uf, "usda")
	if food.Calories != 58.2 || food.Protein != 0.148 {
		t.Fatalf("got Calories %v and Protein %v; want 58.2 and 0.148", food.Calories, food.Protein)
	}
}

func TestConvertUSDAFoodNegativeAnalyticalNutrients(t *testing.T) {
	// USDA Foundation FDC 2727569 reports -0.42825 g carbohydrate by difference.
	// Canonical nutrient snapshots must remain non-negative without inventing carbs.
	for _, tc := range []struct {
		name string
		food string
	}{
		{"nested Foundation dataset", `{"fdcId":2727569,"foodNutrients":[{"nutrient":{"number":"205"},"amount":-0.42825},{"nutrient":{"number":"203"},"amount":21.4},{"nutrient":{"id":2048,"number":"958","unitName":"kcal"},"amount":132.8359}]}`},
		{"flat USDA search", `{"fdcId":2727569,"foodNutrients":[{"nutrientNumber":"205","value":-0.42825},{"nutrientNumber":"203","value":21.4},{"nutrientId":2048,"nutrientNumber":"958","unitName":"KCAL","value":132.8359}]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var uf USDAFood
			if err := json.Unmarshal([]byte(tc.food), &uf); err != nil {
				t.Fatal(err)
			}
			food := convertUSDAFood(uf, "foundation")
			if food.TotalCarbs != 0 || food.Protein != 21.4 || food.Calories != 132.8359 {
				t.Fatalf("got carbs=%v protein=%v calories=%v; want 0, 21.4, 132.8359", food.TotalCarbs, food.Protein, food.Calories)
			}
		})
	}
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
