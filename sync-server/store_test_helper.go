package main

import (
	"database/sql"
	"os"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const securityClaim = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func testStore(t *testing.T) Store {
	t.Helper()
	t.Setenv("HMAC_SECRET", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	t.Setenv("SETUP_CLAIM_SECRET", securityClaim)
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping test requiring PostgreSQL")
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if err := db.Ping(); err != nil {
		t.Fatalf("ping postgres: %v", err)
	}

	if _, err := db.Exec("DROP SCHEMA public CASCADE"); err != nil {
		t.Fatalf("drop schema: %v", err)
	}
	if _, err := db.Exec("CREATE SCHEMA public"); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	pgStore := &PostgresStore{db: db}

	if err := RunMigrations(db, migrationFS, "migrations"); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	if err := pgStore.SeedCategories(); err != nil {
		t.Fatalf("seed categories: %v", err)
	}

	return pgStore
}

func createUser(t *testing.T, s Store, suffix string) *User {
	t.Helper()
	claim := ""
	if n, _ := s.UserCount(); n == 0 {
		claim = securityClaim
	}
	u, err := s.CreateUser("user"+suffix+"@test.com", "password123", "User "+suffix, claim)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return u
}

func strPtr(s string) *string { return &s }
func intPtr(i int) *int       { return &i }
