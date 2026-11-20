package main

import "testing"

func TestResetDataFactoryDefaultsStaySeparate(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	resetExec(t, s, `INSERT INTO food_items(fdc_id,description,data_type) VALUES (991234,'preserved reference','Foundation')`)
	if err := s.FactoryReset(); err != nil {
		t.Fatal(err)
	}
	if resetCount(t, s, "users") != 0 || resetCount(t, s, "food_items") != 1 {
		t.Fatal("factory reset changed account/reference-data semantics")
	}
	if got := resetCount(t, s, "community_categories"); got != 10 {
		t.Fatalf("factory reset restored %d default categories, want 10", got)
	}
	if got := resetCount(t, s, "pantry_staples"); got == 0 {
		t.Fatal("factory reset lost its default staples")
	}
}

func TestResetDataCommunitySeedMigrationOnce(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	resetExec(t, s, `DELETE FROM community_categories`)
	resetExec(t, s, `DELETE FROM schema_migrations WHERE version=34`)
	if err := RunMigrations(s.db, migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	if got := resetCount(t, s, "community_categories"); got != 10 {
		t.Fatalf("fresh migration seeded %d community categories, want 10", got)
	}
	resetExec(t, s, `DELETE FROM community_categories`)
	if err := RunMigrations(s.db, migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	if got := resetCount(t, s, "community_categories"); got != 0 {
		t.Fatalf("migration rerun reseeded %d categories", got)
	}
}
