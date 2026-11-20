package main

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func publishedNutritionJSON() map[string]interface{} {
	n := map[string]interface{}{}
	for _, key := range []string{"calories", "totalFat", "saturatedFat", "transFat", "cholesterol", "sodium", "totalCarbs", "dietaryFiber", "totalSugars", "addedSugars", "protein", "vitaminD", "calcium", "iron", "potassium"} {
		n[key] = 0
	}
	n["calories"] = 800
	n["protein"] = 80
	return map[string]interface{}{"basis": "recipeTotal", "nutrients": n, "source": "Published cookbook", "sourceLabel": "Per serving: 200 kcal", "missingNutrients": []string{"vitaminD"}}
}

func publishedBundle(t *testing.T, version int) RecipeBundle {
	t.Helper()
	raw, _ := json.Marshal(map[string]interface{}{"format": RecipeBundleFormat, "version": version, "recipes": []interface{}{map[string]interface{}{"bundleRecipeId": "published", "name": "Published recipe", "servings": 4, "servingName": "portion", "description": "Source introduction", "customNutrition": publishedNutritionJSON(), "ingredients": []interface{}{map[string]interface{}{"bundleIngredientId": "descriptive", "name": "Descriptive chicken", "amount": 1, "unit": "whole", "source": map[string]interface{}{"type": "manual"}, "nutrients": BundleNutrients{Calories: 999}}}}}})
	var b RecipeBundle
	if err := json.Unmarshal(raw, &b); err != nil {
		t.Fatal(err)
	}
	return b
}

func TestCustomRecipeNutritionStrictValidation(t *testing.T) {
	for _, tt := range []struct {
		name   string
		mutate func(map[string]interface{})
	}{
		{"basis", func(n map[string]interface{}) { n["basis"] = "perServing" }},
		{"source", func(n map[string]interface{}) { n["source"] = " " }},
		{"source null", func(n map[string]interface{}) { n["source"] = nil }},
		{"missing nutrients", func(n map[string]interface{}) { delete(n, "nutrients") }},
		{"omitted nutrient", func(n map[string]interface{}) { delete(n["nutrients"].(map[string]interface{}), "protein") }},
		{"null nutrient", func(n map[string]interface{}) { n["nutrients"].(map[string]interface{})["protein"] = nil }},
		{"negative", func(n map[string]interface{}) { n["nutrients"].(map[string]interface{})["protein"] = -1 }},
		{"too large", func(n map[string]interface{}) { n["nutrients"].(map[string]interface{})["sodium"] = 1000001 }},
		{"unknown nutrient", func(n map[string]interface{}) { n["nutrients"].(map[string]interface{})["vitaminC"] = 5 }},
		{"unknown missing", func(n map[string]interface{}) { n["missingNutrients"] = []string{"vitaminC"} }},
		{"duplicate missing", func(n map[string]interface{}) { n["missingNutrients"] = []string{"iron", "iron"} }},
		{"unknown custom field", func(n map[string]interface{}) { n["perServing"] = true }},
	} {
		t.Run(tt.name, func(t *testing.T) {
			n := publishedNutritionJSON()
			tt.mutate(n)
			raw, _ := json.Marshal(map[string]interface{}{"customNutrition": n})
			var req CreateRecipeRequest
			if err := json.Unmarshal(raw, &req); err == nil {
				t.Fatal("accepted invalid metadata")
			}
		})
	}
}

