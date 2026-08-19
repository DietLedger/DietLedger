package main

import "strings"

// Canonical unit conversion tables. These MUST mirror the TypeScript
// canonical tables in src/lib/unit-conversion.ts:
//   - weight factors are exact
//   - volume factors are the water-density approximation used by the
//     nutrition calculators (cup=240g, tbsp=15g, ...)
// The matcher (import pipeline) and any server-side nutrition math normalize
// amounts to grams exclusively through this module.
var weightToGrams = map[string]float64{
	"g":  1,
	"oz": 28.3495,
	"lb": 453.592,
	"kg": 1000,
	"mg": 0.001,
}

var volumeToGrams = map[string]float64{
	"ml":    1,
	"l":     1000,
	"tsp":   5,
	"tbsp":  15,
	"fl oz": 30,
	"cup":   240,
	"pt":    480,
	"qt":    960,
	"gal":   3840,
}

// wholeUnitGrams is the documented heuristic for count items ("1 whole
// egg"): assume ~100g so per-100g nutrient values scale sensibly.
const wholeUnitGrams = 100.0

// unitToGrams converts an amount in the given unit to grams using the
// canonical tables. Unknown or count units other than "whole" return 0 —
// callers must not treat the raw amount as grams.
func unitToGrams(amount float64, unit string) float64 {
	norm := strings.ToLower(strings.TrimSpace(unit))
	if factor, ok := weightToGrams[norm]; ok {
		return amount * factor
	}
	if factor, ok := volumeToGrams[norm]; ok {
		return amount * factor
	}
	if norm == "whole" {
		return amount * wholeUnitGrams
	}
	return 0
}

// isKnownUnit reports whether the unit carries a gram weight (weight,
// volume, or the "whole" heuristic).
func isKnownUnit(unit string) bool {
	return unitToGrams(1, unit) > 0
}
