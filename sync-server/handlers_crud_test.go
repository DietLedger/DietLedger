package main

import (
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
		"recipeData": `{"name":"Community Recipe"}`, "isPublic": true,
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

	w := env.doRequest("POST", "/api/keys", map[string]interface{}{
		"name": "My Key",
		"secret": "secret-value-123",
	})
	if w.Code != 201 {
		t.Fatalf("create key: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	keyID := m["data"].(map[string]interface{})["id"].(string)

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
