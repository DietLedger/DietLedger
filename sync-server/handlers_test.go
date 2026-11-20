package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type testEnv struct {
	store  Store
	auth   *AuthService
	server *Server
	token  string
	userID string
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	store := testStore(t)
	auth, err := NewAuthService(store, "")
	if err != nil {
		t.Fatalf("new auth: %v", err)
	}
	rl := NewRateLimiter()
	server := NewServer(store, auth, "https://app.example", 10, rl)

	resp, err := auth.Register("test@example.com", "Password123", "Test User", securityClaim)
	if err != nil {
		t.Fatalf("register test user: %v", err)
	}

	return &testEnv{
		store:  store,
		auth:   auth,
		server: server,
		token:  resp.AccessToken,
		userID: resp.User.ID,
	}
}

func (e *testEnv) doRequest(method, path string, body interface{}) *httptest.ResponseRecorder {
	var bodyReader *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
		var req *http.Request
		req = httptest.NewRequest(method, path, bodyReader)
		req.Header.Set("Authorization", "Bearer "+e.token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		e.server.Routes().ServeHTTP(w, req)
		return w
	}
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Authorization", "Bearer "+e.token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	e.server.Routes().ServeHTTP(w, req)
	return w
}

func (e *testEnv) doRequestNoAuth(method, path string, body interface{}) *httptest.ResponseRecorder {
	var bodyReader *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(b)
		req := httptest.NewRequest(method, path, bodyReader)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://app.example")
		w := httptest.NewRecorder()
		e.server.Routes().ServeHTTP(w, req)
		return w
	}
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Origin", "https://app.example")
	w := httptest.NewRecorder()
	e.server.Routes().ServeHTTP(w, req)
	return w
}

func decodeJSON(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&m); err != nil {
		t.Fatalf("decode json: %v", err)
	}
	return m
}

func TestHealthEndpoint(t *testing.T) {
	env := newTestEnv(t)
	w := httptest.NewRequest("GET", "/api/health", nil)
	resp := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(resp, w)
	if resp.Code != 200 {
		t.Fatalf("status = %d", resp.Code)
	}
	m := decodeJSON(t, resp)
	if m["ok"] != true {
		t.Fatal("expected ok=true")
	}
}

func TestRegisterSuccess(t *testing.T) {
	env := newTestEnv(t)
	w := env.doRequestNoAuth("POST", "/api/auth/register", RegisterRequest{
		Email: "new@test.com", Password: "Password123", DisplayName: "New",
	})
	if w.Code != 201 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	if m["accessToken"] == nil {
		t.Fatal("expected accessToken")
	}
}

func TestRegisterDuplicateEmail(t *testing.T) {
	env := newTestEnv(t)
	w := env.doRequestNoAuth("POST", "/api/auth/register", RegisterRequest{
		Email: "test@example.com", Password: "Password123", DisplayName: "Dup",
	})
	if w.Code != 409 {
		t.Fatalf("status = %d, want 409", w.Code)
	}
	body := decodeJSON(t, w)
	if body["ok"] != false || body["error"] != "unable to register account" || len(body) != 2 {
		t.Fatal("registration conflict must use only the documented generic response")
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("registration conflict must not be cached")
	}
}

