package main

import "testing"

func TestDietaryProvisionMigrationVersionWriteFailureRollsBack(t *testing.T) {
	store := testStore(t).(*PostgresStore)
	user := createUser(t, store, "migration-atomic")
	if _, err := store.DB().Exec(`
		DELETE FROM dietary_profiles;
		DELETE FROM schema_migrations WHERE version=33;
		ALTER TABLE schema_migrations ADD CONSTRAINT reject_version_33 CHECK (version <> 33);
	`); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(store.DB(), migrationFS, "migrations"); err == nil {
		t.Fatal("expected injected migration version write failure")
	}
	profiles, err := store.ListDietaryProfiles(user.ID)
	if err != nil || len(profiles) != 0 {
		t.Fatalf("migration seed survived failed version write: profiles=%+v err=%v", profiles, err)
	}
	if _, err := store.DB().Exec(`ALTER TABLE schema_migrations DROP CONSTRAINT reject_version_33`); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(store.DB(), migrationFS, "migrations"); err != nil {
		t.Fatalf("retry migration: %v", err)
	}
	profiles, err = store.ListDietaryProfiles(user.ID)
	if err != nil || len(profiles) != 1 {
		t.Fatalf("retry migration created duplicate starters: profiles=%+v err=%v", profiles, err)
	}
	name := "Personalized after upgrade"
	if _, err := store.UpdateDietaryProfile(user.ID, profiles[0].ID, &UpdateDietaryProfileRequest{Name: &name}); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(store.DB(), migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	profiles, err = store.ListDietaryProfiles(user.ID)
	if err != nil || len(profiles) != 1 || profiles[0].Name != name {
		t.Fatalf("restart overwrote renamed starter: profiles=%+v err=%v", profiles, err)
	}
	if err := store.DeleteDietaryProfile(user.ID, profiles[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(store.DB(), migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	profiles, err = store.ListDietaryProfiles(user.ID)
	if err != nil || len(profiles) != 0 {
		t.Fatalf("restart recreated deleted starter: profiles=%+v err=%v", profiles, err)
	}
}
