package main

import (
	"database/sql"
	"net/url"
	"os"
	"testing"
)

// This database is exclusive to this test process. No application URL fallback.
func TestControlledRolesMigrationAndRuntime(t *testing.T) {
	t.Setenv("SETUP_CLAIM_SECRET", securityClaim)
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL required")
	}
	admin, err := sql.Open("pgx", raw)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	if _, err := admin.Exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public`); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP OWNED BY dietledger_api, dietledger_migrate; DROP ROLE dietledger_api, dietledger_migrate`)
	const migratePassword = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	const apiPassword = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
	if err := ProvisionDatabaseRoles(admin, migratePassword, apiPassword); err != nil {
		t.Fatal(err)
	}
	// Reruns must preserve both role passwords, not silently rekey initialized data.
	if err := ProvisionDatabaseRoles(admin, migratePassword, apiPassword); err != nil {
		t.Fatal(err)
	}
	connect := func(user, password string) *sql.DB {
		u, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		u.User = url.UserPassword(user, password)
		db, err := sql.Open("pgx", u.String())
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Close() })
		return db
	}
	migrationDB := connect("dietledger_migrate", migratePassword)
	if err := RunMigrations(migrationDB, migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	if err := GrantRuntimePrivileges(migrationDB); err != nil {
		t.Fatal(err)
	}
	runtime := connect("dietledger_api", apiPassword)
	if err := VerifyRuntimeRole(runtime); err != nil {
		t.Fatal(err)
	}
	if err := VerifyMigrations(runtime, migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		`CREATE TABLE public.forbidden(id int)`, `CREATE SCHEMA forbidden`, `CREATE ROLE forbidden`,
		`ALTER TABLE public.users ADD COLUMN forbidden int`, `UPDATE schema_migrations SET version=999`,
		`SET ROLE dietledger_migrate`,
	} {
		if _, err := runtime.Exec(query); err == nil {
			t.Fatalf("runtime allowed forbidden operation: %s", query)
		}
	}
	store := &PostgresStore{db: runtime}
	user, err := store.CreateUser("role@example.test", "test-password-123", "Runtime", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetUserByID(user.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.ResetUserData(); err != nil {
		t.Fatal(err)
	}
	if err := VerifyRuntimeRole(admin); err == nil {
		t.Fatal("administrative role accepted as API runtime")
	}
	if err := VerifyRuntimeRole(migrationDB); err == nil {
		t.Fatal("migration owner accepted as API runtime")
	}
}