func TestCustomRecipeNutritionLinkedAuthority(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	var childReq CreateRecipeRequest
	raw, _ := json.Marshal(map[string]interface{}{"name": "Child", "servings": 4, "customNutrition": publishedNutritionJSON()})
	if err := json.Unmarshal(raw, &childReq); err != nil {
		t.Fatal(err)
	}
	child, err := s.CreateRecipe(env.userID, &childReq)
	if err != nil {
		t.Fatal(err)
	}
	link := CreateIngredientReq{Name: "Child", Amount: 2, Unit: "recipe", SourceType: "recipe", LinkedRecipeID: &child.ID, Calories: 1}
	parent, err := s.CreateRecipe(env.userID, &CreateRecipeRequest{Name: "Parent", Servings: 1, Ingredients: []CreateIngredientReq{link}})
	if err != nil {
		t.Fatal(err)
	}
	if parent.Ingredients[0].Calories != 1600 {
		t.Fatalf("create trusted stale linked custom snapshot: %+v", parent.Ingredients[0])
	}
	link.Amount = 0.5
	added, err := s.CreateIngredient(parent.ID, &link)
	if err != nil {
		t.Fatal(err)
	}
	if added.Calories != 400 {
		t.Fatalf("ingredient create calories %g", added.Calories)
	}
	link.Amount = 3
	updated, err := s.UpdateIngredient(env.userID, parent.ID, added.ID, &link)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Calories != 2400 {
		t.Fatalf("ingredient update calories %g", updated.Calories)
	}
	if err := s.ReplaceIngredients(parent.ID, []CreateIngredientReq{link}); err != nil {
		t.Fatal(err)
	}
	parent, err = s.GetRecipe(env.userID, parent.ID)
	if err != nil {
		t.Fatal(err)
	}
	if parent.Ingredients[0].Calories != 2400 {
		t.Fatalf("replace calories %g", parent.Ingredients[0].Calories)
	}
	link.Amount = 1.5
	ings := []CreateIngredientReq{link}
	parent, err = s.UpdateRecipe(env.userID, parent.ID, &UpdateRecipeRequest{Ingredients: &ings})
	if err != nil {
		t.Fatal(err)
	}
	if parent.Ingredients[0].Calories != 1200 {
		t.Fatalf("recipe update calories %g", parent.Ingredients[0].Calories)
	}
}

func TestCustomRecipeNutritionLogAuthorityAndHistory(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	summary, err := s.StageRecipeBundle(env.userID, publishedBundle(t, 4))
	if err != nil {
		t.Fatal(err)
	}
	id := summary.PromotedRecipeIDs[0]
	profile, err := s.CreateProfile(env.userID, &CreateProfileRequest{Name: "Person", Sex: "male", ActivityLevel: "sedentary"})
	if err != nil {
		t.Fatal(err)
	}
	req := CreateFoodLogRequest{SourceType: "recipe", SourceID: &id, Name: "Published", Servings: 2, Date: "2026-01-01", MealSlot: "noon", Calories: 999}
	entry, err := s.CreateFoodLogEntry(env.userID, profile.ID, &req)
	if err != nil {
		t.Fatal(err)
	}
	if entry.Calories != 400 || entry.Protein != 40 {
		t.Fatalf("custom log trusted client nutrition: %+v", entry)
	}
	if _, err := s.UpdateRecipe(env.userID, id, &UpdateRecipeRequest{Servings: intPtr(8)}); err != nil {
		t.Fatal(err)
	}
	entries, err := s.ListFoodLogEntries(profile.ID, "2026-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if entries[0].Calories != 400 {
		t.Fatal("recipe edit rewrote historical log")
	}
	// Metadata-only edits echo consumption fields but must keep historical facts.
	custom := &CustomRecipeNutrition{Basis: "recipeTotal", Source: "Edited source", Nutrients: BundleNutrients{Calories: 2400, Protein: 240}}
	if _, err := s.UpdateRecipe(env.userID, id, &UpdateRecipeRequest{CustomNutrition: custom}); err != nil {
		t.Fatal(err)
	}
	req.MealSlot = "evening"
	req.Calories = 400
	req.Protein = 40
	entry, err = s.UpdateFoodLogEntry(entry.ID, &req)
	if err != nil {
		t.Fatal(err)
	}
	if entry.Calories != 400 || entry.Protein != 40 {
		t.Fatalf("metadata-only edit rebased historical snapshot: %+v", entry)
	}
	req.Servings = 1
	entry, err = s.UpdateFoodLogEntry(entry.ID, &req)
	if err != nil {
		t.Fatal(err)
	}
	if entry.Calories != 300 {
		t.Fatalf("explicit log update used stale facts: %+v", entry)
	}
}

