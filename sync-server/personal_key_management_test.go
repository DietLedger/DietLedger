package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func managedKeyRequest(h http.Handler, method, path, bearer, origin, csrf string, body any) *httptest.ResponseRecorder {
	var raw []byte
	if body != nil {
		raw, _ = json.Marshal(body)
	}
	r := httptest.NewRequest(method, "https://ledger.example.invalid:8443"+path, bytes.NewReader(raw))
	if bearer != "" {
		r.Header.Set("Authorization", "Bearer "+bearer)
	}
	r.Header.Set("Origin", origin)
	r.Header.Set("X-CSRF-Token", csrf)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestPersonalKeyManagementHTTP(t *testing.T) {
	env := securityServer(t)
	const origin = "https://ledger.example.invalid:8443"
	env.server.corsOrigin = origin + ",http://localhost:3000"
	now := time.Now()
	env.server.rateLimiter = newRateLimiterWithClock(func() time.Time { return now }, 100, time.Minute)
	a, err := env.auth.Register("key-admin@example.invalid", "Password123", "Admin", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	b, err := env.auth.Register("key-person@example.invalid", "Password456", "Member")
	if err != nil {
		t.Fatal(err)
	}
	h := env.server.Routes()
	const path = "/api/personal-keys"
	body := map[string]any{"name": " Phone ", "scopes": []string{"diary:read"}, "password": "Password456"}
	request := func(method, path, token string, payload any) *httptest.ResponseRecorder {
		now = now.Add(11 * time.Second) // Allow an account issuance slot deterministically.
		return managedKeyRequest(h, method, path, token, origin, "dietledger", payload)
	}
	for _, tc := range []struct{ origin, csrf string }{{"", "dietledger"}, {"https://ledger.example.invalid", "dietledger"}, {"http://localhost:3000", "dietledger"}, {origin, ""}} {
		w := managedKeyRequest(h, "POST", path, b.AccessToken, tc.origin, tc.csrf, body)
		if w.Code != 403 {
			t.Fatalf("untrusted management request status=%d", w.Code)
		}
	}
	body["password"] = "incorrect"
	if w := request("POST", path, b.AccessToken, body); w.Code != 403 {
		t.Fatalf("wrong password status=%d", w.Code)
	}
	body["password"] = "Password456"
	for _, bad := range [][]string{nil, {"diary:read", "diary:read"}, {"admin"}, {"*"}} {
		body["scopes"] = bad
		if w := request("POST", path, b.AccessToken, body); w.Code != 400 {
			t.Fatalf("bad scopes status=%d", w.Code)
		}
	}
	body["scopes"] = []string{"diary:read"}
	w := request("POST", path, b.AccessToken, body)
	if w.Code != 201 || w.Header().Get("Cache-Control") != "no-store" || len(w.Header().Values("Set-Cookie")) != 0 {
		t.Fatalf("create status=%d", w.Code)
	}
	out := decodeJSON(t, w)["data"].(map[string]any)
	id, key := out["id"].(string), out["key"].(string)
	if out["name"] != "Phone" || !strings.HasPrefix(key, "dlpk1_") || len(key) != 49 {
		t.Fatal("invalid key response")
	}
	created, e1 := time.Parse(time.RFC3339Nano, out["createdAt"].(string))
	expires, e2 := time.Parse(time.RFC3339Nano, out["expiresAt"].(string))
	if e1 != nil || e2 != nil || expires.Sub(created) != 90*24*time.Hour {
		t.Fatal("incorrect expiry")
	}
	var digest []byte
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT secret_digest FROM personal_api_keys WHERE id=$1`, id).Scan(&digest); err != nil {
		t.Fatal(err)
	}
	wantDigest := sha256.Sum256([]byte(key))
	if !bytes.Equal(digest, wantDigest[:]) {
		t.Fatal("wrong digest persisted")
	}
	if w := request("GET", path, b.AccessToken, nil); w.Code != 200 || strings.Contains(w.Body.String(), key) || strings.Contains(w.Body.String(), "digest") || !strings.Contains(w.Body.String(), id) {
		t.Fatalf("owner list status=%d or incorrect metadata", w.Code)
	}
	if w := request("GET", path, a.AccessToken, nil); w.Code != 200 || strings.Contains(w.Body.String(), id) {
		t.Fatalf("foreign list status=%d or data exposure", w.Code)
	}
	if w := request("DELETE", path+"/"+id, a.AccessToken, nil); w.Code != 404 {
		t.Fatalf("foreign revoke status=%d", w.Code)
	}
	if w := request("GET", path, key, nil); w.Code != 403 {
		t.Fatalf("key management status=%d", w.Code)
	}
	if w := request("POST", "/api/keys", b.AccessToken, nil); w.Code != 410 {
		t.Fatalf("legacy issuance status=%d", w.Code)
	}
	if w := personalKeyRequest(h, "GET", "/api/auth/key", "Bearer "+key); w.Code != 200 {
		t.Fatalf("issued key not usable for discovery: %d", w.Code)
	}
	for i := 0; i < 9; i++ {
		body["name"] = fmt.Sprintf("fixture-%d", i)
		if w := request("POST", path, b.AccessToken, body); w.Code != 201 {
			t.Fatalf("create under cap status=%d", w.Code)
		}
	}
	if w := request("POST", path, b.AccessToken, body); w.Code != 409 {
		t.Fatalf("cap status=%d", w.Code)
	}
	if w := request("DELETE", path+"/"+id, b.AccessToken, nil); w.Code != 200 {
		t.Fatalf("owner revoke status=%d", w.Code)
	}
	assertPersonalKeyError(t, personalKeyRequest(h, "GET", "/api/auth/key", "Bearer "+key), http.StatusUnauthorized, "key_invalid")
	if w := request("POST", path, b.AccessToken, body); w.Code != 201 {
		t.Fatalf("create after revoke status=%d", w.Code)
	}
}
