package main

import (
	"encoding/json"
	"net/http"
	"reflect"
	"sync"
	"testing"
)

const starterRestorePath = "/api/dietary-profiles/diabetes-aware-starter"

func TestDietaryStarterRestoreAfterResetIsExplicitConcurrentAndEditable(t *testing.T) {
	env := newTestEnv(t)
	original, err := env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(original) != 1 {
		t.Fatalf("original profiles=%+v err=%v", original, err)
	}
	if err := env.store.ResetUserData(); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		response := env.doRequest(http.MethodGet, "/api/dietary-profiles", nil)
		if response.Code != http.StatusOK || len(decodeJSON(t, response)["data"].([]interface{})) != 0 {
			t.Fatalf("profile read reseeded after reset: status=%d body=%s", response.Code, response.Body.String())
		}
	}
	if response := env.doRequestNoAuth(http.MethodPost, starterRestorePath, nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated restore status=%d", response.Code)
	}
	if response := env.doRequest(http.MethodGet, starterRestorePath, nil); response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("restore GET status=%d want 405", response.Code)
	}

	// Separate requests model double clicks, response-loss retries and two tabs.
	const requests = 8
	var wg sync.WaitGroup
	ids := make(chan string, requests)
	for i := 0; i < requests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			response := env.doRequest(http.MethodPost, starterRestorePath, nil)
			if response.Code != http.StatusOK {
				t.Errorf("restore status=%d body=%s", response.Code, response.Body.String())
				return
			}
			var body struct {
				Data DietaryProfile `json:"data"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Error(err)
				return
			}
			ids <- body.Data.ID
		}()
	}
	wg.Wait()
	close(ids)
	profiles, err := env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 1 {
		t.Fatalf("restored profiles=%+v err=%v; want exactly one", profiles, err)
	}
	for id := range ids {
		if id != profiles[0].ID {
			t.Errorf("restore returned %q want %q", id, profiles[0].ID)
		}
	}
	if profiles[0].IsActive || profiles[0].Name != original[0].Name || profiles[0].AllergensJSON != original[0].AllergensJSON || profiles[0].DietaryTagsJSON != original[0].DietaryTagsJSON || profiles[0].NutrientThresholdsJSON != original[0].NutrientThresholdsJSON {
		t.Fatalf("restore differs from provisioned defaults: restored=%+v original=%+v", profiles[0], original[0])
	}

	name, thresholds := "My edited starter", `[{"nutrient":"dietaryFiber","per1000KcalMin":20,"alertLevel":"warning"}]`
	response := env.doRequest(http.MethodPut, "/api/dietary-profiles/"+profiles[0].ID, map[string]string{"name": name, "nutrientThresholds": thresholds})
	if response.Code != http.StatusOK {
		t.Fatalf("edit restored profile: %d %s", response.Code, response.Body.String())
	}
	edited, err := env.store.GetDietaryProfile(env.userID, profiles[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	response = env.doRequest(http.MethodPost, starterRestorePath, nil)
	var body struct {
		Data DietaryProfile `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || !reflect.DeepEqual(&body.Data, edited) {
		t.Fatalf("retry replaced edited profile: status=%d got=%+v want=%+v", response.Code, body.Data, edited)
	}

	if err := env.store.DeleteDietaryProfile(env.userID, profiles[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(env.store.(*PostgresStore).DB(), migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	profiles, err = env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 0 {
		t.Fatalf("delete/restart reseeded: %+v %v", profiles, err)
	}
}

func TestDietaryStarterRestoreOwnerIsolationAndFailure(t *testing.T) {
	env := newTestEnv(t)
	foreign, err := env.store.CreateUser("foreign-restore@test.com", "Password123", "Other")
	if err != nil {
		t.Fatal(err)
	}
	foreignBefore, err := env.store.ListDietaryProfiles(foreign.ID)
	if err != nil {
		t.Fatal(err)
	}
	profiles, err := env.store.ListDietaryProfiles(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := env.store.DeleteDietaryProfile(env.userID, profiles[0].ID); err != nil {
		t.Fatal(err)
	}
	// Unrelated user-owned profiles are preserved, not considered eligible.
	unrelated, err := env.store.CreateDietaryProfile(env.userID, &CreateDietaryProfileRequest{Name: "Keep me", Allergens: "[]", DietaryTags: "[]", NutrientThresholds: "[]"})
	if err != nil {
		t.Fatal(err)
	}
	db := env.store.(*PostgresStore).DB()
	_, err = db.Exec(`CREATE FUNCTION reject_restore_profile() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'test-only restore failure'; END; $$;
		CREATE TRIGGER reject_restore_profile BEFORE INSERT ON dietary_profiles FOR EACH ROW EXECUTE FUNCTION reject_restore_profile();`)
	if err != nil {
		t.Fatal(err)
	}
	response := env.doRequest(http.MethodPost, starterRestorePath, nil)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("restore failure status=%d body=%s", response.Code, response.Body.String())
	}
	profiles, err = env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 1 || profiles[0].ID != unrelated.ID {
		t.Fatalf("failed restore changed content: %+v %v", profiles, err)
	}
	if _, err := db.Exec(`DROP TRIGGER reject_restore_profile ON dietary_profiles`); err != nil {
		t.Fatal(err)
	}
	response = env.doRequest(http.MethodPost, starterRestorePath, nil)
	if response.Code != http.StatusOK {
		t.Fatalf("retry restore: %d %s", response.Code, response.Body.String())
	}
	foreignAfter, err := env.store.ListDietaryProfiles(foreign.ID)
	if err != nil || !reflect.DeepEqual(foreignBefore, foreignAfter) {
		t.Fatalf("foreign profiles changed: %+v %v", foreignAfter, err)
	}
	profiles, err = env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 2 {
		t.Fatalf("retry profiles: %+v %v", profiles, err)
	}
}
