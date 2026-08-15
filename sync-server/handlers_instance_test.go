package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// These tests cover the instance-metadata endpoints that drive first-run
// routing and the registration gate, plus the registration-disabled behavior
// of the public /api/auth/register endpoint. They follow the same
// testStore/testEnv integration pattern as the rest of the package and require
// TEST_DATABASE_URL (each test drops and re-creates the public schema).
//
// Contract source: plans/onboarding-wizard.md
//   - GET  /api/instance/state                 — public
//   - POST /api/instance/onboarding/complete    — admin-only
//   - PUT/PATCH /api/instance/registration      — admin-only
//   - Registration guard: allow when userCount==0 (first admin) OR
//     registration_enabled; otherwise 403 "registration is disabled".

// newBareServer builds a test env with an empty store (no users registered),
// for first-run / registration-carve-out tests. It does NOT set a token.
func newBareServer(t *testing.T) *testEnv {
	t.Helper()
	store := testStore(t)
	auth, err := NewAuthService(store, "")
	if err != nil {
		t.Fatalf("new auth: %v", err)
	}
	server := NewServer(store, auth, "*", 10, NewRateLimiter())
	return &testEnv{store: store, auth: auth, server: server}
}

// requestWith performs a request carrying the given bearer token (empty token
// => no Authorization header). It exists so these tests can exercise multiple
// identities (admin vs non-admin) without modifying the shared helpers.
func (e *testEnv) requestWith(t *testing.T, token, method, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var buf *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		buf = bytes.NewReader(b)
	}
	var req *http.Request
	if buf != nil {
		req = httptest.NewRequest(method, path, buf)
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	e.server.Routes().ServeHTTP(w, req)
	return w
}

// nonAdminToken registers a second (non-admin) user in env and returns its
// access token. The first user created by newTestEnv is the instance admin.
func (e *testEnv) nonAdminToken(t *testing.T) string {
	t.Helper()
	resp, err := e.auth.Register("nonadmin@example.com", "Password123", "Non Admin")
	if err != nil {
		t.Fatalf("register non-admin user: %v", err)
	}
	return resp.AccessToken
}

func instanceData(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	m := decodeJSON(t, w)
	data, ok := m["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected data object in response, got: %v (body=%s)", m["data"], w.Body.String())
	}
	return data
}

// ── Public instance state read ───────────────────────────────────────

func TestInstanceStatePublicRead(t *testing.T) {
	env := newBareServer(t)

	// Public: no Authorization header.
	w := env.requestWith(t, "", "GET", "/api/instance/state", nil)
	if w.Code != 200 {
		t.Fatalf("GET state status = %d, body = %s", w.Code, w.Body.String())
	}
	data := instanceData(t, w)
	// A freshly-migrated instance allows registration and is not onboarded.
	if data["registrationEnabled"] != true {
		t.Fatalf("registrationEnabled = %v, want true on a fresh instance", data["registrationEnabled"])
	}
	if data["onboardingComplete"] != false {
		t.Fatalf("onboardingComplete = %v, want false on a fresh instance", data["onboardingComplete"])
	}
	if _, ok := data["hasUsers"]; !ok {
		t.Fatalf("response missing hasUsers field: %v", data)
	}
}

// ── Registration-disabled behavior (/api/auth/register) ──────────────

func TestRegisterBlockedWhenDisabled(t *testing.T) {
	env := newTestEnv(t) // creates the first (admin) user

	if err := env.store.SetRegistrationEnabled(false); err != nil {
		t.Fatalf("disable registration: %v", err)
	}

	w := env.doRequestNoAuth("POST", "/api/auth/register", RegisterRequest{
		Email: "newuser@example.com", Password: "Password123", DisplayName: "New",
	})
	if w.Code != 403 {
		t.Fatalf("register status = %d, want 403 (registration disabled), body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	if !strings.Contains(strings.ToLower(getString(m, "error")), "disabled") {
		t.Fatalf("error = %v, want a 'disabled' message", m["error"])
	}
}

func TestRegisterFirstUserAllowedWhenDisabled(t *testing.T) {
	env := newBareServer(t) // no users yet

	// Even with registration closed, a fresh install must allow its first
	// admin account to be created via the setup wizard.
	if err := env.store.SetRegistrationEnabled(false); err != nil {
		t.Fatalf("disable registration: %v", err)
	}

	w := env.doRequestNoAuth("POST", "/api/auth/register", RegisterRequest{
		Email: "first@example.com", Password: "Password123", DisplayName: "First Admin",
	})
	if w.Code != 201 {
		t.Fatalf("first-user register status = %d, want 201, body = %s", w.Code, w.Body.String())
	}
	m := decodeJSON(t, w)
	if m["accessToken"] == nil {
		t.Fatal("expected accessToken for first user")
	}
}

func TestRegisterAllowedAgainAfterReenable(t *testing.T) {
	env := newTestEnv(t)

	if err := env.store.SetRegistrationEnabled(false); err != nil {
		t.Fatalf("disable registration: %v", err)
	}
	w := env.doRequestNoAuth("POST", "/api/auth/register", RegisterRequest{
		Email: "newuser@example.com", Password: "Password123", DisplayName: "New",
	})
	if w.Code != 403 {
		t.Fatalf("disabled register status = %d, want 403", w.Code)
	}

	if err := env.store.SetRegistrationEnabled(true); err != nil {
		t.Fatalf("re-enable registration: %v", err)
	}
	w = env.doRequestNoAuth("POST", "/api/auth/register", RegisterRequest{
		Email: "newuser@example.com", Password: "Password123", DisplayName: "New",
	})
	if w.Code != 201 {
		t.Fatalf("re-enabled register status = %d, want 201, body = %s", w.Code, w.Body.String())
	}
}

// ── Onboarding completion endpoint (/api/instance/onboarding/complete) ──

func TestCompleteOnboardingRequiresAuth(t *testing.T) {
	env := newTestEnv(t)
	w := env.requestWith(t, "", "POST", "/api/instance/onboarding/complete", nil)
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401 without auth", w.Code)
	}
}

