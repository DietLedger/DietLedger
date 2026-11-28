package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

func fixturePersonalKey(marker byte) string {
	return "dlpk1_" + base64.RawURLEncoding.EncodeToString([]byte(strings.Repeat(string(marker), 32)))
}

func personalKeyRequest(h http.Handler, method, path string, authorization ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "https://ledger.example.invalid:8443"+path, nil)
	for _, value := range authorization {
		r.Header.Add("Authorization", value)
	}
	// Even with a cookie present, a key request never enters cookie auth.
	r.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "synthetic-cookie"})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func assertPersonalKeyError(t *testing.T, w *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	var body struct {
		OK   bool   `json:"ok"`
		Code string `json:"code"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || w.Code != status || body.OK || body.Code != code {
		t.Fatalf("got status %d, error code %q, parse error %v; want %d %s", w.Code, body.Code, err, status, code)
	}
	if w.Header().Get("Cache-Control") != "no-store" || len(w.Header().Values("Set-Cookie")) != 0 {
		t.Fatal("key rejection was cacheable or touched cookies")
	}
	if status == 401 && w.Header().Get("WWW-Authenticate") != "Bearer" {
		t.Fatal("missing bearer challenge")
	}
}

func TestPersonalKeyDiscoveryRequiresKey(t *testing.T) {
	h := NewServer(nil, nil, "", 0, nil).Routes()
	for _, auth := range [][]string{nil, {"Bearer dlpk1_invalid"}, {"Bearer synthetic-legacy-key"}, {"Bearer session-fixture"}, {"Bearer " + fixturePersonalKey('a'), "Bearer session-fixture"}, {"Bearer session-fixture, Bearer " + fixturePersonalKey('a')}} {
		w := personalKeyRequest(h, "GET", "/api/auth/key", auth...)
		assertPersonalKeyError(t, w, 401, "key_invalid")
	}
}

func TestPersonalKeyDiscoveryPostgres(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	admin := createUser(t, s, "personal-admin")
	other := createUser(t, s, "personal-other")
	key := fixturePersonalKey('a')
	digest := sha256.Sum256([]byte(key))
	insert := `INSERT INTO personal_api_keys(id,user_id,name,scopes,secret_digest,created_at,expires_at) VALUES ($1,$2,'Fixture',$3,$4,NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 hour')`
	id := "b40d679e-4feb-4b02-a22c-de96477b3cda"
	if _, err := s.db.Exec(insert, id, admin.ID, `["diary:read","diary:write"]`, digest[:]); err != nil {
		t.Fatalf("seed personal key fixture: %v", err)
	}
	auth, err := NewAuthService(s, "")
	if err != nil {
		t.Fatal(err)
	}
	h := NewServer(s, auth, "", 0, nil).Routes()
	_, legacyKey, err := s.CreateAPIKey(admin.ID, "Legacy fixture", `{"recipes":["write"]}`)
	if err != nil {
		t.Fatal(err)
	}
	assertPersonalKeyError(t, personalKeyRequest(h, "GET", "/api/auth/key", "Bearer "+legacyKey), 401, "key_invalid")
	if legacy := personalKeyRequest(h, "GET", "/api/profiles", "Bearer "+legacyKey); legacy.Code != 401 {
		t.Fatalf("legacy managed key status %d, want 401", legacy.Code)
	}
	w := personalKeyRequest(h, "GET", "/api/auth/key", "Bearer "+key)
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" || len(w.Header().Values("Set-Cookie")) != 0 {
		t.Fatalf("unexpected discovery response: %d", w.Code)
	}
	body := decodeJSON(t, w)
	data := body["data"].(map[string]any)
	account := data["account"].(map[string]any)
	wantAccount := map[string]any{"id": admin.ID, "displayName": admin.DisplayName}
	if body["ok"] != true || data["contractVersion"] != float64(1) || len(data) != 3 || !reflect.DeepEqual(account, wantAccount) || strings.Contains(w.Body.String(), key) {
		t.Fatal("discovery did not return only the expected principal and capabilities")
	}
	info := data["key"].(map[string]any)
	if len(info) != 3 || info["id"] != id || !reflect.DeepEqual(info["scopes"], []any{"diary:read", "diary:write"}) {
		t.Fatal("unexpected key metadata")
	}
	if _, err := time.Parse(time.RFC3339Nano, info["expiresAt"].(string)); err != nil {
		t.Fatal("invalid expiry timestamp")
	}
	for _, tc := range []struct{ method, path string }{
		{"POST", "/api/auth/logout"}, {"POST", "/api/account/delete"}, {"GET", "/api/instance/users"}, {"GET", "/api/health"},
		{"GET", "/api/community"}, {"GET", "/api/profiles"}, {"OPTIONS", "/api/auth/key"}, {"HEAD", "/api/auth/key"},
		{"GET", "/api/auth/key/"}, {"GET", "/api/auth/%6bey"}, {"GET", "/api/auth/./key"}, {"GET", "/api/auth/key?extra=1"},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			assertPersonalKeyError(t, personalKeyRequest(h, tc.method, tc.path, "Bearer "+key), 403, "key_forbidden")
		})
	}
	for _, header := range [][]string{{"Bearer fake-session", "bearer " + key}, {"Bearer fake-session, Bearer " + key}} {
		assertPersonalKeyError(t, personalKeyRequest(h, "POST", "/api/auth/logout", header...), 401, "key_invalid")
	}
	assertPersonalKeyError(t, personalKeyRequest(h, "GET", "/api/auth/key", "Bearer "+fixturePersonalKey('b')), 401, "key_invalid")
	for _, mutation := range []string{
		`UPDATE personal_api_keys SET scopes='["admin"]'`,
		`UPDATE personal_api_keys SET scopes='["diary:read","diary:read"]'`,
		`UPDATE personal_api_keys SET scopes='["diary:read"]',expires_at=NOW()`,
		`DELETE FROM personal_api_keys`,
	} {
		if _, err := s.db.Exec(mutation); err != nil {
			t.Fatalf("update key fixture: %v", err)
		}
		assertPersonalKeyError(t, personalKeyRequest(h, "GET", "/api/auth/key", "Bearer "+key), 401, "key_invalid")
	}
	if _, err := s.db.Exec(insert, id, other.ID, `["profiles:read"]`, digest[:]); err != nil {
		t.Fatalf("seed account-delete fixture: %v", err)
	}
	if err := s.DeleteAccount(other.ID); err != nil {
		t.Fatal(err)
	}
	assertPersonalKeyError(t, personalKeyRequest(h, "GET", "/api/auth/key", "Bearer "+key), 401, "key_invalid")
	if _, err := s.db.Exec(`ALTER TABLE personal_api_keys RENAME TO unavailable_personal_api_keys`); err != nil {
		t.Fatal(err)
	}
	assertPersonalKeyError(t, personalKeyRequest(h, "GET", "/api/auth/key", "Bearer "+key), 503, "key_unavailable")
}
