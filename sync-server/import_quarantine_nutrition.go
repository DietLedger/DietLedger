package main

import (
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
)

type importRecipeResult struct {
	changed  bool
	ready    bool
	recipe   BundleRecipe
	blockers []ImportIngredientBlocker
	total    BundleNutrients
	missing  []string
}
type importEvaluator struct {
	store    *PostgresStore
	userID   string
	batches  map[string]*recipeImportBatch
	staged   map[string]*stagedImportRecipe
	results  map[string]importRecipeResult
	visiting map[string]bool
	changed  map[string]bool
	order    []*stagedImportRecipe
}

func newImportEvaluator(s *PostgresStore, userID string, batches []*recipeImportBatch, rows []*stagedImportRecipe) *importEvaluator {
	e := &importEvaluator{store: s, userID: userID, batches: map[string]*recipeImportBatch{}, staged: map[string]*stagedImportRecipe{}, results: map[string]importRecipeResult{}, visiting: map[string]bool{}, changed: map[string]bool{}}
	for _, b := range batches {
		if !b.Cancelled {
			e.batches[b.ID] = b
		}
	}
	for _, r := range rows {
		if e.batches[r.BatchID] != nil {
			e.staged[r.Recipe.PortableID] = r
		}
	}
	return e
}
func (e *importEvaluator) recipeByIdentity(key string) (importRecipeResult, error) {
	if result, ok := e.results[key]; ok {
		return result, nil
	}
	if e.visiting[key] {
		return importRecipeResult{ready: false}, nil
	}
	e.visiting[key] = true
	defer delete(e.visiting, key)
	row := e.staged[key]
	var r BundleRecipe
	var batch *recipeImportBatch
	if row != nil {
		r = row.Recipe
		batch = e.batches[row.BatchID]
	} else {
		id, err := authorizedImportRecipeID(e.store.reader(), e.userID, key)
		if err != nil {
			return importRecipeResult{}, err
		}
		if id == "" {
			return importRecipeResult{ready: false}, nil
		}
		main, err := e.store.GetRecipe(e.userID, id)
		if err != nil {
			return importRecipeResult{}, err
		}
		if main == nil {
			return importRecipeResult{ready: false}, nil
		}
		r = BundleRecipe{Description: main.Description, CustomNutrition: main.CustomNutrition, PortableID: main.PortableID, BundleRecipeID: id, Name: main.Name, Servings: main.Servings, ServingName: main.ServingName}
		for _, ing := range main.Ingredients {
			src := BundleIngredientSourceRef{Type: emptyDefault(ing.SourceType, "manual")}
			switch {
			case ing.UnresolvedSource != nil:
				src = *ing.UnresolvedSource
			case ing.LinkedRecipeID != nil:
				src = BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: *ing.LinkedRecipeID}
			case ing.SourceType == "custom_food" && ing.SourceKey != nil:
				src = BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: *ing.SourceKey}
			case ing.FdcID > 0:
				src = BundleIngredientSourceRef{Type: "usda", FdcID: ing.FdcID}
			}
			r.Ingredients = append(r.Ingredients, BundleIngredient{MissingNutrients: ing.MissingNutrients, BundleIngredientID: ing.ID, Name: ing.Name, Amount: ing.Amount, Unit: ing.Unit, Source: src, Nutrients: nutrientsFromIngredient(ing), ZeroNutritionOverride: ing.ZeroNutritionOverride})
		}
	}
	result := importRecipeResult{ready: true, changed: e.changed[key], recipe: r, blockers: []ImportIngredientBlocker{}}
	result.recipe.Ingredients = append([]BundleIngredient(nil), r.Ingredients...)
	if r.CustomNutrition != nil {
		if err := validateRecipeMetadata(r.Description, r.CustomNutrition); err != nil {
			return importRecipeResult{}, err
		}
	}
	if r.CustomNutrition == nil && len(r.Ingredients) == 0 {
		result.ready = false
		result.blockers = append(result.blockers, ImportIngredientBlocker{IngredientID: "new", Reason: "Recipe has no ingredients"})
	}
	for i, ing := range r.Ingredients {
		// Published totals waive descriptive food matching, not actual recipe
		// dependency ordering. Keep referenced children ahead of their parent.
		if r.CustomNutrition != nil && ing.Source.Type != "recipe" {
			continue
		}
		ready, nutrients, reason, err := e.ingredient(batch, ing, false)
		if err != nil {
			return importRecipeResult{}, err
		}
		if !ready {
			result.ready = false
			result.blockers = append(result.blockers, ImportIngredientBlocker{IngredientID: ing.BundleIngredientID, Reason: reason})
		} else {
			if nutrients != ing.Nutrients {
				result.changed = true
			}
			result.recipe.Ingredients[i].Nutrients = nutrients
			if ing.Source.Type == "recipe" {
				dep := e.results[e.linkedIdentity(batch, ing.Source.BundleRecipeID)]
				missing := dep.missing
				if dep.recipe.CustomNutrition == nil {
					missing = unionMissingNutrients(ing.MissingNutrients, missing)
				}
				if len(missing) > 0 || len(ing.MissingNutrients) > 0 {
					if !reflect.DeepEqual(missing, ing.MissingNutrients) {
						result.changed = true
					}
					result.recipe.Ingredients[i].MissingNutrients = missing
				}
			}
			result.missing = unionMissingNutrients(result.missing, result.recipe.Ingredients[i].MissingNutrients)
			result.total = addImportNutrients(result.total, nutrients)
			if row != nil && ing.Source.Type == "recipe" && e.results[e.linkedIdentity(batch, ing.Source.BundleRecipeID)].changed {
				result.changed = true
			}
		}
	}
	if r.CustomNutrition != nil {
		result.total = r.CustomNutrition.Nutrients
		result.missing = append([]string{}, r.CustomNutrition.MissingNutrients...)
	}
	e.results[key] = result
	if result.ready && row != nil {
		e.order = append(e.order, row)
	}
	return result, nil
}
func (e *importEvaluator) linkedIdentity(batch *recipeImportBatch, key string) string {
	if batch != nil {
		for _, candidate := range batch.Context.Recipes {
			if candidate.BundleRecipeID == key {
				return candidate.PortableID
			}
		}
	}
	return key
}

