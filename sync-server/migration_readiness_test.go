package main

import (
	"strings"
	"testing"
)

func TestMigrationVersionMembershipRejectsEveryUnknownAppliedVersion(t *testing.T) {
	known := []Migration{{Version: 1}, {Version: 3}}
	cases := []struct {
		name    string
		applied map[int]bool
		wantErr bool
	}{
		{"empty fresh ledger", map[int]bool{}, false},
		{"legitimate older subset", map[int]bool{1: true}, false},
		{"current ledger", map[int]bool{1: true, 3: true}, false},
		{"future ledger with missing known step", map[int]bool{1: true, 999999: true}, true},
		{"unknown gap below maximum known", map[int]bool{1: true, 2: true, 3: true}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateAppliedMigrationVersions(known, tc.applied)
			if (err != nil) != tc.wantErr {
				t.Fatalf("unknown-version decision mismatch: %v", err)
			}
			if tc.wantErr && !strings.Contains(err.Error(), "downgrades are not supported") {
				t.Fatal("unknown version did not report downgrade refusal")
			}
		})
	}
}

func TestMigrationReadinessRejectsNewerSchema(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	if _, err := s.DB().Exec(`INSERT INTO schema_migrations(version) VALUES (999999)`); err != nil {
		t.Fatal(err)
	}
	if err := VerifyMigrations(s.DB(), migrationFS, "migrations"); err == nil {
		t.Fatal("downgraded API accepted a newer schema")
	}
}

func TestMigrationReadinessRejectsMissingAndAcceptsApplied(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	if err := VerifyMigrations(s.DB(), migrationFS, "migrations"); err != nil {
		t.Fatalf("fully migrated schema rejected: %v", err)
	}
	migrations, err := loadMigrations(migrationFS, "migrations")
	if err != nil || len(migrations) == 0 {
		t.Fatalf("load migrations: %v", err)
	}
	latest := migrations[len(migrations)-1].Version
	if _, err := s.DB().Exec(`DELETE FROM schema_migrations WHERE version=$1`, latest); err != nil {
		t.Fatal(err)
	}
	if err := VerifyMigrations(s.DB(), migrationFS, "migrations"); err == nil {
		t.Fatal("missing migration accepted")
	}
}
