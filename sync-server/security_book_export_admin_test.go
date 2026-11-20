package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAdminCannotDiscoverOrExportAnotherUsersPrivateBook(t *testing.T) {
	checkBookSecurityDatabase(t)
	env := newTestEnv(t) // first account is administrator
	bob, err := env.auth.Register("book-owner@test.invalid", "Password123", "Book owner")
	if err != nil {
		t.Fatal(err)
	}
	book := doRequestWithToken(env, "POST", "/api/books", bob.AccessToken, map[string]interface{}{"title": "Private Book Canary", "description": "PRIVATE-BOOK-CANARY"})
	bookID := responseID(t, book)
	chapter := doRequestWithToken(env, "POST", "/api/books/"+bookID+"/chapters", bob.AccessToken, map[string]interface{}{"title": "Private Chapter"})
	chapterID := responseID(t, chapter)
	page := doRequestWithToken(env, "POST", "/api/chapters/"+chapterID+"/pages", bob.AccessToken, map[string]interface{}{"title": "Private Page", "content": "PRIVATE-CHILD-CANARY"})
	responseID(t, page)

	adminCandidates := env.doRequest("GET", "/api/recipe-bundles/candidates", nil)
	if adminCandidates.Code != 200 {
		t.Fatalf("admin candidates: %d %s", adminCandidates.Code, adminCandidates.Body.String())
	}
	var candidates struct {
		Data []ExportCandidate `json:"data"`
	}
	if err := json.NewDecoder(adminCandidates.Body).Decode(&candidates); err != nil {
		t.Fatal(err)
	}
	for _, candidate := range candidates.Data {
		if candidate.Type == "book" && (candidate.ID == bookID || strings.Contains(candidate.SearchText, "PRIVATE-")) {
			t.Fatalf("administrator candidate exposed another owner's book: %+v", candidate)
		}
	}
	adminExport := env.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"bookIds": []string{bookID}})
	if adminExport.Code != 403 {
		t.Fatalf("administrator private book export status=%d body=%s", adminExport.Code, adminExport.Body.String())
	}

	ownerCandidates := doRequestWithToken(env, "GET", "/api/recipe-bundles/candidates", bob.AccessToken, nil)
	if ownerCandidates.Code != 200 {
		t.Fatalf("owner candidates: %d %s", ownerCandidates.Code, ownerCandidates.Body.String())
	}
	candidates.Data = nil
	if err := json.NewDecoder(ownerCandidates.Body).Decode(&candidates); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, candidate := range candidates.Data {
		if candidate.Type == "book" && candidate.ID == bookID {
			found = true
		}
	}
	if !found {
		t.Fatal("book owner did not receive their book export candidate")
	}
	ownerExport := doRequestWithToken(env, "POST", "/api/recipe-bundles/export", bob.AccessToken, map[string]interface{}{"bookIds": []string{bookID}})
	if ownerExport.Code != 200 {
		t.Fatalf("owner private book export status=%d body=%s", ownerExport.Code, ownerExport.Body.String())
	}
	if strings.Contains(ownerExport.Body.String(), "PRIVATE-CHILD-CANARY") == false {
		t.Fatalf("owner export omitted owned private page: %s", ownerExport.Body.String())
	}
}
