package main

import (
	"os"
	"testing"
)

func testStore(t *testing.T) Store {
	t.Helper()
	dbPath := os.Getenv("TEST_DB_PATH")
	if dbPath == "" {
		dbPath = ":memory:"
	}
	store, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	if err := store.InitDB(); err != nil {
		t.Fatalf("init db: %v", err)
	}
	return store
}

func createUser(t *testing.T, s Store, suffix string) *User {
	t.Helper()
	u, err := s.CreateUser("user"+suffix+"@test.com", "password123", "User "+suffix)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return u
}