func TestRegisterInvalidEmail(t *testing.T) {
	env := newTestEnv(t)
	w := env.doRequestNoAuth("POST", "/api/auth/register", RegisterRequest{
		Email: "bad-email", Password: "Password123", DisplayName: "Test",
	})
	if w.Code != 400 {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestLoginSuccess(t *testing.T) {
	env := newTestEnv(t)
	w := env.doRequestNoAuth("POST", "/api/auth/login", LoginRequest{
		Email: "test@example.com", Password: "Password123",
	})
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	if m["accessToken"] == nil {
		t.Fatal("expected accessToken")
	}
}

func TestLoginWrongPassword(t *testing.T) {
	env := newTestEnv(t)
	w := env.doRequestNoAuth("POST", "/api/auth/login", LoginRequest{
		Email: "test@example.com", Password: "wrong",
	})
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestAuthRefresh(t *testing.T) {
	env := newTestEnv(t)
	loginResp, _ := env.auth.Login("test@example.com", "Password123")

	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("Origin", "https://app.example")
	req.Header.Set("X-CSRF-Token", "dietledger")
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: loginResp.RefreshToken})
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	if m["accessToken"] == nil {
		t.Fatal("expected accessToken")
	}
}

func TestAuthMiddlewareMissingToken(t *testing.T) {
	env := newTestEnv(t)
	req := httptest.NewRequest("GET", "/api/recipes", nil)
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestAuthMiddlewareInvalidToken(t *testing.T) {
	env := newTestEnv(t)
	req := httptest.NewRequest("GET", "/api/recipes", nil)
	req.Header.Set("Authorization", "Bearer invalid-token-here")
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestRecipeHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/recipes", map[string]interface{}{
		"name": "Test Recipe", "servings": 4, "servingName": "plate",
		"ingredients": []map[string]interface{}{
			{"fdcId": 100, "name": "Flour", "amount": 200, "unit": "g", "calories": 700},
		},
	})
	if w.Code != 201 {
		t.Fatalf("create: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	data := m["data"].(map[string]interface{})
	recipeID := data["id"].(string)
	if recipeID == "" {
		t.Fatal("expected recipe ID")
	}

	w = env.doRequest("GET", "/api/recipes", nil)
	if w.Code != 200 {
		t.Fatalf("list: status = %d", w.Code)
	}
	m = decodeJSON(t, w)
	if int(m["total"].(float64)) != 1 {
		t.Fatalf("total = %v, want 1", m["total"])
	}

	w = env.doRequest("GET", "/api/recipes/"+recipeID, nil)
	if w.Code != 200 {
		t.Fatalf("get: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/recipes/"+recipeID, map[string]interface{}{
		"name": "Updated Recipe", "servings": 2, "servingName": "bowl",
	})
	if w.Code != 200 {
		t.Fatalf("update: status = %d, body = %s", w.Code, w.Body.String())
	}
	m = decodeJSON(t, w)
	data = m["data"].(map[string]interface{})
	if data["name"] != "Updated Recipe" {
		t.Fatalf("name = %v", data["name"])
	}

	w = env.doRequest("DELETE", "/api/recipes/"+recipeID, nil)
	if w.Code != 200 {
		t.Fatalf("delete: status = %d", w.Code)
	}

	w = env.doRequest("GET", "/api/recipes/"+recipeID, nil)
	if w.Code != 404 {
		t.Fatalf("get deleted: status = %d, want 404", w.Code)
	}
}

func TestProfileHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "Alice", "sex": "female", "activityLevel": "moderate",
	})
	if w.Code != 201 {
		t.Fatalf("create: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	profileID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/profiles", nil)
	if w.Code != 200 {
		t.Fatalf("list: status = %d", w.Code)
	}

	w = env.doRequest("GET", "/api/profiles/"+profileID, nil)
	if w.Code != 200 {
		t.Fatalf("get: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/profiles/"+profileID, map[string]interface{}{
		"name": "Bob", "sex": "male", "activityLevel": "active",
	})
	if w.Code != 200 {
		t.Fatalf("update: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/profiles/"+profileID, nil)
	if w.Code != 200 {
		t.Fatalf("delete: status = %d", w.Code)
	}
}

func TestFoodLogHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	pw := env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "P", "sex": "female", "activityLevel": "moderate",
	})
	pm := decodeJSON(t, pw)
	profileID := pm["data"].(map[string]interface{})["id"].(string)

	w := env.doRequest("POST", "/api/profiles/"+profileID+"/log", map[string]interface{}{
		"date": "2025-01-15", "mealSlot": "morning", "sourceType": "customFood",
		"name": "Oatmeal", "servings": 1, "calories": 150,
	})
	if w.Code != 201 {
		t.Fatalf("create log: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	entryID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/profiles/"+profileID+"/log?date=2025-01-15", nil)
	if w.Code != 200 {
		t.Fatalf("list log: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/profiles/"+profileID+"/log/"+entryID, map[string]interface{}{
		"date": "2025-01-15", "mealSlot": "noon", "sourceType": "customFood",
		"name": "Oatmeal Updated", "servings": 2, "calories": 300,
	})
	if w.Code != 200 {
		t.Fatalf("update log: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/profiles/"+profileID+"/log/"+entryID, nil)
	if w.Code != 200 {
		t.Fatalf("delete log: status = %d", w.Code)
	}
}

func TestWeightHandlerCRUD(t *testing.T) {
	env := newTestEnv(t)

	pw := env.doRequest("POST", "/api/profiles", map[string]interface{}{
		"name": "P", "sex": "female", "activityLevel": "moderate",
	})
	pm := decodeJSON(t, pw)
	profileID := pm["data"].(map[string]interface{})["id"].(string)

	w := env.doRequest("POST", "/api/profiles/"+profileID+"/weight", map[string]interface{}{
		"date": "2025-01-15", "weightKg": 70.5,
	})
	if w.Code != 201 {
		t.Fatalf("create weight: status = %d, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	entryID := m["data"].(map[string]interface{})["id"].(string)

	w = env.doRequest("GET", "/api/profiles/"+profileID+"/weight?from=2025-01-01&to=2025-01-31", nil)
	if w.Code != 200 {
		t.Fatalf("list weights: status = %d", w.Code)
	}

	w = env.doRequest("PUT", "/api/profiles/"+profileID+"/weight/"+entryID, map[string]interface{}{
		"date": "2025-01-15", "weightKg": 69.8,
	})
	if w.Code != 200 {
		t.Fatalf("update weight: status = %d, body = %s", w.Code, w.Body.String())
	}

	w = env.doRequest("DELETE", "/api/profiles/"+profileID+"/weight/"+entryID, nil)
	if w.Code != 200 {
		t.Fatalf("delete weight: status = %d", w.Code)
	}
}

func TestRateLimiter(t *testing.T) {
	env := newTestEnv(t)
	for i := 0; i < 250; i++ {
		w := env.doRequest("GET", "/api/recipes", nil)
		if w.Code == 429 {
			return
		}
	}
	t.Fatal("expected 429 rate limit after many requests")
}
