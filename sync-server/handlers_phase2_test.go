package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestSettingsCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("GET", "/api/settings", nil)
	if w.Code != 200 {
		t.Fatalf("GET settings status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	if m["ok"] != true {
		t.Fatal("expected ok=true")
	}

	settingsJSON := `{"unitSystem":"metric","theme":"dark","defaultMealSlotTimes":{"morning":"07:00"}}`
	w = env.doRequest("PUT", "/api/settings", map[string]string{"settings": settingsJSON})
	if w.Code != 200 {
		t.Fatalf("PUT settings status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	data := m["data"].(map[string]interface{})
	if data["settings"] != settingsJSON {
		t.Fatalf("settings mismatch: %v", data["settings"])
	}

	w = env.doRequest("GET", "/api/settings", nil)
	if w.Code != 200 {
		t.Fatalf("GET settings after update status = %d", w.Code)
	}
	m = decodeJSON(t, w)
	data = m["data"].(map[string]interface{})
	if data["settings"] != settingsJSON {
		t.Fatalf("settings mismatch after re-read: %v", data["settings"])
	}
}

func TestSettingsAuthRequired(t *testing.T) {
	env := newTestEnv(t)
	w := env.doRequestNoAuth("GET", "/api/settings", nil)
	if w.Code != 401 {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestSecretUpsertReturnsCurrentIDAndValue(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/secrets", map[string]string{"keyName": "fda-api-key", "value": "first"})
	if w.Code != 201 {
		t.Fatalf("create secret status = %d, body = %s", w.Code, w.Body.String())
	}
	first := decodeJSON(t, w)["data"].(map[string]interface{})
	firstID := first["id"].(string)

	w = env.doRequest("POST", "/api/secrets", map[string]string{"keyName": "fda-api-key", "value": "second"})
	if w.Code != 201 {
		t.Fatalf("update secret status = %d, body = %s", w.Code, w.Body.String())
	}
	second := decodeJSON(t, w)["data"].(map[string]interface{})
	secondID := second["id"].(string)
	if secondID != firstID {
		t.Fatalf("upsert returned id %q, want existing id %q", secondID, firstID)
	}

	w = env.doRequest("GET", "/api/secrets/"+secondID, nil)
	if w.Code != 200 {
		t.Fatalf("get updated secret status = %d, body = %s", w.Code, w.Body.String())
	}
	data := decodeJSON(t, w)["data"].(map[string]interface{})
	if data["value"] != "second" {
		t.Fatalf("secret value = %v, want second", data["value"])
	}
}

func TestTemplateCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("GET", "/api/templates", nil)
	if w.Code != 200 {
		t.Fatalf("GET templates status = %d", w.Code)
	}

	layoutJSON := `{"pageSize":"a4","orientation":"portrait","margins":{"top":10,"right":10,"bottom":10,"left":10},"sections":[],"theme":{"primaryColor":"#000","backgroundColor":"#fff","textColor":"#333","accentColor":"#06b6d4","fontFamily":"sans-serif","borderRadius":4}}`
	w = env.doRequest("POST", "/api/templates", map[string]interface{}{
		"name":      "Test Recipe Template",
		"type":      "recipe",
		"isDefault": false,
		"layout":    layoutJSON,
	})
	if w.Code != 201 {
		t.Fatalf("POST template status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	data := m["data"].(map[string]interface{})
	templateID := data["id"].(string)
	if data["name"] != "Test Recipe Template" {
		t.Fatalf("name mismatch: %v", data["name"])
	}
	if data["type"] != "recipe" {
		t.Fatalf("type mismatch: %v", data["type"])
	}

	w = env.doRequest("GET", "/api/templates/"+templateID, nil)
	if w.Code != 200 {
		t.Fatalf("GET template status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/templates/"+templateID, map[string]interface{}{
		"name": "Updated Template",
	})
	if w.Code != 200 {
		t.Fatalf("PUT template status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	data = m["data"].(map[string]interface{})
	if data["name"] != "Updated Template" {
		t.Fatalf("name mismatch after update: %v", data["name"])
	}

	w = env.doRequest("GET", "/api/templates?type=recipe", nil)
	if w.Code != 200 {
		t.Fatalf("GET templates by type status = %d", w.Code)
	}

	w = env.doRequest("DELETE", "/api/templates/"+templateID, nil)
	if w.Code != 200 {
		t.Fatalf("DELETE template status = %d", w.Code)
	}
}

func TestTemplateOwnership(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/templates", map[string]interface{}{
		"name": "My Template", "type": "recipe", "isDefault": false, "layout": "{}",
	})
	if w.Code != 201 {
		t.Fatalf("POST status = %d", w.Code)
	}
	templateID := decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)

	env2 := newTestEnv(t)

	w = env2.doRequest("DELETE", "/api/templates/"+templateID, nil)
	if w.Code == 200 {
		t.Fatal("user2 should not be able to delete user1's template")
	}
}

func TestDietaryProfileCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/dietary-profiles", map[string]interface{}{
		"name":               "Vegan Profile",
		"allergens":          `["milk","eggs"]`,
		"dietaryTags":        `["vegan","glutenFree"]`,
		"nutrientThresholds": `[{"nutrient":"sodium","dailyMax":2000,"alertLevel":"warning"}]`,
		"isActive":           true,
	})
	if w.Code != 201 {
		t.Fatalf("POST dietary profile status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	data := m["data"].(map[string]interface{})
	profileID := data["id"].(string)

	w = env.doRequest("GET", "/api/dietary-profiles", nil)
	if w.Code != 200 {
		t.Fatalf("GET profiles status = %d", w.Code)
	}

	w = env.doRequest("GET", "/api/dietary-profiles/"+profileID, nil)
	if w.Code != 200 {
		t.Fatalf("GET profile status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/dietary-profiles/"+profileID, map[string]interface{}{
		"name": "Updated Profile",
	})
	if w.Code != 200 {
		t.Fatalf("PUT profile status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/dietary-profiles/"+profileID, nil)
	if w.Code != 200 {
		t.Fatalf("DELETE profile status = %d", w.Code)
	}
}

func TestAllergenRuleCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/dietary-profiles", map[string]interface{}{
		"name": "Test", "allergens": "[]", "dietaryTags": "[]", "nutrientThresholds": "[]", "isActive": true,
	})
	profileID := decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("POST", "/api/dietary-profiles/"+profileID+"/allergen-rules", map[string]interface{}{
		"allergen":       "milk",
		"severity":       "avoid",
		"customKeywords": `["dairy","lactose"]`,
	})
	if w.Code != 201 {
		t.Fatalf("POST allergen rule status = %d, body = %s", w.Code, w.Body.String())
	}
	ruleID := decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/dietary-profiles/"+profileID+"/allergen-rules", nil)
	if w.Code != 200 {
		t.Fatalf("GET allergen rules status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/allergen-rules/"+ruleID, map[string]interface{}{
		"severity": "caution",
	})
	if w.Code != 200 {
		t.Fatalf("PUT allergen rule status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/allergen-rules/"+ruleID, nil)
	if w.Code != 200 {
		t.Fatalf("DELETE allergen rule status = %d", w.Code)
	}
}

func TestBrandKitCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/brand-kits", map[string]interface{}{
		"name":           "My Brand",
		"primaryColor":   "#FF0000",
		"secondaryColor": "#00FF00",
		"fontFamily":     "serif",
	})
	if w.Code != 201 {
		t.Fatalf("POST brand kit status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	data := m["data"].(map[string]interface{})
	kitID := data["id"].(string)

	w = env.doRequest("GET", "/api/brand-kits", nil)
	if w.Code != 200 {
		t.Fatalf("GET brand kits status = %d", w.Code)
	}

	w = env.doRequest("GET", "/api/brand-kits/"+kitID, nil)
	if w.Code != 200 {
		t.Fatalf("GET brand kit status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/brand-kits/"+kitID, map[string]interface{}{
		"name": "Updated Brand",
	})
	if w.Code != 200 {
		t.Fatalf("PUT brand kit status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/brand-kits/"+kitID, nil)
	if w.Code != 200 {
		t.Fatalf("DELETE brand kit status = %d", w.Code)
	}
}

func TestPantryStaplesCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("GET", "/api/pantry-staples", nil)
	if w.Code != 200 {
		t.Fatalf("GET staples status = %d", w.Code)
	}

	w = env.doRequest("POST", "/api/pantry-staples", map[string]string{"name": "Flour"})
	if w.Code != 201 {
		t.Fatalf("POST staple status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("POST", "/api/pantry-staples", map[string]string{"name": "Sugar"})
	if w.Code != 201 {
		t.Fatalf("POST staple status = %d", w.Code)
	}

	w = env.doRequest("GET", "/api/pantry-staples", nil)
	if w.Code != 200 {
		t.Fatalf("GET staples status = %d", w.Code)
	}
	m := decodeJSON(t, w)
	data := m["data"].([]interface{})
	if len(data) != 2 {
		t.Fatalf("expected 2 staples, got %d", len(data))
	}

	w = env.doRequest("DELETE", "/api/pantry-staples", map[string]string{"name": "Flour"})
	if w.Code != 200 {
		t.Fatalf("DELETE staple status = %d, w.Body = %s", w.Code, w.Body.String())
	}
}

func TestUserLocationCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("GET", "/api/settings/location", nil)
	if w.Code != 200 {
		t.Fatalf("GET location status = %d", w.Code)
	}
	m := decodeJSON(t, w)
	if m["data"] != nil {
		t.Fatal("expected nil location initially")
	}

	w = env.doRequest("PUT", "/api/settings/location", map[string]string{"country": "US", "region": "California"})
	if w.Code != 200 {
		t.Fatalf("PUT location status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	data := m["data"].(map[string]interface{})
	if data["country"] != "US" {
		t.Fatalf("country mismatch: %v", data["country"])
	}

	w = env.doRequest("GET", "/api/settings/location", nil)
	if w.Code != 200 {
		t.Fatalf("GET location after update status = %d", w.Code)
	}
	m = decodeJSON(t, w)
	data = m["data"].(map[string]interface{})
	if data["country"] != "US" {
		t.Fatalf("country mismatch after re-read: %v", data["country"])
	}
}

func TestSecretsCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/secrets", map[string]string{
		"keyName": "fda-api-key",
		"value":   "my-secret-key-123",
	})
	if w.Code != 201 {
		t.Fatalf("POST secret status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	secretID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/secrets", nil)
	if w.Code != 200 {
		t.Fatalf("GET secrets status = %d", w.Code)
	}
	m = decodeJSON(t, w)
	data := m["data"].([]interface{})
	if len(data) != 1 {
		t.Fatalf("expected 1 secret, got %d", len(data))
	}
	listed := data[0].(map[string]interface{})
	if listed["keyName"] != "fda-api-key" {
		t.Fatalf("keyName mismatch: %v", listed["keyName"])
	}
	if _, hasValue := listed["value"]; hasValue {
		t.Fatal("list should not include value")
	}

	w = env.doRequest("GET", "/api/secrets/"+secretID, nil)
	if w.Code != 200 {
		t.Fatalf("GET secret status = %d", w.Code)
	}
	m = decodeJSON(t, w)
	secret := m["data"].(map[string]interface{})
	if secret["value"] != "my-secret-key-123" {
		t.Fatalf("decrypted value mismatch: %v", secret["value"])
	}

	w = env.doRequest("DELETE", "/api/secrets/"+secretID, nil)
	if w.Code != 200 {
		t.Fatalf("DELETE secret status = %d", w.Code)
	}
}

func TestSecretsOwnership(t *testing.T) {
	env := newTestEnv(t)

	env.doRequest("POST", "/api/secrets", map[string]string{"keyName": "test-key", "value": "secret"})

	env2 := newTestEnv(t)
	w := env2.doRequest("GET", "/api/secrets", nil)
	m := decodeJSON(t, w)
	data := m["data"].([]interface{})
	if len(data) != 0 {
		t.Fatal("user2 should not see user1's secrets")
	}
}

func TestDietaryProfileOwnership(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/dietary-profiles", map[string]interface{}{
		"name": "Private", "allergens": "[]", "dietaryTags": "[]", "nutrientThresholds": "[]", "isActive": true,
	})
	profileID := decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)

	env2 := newTestEnv(t)
	w = env2.doRequest("GET", "/api/dietary-profiles/"+profileID, nil)
	if w.Code == 200 {
		t.Fatal("user2 should not see user1's dietary profile")
	}

	w = env2.doRequest("DELETE", "/api/dietary-profiles/"+profileID, nil)
	if w.Code == 200 {
		t.Fatal("user2 should not delete user1's dietary profile")
	}
}

func TestBrandKitOwnership(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/brand-kits", map[string]interface{}{
		"name": "My Kit", "primaryColor": "#000", "secondaryColor": "#333", "fontFamily": "sans",
	})
	kitID := decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)

	env2 := newTestEnv(t)
	w = env2.doRequest("GET", "/api/brand-kits/"+kitID, nil)
	if w.Code == 200 {
		t.Fatal("user2 should not see user1's brand kit")
	}

	w = env2.doRequest("DELETE", "/api/brand-kits/"+kitID, nil)
	if w.Code == 200 {
		t.Fatal("user2 should not delete user1's brand kit")
	}
}

