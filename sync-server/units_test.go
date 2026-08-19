package main

import (
	"math"
	"testing"
)

// The Go unit tables must mirror the TypeScript canonical tables in
// src/lib/unit-conversion.ts exactly (weight = exact factors, volume =
// water-density approximation). The import matching pipeline (Phase 3a)
// normalizes ingredient amounts to grams through this module, so a constant
// drift here would make server-side nutrition matching disagree with the
// frontend calculators.
func TestUnitToGrams(t *testing.T) {
	cases := []struct {
		amount float64
		unit   string
		want   float64
	}{
		{1, "g", 1},
		{1, "oz", 28.3495},
		{1, "lb", 453.592},
		{1, "kg", 1000},
		{1, "mg", 0.001},
		{1, "cup", 240},
		{1, "tbsp", 15},
		{1, "tsp", 5},
		{1, "ml", 1},
		{1, "l", 1000},
		{1, "fl oz", 30},
		{1, "whole", 100},
		{2, "oz", 56.699},
		{0.5, "cup", 120},
	}

	for _, tc := range cases {
		t.Run(tc.unit, func(t *testing.T) {
			got := unitToGrams(tc.amount, tc.unit)
			if math.Abs(got-tc.want) > 1e-6 {
				t.Fatalf("unitToGrams(%v, %q) = %v, want %v", tc.amount, tc.unit, got, tc.want)
			}
		})
	}
}

func TestUnitToGramsEdgeCases(t *testing.T) {
	t.Run("case insensitive and trims whitespace", func(t *testing.T) {
		if got := unitToGrams(1, "  OZ "); math.Abs(got-28.3495) > 1e-6 {
			t.Fatalf("unitToGrams(1, \"  OZ \") = %v, want 28.3495", got)
		}
	})

	t.Run("unknown unit returns 0, not the amount", func(t *testing.T) {
		// Count/free-text units carry no gram weight; treating the amount as
		// grams would silently corrupt nutrition normalization.
		if got := unitToGrams(3, "slice"); got != 0 {
			t.Fatalf("unitToGrams(3, slice) = %v, want 0", got)
		}
		if got := unitToGrams(2, ""); got != 0 {
			t.Fatalf("unitToGrams(2, \"\") = %v, want 0", got)
		}
	})
}
