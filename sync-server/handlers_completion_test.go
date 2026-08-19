package main

// Recipe completion persistence (Phase P1): "recipe X was cooked on date Y"
// was previously stored in localStorage under 'kitchen-helper-completed'
// by both the Kitchen Helper and the meal-plan week page. It now lives in
// PostgreSQL per user so it survives devices and logouts.
// Requires TEST_DATABASE_URL like the rest of the handler suite.

import (
	"net/http"
	"testing"
)

func TestRecipeCompletionHandler(t *testing.T) {
	env := newTestEnv(t)

	// Create a recipe to complete.
	rw := env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Pancakes", "servings": 4, "ingredients": []interface{}{},
	})
	rm := decodeJSON(t, rw)
	recipeID := rm["data"].(map[string]interface{})["id"].(string)

	// Empty initially.
	w := env.doRequest("GET", "/api/recipes/completions", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list completions: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	if data, ok := m["data"].([]interface{}); !ok || len(data) != 0 {
		t.Fatalf("expected empty list, got %v", m["data"])
	}

	// Mark completed for a date.
	w = env.doRequest("PUT", "/api/recipes/completions/"+recipeID, map[string]string{"date": "2026-08-19"})
	if w.Code != http.StatusOK {
		t.Fatalf("upsert completion: status = %d, body = %s", w.Code, w.Body.String())
	}

	// Read back: the list contains the recipe with its date.
	w = env.doRequest("GET", "/api/recipes/completions", nil)
	m = decodeJSON(t, w)
	list, ok := m["data"].([]interface{})
	if !ok || len(list) != 1 {
		t.Fatalf("expected 1 completion, got %v", m["data"])
	}
	entry := list[0].(map[string]interface{})
	if entry["recipeId"] != recipeID || entry["completedDate"] != "2026-08-19" {
		t.Fatalf("completion = %v", entry)
	}

	// Re-marking with a later date overwrites (latest completion wins).
	w = env.doRequest("PUT", "/api/recipes/completions/"+recipeID, map[string]string{"date": "2026-08-21"})
	if w.Code != http.StatusOK {
		t.Fatalf("re-upsert: status = %d", w.Code)
	}
	w = env.doRequest("GET", "/api/recipes/completions", nil)
	m = decodeJSON(t, w)
	list = m["data"].([]interface{})
	if len(list) != 1 || list[0].(map[string]interface{})["completedDate"] != "2026-08-21" {
		t.Fatalf("expected overwritten date 2026-08-21, got %v", list)
	}

	// Invalid date is rejected.
	w = env.doRequest("PUT", "/api/recipes/completions/"+recipeID, map[string]string{"date": "not-a-date"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid date: status = %d, want 400", w.Code)
	}

	// Delete clears it.
	w = env.doRequest("DELETE", "/api/recipes/completions/"+recipeID, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("delete completion: status = %d", w.Code)
	}
	w = env.doRequest("GET", "/api/recipes/completions", nil)
	m = decodeJSON(t, w)
	if data, ok := m["data"].([]interface{}); !ok || len(data) != 0 {
		t.Fatalf("expected empty list after delete, got %v", m["data"])
	}
}

func TestRecipeCompletionRequiresAuth(t *testing.T) {
	env := newTestEnv(t)
	w := env.doRequestNoAuth("GET", "/api/recipes/completions", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("no-auth list: status = %d, want 401", w.Code)
	}
}