func TestCustomRecipeNutritionDayPlanAuthority(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	summary, err := s.StageRecipeBundle(env.userID, publishedBundle(t, 4))
	if err != nil {
		t.Fatal(err)
	}
	id := summary.PromotedRecipeIDs[0]
	plan, err := s.CreateMealPlan(env.userID, &CreateMealPlanRequest{Name: "Week", WeekStart: "2026-01-01"})
	if err != nil {
		t.Fatal(err)
	}
	req := CreateDayPlanEntryRequest{Date: "2026-01-01", Slot: "noon", RecipeID: &id, SourceType: "recipe", Servings: 2, Calories: 999}
	entry, err := s.CreateDayPlanEntry(plan.UserID, plan.ID, &req)
	if err != nil {
		t.Fatal(err)
	}
	if entry.Calories != 400 || entry.Protein != 40 {
		t.Fatalf("day plan trusted client facts: %+v", entry)
	}
	req.Servings = 1
	entry, err = s.UpdateDayPlanEntry(plan.UserID, plan.ID, entry.ID, &req)
	if err != nil {
		t.Fatal(err)
	}
	if entry.Calories != 200 {
		t.Fatalf("day plan update trusted client facts: %+v", entry)
	}
}

func TestCustomRecipeNutritionStagedRepairUsesMainCustomTotals(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	summary, err := s.StageRecipeBundle(env.userID, publishedBundle(t, 4))
	if err != nil {
		t.Fatal(err)
	}
	childID := summary.PromotedRecipeIDs[0]
	b := quarantineBundle("parent-to-repair", false)
	if _, err := s.StageRecipeBundle(env.userID, b); err != nil {
		t.Fatal(err)
	}
	_, rows, err := s.loadImportState(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	req := CreateIngredientReq{Name: "Child", Amount: 0.5, Unit: "recipe", SourceType: "recipe", LinkedRecipeID: &childID, Calories: 999}
	summary, err = s.ResolveQuarantinedIngredient(env.userID, rows[0].ID, rows[0].Recipe.Ingredients[0].BundleIngredientID, req)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.PromotedRecipeIDs) != 1 {
		t.Fatalf("custom child seen as unresolved: %+v", summary)
	}
	parent, err := s.GetRecipe(env.userID, summary.PromotedRecipeIDs[0])
	if err != nil {
		t.Fatal(err)
	}
	if parent.Ingredients[0].Calories != 400 || parent.Ingredients[0].Protein != 40 {
		t.Fatalf("repair summed descriptive ingredients: %+v", parent)
	}
}

func TestCustomRecipeNutritionLinkedImportAndRepair(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := publishedBundle(t, 4)
	b.Recipes = append(b.Recipes, BundleRecipe{BundleRecipeID: "parent", Name: "Parent", Servings: 2, Ingredients: []BundleIngredient{{BundleIngredientID: "child", Name: "Published", Amount: 0.5, Unit: "recipe", Source: BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "published"}, Nutrients: BundleNutrients{Calories: 123}}}})
	summary, err := s.StageRecipeBundle(env.userID, b)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.PromotedRecipeIDs) != 2 {
		t.Fatalf("promotion: %+v", summary)
	}
	recipes, _, err := s.ListRecipes(env.userID, 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range recipes {
		if r.Name == "Parent" && r.Ingredients[0].Calories != 400 {
			t.Fatalf("import trusted stale child snapshot: %+v", r)
		}
	}
}

