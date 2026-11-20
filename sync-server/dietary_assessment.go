package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"reflect"
	"strings"
	"time"

	"github.com/google/uuid"
)

type AssessmentStatus string

const (
	AssessmentMatch       AssessmentStatus = "match"
	AssessmentNoMatch     AssessmentStatus = "noMatch"
	AssessmentNotAssessed AssessmentStatus = "notAssessed"
)

type RecipeAssessment struct {
	RecipeID string           `json:"recipeId"`
	Status   AssessmentStatus `json:"status"`
	Reasons  []string         `json:"reasons"`
}

type nutrientThreshold struct {
	Nutrient       string   `json:"nutrient"`
	DailyMax       *float64 `json:"dailyMax,omitempty"`
	PerMealMax     *float64 `json:"perMealMax,omitempty"`
	Per1000KcalMin *float64 `json:"per1000KcalMin,omitempty"`
	AlertLevel     string   `json:"alertLevel"`
}

func insertDefaultDiabetesAwareProfile(tx *sql.Tx, userID string, now time.Time) error {
	_, err := tx.Exec(`INSERT INTO dietary_profiles
		(id, user_id, name, allergens_json, dietary_tags_json, nutrient_thresholds_json, is_active, created_at, updated_at)
		VALUES ($1,$2,'Diabetes-aware','[]','["diabetesAware"]',
		'[ {"nutrient":"sodium","dailyMax":2300,"alertLevel":"warning"}, {"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"} ]',FALSE,$3,$3)`,
		uuid.New().String(), userID, now)
	return err
}

var canonicalAssessmentNutrients = func() map[string]bool {
	allowed := make(map[string]bool)
	typ := reflect.TypeOf(BundleNutrients{})
	for i := 0; i < typ.NumField(); i++ {
		allowed[typ.Field(i).Tag.Get("json")] = true
	}
	return allowed
}()

func canonicalNutrientKey(key string) string {
	switch key {
	case "sugar":
		return "totalSugars"
	case "fiber":
		return "dietaryFiber"
	default:
		return key
	}
}

func decodeNutrientThresholds(raw string) ([]nutrientThreshold, error) {
	var thresholds []nutrientThreshold
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&thresholds); err != nil {
		return nil, err
	}
	var trailing interface{}
	if err := decoder.Decode(&trailing); err != io.EOF {
		return nil, errors.New("nutrient thresholds contain trailing JSON")
	}
	if thresholds == nil {
		return nil, errors.New("nutrient thresholds must be an array")
	}
	for i := range thresholds {
		t := &thresholds[i]
		t.Nutrient = canonicalNutrientKey(t.Nutrient)
		if !canonicalAssessmentNutrients[t.Nutrient] {
			return nil, fmt.Errorf("unknown nutrient %q", t.Nutrient)
		}
		if t.AlertLevel != "warning" && t.AlertLevel != "danger" {
			return nil, fmt.Errorf("invalid alertLevel for %q", t.Nutrient)
		}
		for _, value := range []*float64{t.DailyMax, t.PerMealMax, t.Per1000KcalMin} {
			if value != nil && (!isFinite(*value) || *value < 0 || *value > 1_000_000) {
				return nil, fmt.Errorf("threshold for %q is out of range", t.Nutrient)
			}
		}
	}
	return thresholds, nil
}

func validateNutrientThresholds(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return errors.New("nutrient thresholds are required")
	}
	_, err := decodeNutrientThresholds(raw)
	return err
}

func isFinite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func nutrientsForAssessment(n BundleNutrients) map[string]float64 {
	return map[string]float64{
		"calories": n.Calories, "totalFat": n.TotalFat, "saturatedFat": n.SaturatedFat,
		"transFat": n.TransFat, "cholesterol": n.Cholesterol, "sodium": n.Sodium,
		"totalCarbs": n.TotalCarbs, "dietaryFiber": n.DietaryFiber, "totalSugars": n.TotalSugars,
		"addedSugars": n.AddedSugars, "protein": n.Protein, "vitaminD": n.VitaminD,
		"calcium": n.Calcium, "iron": n.Iron, "potassium": n.Potassium,
	}
}

