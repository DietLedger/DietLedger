package main

import (
	"os"
	"testing"
)

func TestNewAuthServiceHMAC(t *testing.T) {
	os.Unsetenv("HMAC_SECRET")
	auth, err := NewAuthService(nil, "")
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}
	if auth == nil {
		t.Fatal("expected non-nil AuthService")
	}
}

func TestNewAuthServiceWithHMACSecret(t *testing.T) {
	os.Setenv("HMAC_SECRET", "test-secret-that-is-long-enough-for-aes256")
	defer os.Unsetenv("HMAC_SECRET")

	auth, err := NewAuthService(nil, "")
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}
	key := auth.SecretKey()
	if len(key) != 32 {
		t.Fatalf("SecretKey len = %d, want 32", len(key))
	}
}

func TestNewAuthServiceInvalidKeyPath(t *testing.T) {
	_, err := NewAuthService(nil, "/nonexistent/key.pem")
	if err == nil {
		t.Fatal("expected error for invalid key path")
	}
}

func TestTokenRoundTrip(t *testing.T) {
	os.Unsetenv("HMAC_SECRET")
	auth, _ := NewAuthService(nil, "")

	user := &User{ID: "user-123", Email: "test@example.com"}
	resp, err := auth.generateTokens(user)
	if err != nil {
		t.Fatalf("generateTokens: %v", err)
	}

	if resp.AccessToken == "" {
		t.Fatal("expected non-empty access token")
	}
	if resp.RefreshToken == "" {
		t.Fatal("expected non-empty refresh token")
	}
	if resp.ExpiresIn == 0 {
		t.Fatal("expected non-zero ExpiresIn")
	}

	userID, err := auth.ValidateAccessToken(resp.AccessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken: %v", err)
	}
	if userID != "user-123" {
		t.Fatalf("userID = %q, want %q", userID, "user-123")
	}
}

func TestValidateAccessTokenRejectsRefreshToken(t *testing.T) {
	os.Unsetenv("HMAC_SECRET")
	auth, _ := NewAuthService(nil, "")

	user := &User{ID: "user-123", Email: "test@example.com"}
	resp, _ := auth.generateTokens(user)

	_, err := auth.ValidateAccessToken(resp.RefreshToken)
	if err == nil {
		t.Fatal("expected error when validating refresh token as access token")
	}
}

func TestValidateAccessTokenRejectsGarbage(t *testing.T) {
	os.Unsetenv("HMAC_SECRET")
	auth, _ := NewAuthService(nil, "")

	_, err := auth.ValidateAccessToken("garbage-token")
	if err == nil {
		t.Fatal("expected error for garbage token")
	}
}

func TestSecretKeyPadding(t *testing.T) {
	os.Setenv("HMAC_SECRET", "short")
	defer os.Unsetenv("HMAC_SECRET")

	auth, _ := NewAuthService(nil, "")
	key := auth.SecretKey()
	if len(key) != 32 {
		t.Fatalf("SecretKey len = %d, want 32 (padded)", len(key))
	}
}