// Verification preserves imported snapshots. Only an explicitly changed match
// or a staged parent's repaired dependency uses canonical scaling.
func (e *importEvaluator) ingredient(batch *recipeImportBatch, ing BundleIngredient, recalculate bool) (bool, BundleNutrients, string, error) {
	if ing.ZeroNutritionOverride {
		if ing.Source.Type != "manual" || !bundleNutrientsAreZero(ing.Nutrients) {
			return false, BundleNutrients{}, "", errors.New("invalid explicit zero nutrition override")
		}
		return true, BundleNutrients{}, "", nil
	}
	var canonical BundleNutrients
	var portions []FoodPortion
	switch ing.Source.Type {
	case "manual", "":
		return false, ing.Nutrients, "Ingredient needs a food link or explicit no-nutrition choice", nil
	case "usda":
		food, err := e.store.GetFoodByFdcID(ing.Source.FdcID)
		if err != nil {
			return false, BundleNutrients{}, "", err
		}
		if food != nil {
			canonical = nutrientsFromFoodItem(*food)
			portions = food.Portions
		}
		// Retained package facts are unconfirmed even when they name a valid
		// FDC ID. Only an existing trusted database row can verify this link.
		if !meaningfulImportNutrition(canonical) {
			return false, ing.Nutrients, "Required USDA food record is missing or has no meaningful nutrition", nil
		}
	case "custom_food":
		_, food, err := importCustomFood(e.store.reader(), e.userID, importCustomFoodIdentity(batch, ing.Source.BundleCustomFoodID))
		if err != nil {
			return false, BundleNutrients{}, "", err
		}
		if food != nil {
			canonical = food.Nutrients
		} else if batch != nil && !batch.Materialized {
			for _, candidate := range batch.Context.CustomFoods {
				if candidate.BundleCustomFoodID == ing.Source.BundleCustomFoodID || candidate.PortableID == ing.Source.BundleCustomFoodID {
					canonical = candidate.Nutrients
					break
				}
			}
		}
		if !meaningfulImportNutrition(canonical) {
			return false, ing.Nutrients, "Required custom food is missing or has no meaningful nutrition", nil
		}
	case "recipe":
		key := e.linkedIdentity(batch, ing.Source.BundleRecipeID)
		if dep := e.staged[key]; dep != nil && batch != nil && dep.BatchID != batch.ID && !e.batches[dep.BatchID].Accepted {
			return false, ing.Nutrients, "Linked recipe import is awaiting acceptance", nil
		}
		dependency, err := e.recipeByIdentity(key)
		if err != nil {
			return false, BundleNutrients{}, "", err
		}
		if !dependency.ready {
			return false, ing.Nutrients, "Linked recipe is missing, incomplete or cyclic", nil
		}
		if recalculate || dependency.recipe.CustomNutrition != nil || (batch != nil && dependency.changed) {
			return checkedImportScale(dependency.total, ing.Amount)
		}
		return true, ing.Nutrients, "", nil
	default:
		return false, BundleNutrients{}, "", fmt.Errorf("unsupported ingredient source %q", ing.Source.Type)
	}
	if recalculate {
		return checkedImportScale(canonical, importFoodGrams(ing.Amount, ing.Unit, portions)/100)
	}
	return true, ing.Nutrients, "", nil
}
func checkedImportScale(n BundleNutrients, factor float64) (bool, BundleNutrients, string, error) {
	scaled := scaleImportNutrients(n, factor)
	if field := validateNutritionNumbers(scaled); field != "" {
		return false, BundleNutrients{}, "", fmt.Errorf("derived nutrient %s exceeds allowed bounds", field)
	}
	return true, scaled, "", nil
}

