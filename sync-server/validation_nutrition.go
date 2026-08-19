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