func TestSeasonalFoodsEndpoint(t *testing.T) {
	env := newTestEnv(t)

	foods := `["apples","carrots"]`
	if err := env.store.SetSeasonalFoods("US", "California", 1, foods); err != nil {
		t.Fatalf("seed seasonal foods: %v", err)
	}

	w := env.doRequest("GET", "/api/settings/seasonal-foods?country=US&region=California&month=1", nil)
	if w.Code != 200 {
		t.Fatalf("GET seasonal foods status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	data := m["data"].([]interface{})
	if len(data) != 2 {
		t.Fatalf("expected 2 foods, got %d", len(data))
	}
}

func TestTemplateValidation(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/templates", map[string]interface{}{
		"name": "", "type": "recipe", "layout": "{}",
	})
	if w.Code != 400 {
		t.Fatalf("expected 400 for empty name, got %d", w.Code)
	}

	w = env.doRequest("POST", "/api/templates", map[string]interface{}{
		"name": "Test", "type": "invalid", "layout": "{}",
	})
	if w.Code != 400 {
		t.Fatalf("expected 400 for invalid type, got %d", w.Code)
	}
}

func TestLocationValidation(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("PUT", "/api/settings/location", map[string]string{"country": "", "region": ""})
	if w.Code != 400 {
		t.Fatalf("expected 400 for empty location, got %d", w.Code)
	}
}

func TestSecretValidation(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/secrets", map[string]string{"keyName": "", "value": "test"})
	if w.Code != 400 {
		t.Fatalf("expected 400 for empty keyName, got %d", w.Code)
	}
}

func doJSONRequest(env *testEnv, method, path string, body interface{}) *httptest.ResponseRecorder {
	var bodyReader *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
		req := httptest.NewRequest(method, path, bodyReader)
		req.Header.Set("Authorization", "Bearer "+env.token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		env.server.Routes().ServeHTTP(w, req)
		return w
	}
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Authorization", "Bearer "+env.token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	return w
}
