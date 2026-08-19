package main

import (
	"math"
	"reflect"
	"strings"
)

// ── Numeric guards for nutrition-sensitive inputs ─────────────────────
//
// The API is authoritative for nutrition data quality: nonsensical numbers
// (negative nutrients, zero-serving recipes, absurd magnitudes) must be
// rejected with 400 at the boundary instead of being persisted.

// nutritionInputMax bounds any single nutrient or amount value accepted by
// the API. Real per-100g nutrient values top out around ~100,000 mg, so
// anything beyond this cap is a client bug, not data.
const nutritionInputMax = 1_000_000.0

func validNonNegative(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= nutritionInputMax
}

// validRecipeServings: a recipe must be divisible into at least one serving.
func validRecipeServings(n int) bool {
	return n >= 1 && n <= 10000
}

// validLogServings: a log entry records consuming a positive amount.
func validLogServings(v float64) bool {
	return v > 0 && validNonNegative(v)
}

// validHeightCm / validWeightKg bound human body measurements.
func validHeightCm(v float64) bool {
	return v > 0 && v <= 300
}

func validWeightKg(v float64) bool {
	return v > 0 && v <= 1000
}

// ── Whitelists mirroring DB CHECK constraints ─────────────────────────
//
// Handlers validate these so violations return 400 with a useful message
// instead of surfacing as 500 from the database.

var validMealSlots = map[string]bool{
	"morning": true, "midMorning": true, "noon": true, "afternoon": true,
	"evening": true, "night": true, "snack": true,
}

var validDayPlanSlots = map[string]bool{
	"morning": true, "midMorning": true, "noon": true, "afternoon": true,
	"evening": true, "night": true,
}

var validFoodLogSourceTypes = map[string]bool{
	"recipe": true, "customFood": true, "manual": true,
}

var validSexes = map[string]bool{"male": true, "female": true}

var validActivityLevels = map[string]bool{
	"sedentary": true, "light": true, "moderate": true, "active": true, "veryActive": true,
}

// ── Generic numeric walk over nutrition DTOs ──────────────────────────

// validateNutritionNumbers inspects the float64 and *float64 fields of a
// nutrition-carrying request DTO (ingredients, custom foods, log entries,
// weight entries, profiles) and rejects negative, non-finite, or absurdly
// large values. Field names in errors come from the struct field names.
// Non-numeric fields are ignored; semantics like "servings must be > 0" are
// the caller's responsibility.
func validateNutritionNumbers(v interface{}) string {
	rv := reflect.ValueOf(v)
	for rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return ""
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return ""
	}
	rt := rv.Type()
	for i := 0; i < rt.NumField(); i++ {
		field := rt.Field(i)
		if field.PkgPath != "" { // unexported
			continue
		}
		fv := rv.Field(i)
		switch fv.Kind() {
		case reflect.Float64:
			if !validNonNegative(fv.Float()) {
				return field.Name
			}
		case reflect.Ptr:
			if !fv.IsNil() && fv.Elem().Kind() == reflect.Float64 {
				if !validNonNegative(fv.Elem().Float()) {
					return field.Name
				}
			}
		}
	}
	return ""
}

// invalidNutrientMessage builds the 400 body text for a rejected field.
func invalidNutrientMessage(field string) string {
	var b strings.Builder
	b.WriteString(field)
	b.WriteString(" must be a non-negative number no greater than 1000000")
	return b.String()
}

// validateIngredient applies the per-ingredient rules: a name, a known-ish
// non-negative amount, and sane nutrient numbers.
func validateIngredient(req *CreateIngredientReq) string {
	if strings.TrimSpace(req.Name) == "" {
		return "ingredient name is required"
	}
	if field := validateNutritionNumbers(*req); field != "" {
		return invalidNutrientMessage("ingredient " + field)
	}
	return ""
}

// validateIngredients applies validateIngredient to a whole list and
// returns the first violation (empty string when valid).
func validateIngredients(ingredients []CreateIngredientReq) string {
	for i := range ingredients {
		if msg := validateIngredient(&ingredients[i]); msg != "" {
			return msg
		}
	}
	return ""
}

// validateProfile applies profile rules beyond required strings: sex and
// activity level whitelists (mirroring the DB CHECKs so violations return
// 400 instead of 500), human-plausible height, and sane goal numbers.
func validateProfile(req *CreateProfileRequest) string {
	if !validSexes[req.Sex] {
		return "sex must be male or female"
	}
	if req.ActivityLevel != "" && !validActivityLevels[req.ActivityLevel] {
		return "invalid activityLevel"
	}
	if req.HeightCm != nil && !validHeightCm(*req.HeightCm) {
		return "heightCm must be between 0 and 300"
	}
	if req.GoalWeightKg != nil && !validWeightKg(*req.GoalWeightKg) {
		return "goalWeightKg must be between 0 and 1000"
	}
	if field := validateNutritionNumbers(*req); field != "" {
		return invalidNutrientMessage(field)
	}
	return ""
}

// validateFoodLog applies log-entry rules: slot and source whitelists,
// positive servings, and sane nutrient numbers.
func validateFoodLog(req *CreateFoodLogRequest) string {
	if !validMealSlots[req.MealSlot] {
		return "invalid mealSlot"
	}
	if !validFoodLogSourceTypes[req.SourceType] {
		return "invalid sourceType"
	}
	if !validLogServings(req.Servings) {
		return "servings must be greater than 0"
	}
	if field := validateNutritionNumbers(*req); field != "" {
		return invalidNutrientMessage(field)
	}
	return ""
}

// validateWeightEntry: weightKg of 0 means "not measured" (the store stores
// NULL) and is allowed; any provided weight must be human-plausible.
// Vitals (blood sugar, blood pressure) must be non-negative.
func validateWeightEntry(req *CreateWeightEntryRequest) string {
	if req.WeightKg != 0 && !validWeightKg(req.WeightKg) {
		return "weightKg must be between 0 and 1000"
	}
	if field := validateNutritionNumbers(*req); field != "" {
		return invalidNutrientMessage(field)
	}
	return ""
}

// validateDayPlanEntry: day-plan slots exclude "snack" (DB CHECK).
func validateDayPlanEntry(req *CreateDayPlanEntryRequest) string {
	if !validDayPlanSlots[req.Slot] {
		return "invalid slot"
	}
	if !validLogServings(req.Servings) {
		return "servings must be greater than 0"
	}
	if field := validateNutritionNumbers(*req); field != "" {
		return invalidNutrientMessage(field)
	}
	return ""
}

// validateCustomFood: nutrient numbers must be sane (name is checked by the
// caller via validateRequired).
func validateCustomFood(req *CreateCustomFoodRequest) string {
	if field := validateNutritionNumbers(*req); field != "" {
		return invalidNutrientMessage(field)
	}
	return ""
}
