package main

import (
	"net/http"
	"testing"
)

func TestDietaryProfileWritesRequireEnumArrays(t *testing.T) {
	env := newTestEnv(t)
	profiles, err := env.store.ListDietaryProfiles(env.userID)
	if err != nil || len(profiles) != 1 {
		t.Fatalf("profiles=%+v err=%v", profiles, err)
	}
	for _, field := range []string{"dietaryTags", "allergens"} {
		for _, invalid := range []string{"null", "{}", `"diabetesAware"`, `[null]`, `["unknown"]`, `["diabetesAware",23]`, `[] []`} {
			for _, method := range []string{http.MethodPost, http.MethodPut} {
				t.Run(method+"/"+field+"/"+invalid, func(t *testing.T) {
					path := "/api/dietary-profiles"
					body := map[string]interface{}{"name": "Enum validation", "allergens": "[]", "dietaryTags": "[]", "nutrientThresholds": "[]"}
					body[field] = invalid
					if method == http.MethodPut {
						path += "/" + profiles[0].ID
					}
					response := env.doRequest(method, path, body)
					if response.Code != http.StatusBadRequest {
						t.Fatalf("expected 400, got %d body=%s", response.Code, response.Body.String())
					}
				})
			}
		}
	}
	response := env.doRequest(http.MethodPut, "/api/dietary-profiles/"+profiles[0].ID, map[string]string{
		"dietaryTags": `["diabetesAware","vegan"]`,
		"allergens":   `["milk","eggs","fish","shellfish","treeNuts","peanuts","wheat","soybeans","sesame"]`,
	})
	if response.Code != http.StatusOK {
		t.Fatalf("valid enum arrays rejected: status=%d body=%s", response.Code, response.Body.String())
	}
}