func meaningfulImportNutrition(n BundleNutrients) bool {
	v := reflect.ValueOf(n)
	for i := 0; i < v.NumField(); i++ {
		if v.Field(i).Float() > 0 {
			return true
		}
	}
	return false
}
func scaleImportNutrients(n BundleNutrients, factor float64) BundleNutrients {
	v := reflect.ValueOf(&n).Elem()
	for i := 0; i < v.NumField(); i++ {
		v.Field(i).SetFloat(math.Max(0, math.Round(v.Field(i).Float()*factor*100)/100))
	}
	return n
}
func addImportNutrients(a, b BundleNutrients) BundleNutrients {
	v, w := reflect.ValueOf(&a).Elem(), reflect.ValueOf(b)
	for i := 0; i < v.NumField(); i++ {
		v.Field(i).SetFloat(v.Field(i).Float() + w.Field(i).Float())
	}
	return a
}

// Mirrors foodAmountInGrams used by buildIngredientRematchUpdate. USDA portion
// weights win only when every matching portion agrees. Otherwise use the
// existing canonical nutrition conversion, not a new measurement policy.
func importFoodGrams(amount float64, unit string, portions []FoodPortion) float64 {
	normalize := func(s string) string { return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(s)), "s") }
	target := normalize(unit)
	ratios := []float64{}
	for _, p := range portions {
		if normalize(p.MeasureUnit) == target && p.Amount > 0 && p.GramWeight > 0 && !math.IsNaN(p.Amount) && !math.IsNaN(p.GramWeight) && !math.IsInf(p.Amount, 0) && !math.IsInf(p.GramWeight, 0) {
			ratios = append(ratios, p.GramWeight/p.Amount)
		}
	}
	if len(ratios) > 0 {
		consistent := true
		for _, ratio := range ratios {
			if math.Abs(ratio-ratios[0]) >= 0.001 {
				consistent = false
			}
		}
		if consistent {
			return amount * ratios[0]
		}
	}
	return unitToGrams(amount, unit)
}