func TestCustomRecipeNutritionArtifactPublicJourney(t *testing.T) {
	raw, err := os.ReadFile("../recipe_meals_pdfs/deliciously-healthy-family-meals-first-two.recipe-bundle.json")
	if os.IsNotExist(err) {
		t.Skip("external PDF artifact not present")
	}
	if err != nil {
		t.Fatal(err)
	}
	var b RecipeBundle
	if err := json.Unmarshal(raw, &b); err != nil {
		t.Fatal(err)
	}
	if err := ValidateRecipeBundle(b); err != nil {
		t.Fatal(err)
	}
	env := newTestEnv(t)
	w := env.doRequest("POST", "/api/recipe-bundles/import", b)
	if w.Code != 200 {
		t.Fatalf("public import: %d %s", w.Code, w.Body.String())
	}
	s := env.store.(*PostgresStore)
	rows, _, err := s.ListRecipes(env.userID, 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("artifact did not promote immediately: %s", w.Body.String())
	}
	want := map[string]BundleNutrients{b.Recipes[0].Name: {Calories: 992, Sodium: 1688, Protein: 80}, b.Recipes[1].Name: {Calories: 928, Sodium: 168, Protein: 72}}
	ids := []string{}
	for _, r := range rows {
		ids = append(ids, r.ID)
		if r.CustomNutrition == nil {
			t.Fatal("lost published totals")
		}
		n := r.CustomNutrition.Nutrients
		v := want[r.Name]
		if r.Servings != 4 || n.Calories != v.Calories || n.Sodium != v.Sodium || n.Protein != v.Protein {
			t.Fatalf("artifact facts: %+v", r)
		}
		for _, i := range r.Ingredients {
			if i.ZeroNutritionOverride || i.LinkedRecipeID != nil || i.FdcID > 0 {
				t.Fatalf("fabricated ingredient source: %+v", i)
			}
		}
	}
	w = env.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"recipeIds": ids})
	if w.Code != 200 {
		t.Fatalf("public export: %d %s", w.Code, w.Body.String())
	}
	w = env.doRequest("POST", "/api/recipe-bundles/owner-backup", map[string]interface{}{})
	if w.Code != 200 {
		t.Fatalf("public backup: %d %s", w.Code, w.Body.String())
	}
	backup, err := s.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if backup.Version != 4 || len(backup.Recipes) != 2 {
		t.Fatalf("backup: %+v", backup)
	}
	for _, r := range backup.Recipes {
		for _, original := range b.Recipes {
			if r.Name == original.Name && (!reflect.DeepEqual(r.CustomNutrition, original.CustomNutrition) || !reflect.DeepEqual(r.Description, original.Description)) {
				t.Fatal("artifact metadata changed")
			}
		}
	}
}

func TestCustomRecipeNutritionCrossOwnerLogRejected(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	profile, err := s.CreateProfile(env.userID, &CreateProfileRequest{Name: "Victim", Sex: "male"})
	if err != nil {
		t.Fatal(err)
	}
	summary, err := s.StageRecipeBundle(env.userID, publishedBundle(t, 4))
	if err != nil {
		t.Fatal(err)
	}
	id := summary.PromotedRecipeIDs[0]
	req := CreateFoodLogRequest{SourceType: "recipe", SourceID: &id, Name: "Private", Servings: 1, Date: "2026-01-01", MealSlot: "noon"}
	entry, err := s.CreateFoodLogEntry(env.userID, profile.ID, &req)
	if err != nil {
		t.Fatal(err)
	}
	other, err := env.auth.Register("attacker@test.com", "Password123", "Attacker")
	if err != nil {
		t.Fatal(err)
	}
	own, err := s.CreateProfile(other.User.ID, &CreateProfileRequest{Name: "Own", Sex: "male"})
	if err != nil {
		t.Fatal(err)
	}
	env.token = other.AccessToken
	req.Servings = 2
	for _, p := range []string{profile.ID, own.ID} {
		w := env.doRequest("PUT", "/api/profiles/"+p+"/log/"+entry.ID, req)
		if w.Code != 404 {
			t.Fatalf("cross-owner log edit: %d %s", w.Code, w.Body.String())
		}
	}
	w := env.doRequest("POST", "/api/profiles/"+profile.ID+"/log", req)
	if w.Code != 404 {
		t.Fatalf("cross-owner profile log create: %d %s", w.Code, w.Body.String())
	}
	logs, err := s.ListFoodLogEntries(profile.ID, "2026-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if logs[0].Calories != 200 {
		t.Fatal("victim snapshot mutated")
	}
}

func TestCustomRecipeNutritionDependencyOrder(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := publishedBundle(t, 4)
	b.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "child"}
	child := BundleRecipe{BundleRecipeID: "child", Name: "Child", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "zero", Name: "Zero", Source: BundleIngredientSourceRef{Type: "manual"}, ZeroNutritionOverride: true}}}
	b.Recipes = append(b.Recipes, child)
	summary, err := s.StageRecipeBundle(env.userID, b)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.PromotedRecipeIDs) != 2 {
		t.Fatalf("dependency promotion: %+v", summary)
	}
	rows, _, err := s.ListRecipes(env.userID, 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.Name == "Published recipe" && (r.Ingredients[0].LinkedRecipeID == nil || r.Ingredients[0].UnresolvedSource != nil) {
			t.Fatalf("custom parent promoted before child: %+v", r.Ingredients[0])
		}
	}
}