func recipeAssessmentNutrients(recipe Recipe) (BundleNutrients, []string, bool) {
	var totals BundleNutrients
	missing := make(map[string]bool)
	if recipe.CustomNutrition != nil {
		if recipe.CustomNutrition.Basis != "recipeTotal" || validateCustomRecipeNutrition(recipe.CustomNutrition) != nil {
			return totals, nil, false
		}
		totals = recipe.CustomNutrition.Nutrients
		for _, key := range recipe.CustomNutrition.MissingNutrients {
			missing[canonicalNutrientKey(key)] = true
		}
		return totals, keysOf(missing), true
	}
	if len(recipe.Ingredients) == 0 {
		return totals, nil, false
	}
	for _, ingredient := range recipe.Ingredients {
		if validateMissingNutrients(ingredient.MissingNutrients) != nil {
			return BundleNutrients{}, nil, false
		}
		for _, key := range ingredient.MissingNutrients {
			missing[canonicalNutrientKey(key)] = true
		}
		nutrients := nutrientsFromIngredient(ingredient)
		// Imported supplied facts are not verified nutrition. Retain ordinary
		// legacy snapshots without requiring a fresh USDA/custom-food lookup.
		if ingredient.UnresolvedSource != nil || ingredient.UnconfirmedNutrition != nil {
			return BundleNutrients{}, nil, false
		}
		if ingredient.ZeroNutritionOverride {
			if ingredient.FdcID != -3 || emptyDefault(ingredient.SourceType, "manual") != "manual" || ingredient.SourceKey != nil || ingredient.LinkedRecipeID != nil || !bundleNutrientsAreZero(nutrients) {
				return BundleNutrients{}, nil, false
			}
		} else if ingredient.FdcID <= 0 && ingredient.SourceKey == nil && ingredient.LinkedRecipeID == nil && !meaningfulImportNutrition(nutrients) {
			// An unmatched zero placeholder is unknown, not a deliberate zero.
			return BundleNutrients{}, nil, false
		}
		if validateNutritionNumbers(nutrients) != "" {
			return BundleNutrients{}, nil, false
		}
		totals = addImportNutrients(totals, nutrients)
	}
	return totals, keysOf(missing), true
}

func keysOf(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

func assessRecipeNutrients(profile DietaryProfile, recipe Recipe) RecipeAssessment {
	result := RecipeAssessment{RecipeID: recipe.ID, Status: AssessmentNotAssessed, Reasons: []string{}}
	thresholds, err := decodeNutrientThresholds(profile.NutrientThresholdsJSON)
	if err != nil {
		result.Reasons = append(result.Reasons, "profile nutrient criteria are invalid")
		return result
	}
	criteria := make([]nutrientThreshold, 0, len(thresholds))
	for _, threshold := range thresholds {
		if threshold.PerMealMax != nil || threshold.Per1000KcalMin != nil {
			criteria = append(criteria, threshold)
		}
	}
	if len(criteria) == 0 {
		result.Reasons = append(result.Reasons, "profile has no recipe-level nutrient criteria")
		return result
	}
	if recipe.Servings <= 0 {
		result.Reasons = append(result.Reasons, "recipe servings are invalid")
		return result
	}
	totals, missing, ok := recipeAssessmentNutrients(recipe)
	if !ok {
		result.Reasons = append(result.Reasons, "recipe nutrition is unavailable")
		return result
	}
	values := nutrientsForAssessment(totals)
	for key, value := range values {
		if !isFinite(value) || value < 0 {
			result.Reasons = append(result.Reasons, "recipe nutrition contains invalid values")
			return result
		}
		values[key] = value / float64(recipe.Servings)
	}
	missingSet := make(map[string]bool, len(missing))
	for _, key := range missing {
		missingSet[canonicalNutrientKey(key)] = true
	}
	unknown := false
	failed := false
	calories := totals.Calories
	wholeValues := nutrientsForAssessment(totals)
	for _, criterion := range criteria {
		key := criterion.Nutrient
		value, exists := values[key]
		if !exists || missingSet[key] {
			unknown = true
			result.Reasons = append(result.Reasons, key+" is unreported")
			continue
		}
		if criterion.PerMealMax != nil && value > *criterion.PerMealMax {
			failed = true
			result.Reasons = append(result.Reasons, key+" exceeds the per-serving maximum")
		}
		if criterion.Per1000KcalMin != nil {
			if missingSet["calories"] || !isFinite(calories) || calories <= 0 {
				unknown = true
				result.Reasons = append(result.Reasons, "positive calories are required for nutrient density")
				continue
			}
			// Whole-recipe facts avoid yield-dependent floating-point drift.
			// A relative 1e-12 tolerance admits representation noise only, not
			// a materially below-target recipe.
			density := wholeValues[key] / calories * 1000
			minimum := *criterion.Per1000KcalMin
			tolerance := math.Max(math.Abs(density), math.Abs(minimum)) * 1e-12
			if !isFinite(density) {
				unknown = true
				result.Reasons = append(result.Reasons, key+" density is invalid")
			} else if density < minimum && minimum-density > tolerance {
				failed = true
				result.Reasons = append(result.Reasons, key+" is below the per-1000-kcal minimum")
			}
		}
	}
	if unknown {
		result.Status = AssessmentNotAssessed
	} else if failed {
		result.Status = AssessmentNoMatch
	} else {
		result.Status = AssessmentMatch
	}
	return result
}
