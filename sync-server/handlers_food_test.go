package main

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
)

func seedFoodItems(t *testing.T, s Store) {
	t.Helper()
	items := []FoodItem{
		{FdcID: 100001, Description: "Apple, Raw, With Skin", DataType: "SR Legacy", ServingSize: 100, ServingSizeUnit: "g", Calories: 52, Source: "usda"},
		{FdcID: 100002, Description: "Apple Juice, Canned", DataType: "SR Legacy", ServingSize: 240, ServingSizeUnit: "ml", Calories: 45, Source: "usda"},
		{FdcID: 100003, Description: "Banana, Raw", DataType: "SR Legacy", ServingSize: 118, ServingSizeUnit: "g", Calories: 89, Source: "usda"},
		{FdcID: 100004, Description: "Chicken Breast, Grilled", DataType: "SR Legacy", ServingSize: 100, ServingSizeUnit: "g", Calories: 165, Source: "usda"},
		{FdcID: 100005, Description: "Chicken Soup, Canned", DataType: "SR Legacy", ServingSize: 245, ServingSizeUnit: "g", Calories: 50, Source: "usda"},
		{FdcID: 100006, Description: "Rice, White, Cooked", DataType: "SR Legacy", ServingSize: 158, ServingSizeUnit: "g", Calories: 130, Source: "usda"},
	}
	for _, item := range items {
		if _, err := s.CreateFoodItem(&item); err != nil {
			t.Fatalf("seed food %d: %v", item.FdcID, err)
		}
	}
}

func TestFoodSearchHandler(t *testing.T) {
	env := newTestEnv(t)
	seedFoodItems(t, env.store)
	if _, err := env.store.CreateFoodItem(&FoodItem{FdcID: 100007, Description: "Apple, missing energy", DataType: "Foundation", Calories: 0, Source: "usda"}); err != nil {
		t.Fatalf("seed nutritionally empty food: %v", err)
	}
	if _, err := env.store.CreateFoodItem(&FoodItem{FdcID: 100008, Description: "Apple with sodium", DataType: "Foundation", Calories: 0, Sodium: 12, Source: "usda"}); err != nil {
		t.Fatalf("seed zero-calorie nutrient-bearing food: %v", err)
	}

	w := env.doRequest("GET", "/api/foods/search?q=apple", nil)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var result FoodSearchResult
	json.NewDecoder(w.Body).Decode(&result)
	if result.Total != 3 {
		t.Fatalf("total = %d, want two positive-calorie apples and the sodium-bearing zero-calorie apple", result.Total)
	}
	foundSodiumFood := false
	for _, f := range result.Foods {
		if !contains(f.Description, "pple") {
			t.Fatalf("unexpected result: %s", f.Description)
		}
		if f.FdcID == 100008 {
			foundSodiumFood = f.Calories == 0 && f.Sodium == 12
		}
	}
	if !foundSodiumFood {
		t.Fatal("search did not return zero-calorie food with meaningful sodium")
	}
}

func TestFoodSearchPagination(t *testing.T) {
	env := newTestEnv(t)
	seedFoodItems(t, env.store)

	w := env.doRequest("GET", "/api/foods/search?q=chicken&page=1&perPage=1", nil)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var result FoodSearchResult
	json.NewDecoder(w.Body).Decode(&result)
	if result.PerPage != 1 {
		t.Fatalf("perPage = %d, want 1", result.PerPage)
	}
	if len(result.Foods) > 1 {
		t.Fatalf("got %d foods, want <= 1", len(result.Foods))
	}
	if result.Total < 2 {
		t.Fatalf("total = %d, want >= 2", result.Total)
	}
}

func TestFoodSearchEmptyQuery(t *testing.T) {
	env := newTestEnv(t)
	seedFoodItems(t, env.store)

	w := env.doRequest("GET", "/api/foods/search", nil)
	if w.Code != 200 {
		t.Fatalf("status = %d", w.Code)
	}
	var result FoodSearchResult
	json.NewDecoder(w.Body).Decode(&result)
	if result.Total < 6 {
		t.Fatalf("total = %d, want >= 6", result.Total)
	}
}

