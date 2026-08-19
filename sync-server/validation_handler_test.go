package main

// Handler-level tests for server-side nutrition input validation (G4).
// The API is authoritative for nutrition data quality: negative nutrients,
// impossible servings, and out-of-range body measurements must be rejected
// with 400 (and enum violations must not surface as 500 from DB CHECKs).
// Requires TEST_DATABASE_URL like the rest of the handler suite.

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func expectStatus(t *testing.T, w *httptest.ResponseRecorder, want int, context string) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("%s: status = %d, want %d, body = %s", context, w.Code, want, w.Body.String())
	}
}

func TestRecipeValidation(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Bad", "servings": 0, "ingredients": []interface{}{},
	})
	expectStatus(t, w, http.StatusBadRequest, "zero servings")

	w = env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Bad", "servings": -3, "ingredients": []interface{}{},
	})
	expectStatus(t, w, http.StatusBadRequest, "negative servings")

	w = env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Bad", "servings": 2,
		"ingredients": []interface{}{
			map[string]interface{}{"name": "Salt", "amount": 1, "unit": "tsp", "sodium": -100},
		},
	})
	expectStatus(t, w, http.StatusBadRequest, "negative ingredient nutrient")

	w = env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Good", "servings": 4,
		"ingredients": []interface{}{
			map[string]interface{}{"name": "Salt", "amount": 1, "unit": "tsp", "sodium": 100},
		},
	})
	expectStatus(t, w, http.StatusCreated, "valid recipe")
}

func TestFoodLogValidation(t *testing.T) {
	env := newTestEnv(t)

	pw := env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "P", "sex": "female",
	})
	pm := decodeJSON(t, pw)
	profileID := pm["data"].(map[string]interface{})["id"].(string)

	// Legacy slot names must be a 400, not a 500 from the DB CHECK.
	w := env.doRequest("POST", "/api/profiles/"+profileID+"/log", map[string]interface{}{
		"date": "2025-01-15", "mealSlot": "breakfast", "sourceType": "manual",
		"name": "Toast", "servings": 1,
	})
	expectStatus(t, w, http.StatusBadRequest, "legacy meal slot")

	w = env.doRequest("POST", "/api/profiles/"+profileID+"/log", map[string]interface{}{
		"date": "2025-01-15", "mealSlot": "morning", "sourceType": "manual",
		"name": "Toast", "servings": 0,
	})
	expectStatus(t, w, http.StatusBadRequest, "zero servings")

	w = env.doRequest("POST", "/api/profiles/"+profileID+"/log", map[string]interface{}{
		"date": "2025-01-15", "mealSlot": "morning", "sourceType": "manual",
		"name": "Toast", "servings": 1, "protein": -5,
	})
	expectStatus(t, w, http.StatusBadRequest, "negative protein")

	w = env.doRequest("POST", "/api/profiles/"+profileID+"/log", map[string]interface{}{
		"date": "2025-01-15", "mealSlot": "morning", "sourceType": "manual",
		"name": "Toast", "servings": 1, "protein": 5,
	})
	expectStatus(t, w, http.StatusCreated, "valid log")
}

func TestProfileValidation(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "P", "sex": "female", "heightCm": 500,
	})
	expectStatus(t, w, http.StatusBadRequest, "impossible height")

	w = env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "P", "sex": "robot",
	})
	expectStatus(t, w, http.StatusBadRequest, "invalid sex")

	w = env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "P", "sex": "female", "activityLevel": "extreme",
	})
	expectStatus(t, w, http.StatusBadRequest, "invalid activity level")

	w = env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "P", "sex": "female", "heightCm": 165, "activityLevel": "moderate",
	})
	expectStatus(t, w, http.StatusCreated, "valid profile")
}

func TestWeightValidation(t *testing.T) {
	env := newTestEnv(t)

	pw := env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "P", "sex": "female",
	})
	pm := decodeJSON(t, pw)
	profileID := pm["data"].(map[string]interface{})["id"].(string)

	w := env.doRequest("POST", "/api/profiles/"+profileID+"/weight", map[string]interface{}{
		"date": "2025-01-15", "weightKg": -70,
	})
	expectStatus(t, w, http.StatusBadRequest, "negative weight")

	w = env.doRequest("POST", "/api/profiles/"+profileID+"/weight", map[string]interface{}{
		"date": "2025-01-15", "weightKg": 70,
	})
	expectStatus(t, w, http.StatusCreated, "valid weight")
}

func TestCustomFoodValidation(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/custom-foods", map[string]interface{}{
		"name": "Snack", "protein": -3,
	})
	expectStatus(t, w, http.StatusBadRequest, "negative protein")

	w = env.doRequest("POST", "/api/custom-foods", map[string]interface{}{
		"name": "Snack", "protein": 3, "calories": 150,
	})
	expectStatus(t, w, http.StatusCreated, "valid custom food")
}

func TestDayPlanEntryValidation(t *testing.T) {
	env := newTestEnv(t)

	mw := env.doRequest("POST", "/api/meal-plans", map[string]interface{}{
		"name": "W1", "weekStart": "2025-01-13",
	})
	mm := decodeJSON(t, mw)
	planID := mm["data"].(map[string]interface{})["id"].(string)

	w := env.doRequest("POST", "/api/meal-plans/"+planID+"/entries", map[string]interface{}{
		"date": "2025-01-13", "slot": "snack", "sourceType": "recipe",
		"position": 1, "servings": 1,
	})
	expectStatus(t, w, http.StatusBadRequest, "snack slot not allowed in day plans")

	w = env.doRequest("POST", "/api/meal-plans/"+planID+"/entries", map[string]interface{}{
		"date": "2025-01-13", "slot": "morning", "sourceType": "recipe",
		"position": 1, "servings": 1,
	})
	expectStatus(t, w, http.StatusCreated, "valid day-plan entry")
}
