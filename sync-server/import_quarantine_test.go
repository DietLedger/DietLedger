package main

import (
	"encoding/json"
	"fmt"
	"testing"
)

func quarantineBundle(key string, complete bool) RecipeBundle {
	src := BundleIngredientSourceRef{Type: "manual"}
	return RecipeBundle{Format: RecipeBundleFormat, Version: 2, Recipes: []BundleRecipe{{BundleRecipeID: key, Name: key, Servings: 1, ServingName: "bowl", Ingredients: []BundleIngredient{{BundleIngredientID: "ingredient", Name: "Original ingredient", Amount: 50, Unit: "g", Description: "retained", PrepInstructions: []string{"chopped"}, StorageLocation: "Pantry", Source: src, ZeroNutritionOverride: complete}}}}}
}
func quarantineSummary(t *testing.T, env *testEnv, b RecipeBundle) map[string]interface{} {
	t.Helper()
	w := env.doRequest("POST", "/api/recipe-bundles/import", b)
	if w.Code != 200 {
		t.Fatalf("import %d %s", w.Code, w.Body.String())
	}
	return decodeJSON(t, w)["data"].(map[string]interface{})
}
func quarantineRows(t *testing.T, env *testEnv) []map[string]interface{} {
	t.Helper()
	w := env.doRequest("GET", "/api/recipe-imports", nil)
	if w.Code != 200 {
		t.Fatalf("list %d %s", w.Code, w.Body.String())
	}
	var v struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	return v.Data
}
func quarantineKeep(t *testing.T, env *testEnv, summary map[string]interface{}) string {
	t.Helper()
	id, ok := summary["pendingImportId"].(string)
	if !ok || id == "" || summary["requiresDecision"] != true {
		t.Fatalf("expected pending decision: %#v", summary)
	}
	w := env.doRequest("POST", "/api/recipe-imports/"+id+"/decision", map[string]string{"action": "keep"})
	if w.Code != 200 {
		t.Fatalf("keep %d %s", w.Code, w.Body.String())
	}
	return id
}
func quarantineMainCount(t *testing.T, env *testEnv) int {
	t.Helper()
	var n int
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, env.userID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
func TestImportStagingDecisionCumulativeAndRetry(t *testing.T) {
	env := newTestEnv(t)
	a := quarantineBundle("file A", false)
	summary := quarantineSummary(t, env, a)
	if quarantineMainCount(t, env) != 0 {
		t.Fatal("unaccepted incoming batch published main recipes")
	}
	batch := quarantineKeep(t, env, summary)
	retry := quarantineSummary(t, env, a)
	if retry["requiresDecision"] != false {
		t.Fatalf("accepted retry reopened the decision: %v", retry)
	}
	if rows := quarantineRows(t, env); len(rows) != 1 {
		t.Fatalf("retry duplicated queue: %v", rows)
	}
	b := quarantineSummary(t, env, quarantineBundle("file B", false))
	if quarantineMainCount(t, env) != 0 {
		t.Fatal("second input changed main")
	}
	quarantineKeep(t, env, b)
	if rows := quarantineRows(t, env); len(rows) != 2 {
		t.Fatalf("later file replaced previous quarantine: %v", rows)
	}
	c := quarantineSummary(t, env, quarantineBundle("file C", false))
	id := c["pendingImportId"].(string)
	w := env.doRequest("POST", "/api/recipe-imports/"+id+"/decision", map[string]string{"action": "cancel"})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if len(quarantineRows(t, env)) != 2 || quarantineMainCount(t, env) != 0 {
		t.Fatal("cancel removed earlier queue or published main")
	}
	w = env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "cancel"})
	if w.Code != 409 {
		t.Fatalf("accepted batch cancellation: %d %s", w.Code, w.Body.String())
	}
}
func TestImportStagingCompleteAndRepair(t *testing.T) {
	env := newTestEnv(t)
	summary := quarantineSummary(t, env, quarantineBundle("complete", true))
	if summary["requiresDecision"] == true || quarantineMainCount(t, env) != 1 {
		t.Fatalf("complete import not promoted: %v", summary)
	}
	summary = quarantineSummary(t, env, quarantineBundle("repair", false))
	quarantineKeep(t, env, summary)
	rows := quarantineRows(t, env)
	if len(rows) != 1 {
		t.Fatal(rows)
	}
	id := rows[0]["id"].(string)
	w := env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": 123456789, "sourceType": "usda", "sourceKey": "123456789", "calories": 50})
	if w.Code != 400 {
		t.Fatalf("fictitious target accepted: %d %s", w.Code, w.Body.String())
	}
	w = env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true, "description": "retained", "prepInstructions": []string{"chopped"}, "storageLocation": "Pantry"})
	if w.Code != 200 {
		t.Fatalf("repair %d %s", w.Code, w.Body.String())
	}
	if len(quarantineRows(t, env)) != 0 || quarantineMainCount(t, env) != 2 {
		t.Fatal("repair did not atomically promote")
	}
	var desc, prep, storage string
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT description,prep_instructions,storage_location FROM ingredients i JOIN recipes r ON r.id=i.recipe_id WHERE r.name='repair'`).Scan(&desc, &prep, &storage); err != nil {
		t.Fatal(err)
	}
	if desc != "retained" || prep != "[\"chopped\"]" || storage != "Pantry" {
		t.Fatalf("metadata lost %s %s %s", desc, prep, storage)
	}
}
func TestImportStagingDependenciesAndCycles(t *testing.T) {
	for _, cycle := range []bool{false, true} {
		t.Run(fmt.Sprint(cycle), func(t *testing.T) {
			env := newTestEnv(t)
			b := quarantineBundle("child", false)
			parent := quarantineBundle("parent", false).Recipes[0]
			parent.Ingredients[0].Source = BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "child"}
			parent.Ingredients[0].Amount = 2
			parent.Ingredients[0].Unit = "× recipe"
			if cycle {
				b.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "parent"}
			}
			b.Recipes = append(b.Recipes, parent)
			quarantineKeep(t, env, quarantineSummary(t, env, b))
			rows := quarantineRows(t, env)
			if len(rows) != 2 || quarantineMainCount(t, env) != 0 {
				t.Fatalf("dependency/cycle published shells: %v", rows)
			}
			var id string
			for _, r := range rows {
				if r["recipe"].(map[string]interface{})["name"] == "child" {
					id = r["id"].(string)
				}
			}
			w := env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
			if w.Code != 200 || len(quarantineRows(t, env)) != 0 || quarantineMainCount(t, env) != 2 {
				t.Fatalf("repair did not release parents: %d %s", w.Code, w.Body.String())
			}
		})
	}
}
func TestImportStagingEmptyAndOwnership(t *testing.T) {
	env := newTestEnv(t)
	b := quarantineBundle("empty", false)
	b.Recipes[0].Ingredients = nil
	quarantineKeep(t, env, quarantineSummary(t, env, b))
	rows := quarantineRows(t, env)
	if len(rows) != 1 {
		t.Fatal(rows)
	}
	id := rows[0]["id"].(string)
	other, err := env.auth.Register("staging-other@test.com", "Password123", "Other")
	if err != nil {
		t.Fatal(err)
	}
	w := doRequestWithToken(env, "PUT", "/api/recipe-imports/"+id+"/ingredients/new", other.AccessToken, map[string]interface{}{"name": "zero", "amount": 1, "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
	if w.Code != 404 {
		t.Fatalf("foreign repair %d %s", w.Code, w.Body.String())
	}
	w = env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/new", map[string]interface{}{"name": "zero", "amount": 1, "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
	if w.Code != 200 || quarantineMainCount(t, env) != 1 {
		t.Fatalf("empty repair %d %s", w.Code, w.Body.String())
	}
}
