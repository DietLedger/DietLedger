package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestAuthRequiresPersistentSecret(t *testing.T) {
	for _, secret := range []string{"", "short", "replace-with-a-real-secret-before-starting"} {
		t.Setenv("HMAC_SECRET", secret)
		if _, err := NewAuthService(nil, ""); err == nil {
			t.Fatal("weak secret accepted")
		}
	}
}

func TestNewAuthServiceWithHMACSecret(t *testing.T) {
	t.Setenv("HMAC_SECRET", securityClaim)
	auth, err := NewAuthService(nil, "")
	if err != nil {
		t.Fatal(err)
	}
	if string(auth.SecretKey()) != securityClaim[:32] {
		t.Fatal("persistent encryption material changed")
	}
}

func TestNewAuthServiceInvalidKeyPath(t *testing.T) {
	t.Setenv("HMAC_SECRET", securityClaim)
	if _, err := NewAuthService(nil, "/nonexistent/key.pem"); err == nil {
		t.Fatal("invalid key path accepted")
	}
}

func TestAuthJWTAlgorithmAndClaims(t *testing.T) {
	t.Setenv("HMAC_SECRET", securityClaim)
	auth, _ := NewAuthService(nil, "")
	for _, method := range []jwt.SigningMethod{jwt.SigningMethodHS384, jwt.SigningMethodHS512} {
		raw, err := jwt.NewWithClaims(method, jwt.MapClaims{"sub": "test", "type": "access", "exp": time.Now().Add(time.Hour).Unix()}).SignedString(auth.hmacSecret)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := auth.parseToken(raw); err == nil {
			t.Fatal("wrong HMAC algorithm accepted")
		}
	}
	for _, claims := range []jwt.MapClaims{
		{"sub": "test", "type": "access"},
		{"sub": "test", "type": "access", "exp": time.Now().Add(-time.Hour).Unix()},
	} {
		raw, _ := auth.signToken(claims)
		if _, err := auth.parseToken(raw); err == nil {
			t.Fatal("missing/expired expiry accepted")
		}
	}
	raw, _ := auth.signToken(jwt.MapClaims{"sub": "test", "type": "access", "exp": time.Now().Add(time.Hour).Unix()})
	if _, err := auth.ValidateAccessToken(raw); err == nil {
		t.Fatal("legacy sid-less token accepted")
	}
	if _, err := auth.ValidateAccessToken("garbage"); err == nil {
		t.Fatal("garbage accepted")
	}
}

func TestAuthRSARoundTripAndWrongAlgorithm(t *testing.T) {
	t.Setenv("HMAC_SECRET", securityClaim)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "synthetic-signing.pem")
	if err := os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}), 0600); err != nil {
		t.Fatal(err)
	}
	auth, err := NewAuthService(nil, path)
	if err != nil {
		t.Fatal(err)
	}
	claims := jwt.MapClaims{"sub": "test", "type": "access", "exp": time.Now().Add(time.Hour).Unix()}
	raw, err := auth.signToken(claims)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.parseToken(raw); err != nil {
		t.Fatal(err)
	}
	raw, err = jwt.NewWithClaims(jwt.SigningMethodRS512, claims).SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.parseToken(raw); err == nil {
		t.Fatal("wrong RSA algorithm accepted")
	}
}
