package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func doRequestWithToken(env *testEnv, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	var req *http.Request
	if body != nil {
		b, _ := json.Marshal(body)
		req = httptest.NewRequest(method, path, bytes.NewReader(b))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	return w
}

func responseID(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	if w.Code < 200 || w.Code >= 300 {
		t.Fatalf("response status=%d body=%s", w.Code, w.Body.String())
	}
	return decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)
}

func TestRecipeBundleCandidatesRespectExportEligibility(t *testing.T) {
	env := newTestEnv(t)

	adminRecipe := env.doRequest("POST", "/api/recipes", map[string]interface{}{"name": "Public Admin Recipe", "servings": 1, "servingName": "serving"})
	adminRecipeID := responseID(t, adminRecipe)
	env.doRequest("POST", "/api/share", map[string]interface{}{"recipeId": adminRecipeID, "title": "Public Admin Recipe", "recipeData": `{}`, "visibility": "public"})

	adminBook := env.doRequest("POST", "/api/books", map[string]interface{}{"title": "Admin Book", "description": "private book"})
	adminBookID := responseID(t, adminBook)
	adminProfile := env.doRequest("POST", "/api/profiles", map[string]interface{}{"name": "Admin Profile", "sex": "female"})
	adminProfileID := responseID(t, adminProfile)
	adminMealPlan := env.doRequest("POST", "/api/meal-plans", map[string]interface{}{"name": "Admin Meal Plan", "weekStart": "2026-10-12"})
	adminMealPlanID := responseID(t, adminMealPlan)

	other, err := env.auth.Register("other-export@test.com", "Password123", "Other")
	if err != nil {
		t.Fatalf("register other: %v", err)
	}
	ownRecipe := doRequestWithToken(env, "POST", "/api/recipes", other.AccessToken, map[string]interface{}{"name": "Other Own Recipe", "servings": 1, "servingName": "serving"})
	ownRecipeID := responseID(t, ownRecipe)
	ownBook := doRequestWithToken(env, "POST", "/api/books", other.AccessToken, map[string]interface{}{"title": "Other Own Book", "description": "owned book"})
	ownBookID := responseID(t, ownBook)
	ownProfile := doRequestWithToken(env, "POST", "/api/profiles", other.AccessToken, map[string]interface{}{"name": "Other Own Profile", "sex": "male"})
	ownProfileID := responseID(t, ownProfile)
	ownMealPlan := doRequestWithToken(env, "POST", "/api/meal-plans", other.AccessToken, map[string]interface{}{"name": "Other Own Meal Plan", "weekStart": "2026-10-19"})
	ownMealPlanID := responseID(t, ownMealPlan)

	w := doRequestWithToken(env, "GET", "/api/recipe-bundles/candidates", other.AccessToken, nil)
	if w.Code != 200 {
		t.Fatalf("candidates: status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		OK   bool              `json:"ok"`
		Data []ExportCandidate `json:"data"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode candidates: %v", err)
	}
	seen := map[string]bool{}
	for _, c := range resp.Data {
		seen[c.Type+":"+c.ID] = true
	}
	if !seen["recipe:"+adminRecipeID] || !seen["recipe:"+ownRecipeID] || !seen["book:"+ownBookID] || !seen["nutritionProfile:"+ownProfileID] || !seen["mealPlan:"+ownMealPlanID] {
		t.Fatalf("expected public recipe plus own recipe, book, profile, and meal plan in candidates; got %#v", seen)
	}
	if seen["book:"+adminBookID] || seen["nutritionProfile:"+adminProfileID] || seen["mealPlan:"+adminMealPlanID] {
		t.Fatalf("non-admin should not see another user's private book, profile, or meal plan")
	}
	// Administrator status is not a private-data export capability either.
	w = env.doRequest("GET", "/api/recipe-bundles/candidates", nil)
	securityStatus(t, w, 200)
	for _, privateID := range []string{ownRecipeID, ownProfileID, ownMealPlanID} {
		if bytes.Contains(w.Body.Bytes(), []byte(privateID)) {
			t.Fatalf("admin candidate enumeration exposed private ID %s", privateID)
		}
	}
	for field, ids := range map[string][]string{"recipeIds": {ownRecipeID}, "profileIds": {ownProfileID}, "mealPlanIds": {ownMealPlanID}} {
		securityStatus(t, env.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{field: ids}), 403)
	}
}

func TestRecipeBundleExportAuthorization(t *testing.T) {
	env := newTestEnv(t)

	adminRecipe := env.doRequest("POST", "/api/recipes", map[string]interface{}{"name": "Admin Private", "servings": 1, "servingName": "serving"})
	adminRecipeID := responseID(t, adminRecipe)
	adminBook := env.doRequest("POST", "/api/books", map[string]interface{}{"title": "Admin Private Book", "description": "private book"})
	adminBookID := responseID(t, adminBook)
	adminProfile := env.doRequest("POST", "/api/profiles", map[string]interface{}{"name": "Admin Profile", "sex": "female"})
	adminProfileID := responseID(t, adminProfile)
	responseID(t, env.doRequest("POST", "/api/profiles/"+adminProfileID+"/log", map[string]interface{}{"date": "2026-10-12", "mealSlot": "morning", "sourceType": "manual", "name": "Oatmeal", "servings": 1}))
	responseID(t, env.doRequest("POST", "/api/profiles/"+adminProfileID+"/weight", map[string]interface{}{"date": "2026-10-12", "weightKg": 72.5}))
	adminMealPlan := env.doRequest("POST", "/api/meal-plans", map[string]interface{}{"name": "Admin Meal Plan", "weekStart": "2026-10-12"})
	adminMealPlanID := responseID(t, adminMealPlan)
	responseID(t, env.doRequest("POST", "/api/meal-plans/"+adminMealPlanID+"/groups", map[string]interface{}{"name": "Prep", "date": "2026-10-12", "slot": "morning", "position": 1}))
	responseID(t, env.doRequest("POST", "/api/meal-plans/"+adminMealPlanID+"/entries", map[string]interface{}{"date": "2026-10-12", "slot": "morning", "position": 1, "servings": 1, "sourceType": "manual", "foodName": "Oatmeal"}))

	other, err := env.auth.Register("other-auth@test.com", "Password123", "Other")
	if err != nil {
		t.Fatalf("register other: %v", err)
	}

	w := doRequestWithToken(env, "POST", "/api/recipe-bundles/export", other.AccessToken, map[string]interface{}{"recipeIds": []string{adminRecipeID}})
	if w.Code != 403 {
		t.Fatalf("non-admin private recipe export status=%d want 403 body=%s", w.Code, w.Body.String())
	}
	w = doRequestWithToken(env, "POST", "/api/recipe-bundles/export", other.AccessToken, map[string]interface{}{"bookIds": []string{adminBookID}})
	if w.Code != 403 {
		t.Fatalf("non-admin private book export status=%d want 403 body=%s", w.Code, w.Body.String())
	}
	w = doRequestWithToken(env, "POST", "/api/recipe-bundles/export", other.AccessToken, map[string]interface{}{"profileIds": []string{adminProfileID}})
	if w.Code != 403 {
		t.Fatalf("non-admin private profile export status=%d want 403 body=%s", w.Code, w.Body.String())
	}
	w = doRequestWithToken(env, "POST", "/api/recipe-bundles/export", other.AccessToken, map[string]interface{}{"mealPlanIds": []string{adminMealPlanID}})
	if w.Code != 403 {
		t.Fatalf("non-admin private meal plan export status=%d want 403 body=%s", w.Code, w.Body.String())
	}

	w = env.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"recipeIds": []string{adminRecipeID}, "bookIds": []string{adminBookID}, "profileIds": []string{adminProfileID}, "mealPlanIds": []string{adminMealPlanID}})
	if w.Code != 200 {
		t.Fatalf("admin export status=%d want 200 body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		OK   bool         `json:"ok"`
		Data RecipeBundle `json:"data"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode export: %v", err)
	}
	if len(resp.Data.NutritionProfiles) != 1 || len(resp.Data.FoodLogEntries) != 1 || len(resp.Data.WeightEntries) != 1 || len(resp.Data.MealPlans) != 1 || len(resp.Data.DayPlanEntries) != 1 || len(resp.Data.MealGroups) != 1 {
		t.Fatalf("expected exported nutrition history and meal plan details, got profiles=%d logs=%d weights=%d mealPlans=%d entries=%d groups=%d", len(resp.Data.NutritionProfiles), len(resp.Data.FoodLogEntries), len(resp.Data.WeightEntries), len(resp.Data.MealPlans), len(resp.Data.DayPlanEntries), len(resp.Data.MealGroups))
	}
}
