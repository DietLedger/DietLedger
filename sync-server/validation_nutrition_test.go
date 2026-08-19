package main

import (
	"math"
	"testing"
)

type sampleNutritionDTO struct {
	Name      string   `json:"name"`
	Amount    float64  `json:"amount"`
	Sodium    float64  `json:"sodium"`
	Goal      *float64 `json:"goal,omitempty"`
	IgnoredID int      `json:"ignoredId"`
}

func TestValidNonNegative(t *testing.T) {
	cases := []struct {
		v    float64
		want bool
	}{
		{0, true},
		{0.5, true},
		{100000, true},
		{1000000, true},
		{-0.001, false},
		{-5, false},
		{1000001, false},
		{math.NaN(), false},
		{math.Inf(1), false},
		{math.Inf(-1), false},
	}
	for _, tc := range cases {
		if got := validNonNegative(tc.v); got != tc.want {
			t.Errorf("validNonNegative(%v) = %v, want %v", tc.v, got, tc.want)
		}
	}
}

func TestValidServings(t *testing.T) {
	if !validRecipeServings(1) || !validRecipeServings(4) || !validRecipeServings(10000) {
		t.Error("reasonable recipe servings should be valid")
	}
	if validRecipeServings(0) || validRecipeServings(-2) || validRecipeServings(10001) {
		t.Error("zero/negative/huge recipe servings should be invalid")
	}
	if !validLogServings(0.5) || !validLogServings(2) {
		t.Error("positive log servings should be valid")
	}
	if validLogServings(0) || validLogServings(-1) {
		t.Error("zero/negative log servings should be invalid")
	}
}

func TestValidBodyMeasurements(t *testing.T) {
	if !validHeightCm(180) || validHeightCm(0) || validHeightCm(350) || validHeightCm(-5) {
		t.Error("height bounds wrong")
	}
	if !validWeightKg(80) || !validWeightKg(0.5) || validWeightKg(0) || validWeightKg(2000) {
		t.Error("weight bounds wrong")
	}
}

func TestValidateNutritionNumbers(t *testing.T) {
	good := 12.5
	bad := -1.0

	if f := validateNutritionNumbers(sampleNutritionDTO{Amount: 100, Sodium: 5, Goal: &good}); f != "" {
		t.Fatalf("valid DTO rejected at field %q", f)
	}

	if f := validateNutritionNumbers(sampleNutritionDTO{Amount: -1}); f != "Amount" {
		t.Fatalf("negative Amount: got %q, want \"Amount\"", f)
	}
	if f := validateNutritionNumbers(sampleNutritionDTO{Sodium: 2e6}); f != "Sodium" {
		t.Fatalf("huge Sodium: got %q, want \"Sodium\"", f)
	}
	if f := validateNutritionNumbers(sampleNutritionDTO{Goal: &bad}); f != "Goal" {
		t.Fatalf("negative pointer goal: got %q, want \"Goal\"", f)
	}

	// Nil pointers and non-float fields are ignored.
	if f := validateNutritionNumbers(sampleNutritionDTO{IgnoredID: -3}); f != "" {
		t.Fatalf("non-float field must be ignored, got %q", f)
	}
	if f := validateNutritionNumbers(&sampleNutritionDTO{Amount: 1}); f != "" {
		t.Fatalf("pointer-to-struct should be walked, got %q", f)
	}
	if f := validateNutritionNumbers(nil); f != "" {
		t.Fatalf("nil input should be a no-op, got %q", f)
	}
}

func TestWhitelistsMatchDBChecks(t *testing.T) {
	if !validMealSlots["snack"] || validDayPlanSlots["snack"] {
		t.Error("snack is valid for food logs but not day-plan slots (matches DB CHECKs)")
	}
	if validMealSlots["breakfast"] || validFoodLogSourceTypes["custom"] || validDayPlanSlots["lunch"] {
		t.Error("legacy slot/source names must be rejected")
	}
	if !validSexes["male"] || !validSexes["female"] || validSexes["other"] {
		t.Error("sex whitelist wrong")
	}
	if !validActivityLevels["veryActive"] || validActivityLevels["extreme"] {
		t.Error("activity whitelist wrong")
	}
}