func TestCompleteOnboardingRequiresAdmin(t *testing.T) {
	env := newTestEnv(t)
	w := env.requestWith(t, env.nonAdminToken(t), "POST", "/api/instance/onboarding/complete", nil)
	if w.Code != 403 {
		t.Fatalf("status = %d, want 403 for non-admin", w.Code)
	}
}

func TestCompleteOnboardingAdminSuccess(t *testing.T) {
	env := newTestEnv(t)

	w := env.doRequest("POST", "/api/instance/onboarding/complete", nil)
	if w.Code != 200 {
		t.Fatalf("complete status = %d, body = %s", w.Code, w.Body.String())
	}
	data := instanceData(t, w)
	if data["onboardingComplete"] != true {
		t.Fatalf("onboardingComplete = %v, want true after completion", data["onboardingComplete"])
	}
	if data["onboardingCompletedAt"] == nil {
		t.Fatal("onboardingCompletedAt should be set after completion")
	}

	// The completion must be observable through the public read path.
	w = env.requestWith(t, "", "GET", "/api/instance/state", nil)
	if w.Code != 200 {
		t.Fatalf("GET state status = %d", w.Code)
	}
	data = instanceData(t, w)
	if data["onboardingComplete"] != true {
		t.Fatalf("public state onboardingComplete = %v, want true", data["onboardingComplete"])
	}
}

func TestCompleteOnboardingMethodNotAllowed(t *testing.T) {
	env := newTestEnv(t)
	w := env.doRequest("GET", "/api/instance/onboarding/complete", nil)
	if w.Code != 405 {
		t.Fatalf("status = %d, want 405 for GET", w.Code)
	}
}

// ── Registration toggle endpoint (/api/instance/registration) ─────────
//
// This is the documented admin path that produces the registration-disabled
// state exercised above; it is owned here alongside the register behavior.

func TestRegistrationToggleRequiresAuth(t *testing.T) {
	env := newTestEnv(t)
	w := env.requestWith(t, "", "PUT", "/api/instance/registration", map[string]bool{"registrationEnabled": false})
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401 without auth", w.Code)
	}
}

func TestRegistrationToggleRequiresAdmin(t *testing.T) {
	env := newTestEnv(t)
	w := env.requestWith(t, env.nonAdminToken(t), "PUT", "/api/instance/registration", map[string]bool{"registrationEnabled": false})
	if w.Code != 403 {
		t.Fatalf("status = %d, want 403 for non-admin", w.Code)
	}
}

func TestRegistrationToggleAdminSuccess(t *testing.T) {
	env := newTestEnv(t)

	// Disable via the admin endpoint.
	w := env.doRequest("PUT", "/api/instance/registration", UpdateRegistrationRequest{RegistrationEnabled: false})
	if w.Code != 200 {
		t.Fatalf("PUT registration status = %d, body = %s", w.Code, w.Body.String())
	}
	data := instanceData(t, w)
	if data["registrationEnabled"] != false {
		t.Fatalf("registrationEnabled = %v, want false after disable", data["registrationEnabled"])
	}

	// Confirm it persisted on the public read path.
	w = env.requestWith(t, "", "GET", "/api/instance/state", nil)
	if w.Code != 200 {
		t.Fatalf("GET state status = %d", w.Code)
	}
	if instanceData(t, w)["registrationEnabled"] != false {
		t.Fatal("registrationEnabled did not persist on public read")
	}

	// Re-enable via the admin endpoint.
	w = env.doRequest("PATCH", "/api/instance/registration", UpdateRegistrationRequest{RegistrationEnabled: true})
	if w.Code != 200 {
		t.Fatalf("PATCH registration status = %d, body = %s", w.Code, w.Body.String())
	}
	if instanceData(t, w)["registrationEnabled"] != true {
		t.Fatal("registrationEnabled should be true after re-enable")
	}
}

// getString reads a string field from a decoded JSON map, tolerating nil.
func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