func TestCustomRecipeNutritionPendingMainCanonicalization(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := publishedBundle(t, 4)
	b.PendingImports = &PendingRecipeImports{Version: 1}
	b.Recipes = append(b.Recipes, BundleRecipe{BundleRecipeID: "parent", Name: "Parent", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "child", Name: "Published", Amount: 1, Source: BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "published"}, Nutrients: BundleNutrients{Calories: 123}}}})
	if _, err := s.StageRecipeBundle(env.userID, b); err != nil {
		t.Fatal(err)
	}
	rows, _, err := s.ListRecipes(env.userID, 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.Name == "Parent" && r.Ingredients[0].Calories != 800 {
			t.Fatalf("pending restore discarded corrected snapshots: %+v", r.Ingredients[0])
		}
	}
}

func TestCustomRecipeNutritionMissingNutrientsPropagate(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := publishedBundle(t, 4)
	b.Recipes = append(b.Recipes, BundleRecipe{BundleRecipeID: "parent", Name: "Parent", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "child", Name: "Child", Amount: 1, Source: BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "published"}}}}, BundleRecipe{BundleRecipeID: "grandparent", Name: "Grandparent", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "parent", Name: "Parent", Amount: 1, Source: BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "parent"}}}})
	if _, err := s.StageRecipeBundle(env.userID, b); err != nil {
		t.Fatal(err)
	}
	rows, _, err := s.ListRecipes(env.userID, 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.Name == "Published recipe" {
			continue
		}
		raw, _ := json.Marshal(r.Ingredients[0])
		var facts map[string]interface{}
		_ = json.Unmarshal(raw, &facts)
		list, ok := facts["missingNutrients"].([]interface{})
		if !ok || len(list) != 1 || list[0] != "vitaminD" {
			t.Fatalf("lost missing provenance through %s: %s", r.Name, raw)
		}
	}
	backup, err := s.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range backup.Recipes {
		if r.Name == "Published recipe" {
			continue
		}
		raw, _ := json.Marshal(r.Ingredients[0])
		var facts map[string]interface{}
		_ = json.Unmarshal(raw, &facts)
		if facts["missingNutrients"] == nil {
			t.Fatalf("backup lost linked missing provenance: %s", raw)
		}
	}
}

func TestCustomRecipeNutritionIngredientMissingVersionGate(t *testing.T) {
	b := quarantineBundle("ingredient-missing", true)
	raw, _ := json.Marshal(b)
	var obj map[string]interface{}
	_ = json.Unmarshal(raw, &obj)
	ing := obj["recipes"].([]interface{})[0].(map[string]interface{})["ingredients"].([]interface{})[0].(map[string]interface{})
	ing["missingNutrients"] = []string{"vitaminD"}
	for _, version := range []int{1, 2, 3, 4} {
		obj["version"] = version
		if version == 3 {
			obj["pendingImports"] = map[string]interface{}{"version": 1}
		} else {
			delete(obj, "pendingImports")
		}
		encoded, _ := json.Marshal(obj)
		var copy RecipeBundle
		if err := json.Unmarshal(encoded, &copy); err != nil {
			t.Fatal(err)
		}
		err := ValidateRecipeBundle(copy)
		if version < 4 && err == nil {
			t.Fatalf("v%d silently accepts missing provenance", version)
		}
		if version == 4 && err != nil {
			t.Fatal(err)
		}
	}
}

func TestCustomRecipeNutritionDerivedBounds(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := publishedBundle(t, 4)
	b.Recipes[0].CustomNutrition.Nutrients.Calories = nutritionInputMax
	b.Recipes = append(b.Recipes, BundleRecipe{BundleRecipeID: "parent", Name: "Parent", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "child", Name: "Published", Amount: 2, Source: BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "published"}}}})
	if _, err := s.StageRecipeBundle(env.userID, b); err == nil {
		t.Fatal("staged derived nutrients exceed bound")
	}
}

