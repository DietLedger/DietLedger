package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func httpsCookieRequest(env *testEnv, path, cookieHeader string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "https://app.example.test"+path, nil)
	req.Header.Set("Origin", "https://app.example.test")
	req.Header.Set("X-CSRF-Token", "dietledger")
	req.Header.Set("Cookie", cookieHeader)
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	return w
}

func cookieIntegrityUsers(t *testing.T) (*testEnv, *AuthResponse, *AuthResponse) {
	t.Helper()
	env := securityServer(t)
	env.server.corsOrigin = "https://app.example.test"
	victim, err := env.auth.Register("victim@example.test", "Password123", "Victim", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	attacker, err := env.auth.Register("attacker@example.test", "Password123", "Attacker")
	if err != nil {
		t.Fatal(err)
	}
	return env, victim, attacker
}

func TestSecurityHTTPSRejectsLegacyCookieAsFreshPrincipal(t *testing.T) {
	env, _, attacker := cookieIntegrityUsers(t)
	w := httpsCookieRequest(env, "/api/auth/refresh", "dietledger_refresh="+attacker.RefreshToken)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("legacy cookie accepted for HTTPS refresh: status=%d", w.Code)
	}
	// Rejecting browser transport must not revoke an unrelated valid session.
	if _, err := env.auth.ValidateAccessToken(attacker.AccessToken); err != nil {
		t.Fatal("legacy rejection revoked unrelated session")
	}
}

func TestSecurityHTTPSRejectsDuplicateSelectedCookies(t *testing.T) {
	env, victim, attacker := cookieIntegrityUsers(t)
	w := httpsCookieRequest(env, "/api/auth/refresh", "__Host-dietledger_refresh="+attacker.RefreshToken+"; dietledger_refresh="+attacker.RefreshToken+"; __Host-dietledger_refresh="+victim.RefreshToken)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("duplicate HTTPS cookies accepted: status=%d", w.Code)
	}
	if _, err := env.auth.ValidateAccessToken(victim.AccessToken); err != nil {
		t.Fatal("ambiguous cookie transport revoked victim")
	}
	if _, err := env.auth.ValidateAccessToken(attacker.AccessToken); err != nil {
		t.Fatal("ambiguous cookie transport revoked other session")
	}
}

func TestSecurityHTTPSPrefixWinsOverInjectedLegacyCookie(t *testing.T) {
	env, victim, attacker := cookieIntegrityUsers(t)
	// Browser order for a longer-path parent-Domain legacy cookie before the
	// genuine root-path host cookie; Go's Cookie header carries no Domain/Path.
	w := httpsCookieRequest(env, "/api/auth/refresh", "dietledger_refresh="+attacker.RefreshToken+"; __Host-dietledger_refresh="+victim.RefreshToken)
	if w.Code != http.StatusOK {
		t.Fatalf("genuine HTTPS cookie rejected: status=%d", w.Code)
	}
	data := decodeJSON(t, w)
	user := data["user"].(map[string]interface{})
	if user["id"] != victim.User.ID {
		t.Fatal("injected legacy cookie selected the attacker's principal")
	}
	var genuine *http.Cookie
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == "__Host-dietledger_refresh" && cookie.MaxAge >= 0 {
			genuine = cookie
		}
	}
	if genuine == nil || !genuine.Secure || !genuine.HttpOnly || genuine.Path != "/" || genuine.Domain != "" || genuine.SameSite != http.SameSiteStrictMode {
		t.Fatal("HTTPS refresh lacks __Host cookie guarantees")
	}
}

func TestSecurityLoopbackUsesSeparateDevelopmentCookie(t *testing.T) {
	env := securityServer(t)
	w := authRequest(env, "/api/auth/register", map[string]string{"email": "local@example.test", "password": "Password123", "displayName": "Local", "setupClaim": securityClaim}, nil, "")
	if w.Code != http.StatusCreated {
		t.Fatalf("local registration=%d", w.Code)
	}
	var local *http.Cookie
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == "dietledger_refresh_loopback" && cookie.MaxAge >= 0 {
			local = cookie
		}
	}
	if local == nil || local.Secure || !local.HttpOnly || local.Domain != "" || local.Path != "/api/auth" {
		t.Fatal("explicit loopback did not use separate development cookie")
	}
	env.server.corsOrigin = "https://app.example.test"
	denied := httpsCookieRequest(env, "/api/auth/refresh", "dietledger_refresh_loopback="+local.Value)
	if denied.Code != http.StatusUnauthorized {
		t.Fatal("HTTPS accepted development cookie fallback")
	}
}
