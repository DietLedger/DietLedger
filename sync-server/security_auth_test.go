package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func securityServer(t *testing.T) *testEnv {
	t.Helper()
	t.Setenv("SETUP_CLAIM_SECRET", securityClaim)
	t.Setenv("AUTH_ALLOW_INSECURE_LOOPBACK", "true")
	env := newBareServer(t)
	env.server.corsOrigin = "http://localhost:3000"
	return env
}

func authRequest(env *testEnv, path string, body any, cookie *http.Cookie, csrf string) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "http://localhost:3000"+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://localhost:3000")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	if csrf != "" {
		req.Header.Set("X-CSRF-Token", csrf)
	}
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	return w
}

func TestSecuritySetupRequiresClaim(t *testing.T) {
	env := securityServer(t)
	w := authRequest(env, "/api/auth/register", map[string]string{"email": "first@example.com", "password": "Password123", "displayName": "First"}, nil, "")
	if w.Code != 403 {
		t.Fatalf("without claim status=%d, want 403", w.Code)
	}
	if n, _ := env.store.UserCount(); n != 0 {
		t.Fatal("unauthorized setup inserted account")
	}
}

func TestSecurityCookieRefreshAndLogout(t *testing.T) {
	env := securityServer(t)
	w := authRequest(env, "/api/auth/register", map[string]string{"email": "first@example.com", "password": "Password123", "displayName": "First", "setupClaim": securityClaim}, nil, "")
	if w.Code != 201 {
		t.Fatalf("register=%d %s", w.Code, w.Body.String())
	}
	data := decodeJSON(t, w)
	if data["refreshToken"] != nil {
		t.Fatal("refresh secret in JSON")
	}
	if data["expiresIn"] != float64(900) {
		t.Fatal("access TTL must be 15 minutes")
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing no-store")
	}
	cookies := w.Result().Cookies()
	if len(cookies) < 1 || cookies[0].Name != loopbackRefreshCookieName || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatal("missing hardened refresh cookie")
	}
	cookie := cookies[0]
	csrf, _ := data["csrfToken"].(string)
	if csrf == "" {
		t.Fatal("missing CSRF token")
	}
	bad := authRequest(env, "/api/auth/refresh", nil, cookie, "")
	if bad.Code != 403 {
		t.Fatalf("missing csrf accepted: %d", bad.Code)
	}
	good := authRequest(env, "/api/auth/refresh", nil, cookie, csrf)
	if good.Code != 200 {
		t.Fatalf("refresh=%d %s", good.Code, good.Body.String())
	}
	next := decodeJSON(t, good)
	out := authRequest(env, "/api/auth/logout", nil, good.Result().Cookies()[0], next["csrfToken"].(string))
	if out.Code != 200 {
		t.Fatalf("logout=%d", out.Code)
	}
	if _, err := env.auth.ValidateAccessToken(next["accessToken"].(string)); err == nil {
		t.Fatal("logout access still valid")
	}
	if _, err := env.auth.ValidateAccessToken(data["accessToken"].(string)); err == nil {
		t.Fatal("pre-refresh access still valid after logout")
	}
	replay := authRequest(env, "/api/auth/refresh", nil, cookie, csrf)
	if replay.Code != 401 {
		t.Fatal("refresh replay accepted")
	}
	if strings.Contains(good.Body.String(), cookie.Value) {
		t.Fatal("cookie secret leaked")
	}
}
