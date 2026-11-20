package main

import (
	"strings"
	"testing"
)

func TestValidateDeploymentSecrets(t *testing.T) {
	tests := []struct {
		name        string
		databaseURL string
		hmacSecret  string
		wantErr     bool
	}{
		{
			name:        "accepts URL-encoded strong database password and persistent HMAC",
			databaseURL: "postgres://dietledger:p%40ss%3Aword%2Fwith%25encoding@postgres:5432/dietledger?sslmode=disable",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
		},
		{
			name:        "accepts exact minimum credential lengths",
			databaseURL: "postgres://dietledger:1234567890abcdef@postgres:5432/dietledger",
			hmacSecret:  "12345678901234567890123456789012",
		},
		{
			name:        "rejects missing database URL",
			databaseURL: "",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
			wantErr:     true,
		},
		{
			name:        "rejects malformed database URL",
			databaseURL: "postgres://user:%zz@postgres/db",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
			wantErr:     true,
		},
		{
			name:        "rejects database URL without password",
			databaseURL: "postgres://dietledger@postgres:5432/dietledger",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
			wantErr:     true,
		},
		{
			name:        "rejects database password shorter than 16 characters",
			databaseURL: "postgres://dietledger:short@postgres:5432/dietledger",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
			wantErr:     true,
		},
		{
			name:        "rejects generic database password literal",
			databaseURL: "postgres://dietledger:postgres@postgres:5432/dietledger",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
			wantErr:     true,
		},
		{
			name:        "rejects .env.example database password placeholder",
			databaseURL: "postgres://dietledger:CHANGE_ME_TO_A_STRONG_PASSWORD@postgres:5432/dietledger",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
			wantErr:     true,
		},
		{
			name:        "rejects replace_me database password placeholder",
			databaseURL: "postgres://dietledger:replace_me_with_a_real_password@postgres:5432/dietledger",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
			wantErr:     true,
		},
		{
			name:        "rejects replacement-label database placeholder",
			databaseURL: "postgres://dietledger:REPLACE_WITH_GENERATED_PASSWORD@postgres:5432/dietledger",
			hmacSecret:  "stable-hmac-secret-with-more-than-32-characters",
			wantErr:     true,
		},
		{
			name:        "rejects replacement-label signing placeholder",
			databaseURL: "postgres://dietledger:strong-db-password-123@postgres:5432/dietledger",
			hmacSecret:  "REPLACE_WITH_GENERATED_SECRET_BEFORE_START",
			wantErr:     true,
		},
		{
			name:        "rejects missing HMAC secret",
			databaseURL: "postgres://dietledger:strong-db-password-123@postgres:5432/dietledger",
			hmacSecret:  "",
			wantErr:     true,
		},
		{
			name:        "rejects HMAC secret shorter than 32 characters",
			databaseURL: "postgres://dietledger:strong-db-password-123@postgres:5432/dietledger",
			hmacSecret:  "short-hmac-secret",
			wantErr:     true,
		},
		{
			name:        "rejects generic HMAC literal",
			databaseURL: "postgres://dietledger:strong-db-password-123@postgres:5432/dietledger",
			hmacSecret:  "passwordpasswordpasswordpassword",
			wantErr:     true,
		},
		{
			name:        "rejects .env.example HMAC placeholder",
			databaseURL: "postgres://dietledger:strong-db-password-123@postgres:5432/dietledger",
			hmacSecret:  "CHANGE_ME_TO_A_LONG_RANDOM_STRING",
			wantErr:     true,
		},
		{
			name:        "rejects replace_me HMAC placeholder",
			databaseURL: "postgres://dietledger:strong-db-password-123@postgres:5432/dietledger",
			hmacSecret:  "replace_me_with_a_persistent_hmac_secret",
			wantErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateDeploymentSecrets(tt.databaseURL, tt.hmacSecret)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateDeploymentSecrets() error = %v, wantErr %t", err, tt.wantErr)
			}
		})
	}
}

func TestValidateDeploymentSecretsErrorsDoNotExposeCredentials(t *testing.T) {
	const databasePassword = "sensitive-database-password-value"
	const hmacSecret = "sensitive-short-secret"
	err := validateDeploymentSecrets("postgres://dietledger:"+databasePassword+"@postgres:5432/dietledger", hmacSecret)
	if err == nil {
		t.Fatal("expected invalid HMAC error")
	}
	if strings.Contains(err.Error(), databasePassword) || strings.Contains(err.Error(), hmacSecret) || strings.Contains(err.Error(), "postgres://") {
		t.Fatalf("validation error leaked credential material: %q", err)
	}
}
