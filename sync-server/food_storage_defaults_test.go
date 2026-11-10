package main

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func storageRequest(t *testing.T, env *testEnv, token, method, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(method, path, strings.NewReader(string(b)))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	return w
}
func storageData(t *testing.T, w *httptest.ResponseRecorder, code int) map[string]interface{} {
	t.Helper()
	if w.Code != code {
		t.Fatalf("status=%d want=%d body=%s", w.Code, code, w.Body.String())
	}
	return decodeJSON(t, w)["data"].(map[string]interface{})
}
func storageList(t *testing.T, env *testEnv, token string) []interface{} {
	t.Helper()
	w := storageRequest(t, env, token, "GET", "/api/food-storage-defaults", nil)
	if w.Code != 200 {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	return decodeJSON(t, w)["data"].([]interface{})
}
func storageRecipe(t *testing.T, env *testEnv, token string) string {
	t.Helper()
	return storageData(t, storageRequest(t, env, token, "POST", "/api/recipes", map[string]interface{}{"name": "Storage", "servings": 1}), 201)["id"].(string)
}
func storageIngredient(t *testing.T, env *testEnv, token, recipeID string, fields map[string]interface{}) string {
	t.Helper()
	return storageData(t, storageRequest(t, env, token, "POST", "/api/recipes/"+recipeID+"/ingredients", storageBody(fields)), 201)["id"].(string)
}
func storageBody(fields map[string]interface{}) map[string]interface{} {
	body := map[string]interface{}{"fdcId": 0, "name": "Food", "amount": 100, "unit": "g"}
	for k, v := range fields {
		body[k] = v
	}
	return body
}
func storageEdit(t *testing.T, env *testEnv, token, recipeID, ingredientID string, fields map[string]interface{}, code int) {
	t.Helper()
	w := storageRequest(t, env, token, "PUT", "/api/recipes/"+recipeID+"/ingredients/"+ingredientID, storageBody(fields))
	if w.Code != code {
		t.Fatalf("ingredient update: status=%d want=%d body=%s", w.Code, code, w.Body.String())
	}
}
func seedStorageFood(t *testing.T, env *testEnv, id int) {
	t.Helper()
	_, err := env.store.CreateFoodItem(&FoodItem{FdcID: id, Description: fmt.Sprintf("Food %d", id), DataType: "foundation_food", Source: "usda"})
	if err != nil {
		t.Fatal(err)
	}
}
func TestFoodStorageFirstChoiceAndExplicitOverride(t *testing.T) {
	env := newTestEnv(t)
	seedStorageFood(t, env, 765432)
	recipe := storageRecipe(t, env, env.token)
	fields := map[string]interface{}{"sourceType": "usda", "sourceKey": "765432", "fdcId": 765432}
	first := storageIngredient(t, env, env.token, recipe, fields)
	if got := storageList(t, env, env.token); len(got) != 0 {
		t.Fatalf("add set default: %v", got)
	}
	fields["storageLocation"] = "Pantry"
	storageEdit(t, env, env.token, recipe, first, fields, 200)
	want := []interface{}{map[string]interface{}{"sourceType": "usda", "sourceKey": "765432", "location": "Pantry"}}
	if got := storageList(t, env, env.token); !reflect.DeepEqual(got, want) {
		t.Fatalf("first choice: %v", got)
	}
	fields["storageLocation"] = "Freezer"
	storageEdit(t, env, env.token, recipe, first, fields, 200)
	second := storageIngredient(t, env, env.token, recipe, map[string]interface{}{"sourceType": "usda", "sourceKey": "765432", "fdcId": 765432})
	storageEdit(t, env, env.token, recipe, second, fields, 200)
	preselected := storageIngredient(t, env, env.token, recipe, map[string]interface{}{"sourceType": "usda", "sourceKey": "765432", "fdcId": 765432, "storageLocation": "Countertop"})
	storageEdit(t, env, env.token, recipe, preselected, fields, 200)
	if got := storageList(t, env, env.token); !reflect.DeepEqual(got, want) {
		t.Fatalf("recipe edit changed default: %v", got)
	}
	got := storageData(t, storageRequest(t, env, env.token, "PUT", "/api/food-storage-defaults/usda/765432", map[string]string{"location": "Refrigerator"}), 200)
	if got["location"] != "Refrigerator" {
		t.Fatalf("override response: %v", got)
	}
	want[0].(map[string]interface{})["location"] = "Refrigerator"
	if got := storageList(t, env, env.token); !reflect.DeepEqual(got, want) {
		t.Fatalf("explicit override: %v", got)
	}
	data := storageData(t, storageRequest(t, env, env.token, "GET", "/api/recipes/"+recipe, nil), 200)
	for _, ing := range data["ingredients"].([]interface{}) {
		if ing.(map[string]interface{})["storageLocation"] == "Refrigerator" {
			t.Fatal("retroactive recipe change")
		}
	}
}
func TestFoodStorageNoRematchOrManualDefault(t *testing.T) {
	env := newTestEnv(t)
	seedStorageFood(t, env, 765433)
	seedStorageFood(t, env, 765434)
	recipe := storageRecipe(t, env, env.token)
	manual := storageIngredient(t, env, env.token, recipe, map[string]interface{}{"sourceType": "manual"})
	storageEdit(t, env, env.token, recipe, manual, map[string]interface{}{"sourceType": "manual", "storageLocation": "Pantry"}, 200)
	matched := storageIngredient(t, env, env.token, recipe, map[string]interface{}{"sourceType": "usda", "fdcId": 765433, "sourceKey": "765433", "storageLocation": "Pantry"})
	storageEdit(t, env, env.token, recipe, matched, map[string]interface{}{"sourceType": "usda", "fdcId": 765434, "sourceKey": "765434", "storageLocation": "Pantry"}, 200)
	storageEdit(t, env, env.token, recipe, manual, map[string]interface{}{"sourceType": "usda", "fdcId": 765433, "sourceKey": "765433", "storageLocation": "Freezer"}, 200)
	if got := storageList(t, env, env.token); len(got) != 0 {
		t.Fatalf("rematch/add/manual set default: %v", got)
	}
}
func TestFoodStorageValidationIsolationAndDeletedCustom(t *testing.T) {
	env := newTestEnv(t)
	seedStorageFood(t, env, 765435)
	other, err := env.auth.Register("storage-other@test.com", "Password123", "Other")
	if err != nil {
		t.Fatal(err)
	}
	custom, err := env.store.CreateCustomFood(env.userID, &CreateCustomFoodRequest{Name: "Mine"})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path, location string
		code           int
	}{
		{"/api/food-storage-defaults/usda/0", "Pantry", 400}, {"/api/food-storage-defaults/usda/999999", "Pantry", 404},
		{"/api/food-storage-defaults/usda/nope", "Pantry", 400}, {"/api/food-storage-defaults/manual/765435", "Pantry", 400},
		{"/api/food-storage-defaults/usda/765435", "", 400}, {"/api/food-storage-defaults/usda/765435", "Garage", 400},
		{"/api/food-storage-defaults/custom_food/absent", "Pantry", 404},
	} {
		w := storageRequest(t, env, env.token, "PUT", tc.path, map[string]string{"location": tc.location})
		if w.Code != tc.code {
			t.Errorf("%s %q: %d want %d body=%s", tc.path, tc.location, w.Code, tc.code, w.Body.String())
		}
	}
	path := "/api/food-storage-defaults/custom_food/" + custom.ID
	if w := storageRequest(t, env, other.AccessToken, "PUT", path, map[string]string{"location": "Pantry"}); w.Code != 404 {
		t.Fatalf("cross-user: %d", w.Code)
	}
	storageData(t, storageRequest(t, env, env.token, "PUT", path, map[string]string{"location": "Freezer"}), 200)
	storageData(t, storageRequest(t, env, other.AccessToken, "PUT", "/api/food-storage-defaults/usda/765435", map[string]string{"location": "Countertop"}), 200)
	if got := storageList(t, env, env.token); len(got) != 1 || got[0].(map[string]interface{})["location"] != "Freezer" {
		t.Fatalf("owner: %v", got)
	}
	if got := storageList(t, env, other.AccessToken); len(got) != 1 || got[0].(map[string]interface{})["location"] != "Countertop" {
		t.Fatalf("other: %v", got)
	}
	if w := env.doRequestNoAuth("GET", "/api/food-storage-defaults", nil); w.Code != 401 {
		t.Fatalf("anonymous: %d", w.Code)
	}
	if err := env.store.DeleteCustomFood(env.userID, custom.ID); err != nil {
		t.Fatal(err)
	}
	if got := storageList(t, env, env.token); len(got) != 0 {
		t.Fatalf("deleted custom still listed: %v", got)
	}
	if w := storageRequest(t, env, env.token, "PUT", path, map[string]string{"location": "Pantry"}); w.Code != 404 {
		t.Fatalf("deleted custom: %d", w.Code)
	}
}
func TestFoodStorageIngredientOwnership(t *testing.T) {
	env := newTestEnv(t)
	seedStorageFood(t, env, 765436)
	a := storageRecipe(t, env, env.token)
	b := storageRecipe(t, env, env.token)
	ing := storageIngredient(t, env, env.token, a, map[string]interface{}{"sourceType": "usda", "fdcId": 765436})
	fields := map[string]interface{}{"sourceType": "usda", "fdcId": 765436, "storageLocation": "Pantry"}
	storageEdit(t, env, env.token, b, ing, fields, 404)
	fields["storageLocation"] = "Garage"
	storageEdit(t, env, env.token, a, ing, fields, 400)
	fields["storageLocation"] = "Pantry"
	if w := storageRequest(t, env, env.token, "DELETE", "/api/recipes/"+b+"/ingredients/"+ing, nil); w.Code != 404 {
		t.Fatalf("mismatched delete: %d", w.Code)
	}
	other, err := env.auth.Register("storage-stranger@test.com", "Password123", "Stranger")
	if err != nil {
		t.Fatal(err)
	}
	otherRecipe := storageRecipe(t, env, other.AccessToken)
	storageEdit(t, env, other.AccessToken, otherRecipe, ing, fields, 404)
	if got := storageList(t, env, env.token); len(got) != 0 {
		t.Fatalf("unauthorized default: %v", got)
	}
	data := storageData(t, storageRequest(t, env, env.token, "GET", "/api/recipes/"+a, nil), 200)
	if got := data["ingredients"].([]interface{})[0].(map[string]interface{})["storageLocation"]; got != "" {
		t.Fatalf("ingredient modified: %v", got)
	}
}
func TestFoodStorageCustomFirstChoiceAndInvalidMatch(t *testing.T) {
	env := newTestEnv(t)
	custom, err := env.store.CreateCustomFood(env.userID, &CreateCustomFoodRequest{Name: "Mine"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := env.auth.Register("food-other@test.com", "Password123", "Other")
	if err != nil {
		t.Fatal(err)
	}
	recipe := storageRecipe(t, env, env.token)
	fields := map[string]interface{}{"sourceType": "custom_food", "sourceKey": custom.ID}
	ing := storageIngredient(t, env, env.token, recipe, fields)
	fields["storageLocation"] = "Freezer"
	storageEdit(t, env, env.token, recipe, ing, fields, 200)
	want := []interface{}{map[string]interface{}{"sourceType": "custom_food", "sourceKey": custom.ID, "location": "Freezer"}}
	if got := storageList(t, env, env.token); !reflect.DeepEqual(got, want) {
		t.Fatalf("custom first: %v", got)
	}
	if got := storageList(t, env, other.AccessToken); len(got) != 0 {
		t.Fatalf("other can see custom default: %v", got)
	}
	otherRecipe := storageRecipe(t, env, other.AccessToken)
	otherIng := storageIngredient(t, env, other.AccessToken, otherRecipe, map[string]interface{}{"sourceType": "custom_food", "sourceKey": custom.ID})
	storageEdit(t, env, other.AccessToken, otherRecipe, otherIng, fields, 200)
	if got := storageList(t, env, other.AccessToken); len(got) != 0 {
		t.Fatalf("other seeded another user's custom food: %v", got)
	}
}
func TestFoodStorageIngredientAndDefaultRollbackTogether(t *testing.T) {
	env := newTestEnv(t)
	seedStorageFood(t, env, 765437)
	recipe := storageRecipe(t, env, env.token)
	ing := storageIngredient(t, env, env.token, recipe, map[string]interface{}{"sourceType": "usda", "fdcId": 765437})
	pg := env.store.(*PostgresStore)
	// Simulate a failed default insert after the ingredient UPDATE has executed.
	_, err := pg.db.Exec(`CREATE FUNCTION reject_storage_default() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insert failure'; END $$;
 CREATE TRIGGER fail_storage_default BEFORE INSERT ON food_storage_defaults FOR EACH ROW EXECUTE FUNCTION reject_storage_default()`)
	if err != nil {
		t.Fatal(err)
	}
	storageEdit(t, env, env.token, recipe, ing, map[string]interface{}{"sourceType": "usda", "fdcId": 765437, "storageLocation": "Pantry"}, 500)
	data := storageData(t, storageRequest(t, env, env.token, "GET", "/api/recipes/"+recipe, nil), 200)
	if got := data["ingredients"].([]interface{})[0].(map[string]interface{})["storageLocation"]; got != "" {
		t.Fatalf("failed default left saved ingredient: %v", got)
	}
	if got := storageList(t, env, env.token); len(got) != 0 {
		t.Fatalf("failed update left default: %v", got)
	}
}
