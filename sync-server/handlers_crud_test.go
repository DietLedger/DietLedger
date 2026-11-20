package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestSharingCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Share Test", "servings": 2, "servingName": "plate",
	})
	if w.Code != 201 {
		t.Fatalf("create recipe: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	recipeID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("POST", "/api/share", map[string]interface{}{
		"recipeId":   recipeID,
		"title":      "Shared Recipe",
		"recipeData": `{"name":"Share Test"}`,
		"visibility": "public",
	})
	if w.Code != 201 {
		t.Fatalf("create share: status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	shareToken := m["shareToken"].(string)
	if shareToken == "" {
		t.Fatal("expected share token")
	}

	w = env.doRequest("GET", "/api/share", nil)
	if w.Code != 200 {
		t.Fatalf("list shares: status = %d", w.Code)
	}

	w = env.doRequestNoAuth("GET", "/api/share/"+shareToken, nil)
	if w.Code != 200 {
		t.Fatalf("get share by token: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequestNoAuth("GET", "/api/share/nonexistent-token", nil)
	if w.Code != 404 {
		t.Fatalf("get nonexistent share: status = %d, want 404", w.Code)
	}

	w = env.doRequest("DELETE", "/api/share/"+m["id"].(string), nil)
	if w.Code != 200 {
		t.Fatalf("delete share: status = %d", w.Code)
	}
}

func TestShareOwnershipAndVisibilityValidation(t *testing.T) {
	env := newTestEnv(t)
	ownerRecipe := env.doRequest("POST", "/api/recipes", map[string]interface{}{"name": "Owner recipe", "servings": 1, "servingName": "portion"})
	ownerRecipeID := decodeJSON(t, ownerRecipe)["data"].(map[string]interface{})["id"].(string)

	other, err := env.auth.Register("other-sharing@test.com", "Password123", "Other")
	if err != nil {
		t.Fatal(err)
	}
	otherRecipeReq := httptest.NewRequest("POST", "/api/recipes", bytes.NewBufferString(`{"name":"Other recipe","servings":1,"servingName":"portion"}`))
	otherRecipeReq.Header.Set("Authorization", "Bearer "+other.AccessToken)
	otherRecipeReq.Header.Set("Content-Type", "application/json")
	otherRecipeRec := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(otherRecipeRec, otherRecipeReq)
	otherRecipeID := decodeJSON(t, otherRecipeRec)["data"].(map[string]interface{})["id"].(string)

	foreign := env.doRequest("POST", "/api/share", map[string]interface{}{"recipeId": otherRecipeID, "title": "forged", "recipeData": "{}", "visibility": "public"})
	if foreign.Code < 400 {
		t.Fatalf("sharing another owner's recipe returned %d: %s", foreign.Code, foreign.Body.String())
	}

	created := env.doRequest("POST", "/api/share", map[string]interface{}{"recipeId": ownerRecipeID, "title": "private by default", "recipeData": "{}"})
	if created.Code != 201 {
		t.Fatalf("create owner share: %d %s", created.Code, created.Body.String())
	}
	share := decodeJSON(t, created)
	if share["visibility"] != VisibilityPrivate {
		t.Fatalf("omitted visibility = %v, want private", share["visibility"])
	}
	shareID := share["id"].(string)

	for _, body := range []map[string]interface{}{{}, {"visibility": "typo"}} {
		invalid := env.doRequest("PUT", "/api/share/"+shareID, body)
		if invalid.Code != 400 {
			t.Fatalf("invalid visibility update status = %d, body=%s", invalid.Code, invalid.Body.String())
		}
	}
	// The authenticated non-owner must not mutate a known share ID.
	foreignTokenReq := httptest.NewRequest("PUT", "/api/share/"+shareID, bytes.NewBufferString(`{"visibility":"public"}`))
	foreignTokenReq.Header.Set("Authorization", "Bearer "+other.AccessToken)
	foreignTokenReq.Header.Set("Content-Type", "application/json")
	foreignTokenRec := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(foreignTokenRec, foreignTokenReq)
	if foreignTokenRec.Code < 400 {
		t.Fatalf("non-owner updated share: %d %s", foreignTokenRec.Code, foreignTokenRec.Body.String())
	}
}

func TestShareMissingFields(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/share", map[string]interface{}{
		"recipeId": "abc",
	})
	if w.Code != 400 {
		t.Fatalf("missing fields: status = %d, want 400", w.Code)
	}
}

func TestCommunitySearch(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Community Recipe", "servings": 2, "servingName": "plate",
	})
	m := decodeJSON(t, w)
	recipeID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("POST", "/api/share", map[string]interface{}{
		"recipeId": recipeID, "title": "Community Recipe",
		"recipeData": `{"name":"Community Recipe"}`, "visibility": "public",
	})
	if w.Code != 201 {
		t.Fatalf("share: status = %d", w.Code)
	}

	w = env.doRequestNoAuth("GET", "/api/community?q=Community", nil)
	if w.Code != 200 {
		t.Fatalf("community search: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequestNoAuth("GET", "/api/community/categories", nil)
	if w.Code != 200 {
		t.Fatalf("community categories: status = %d", w.Code)
	}
}

func TestShareVisibilityTiers(t *testing.T) {
	env := newTestEnv(t)

	// Create a recipe to share.
	w := env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Tier Test", "servings": 2, "servingName": "plate",
	})
	m := decodeJSON(t, w)
	recipeID := m["data"].(map[string]interface{})["id"].(string)

	// Register a second user.
	resp2, err := env.auth.Register("other@test.com", "Password123", "Other")
	if err != nil {
		t.Fatalf("register second user: %v", err)
	}

	// --- users tier ---
	w = env.doRequest("POST", "/api/share", map[string]interface{}{
		"recipeId": recipeID, "title": "Users Only",
		"recipeData": `{"name":"Tier Test"}`, "visibility": "users",
	})
	if w.Code != 201 {
		t.Fatalf("create users share: status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	usersToken := m["shareToken"].(string)

	// anon → 401
	w = env.doRequestNoAuth("GET", "/api/share/"+usersToken, nil)
	if w.Code != 401 {
		t.Fatalf("users share anon: status = %d, want 401", w.Code)
	}

	// other authed user → 200
	req := httptest.NewRequest("GET", "/api/share/"+usersToken, nil)
	req.Header.Set("Authorization", "Bearer "+resp2.AccessToken)
	rec := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("users share authed: status = %d, want 200", rec.Code)
	}

	// --- private tier ---
	w = env.doRequest("POST", "/api/share", map[string]interface{}{
		"recipeId": recipeID, "title": "Private",
		"recipeData": `{"name":"Tier Test"}`, "visibility": "private",
	})
	if w.Code != 201 {
		t.Fatalf("create private share: status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	privateToken := m["shareToken"].(string)

	// anon → 403
	w = env.doRequestNoAuth("GET", "/api/share/"+privateToken, nil)
	if w.Code != 403 {
		t.Fatalf("private share anon: status = %d, want 403", w.Code)
	}

	// other authed user → 403
	req = httptest.NewRequest("GET", "/api/share/"+privateToken, nil)
	req.Header.Set("Authorization", "Bearer "+resp2.AccessToken)
	rec = httptest.NewRecorder()
	env.server.Routes().ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatalf("private share other user: status = %d, want 403", rec.Code)
	}

	// owner → 200
	w = env.doRequest("GET", "/api/share/"+privateToken, nil)
	if w.Code != 200 {
		t.Fatalf("private share owner: status = %d, want 200", w.Code)
	}
}

func TestCommunitySearchVisibility(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Vis Community", "servings": 2, "servingName": "plate",
	})
	m := decodeJSON(t, w)
	recipeID := m["data"].(map[string]interface{})["id"].(string)

	// Share as public and as users.
	env.doRequest("POST", "/api/share", map[string]interface{}{
		"recipeId": recipeID, "title": "Public One",
		"recipeData": `{}`, "visibility": "public",
	})
	env.doRequest("POST", "/api/share", map[string]interface{}{
		"recipeId": recipeID, "title": "Users One",
		"recipeData": `{}`, "visibility": "users",
	})

	// anon sees only public.
	w = env.doRequestNoAuth("GET", "/api/community", nil)
	if w.Code != 200 {
		t.Fatalf("anon community: status = %d", w.Code)
	}
	var anonItems []interface{}
	json.NewDecoder(w.Body).Decode(&anonItems)
	if len(anonItems) != 1 {
		t.Fatalf("anon community: expected 1 result, got %d", len(anonItems))
	}

	// authed sees public + users.
	w = env.doRequest("GET", "/api/community", nil)
	if w.Code != 200 {
		t.Fatalf("authed community: status = %d", w.Code)
	}
	var authedItems []interface{}
	json.NewDecoder(w.Body).Decode(&authedItems)
	if len(authedItems) != 2 {
		t.Fatalf("authed community: expected 2 results, got %d", len(authedItems))
	}
}

func TestMealPlanHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/meal-plans", map[string]interface{}{
		"name": "Week 1", "weekStart": "2025-01-13",
	})
	if w.Code != 201 {
		t.Fatalf("create: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	planID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/meal-plans", nil)
	if w.Code != 200 {
		t.Fatalf("list: status = %d", w.Code)
	}

	w = env.doRequest("GET", "/api/meal-plans/"+planID, nil)
	if w.Code != 200 {
		t.Fatalf("get: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/meal-plans/"+planID, map[string]interface{}{
		"name": "Week 1 Updated", "weekStart": "2025-01-13",
	})
	if w.Code != 200 {
		t.Fatalf("update: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/meal-plans/"+planID, nil)
	if w.Code != 200 {
		t.Fatalf("delete: status = %d", w.Code)
	}
}

func TestDayPlanEntryPartialUpdate(t *testing.T) {
	env := newTestEnv(t)

	// Create a meal plan
	w := env.doRequest("POST", "/api/meal-plans", map[string]interface{}{
		"name": "Week 1", "weekStart": "2025-01-13",
	})
	if w.Code != 201 {
		t.Fatalf("create plan: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	planID := m["data"].(map[string]interface{})["id"].(string)

	// Create a real plan group so the entry's group reference is valid.
	w = env.doRequest("POST", "/api/meal-plans/"+planID+"/groups", map[string]interface{}{"name": "Meal group", "date": "2025-01-13", "slot": "morning"})
	if w.Code != 201 {
		t.Fatalf("create group: status = %d, body = %s", w.Code, w.Body.String())
	}
	groupID := decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)

	// Create an entry with full data
	w = env.doRequest("POST", "/api/meal-plans/"+planID+"/entries", map[string]interface{}{
		"date": "2025-01-13", "slot": "morning", "sourceType": "recipe",
		"position": 0, "servings": 2,
	})
	if w.Code != 201 {
		t.Fatalf("create entry: status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	entryID := m["data"].(map[string]interface{})["id"].(string)

	// Partial PUT: only groupId (simulates grouping)
	w = env.doRequest("PUT", "/api/entries/"+entryID, map[string]interface{}{
		"groupId": groupID,
	})
	if w.Code != 200 {
		t.Fatalf("partial update (groupId): status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	data := m["data"].(map[string]interface{})
	if data["date"] != "2025-01-13" {
		t.Errorf("date overwritten: got %v, want 2025-01-13", data["date"])
	}
	if data["slot"] != "morning" {
		t.Errorf("slot overwritten: got %v, want morning", data["slot"])
	}
	if data["servings"] != float64(2) {
		t.Errorf("servings overwritten: got %v, want 2", data["servings"])
	}
	if data["groupId"] != groupID {
		t.Errorf("groupId not set: got %v, want %s", data["groupId"], groupID)
	}

	// Partial PUT: only slot + position (simulates drag-to-move)
	w = env.doRequest("PUT", "/api/entries/"+entryID, map[string]interface{}{
		"slot": "noon", "position": 3,
	})
	if w.Code != 200 {
		t.Fatalf("partial update (move): status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	data = m["data"].(map[string]interface{})
	if data["date"] != "2025-01-13" {
		t.Errorf("date overwritten on move: got %v, want 2025-01-13", data["date"])
	}
	if data["slot"] != "noon" {
		t.Errorf("slot not updated: got %v, want noon", data["slot"])
	}
	if data["position"] != float64(3) {
		t.Errorf("position not updated: got %v, want 3", data["position"])
	}
	if data["servings"] != float64(2) {
		t.Errorf("servings overwritten on move: got %v, want 2", data["servings"])
	}
	if data["groupId"] != groupID {
		t.Errorf("groupId lost on move: got %v, want %s", data["groupId"], groupID)
	}

	// Partial PUT: groupId=null (simulates ungrouping)
	w = env.doRequest("PUT", "/api/entries/"+entryID, map[string]interface{}{
		"groupId": nil,
	})
	if w.Code != 200 {
		t.Fatalf("partial update (ungroup): status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	data = m["data"].(map[string]interface{})
	if _, exists := data["groupId"]; exists {
		t.Errorf("groupId should be unset, got %v", data["groupId"])
	}
	if data["slot"] != "noon" {
		t.Errorf("slot overwritten on ungroup: got %v, want noon", data["slot"])
	}
}

func TestBookHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/books", map[string]interface{}{
		"title": "My Book", "description": "Test book", "coverColor": "#000",
	})
	if w.Code != 201 {
		t.Fatalf("create book: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	bookID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/books", nil)
	if w.Code != 200 {
		t.Fatalf("list books: status = %d", w.Code)
	}

	w = env.doRequest("GET", "/api/books/"+bookID, nil)
	if w.Code != 200 {
		t.Fatalf("get book: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/books/"+bookID, map[string]interface{}{
		"title": "Updated Book",
	})
	if w.Code != 200 {
		t.Fatalf("update book: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/books/"+bookID, nil)
	if w.Code != 200 {
		t.Fatalf("delete book: status = %d", w.Code)
	}
}

func TestCategoryAdminAndCycleGuards(t *testing.T) {
	env := newTestEnv(t)
	first := env.doRequest("POST", "/api/categories", map[string]interface{}{"name": "Parent"})
	if first.Code != 201 {
		t.Fatalf("admin category create: %d %s", first.Code, first.Body.String())
	}
	parentID := decodeJSON(t, first)["data"].(map[string]interface{})["id"].(string)
	child := env.doRequest("POST", "/api/categories", map[string]interface{}{"name": "Child", "parentId": parentID})
	childID := decodeJSON(t, child)["data"].(map[string]interface{})["id"].(string)
	cycle := env.doRequest("PUT", "/api/categories/"+parentID, map[string]interface{}{"name": "Parent", "parentId": childID})
	if cycle.Code < 400 {
		t.Fatalf("cyclic category reparent accepted: %d %s", cycle.Code, cycle.Body.String())
	}
	other, err := env.auth.Register("category-reader@test.com", "Password123", "Reader")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("POST", "/api/categories", bytes.NewBufferString(`{"name":"forbidden"}`))
	req.Header.Set("Authorization", "Bearer "+other.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatalf("non-admin category creation status = %d", rec.Code)
	}
}

func TestCategoryHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/categories", map[string]interface{}{
		"name": "Desserts",
	})
	if w.Code != 201 {
		t.Fatalf("create category: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	catID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/categories", nil)
	if w.Code != 200 {
		t.Fatalf("list categories: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/categories/"+catID, map[string]interface{}{
		"name": "Desserts Updated",
	})
	if w.Code != 200 {
		t.Fatalf("update category: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/categories/"+catID, nil)
	if w.Code != 200 {
		t.Fatalf("delete category: status = %d", w.Code)
	}
}

func TestCustomFoodHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/custom-foods", map[string]interface{}{
		"name": "My Granola", "calories": 200, "protein": 8,
	})
	if w.Code != 201 {
		t.Fatalf("create custom food: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	foodID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/custom-foods", nil)
	if w.Code != 200 {
		t.Fatalf("list custom foods: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/custom-foods/"+foodID, map[string]interface{}{
		"name": "My Granola V2", "calories": 180,
	})
	if w.Code != 200 {
		t.Fatalf("update custom food: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/custom-foods/"+foodID, nil)
	if w.Code != 200 {
		t.Fatalf("delete custom food: status = %d", w.Code)
	}
}

func TestGroceryHandler(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("GET", "/api/grocery?weekStart=2025-01-13", nil)
	if w.Code != 200 {
		t.Fatalf("get grocery: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/grocery", map[string]interface{}{
		"weekStart":    "2025-01-13",
		"checkedItems": `{"milk":true}`,
	})
	if w.Code != 200 {
		t.Fatalf("upsert grocery: status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestAPIKeyHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/keys", map[string]interface{}{"name": "My Key"})
	if w.Code != 410 {
		t.Fatalf("issuance status=%d", w.Code)
	}
	key, _, err := env.store.CreateAPIKey(env.userID, "Existing", "{}")
	if err != nil {
		t.Fatal(err)
	}
	keyID := key.ID

	w = env.doRequest("GET", "/api/keys", nil)
	if w.Code != 200 {
		t.Fatalf("list keys: status = %d", w.Code)
	}

	w = env.doRequest("DELETE", "/api/keys/"+keyID, nil)
	if w.Code != 200 {
		t.Fatalf("delete key: status = %d", w.Code)
	}
}

func TestAboutEndpoint(t *testing.T) {
	env := newTestEnv(t)
	req := httptest.NewRequest("GET", "/api/about", nil)
	resp := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(resp, req)
	if resp.Code != 200 {
		t.Fatalf("status = %d", resp.Code)
	}
	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	if body["name"] == nil {
		t.Fatal("expected name field")
	}
}

func TestUnauthorizedAccess(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequestNoAuth("GET", "/api/recipes", nil)
	if w.Code != 401 {
		t.Fatalf("unauth recipes: status = %d, want 401", w.Code)
	}

	w = env.doRequestNoAuth("POST", "/api/meal-plans", map[string]interface{}{
		"name": "Hack", "weekStart": "2025-01-13",
	})
	if w.Code != 401 {
		t.Fatalf("unauth meal plan: status = %d, want 401", w.Code)
	}

	w = env.doRequestNoAuth("GET", "/api/books", nil)
	if w.Code != 401 {
		t.Fatalf("unauth books: status = %d, want 401", w.Code)
	}

	w = env.doRequestNoAuth("DELETE", "/api/keys/fake", nil)
	if w.Code != 401 {
		t.Fatalf("unauth keys: status = %d, want 401", w.Code)
	}
}