func TestFoodSearchSpecialChars(t *testing.T) {
	env := newTestEnv(t)
	seedFoodItems(t, env.store)

	w := env.doRequest("GET", "/api/foods/search?q=apple%27s%20%22test%22", nil)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestFoodItemByFdcID(t *testing.T) {
	env := newTestEnv(t)
	seedFoodItems(t, env.store)

	w := env.doRequest("GET", "/api/foods/100003", nil)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp APIResponse
	json.NewDecoder(w.Body).Decode(&resp)
	data, ok := resp.Data.(map[string]interface{})
	if !ok {
		t.Fatal("expected data object")
	}
	if data["description"] != "Banana, Raw" {
		t.Fatalf("description = %v", data["description"])
	}
}

func TestFoodItemByFdcIDEligibility(t *testing.T) {
	env := newTestEnv(t)
	if _, err := env.store.CreateFoodItem(&FoodItem{FdcID: 999998, Description: "Salt, table", Calories: 0, Sodium: 38758, Source: "usda"}); err != nil {
		t.Fatal(err)
	}
	if _, err := env.store.CreateFoodItem(&FoodItem{FdcID: 999997, Description: "Empty record", Calories: 0, Source: "usda"}); err != nil {
		t.Fatal(err)
	}
	if w := env.doRequest("GET", "/api/foods/999998", nil); w.Code != 200 {
		t.Fatalf("salt lookup status = %d, want 200: %s", w.Code, w.Body.String())
	}
	if w := env.doRequest("GET", "/api/foods/999997", nil); w.Code != 404 {
		t.Fatalf("empty record lookup status = %d, want 404", w.Code)
	}
}

func TestFoodItemByFdcIDNotFound(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("GET", "/api/foods/999999", nil)
	if w.Code != 404 {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestFoodItemByUPCZeroCaloriesNotSelectable(t *testing.T) {
	env := newTestEnv(t)
	upc := "00000000001"
	if _, err := env.store.CreateFoodItem(&FoodItem{FdcID: 200002, Description: "Zero-calorie product", Calories: 0, GtinUpc: &upc, Source: "usda"}); err != nil {
		t.Fatal(err)
	}
	w := env.doRequest("GET", "/api/foods/upc/"+upc, nil)
	if w.Code != 404 {
		t.Fatalf("status = %d, want 404 for zero-calorie food", w.Code)
	}
}

func TestFoodItemByUPC(t *testing.T) {
	env := newTestEnv(t)
	upc := "04163100067"
	env.store.CreateFoodItem(&FoodItem{
		FdcID: 200001, Description: "Test Branded Product", DataType: "Branded", Calories: 100,
		GtinUpc: &upc, ServingSize: 1, ServingSizeUnit: "cup", Source: "usda",
	})

	w := env.doRequest("GET", "/api/foods/upc/"+upc, nil)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp APIResponse
	json.NewDecoder(w.Body).Decode(&resp)
	data := resp.Data.(map[string]interface{})
	if data["description"] != "Test Branded Product" {
		t.Fatalf("description = %v", data["description"])
	}
}

// Current wiring requires auth for /api/foods/search (server.go). NOTE:
// docs/final_docs/api_contract.md documents this route as public — that drift is
// tracked for reconciliation in docs/plans/development-plan.md (open questions).
// If the route is made public per contract, flip this test back to expect
// 200 without a token.
func TestFoodSearchEndpointRequiresAuth(t *testing.T) {
	env := newTestEnv(t)
	seedFoodItems(t, env.store)

	req := httptest.NewRequest("GET", "/api/foods/search?q=apple", nil)
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	if w.Code != 401 {
		t.Fatalf("food search requires auth under current wiring, got status = %d, body = %s", w.Code, w.Body.String())
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s >= sub && s[:len(sub)] == sub || contains(s[1:], sub))
}

func TestFoodSearchIntegration(t *testing.T) {
	env := newTestEnv(t)
	seedFoodItems(t, env.store)

	queries := []struct {
		q          string
		minResults int
	}{
		{"apple", 2},
		{"banana", 1},
		{"chicken", 2},
		{"rice", 1},
		{"xyz", 0},
	}

	for _, tc := range queries {
		t.Run(fmt.Sprintf("q=%s", tc.q), func(t *testing.T) {
			w := env.doRequest("GET", "/api/foods/search?q="+tc.q, nil)
			if w.Code != 200 {
				t.Fatalf("status = %d", w.Code)
			}
			var result FoodSearchResult
			json.NewDecoder(w.Body).Decode(&result)
			if result.Total < tc.minResults {
				t.Errorf("q=%q: total = %d, want >= %d", tc.q, result.Total, tc.minResults)
			}
		})
	}
}
