package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecurityHTTPSCookieAndOrigin(t *testing.T) {
	env := securityServer(t)
	env.server.corsOrigin = "https://dietledger.example"
	request := httptest.NewRequest("POST", "https://dietledger.example/api/auth/register", strings.NewReader(`{"email":"admin@example.com","password":"Password123","displayName":"Admin","setupClaim":"`+securityClaim+`"}`))
	request.Header.Set("Origin", "https://dietledger.example")
	request.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, request)
	if w.Code != http.StatusCreated {
		t.Fatalf("register status=%d", w.Code)
	}
	cookies := w.Result().Cookies()
	if len(cookies) < 1 || cookies[0].Name != refreshCookieName || !cookies[0].Secure || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode || cookies[0].Path != "/" || cookies[0].Domain != "" {
		t.Fatal("HTTPS refresh cookie attributes invalid")
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("auth response cacheable")
	}
	req := httptest.NewRequest("POST", "https://dietledger.example/api/auth/refresh", nil)
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("X-CSRF-Token", "dietledger")
	req.AddCookie(cookies[0])
	denied := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(denied, req)
	if denied.Code != http.StatusForbidden || denied.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("untrusted origin accepted or cached")
	}
}
