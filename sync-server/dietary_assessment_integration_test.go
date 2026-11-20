package main

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestDietaryProfileDefaultProvisioningAndValidation(t *testing.T) {
	env := newTestEnv(t)
	profiles, err := env.store.ListDietaryProfiles(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if len(profiles) != 1 || profiles[0].Name != "Diabetes-aware" || profiles[0].IsActive {
		t.Fatalf("new user default profiles = %+v; want one inactive Diabetes-aware profile", profiles)
	}
	var tags []string
	if err := json.Unmarshal([]byte(profiles[0].DietaryTagsJSON), &tags); err != nil {
		t.Fatal(err)
	}
	if len(tags) != 1 || tags[0] != "diabetesAware" {
		t.Fatalf("default tags = %v", tags)
	}
	renamed := "Personalized starter"
	if _, err := env.store.UpdateDietaryProfile(env.userID, profiles[0].ID, &UpdateDietaryProfileRequest{Name: &renamed}); err != nil {
		t.Fatal(err)
	}
	profiles, err = env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 1 || profiles[0].Name != renamed {
		t.Fatalf("renamed profile was not preserved: profiles=%+v err=%v", profiles, err)
	}
	if err := env.store.DeleteDietaryProfile(env.userID, profiles[0].ID); err != nil {
		t.Fatal(err)
	}
	profiles, err = env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 0 {
		t.Fatalf("deleted default was reseeded: profiles=%+v err=%v", profiles, err)
	}
	// Exercise the one-time upgrade SQL against an already-existing account.
	migration, err := migrationFS.ReadFile("migrations/000033_diabetes_aware_profile.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := env.store.(*PostgresStore).DB().Exec(string(migration)); err != nil {
		t.Fatalf("apply existing-user provisioning migration: %v", err)
	}
	profiles, err = env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 1 || profiles[0].Name != "Diabetes-aware" {
		t.Fatalf("existing-user migration profiles=%+v err=%v", profiles, err)
	}
	if err := env.store.DeleteDietaryProfile(env.userID, profiles[0].ID); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(env.store.(*PostgresStore).DB(), migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	if profiles, err = env.store.ListDietaryProfiles(env.userID); err != nil || len(profiles) != 0 {
		t.Fatalf("deleted migrated profile was reseeded after migration restart: profiles=%+v err=%v", profiles, err)
	}
	if _, err := env.store.CreateUser("second@test.com", "Password123", "Second"); err != nil {
		t.Fatal(err)
	}
	users, err := env.store.ListUsers()
	if err != nil || len(users) != 2 {
		t.Fatalf("users=%+v err=%v", users, err)
	}
	newUser, err := env.store.GetUserByEmail("second@test.com")
	if err != nil || newUser == nil {
		t.Fatalf("get second user: user=%+v err=%v", newUser, err)
	}
	profiles, err = env.store.ListDietaryProfiles(newUser.ID)
	if err != nil || len(profiles) != 1 {
		t.Fatalf("second user's default profiles=%+v err=%v", profiles, err)
	}

	invalid := env.doRequest(http.MethodPost, "/api/dietary-profiles", map[string]interface{}{
		"name": "Invalid", "allergens": "[]", "dietaryTags": "[]",
		"nutrientThresholds": `[{"nutrient":"bogus","perMealMax":1,"alertLevel":"warning"}]`, "isActive": false,
	})
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid profile POST status=%d body=%s", invalid.Code, invalid.Body.String())
	}
}

func TestRecipeAssessmentsAreAuthenticatedAndOwnerScoped(t *testing.T) {
	env := newTestEnv(t)
	profiles, err := env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 1 {
		t.Fatalf("default profile lookup: profiles=%+v err=%v", profiles, err)
	}
	profile := profiles[0]
	thresholds := `[{"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"}]`
	if _, err := env.store.UpdateDietaryProfile(env.userID, profile.ID, &UpdateDietaryProfileRequest{NutrientThresholds: &thresholds}); err != nil {
		t.Fatal(err)
	}
	invalidUpdate := env.doRequest(http.MethodPut, "/api/dietary-profiles/"+profile.ID, map[string]string{
		"nutrientThresholds": `[{"nutrient":"unknown","perMealMax":1,"alertLevel":"warning"}]`,
	})
	if invalidUpdate.Code != http.StatusBadRequest {
		t.Fatalf("invalid profile PUT status=%d body=%s", invalidUpdate.Code, invalidUpdate.Body.String())
	}
	custom := &CustomRecipeNutrition{Basis: "recipeTotal", Source: "test source", Nutrients: BundleNutrients{Calories: 1000, DietaryFiber: 14}}
	recipe, err := env.store.CreateRecipe(env.userID, &CreateRecipeRequest{Name: "Fiber recipe", Servings: 2, ServingName: "serving", CustomNutrition: custom})
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/dietary-profiles/" + profile.ID + "/recipe-assessments"
	unauth := env.doRequestNoAuth(http.MethodGet, path, nil)
	if unauth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated assessment status=%d body=%s", unauth.Code, unauth.Body.String())
	}
	response := env.doRequest(http.MethodGet, path, nil)
	if response.Code != http.StatusOK {
		t.Fatalf("assessment status=%d body=%s", response.Code, response.Body.String())
	}
	data := decodeJSON(t, response)["data"].([]interface{})
	if len(data) != 1 {
		t.Fatalf("assessment count=%d", len(data))
	}
	assessment := data[0].(map[string]interface{})
	if assessment["recipeId"] != recipe.ID || assessment["status"] != "match" {
		t.Fatalf("assessment=%v", assessment)
	}
	if _, exists := assessment["reasons"]; !exists {
		t.Fatalf("assessment missing reasons: %v", assessment)
	}

	other, err := env.store.CreateUser("other@test.com", "Password123", "Other")
	if err != nil {
		t.Fatal(err)
	}
	foreign, err := env.store.ListDietaryProfiles(other.ID)
	if err != nil || len(foreign) != 1 {
		t.Fatalf("foreign profiles=%+v err=%v", foreign, err)
	}
	if _, err := env.store.CreateRecipe(other.ID, &CreateRecipeRequest{Name: "Not the caller's recipe", Servings: 1, CustomNutrition: custom}); err != nil {
		t.Fatal(err)
	}
	response = env.doRequest(http.MethodGet, path, nil)
	if response.Code != http.StatusOK {
		t.Fatalf("owner-only assessment status=%d", response.Code)
	}
	if got := decodeJSON(t, response)["data"].([]interface{}); len(got) != 1 || got[0].(map[string]interface{})["recipeId"] != recipe.ID {
		t.Fatalf("foreign recipe leaked into assessments: %v", got)
	}
	response = env.doRequest(http.MethodGet, "/api/dietary-profiles/"+foreign[0].ID+"/recipe-assessments", nil)
	if response.Code != http.StatusNotFound {
		t.Fatalf("foreign profile assessment status=%d body=%s", response.Code, response.Body.String())
	}
	response = env.doRequest(http.MethodGet, "/api/dietary-profiles/unknown/recipe-assessments", nil)
	if response.Code != http.StatusNotFound {
		t.Fatalf("unknown profile assessment status=%d", response.Code)
	}
	response = env.doRequest(http.MethodPost, path, nil)
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("assessment POST status=%d", response.Code)
	}

	for _, tc := range []struct {
		rules string
		want  string
	}{
		{`[{"nutrient":"dietaryFiber","per1000KcalMin":15,"alertLevel":"warning"}]`, "noMatch"},
		{`[{"nutrient":"dietaryFiber","alertLevel":"warning"}]`, "notAssessed"},
		{`[]`, "notAssessed"},
	} {
		response = env.doRequest(http.MethodPut, "/api/dietary-profiles/"+profile.ID, map[string]string{"nutrientThresholds": tc.rules})
		if response.Code != http.StatusOK {
			t.Fatalf("save profile thresholds status=%d body=%s", response.Code, response.Body.String())
		}
		response = env.doRequest(http.MethodGet, path, nil)
		if response.Code != http.StatusOK {
			t.Fatalf("read updated assessment status=%d body=%s", response.Code, response.Body.String())
		}
		got := decodeJSON(t, response)["data"].([]interface{})[0].(map[string]interface{})["status"]
		if got != tc.want {
			t.Fatalf("updated assessment status=%v want=%s", got, tc.want)
		}
	}
}