func TestCustomRecipeNutritionRawNativeLinkedAuthority(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := publishedBundle(t, 4)
	parent := BundleRecipe{BundleRecipeID: "parent", Name: "Parent", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "child", Name: "Published", Amount: 2, Source: BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "published"}, Nutrients: BundleNutrients{Calories: 1}}}}
	b.Recipes = append([]BundleRecipe{parent}, b.Recipes...)
	if _, err := s.ImportRecipeBundle(env.userID, b); err != nil {
		t.Fatal(err)
	}
	rows, _, err := s.ListRecipes(env.userID, 1, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.Name == "Parent" && r.Ingredients[0].Calories != 1600 {
			t.Fatalf("native import trusts stale snapshot: %+v", r.Ingredients[0])
		}
	}
	if _, err := s.ImportRecipeBundle(env.userID, b); err != nil {
		t.Fatalf("canonical native retry conflicts: %v", err)
	}
}

func TestCustomRecipeNutritionPendingBackupRestore(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := publishedBundle(t, 4)
	b.Recipes = append(b.Recipes, BundleRecipe{BundleRecipeID: "unresolved", Name: "Unresolved regular", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "manual", Name: "Unmatched", Amount: 1, Source: BundleIngredientSourceRef{Type: "manual"}}}})
	summary, err := s.StageRecipeBundle(env.userID, b)
	if err != nil {
		t.Fatal(err)
	}
	backup, err := s.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if backup.Version != 4 || backup.PendingImports == nil {
		t.Fatalf("pending custom backup downgraded: %+v", backup)
	}
	if err := ValidateRecipeBundle(*backup); err != nil {
		t.Fatal(err)
	}
	other := createUser(t, s, "restore-custom")
	restored, err := s.StageRecipeBundle(other.ID, *backup)
	if err != nil {
		t.Fatal(err)
	}
	if restored == nil {
		t.Fatal("missing restored pending state")
	}
	batches, rows, err := s.loadImportState(other.ID)
	if err != nil {
		t.Fatal(err)
	}
	var pending []*recipeImportBatch
	for _, batch := range batches {
		if !batch.Accepted {
			pending = append(pending, batch)
		}
	}
	if len(pending) != 1 || len(rows) != 2 {
		t.Fatalf("lost pending imports: %d %d", len(pending), len(rows))
	}
	summary, err = s.DecideRecipeImport(other.ID, pending[0].ID, "keep")
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.PromotedRecipeIDs) != 1 {
		t.Fatalf("custom not promoted after pending decision: %+v", summary)
	}
	q, err := s.ListQuarantinedRecipes(other.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(q) != 1 {
		t.Fatalf("regular readiness weakened: %+v", q)
	}
}

