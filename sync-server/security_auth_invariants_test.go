package main

import (
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// Hold the same lock the competing operations need, then wait until both
// transactions actually block at PostgreSQL. No sleep-based race assertion.
func membershipBarrier(t *testing.T, s *PostgresStore, run func(int) error) []error {
	t.Helper()
	tx, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := lockMembership(tx); err != nil {
		t.Fatal(err)
	}
	result := make([]error, 2)
	var wg sync.WaitGroup
	for i := range result {
		wg.Add(1)
		go func(i int) { defer wg.Done(); result[i] = run(i) }(i)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		var waiting int
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%instance_meta%FOR UPDATE%'`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting >= 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("competing membership operations did not reach barrier")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	wg.Wait()
	return result
}

func TestSecurityFirstAdminAtomicity(t *testing.T) {
	env := securityServer(t)
	store := env.store.(*PostgresStore)
	errs := membershipBarrier(t, store, func(i int) error {
		email := []string{"first-a@example.com", "first-b@example.com"}[i]
		_, err := env.auth.Register(email, "Password123", "First", securityClaim)
		return err
	})
	success := 0
	for _, err := range errs {
		if err == nil {
			success++
		} else if !errors.Is(err, ErrSetupClaim) {
			t.Fatalf("unexpected admission failure: %v", err)
		}
	}
	if success != 1 {
		t.Fatalf("created %d first users", success)
	}
	count, _ := store.AdminCount()
	if count != 1 {
		t.Fatalf("admins=%d", count)
	}
	var receipts int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM bootstrap_claim_consumptions`).Scan(&receipts); err != nil || receipts != 1 {
		t.Fatal("claim not consumed exactly once")
	}
}

func TestSecurityLastAdminInvariant(t *testing.T) {
	env := securityServer(t)
	first, err := env.auth.Register("first@example.com", "Password123", "First", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	second, err := env.auth.Register("second@example.com", "Password123", "Second")
	if err != nil {
		t.Fatal(err)
	}
	store := env.store.(*PostgresStore)
	if err := store.SetUserAdmin(second.User.ID, true); err != nil {
		t.Fatal(err)
	}
	errs := membershipBarrier(t, store, func(i int) error { return store.DeleteAccount([]string{first.User.ID, second.User.ID}[i]) })
	success := 0
	for _, err := range errs {
		if err == nil {
			success++
		} else if !errors.Is(err, ErrLastAdmin) {
			t.Fatal(err)
		}
	}
	if n, _ := store.AdminCount(); n != 1 || success != 1 {
		t.Fatal("concurrent account deletion removed final administrator")
	}
	users, _ := store.ListUsers()
	if err := store.SetUserAdmin(users[0].ID, false); !errors.Is(err, ErrLastAdmin) {
		t.Fatal("last admin demotion accepted")
	}
}

func TestSecuritySuccessorRollback(t *testing.T) {
	env := securityServer(t)
	a, err := env.auth.Register("first@example.com", "Password123", "First", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	b, err := env.auth.Register("second@example.com", "Password123", "Second")
	if err != nil {
		t.Fatal(err)
	}
	store := env.store.(*PostgresStore)
	_, err = store.db.Exec(`CREATE FUNCTION fail_account_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic deletion failure'; END $$; CREATE TRIGGER fail_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION fail_account_delete()`)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteAccount(a.User.ID, b.User.ID); err == nil {
		t.Fatal("expected deletion failure")
	}
	saved, err := store.GetUserByID(b.User.ID)
	if err != nil || saved.IsAdmin {
		t.Fatal("successor promotion escaped rollback")
	}
	if _, err := env.auth.ValidateAccessToken(a.AccessToken); err != nil {
		t.Fatal("failed deletion invalidated original session")
	}
}

func TestSecurityFactoryResetClaimRecovery(t *testing.T) {
	env := securityServer(t)
	a, err := env.auth.Register("first@example.com", "Password123", "First", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	if err := env.store.FactoryReset(); err != nil {
		t.Fatal(err)
	}
	if _, err := env.auth.ValidateAccessToken(a.AccessToken); err == nil {
		t.Fatal("factory reset retained access")
	}
	if _, err := env.auth.Register("next@example.com", "Password123", "Next", securityClaim); !errors.Is(err, ErrSetupClaim) {
		t.Fatal("old claim reopened setup")
	}
	nextClaim := "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd"
	t.Setenv("SETUP_CLAIM_SECRET", nextClaim)
	if _, err := env.auth.Register("next@example.com", "Password123", "Next", nextClaim); err != nil {
		t.Fatal(err)
	}
}

func TestSecurityRefreshReplayRevokesFamily(t *testing.T) {
	env := securityServer(t)
	a, err := env.auth.Register("first@example.com", "Password123", "First", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	b, err := env.auth.RefreshToken(a.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := env.auth.RefreshToken(a.RefreshToken); !errors.Is(err, ErrInvalidSession) {
		t.Fatal("reuse accepted")
	}
	if _, err := env.auth.ValidateAccessToken(b.AccessToken); err == nil {
		t.Fatal("reuse did not revoke family access")
	}
	if _, err := env.auth.RefreshToken(b.RefreshToken); err == nil {
		t.Fatal("reuse did not revoke next refresh")
	}
}

func TestSecurityConcurrentRefresh(t *testing.T) {
	env := securityServer(t)
	a, err := env.auth.Register("first@example.com", "Password123", "First", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	start := make(chan struct{})
	results := make([]*AuthResponse, 2)
	errs := make([]error, 2)
	for i := range results {
		wg.Add(1)
		go func(i int) { defer wg.Done(); <-start; results[i], errs[i] = env.auth.RefreshToken(a.RefreshToken) }(i)
	}
	close(start)
	wg.Wait()
	success := 0
	for i, err := range errs {
		if err == nil {
			success++
			if _, err := env.auth.ValidateAccessToken(results[i].AccessToken); err == nil {
				t.Fatal("replay family not revoked")
			}
		} else if !errors.Is(err, ErrInvalidSession) {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatalf("refresh successes=%d", success)
	}
}

func TestSecurityOriginAndLegacyCutover(t *testing.T) {
	env := securityServer(t)
	for _, origin := range []string{"", "http://evil.example", "https://app.example", "null", "http://localhost:3000.evil.example"} {
		req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("X-CSRF-Token", "dietledger")
		w := httptest.NewRecorder()
		env.server.Routes().ServeHTTP(w, req)
		if w.Code != 403 {
			t.Fatalf("accepted origin %q: %d", origin, w.Code)
		}
	}
	t.Setenv("AUTH_ALLOW_INSECURE_LOOPBACK", "false")
	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("X-CSRF-Token", "dietledger")
	w := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatal("implicit HTTP accepted")
	}
	a, err := env.auth.Register("first@example.com", "Password123", "First", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	store := env.store.(*PostgresStore)
	if _, err := store.db.Exec(`UPDATE users SET api_key='synthetic-retired-key' WHERE id=$1`, a.User.ID); err != nil {
		t.Fatal(err)
	}
	protected := env.requestWith(t, "synthetic-retired-key", "GET", "/api/settings", nil)
	if protected.Code != 401 {
		t.Fatal("plaintext legacy key accepted")
	}
	issued := env.requestWith(t, a.AccessToken, "POST", "/api/keys", map[string]string{"name": "test"})
	if issued.Code != 410 {
		t.Fatal("unsupported managed key issued")
	}
	t.Setenv("AUTH_ALLOW_INSECURE_LOOPBACK", "true")
	login := authRequest(env, "/api/auth/login", map[string]string{"email": "first@example.com", "password": "wrong"}, nil, "")
	missing := authRequest(env, "/api/auth/login", map[string]string{"email": "absent@example.com", "password": "wrong"}, nil, "")
	if login.Code != http.StatusUnauthorized || missing.Code != login.Code || login.Body.String() != missing.Body.String() {
		t.Fatal("credentials errors reveal account existence")
	}
}

func TestSecuritySessionExpiryAndDBFailure(t *testing.T) {
	env := securityServer(t)
	a, err := env.auth.Register("first@example.com", "Password123", "First", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	store := env.store.(*PostgresStore)
	if _, err := store.db.Exec(`UPDATE auth_sessions SET expires_at=NOW()-INTERVAL '1 second'`); err != nil {
		t.Fatal(err)
	}
	if _, err := env.auth.ValidateAccessToken(a.AccessToken); err == nil {
		t.Fatal("expired session accepted")
	}
	if _, err := store.db.Exec(`ALTER TABLE auth_sessions RENAME TO unavailable_auth_sessions`); err != nil {
		t.Fatal(err)
	}
	if _, err := env.auth.ValidateAccessToken(a.AccessToken); err == nil {
		t.Fatal("database error allowed access")
	}
	var null sql.NullString
	if err := store.db.QueryRow(`SELECT api_key FROM users WHERE id=$1`, a.User.ID).Scan(&null); err != nil || null.Valid {
		t.Fatal("legacy key still issued")
	}
}
