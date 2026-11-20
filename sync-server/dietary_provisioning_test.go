package main

import "testing"

func TestDietaryDefaultProvisionFailureRollsBackUserCreation(t *testing.T) {
	store := testStore(t).(*PostgresStore)
	_, err := store.DB().Exec(`
		CREATE FUNCTION reject_test_dietary_profile() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'test-only profile provisioning failure'; END;
		$$;
		CREATE TRIGGER reject_test_profile BEFORE INSERT ON dietary_profiles
		FOR EACH ROW EXECUTE FUNCTION reject_test_dietary_profile();
	`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateUser("rollback-profile@test.com", "Password123", "Rollback", securityClaim); err == nil {
		t.Fatal("expected provisioning failure to fail account creation")
	}
	user, err := store.GetUserByEmail("rollback-profile@test.com")
	if err != nil || user != nil {
		t.Fatalf("partial account survived profile provisioning failure: user=%+v err=%v", user, err)
	}
	if _, err := store.DB().Exec(`DROP TRIGGER reject_test_profile ON dietary_profiles`); err != nil {
		t.Fatal(err)
	}
	user, err = store.CreateUser("rollback-profile@test.com", "Password123", "Retry", securityClaim)
	if err != nil {
		t.Fatalf("retry after rollback failed: %v", err)
	}
	profiles, err := store.ListDietaryProfiles(user.ID)
	if err != nil || len(profiles) != 1 {
		t.Fatalf("retry starter profiles=%+v err=%v", profiles, err)
	}
}