func TestCustomRecipeNutritionIdentityAndClosure(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := publishedBundle(t, 4)
	summary, err := s.StageRecipeBundle(env.userID, b)
	if err != nil {
		t.Fatal(err)
	}
	id := summary.PromotedRecipeIDs[0]
	child, err := s.GetRecipe(env.userID, id)
	if err != nil {
		t.Fatal(err)
	}
	parent, err := s.CreateRecipe(env.userID, &CreateRecipeRequest{Name: "Parent", Servings: 1, Ingredients: []CreateIngredientReq{{Name: "Child", Amount: 1, Unit: "recipe", SourceType: "recipe", LinkedRecipeID: &id}}})
	if err != nil {
		t.Fatal(err)
	}
	exported, err := s.ExportRecipeBundle(env.userID, []string{parent.ID}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if exported.Version != 4 || len(exported.Recipes) != 2 {
		t.Fatalf("dependency-only v4 metadata lost: %+v", exported)
	}
	if _, err := s.StageRecipeBundle(env.userID, *exported); err != nil {
		t.Fatalf("unchanged metadata conflict: %v", err)
	}
	for _, kind := range []string{"description", "source", "missingNutrients", "totals"} {
		copiedRaw, _ := json.Marshal(exported)
		var copy RecipeBundle
		_ = json.Unmarshal(copiedRaw, &copy)
		for i := range copy.Recipes {
			r := &copy.Recipes[i]
			if r.PortableID != child.PortableID {
				continue
			}
			switch kind {
			case "description":
				r.Description = strPtr("Changed")
			case "source":
				r.CustomNutrition.Source = "Changed"
			case "missingNutrients":
				r.CustomNutrition.MissingNutrients = []string{"iron"}
			case "totals":
				r.CustomNutrition.Nutrients.Calories++
			}
		}
		if _, err := s.StageRecipeBundle(env.userID, copy); err == nil {
			t.Fatalf("changed %s reused silently", kind)
		}
	}
}

func TestCustomRecipeNutritionUpdateRollbackAndCascade(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	summary, err := s.StageRecipeBundle(env.userID, publishedBundle(t, 4))
	if err != nil {
		t.Fatal(err)
	}
	id := summary.PromotedRecipeIDs[0]
	r, err := s.GetRecipe(env.userID, id)
	if err != nil {
		t.Fatal(err)
	}
	changed := *r.CustomNutrition
	changed.Nutrients.Calories = 400
	yes := true
	invalid := []CreateIngredientReq{{Name: "Invalid zero override", Calories: 1, ZeroNutritionOverride: &yes}}
	if _, err := s.UpdateRecipe(env.userID, id, &UpdateRecipeRequest{Name: strPtr("Should rollback"), Description: strPtr("Changed"), CustomNutrition: &changed, Ingredients: &invalid}); err == nil {
		t.Fatal("invalid ingredient persisted")
	}
	r, err = s.GetRecipe(env.userID, id)
	if err != nil {
		t.Fatal(err)
	}
	if r.Name != "Published recipe" || r.CustomNutrition.Nutrients.Calories != 800 || *r.Description != "Source introduction" {
		t.Fatalf("partial update persisted: %+v", r)
	}
	if err := s.DeleteRecipe(env.userID, id); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM custom_recipe_nutrition WHERE recipe_id=$1`, id).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("custom nutrition did not cascade")
	}
}

func TestCustomRecipeNutritionVersionContract(t *testing.T) {
	for _, version := range []int{1, 2, 3} {
		b := publishedBundle(t, version)
		if version == 3 {
			b.PendingImports = &PendingRecipeImports{Version: 1}
		}
		if err := ValidateRecipeBundle(b); err == nil {
			t.Errorf("v%d silently accepted unsupported recipe metadata", version)
		}
	}
	if err := ValidateRecipeBundle(publishedBundle(t, 4)); err != nil {
		t.Fatalf("v4: %v", err)
	}
}

func TestCustomRecipeNutritionCRUD(t *testing.T) {
	env := newTestEnv(t)
	payload := map[string]interface{}{"name": "Published", "servings": 4, "description": "Source introduction", "customNutrition": publishedNutritionJSON(), "ingredients": []interface{}{map[string]interface{}{"name": "Descriptive", "amount": 1, "unit": "whole"}}}
	w := env.doRequest("POST", "/api/recipes", payload)
	if w.Code != 201 {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	data := decodeJSON(t, w)["data"].(map[string]interface{})
	if data["customNutrition"] == nil || data["description"] != "Source introduction" {
		t.Fatalf("lost custom facts: %v", data)
	}
	id := data["id"].(string)
	w = env.doRequest("PUT", "/api/recipes/"+id, map[string]interface{}{"servings": 8})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	data = decodeJSON(t, w)["data"].(map[string]interface{})
	if data["customNutrition"].(map[string]interface{})["nutrients"].(map[string]interface{})["calories"] != float64(800) {
		t.Fatal("yield edit replaced fixed totals")
	}
	w = env.doRequest("PUT", "/api/recipes/"+id, map[string]interface{}{"customNutrition": nil})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if decodeJSON(t, w)["data"].(map[string]interface{})["customNutrition"] != nil {
		t.Fatal("explicit null did not remove custom nutrition")
	}
}

func TestCustomRecipeNutritionStagingRoundTrip(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	summary, err := s.StageRecipeBundle(env.userID, publishedBundle(t, 4))
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.PromotedRecipeIDs) != 1 {
		t.Fatalf("descriptive recipe failed promotion: %+v", summary)
	}
	b, err := s.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if b.Version != 4 {
		t.Fatalf("backup version %d", b.Version)
	}
	raw, _ := json.Marshal(b.Recipes[0])
	var facts map[string]interface{}
	_ = json.Unmarshal(raw, &facts)
	if facts["customNutrition"] == nil || facts["description"] != "Source introduction" {
		t.Fatalf("backup lost metadata: %s", raw)
	}
	if b.Recipes[0].Ingredients[0].ZeroNutritionOverride {
		t.Fatal("descriptive content converted to no-nutrition consent")
	}
}
