package main

import (
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestPersonalKeyRoutesContract(t *testing.T) {
	raw, err := os.ReadFile("../docs/specs/scoped-personal-sync-api-keys.md")
	if err != nil {
		t.Fatal(err)
	}
	_, contract, ok := strings.Cut(string(raw), "| Scope | Methods | Exact paths |")
	if !ok {
		t.Fatal("missing contract")
	}
	contract, _, _ = strings.Cut(contract, "### Boundaries")
	paths := regexp.MustCompile("`(/api/[^`]+)`")
	actual := NewServer(nil, nil, "", 0, nil).personalKeyRoutes()
	seen := map[string]string{}
	for _, line := range strings.Split(contract, "\n") {
		if !strings.HasPrefix(line, "| ") || strings.HasPrefix(line, "| ---") || strings.Contains(line, "optional live fallback") {
			continue
		}
		fields := strings.Split(line, "|")
		scope := strings.Trim(strings.TrimSpace(fields[1]), "`")
		if scope == "Valid personal key" {
			continue
		}
		for _, method := range strings.Split(strings.TrimSpace(fields[2]), ", ") {
			for _, match := range paths.FindAllStringSubmatch(fields[3], -1) {
				target := match[1]
				if target == "/api/share/{shareId}" {
					target = "/api/share/{shareToken}" // One structural route; semantics vary by method.
				}
				if strings.HasSuffix(target, "/") {
					target += "{$}"
				}
				seen[target+" "+method] = scope
				if actual.grants[target][method] != scope {
					t.Errorf("%s %s scope=%q want %q", method, target, actual.grants[target][method], scope)
				}
			}
		}
	}
	ui, err := os.ReadFile("../src/app/(app)/settings/personal-keys/page.tsx")
	if err != nil {
		t.Fatal(err)
	}
	uiScopes := map[string]bool{}
	for _, match := range regexp.MustCompile(`\['([a-z-]+:[a-z-]+)',`).FindAllStringSubmatch(string(ui), -1) {
		uiScopes[match[1]] = true
	}
	wantScopes := map[string]bool{"catalog:live": true}
	for pattern, methods := range actual.grants {
		for method, scope := range methods {
			wantScopes[scope] = true
			if seen[pattern+" "+method] != scope || !validPersonalKeyScopes([]string{scope}) {
				t.Errorf("undocumented route %s %s", method, pattern)
			}
		}
	}
	if !maps.Equal(uiScopes, wantScopes) {
		t.Fatalf("web grant options differ from Go route grants: %v vs %v", uiScopes, wantScopes)
	}
}

func TestPersonalKeyPersonalRoutesHTTP(t *testing.T) {
	env := securityServer(t)
	const origin = "https://ledger.example.invalid:8443"
	env.server.corsOrigin = origin
	a, err := env.auth.Register("key-a@example.invalid", "Password123", "Admin", securityClaim)
	if err != nil {
		t.Fatal(err)
	}
	b, err := env.auth.Register("key-b@example.invalid", "Password123", "Member")
	if err != nil {
		t.Fatal(err)
	}
	h := env.server.Routes()
	issue := func(scopes []string) string {
		w := managedKeyRequest(h, "POST", "/api/personal-keys", a.AccessToken, origin, "dietledger", map[string]any{"name": "Fixture", "password": "Password123", "scopes": scopes})
		if w.Code != 201 {
			t.Fatalf("issue status=%d", w.Code)
		}
		return decodeJSON(t, w)["data"].(map[string]any)["key"].(string)
	}
	full := issue([]string{"profiles:read", "profiles:write", "diary:read", "diary:write", "weight:read", "weight:write", "meal-plans:read", "meal-plans:write", "recipes:read", "recipes:write", "sharing:read", "sharing:publish", "design:read", "design:write", "transfer:import"})
	limited := issue([]string{"profiles:read"})
	call := func(method, path, token string, body any, want int) *httptest.ResponseRecorder {
		w := managedKeyRequest(h, method, path, token, "", "", body)
		if w.Code != want {
			t.Fatalf("%s %s got %d want %d: %s", method, path, w.Code, want, w.Body.String())
		}
		return w
	}
	id := func(w *httptest.ResponseRecorder) string {
		return decodeJSON(t, w)["data"].(map[string]any)["id"].(string)
	}
	profile := id(call("POST", "/api/profiles", full, map[string]any{"name": "Fixture", "sex": "female"}, 201))
	foreign := id(call("POST", "/api/profiles", b.AccessToken, map[string]any{"name": "Foreign", "sex": "female"}, 201))
	p := "/api/profiles/" + profile
	f := "/api/profiles/" + foreign
	call("GET", p, limited, nil, 200)
	call("GET", f, limited, nil, 404)
	pg := env.store.(*PostgresStore)
	if _, err := pg.db.Exec(`INSERT INTO person_profiles(id,user_id,name,sex) VALUES ('logbook',$1,'Profile with reserved prefix','female')`, a.User.ID); err != nil {
		t.Fatal(err)
	}
	if got := id(call("GET", "/api/profiles/logbook", limited, nil, 200)); got != "logbook" {
		t.Fatal("profile route dispatched to diary handler")
	}
	call("POST", p+"/log", limited, nil, 403)
	log := map[string]any{"date": "2026-01-01", "mealSlot": "noon", "sourceType": "manual", "name": "Fixture", "servings": 1, "profileId": foreign}
	entry := id(call("POST", p+"/log", full, log, 201))
	if _, err := pg.db.Exec(`UPDATE food_log_entries SET user_id=$1 WHERE id=$2`, b.User.ID, entry); err != nil {
		t.Fatal(err)
	}
	if got := decodeJSON(t, call("GET", p+"/log", full, nil, 200))["data"].([]any); len(got) != 0 {
		t.Fatal("log read leaked a row with a foreign child owner")
	}
	if _, err := pg.db.Exec(`UPDATE food_log_entries SET user_id=$1 WHERE id=$2`, a.User.ID, entry); err != nil {
		t.Fatal(err)
	}
	call("GET", p+"/log", full, nil, 200)
	call("GET", f+"/log", full, nil, 404)
	call("PUT", p+"/log/"+entry, full, log, 200)
	call("DELETE", f+"/log/"+entry, full, nil, 404)
	call("DELETE", p+"/log/"+entry, full, nil, 200)
	vitals := map[string]any{"date": "2026-01-01", "weightKg": 65, "bloodSugar": 94}
	weight := id(call("POST", p+"/weight", full, vitals, 201))
	if _, err := pg.db.Exec(`UPDATE weight_entries SET user_id=$1 WHERE id=$2`, b.User.ID, weight); err != nil {
		t.Fatal(err)
	}
	if got := decodeJSON(t, call("GET", p+"/weight", full, nil, 200))["data"].([]any); len(got) != 0 {
		t.Fatal("weight read leaked a row with a foreign child owner")
	}
	call("DELETE", p+"/weight/"+weight, full, nil, 404)
	call("DELETE", p, full, nil, 404)
	if _, err := pg.db.Exec(`UPDATE weight_entries SET user_id=$1 WHERE id=$2`, a.User.ID, weight); err != nil {
		t.Fatal(err)
	}
	call("PUT", p+"/weight/"+weight, full, vitals, 200)
	call("GET", f+"/weight", full, nil, 404)
	call("DELETE", p+"/weight/"+weight, full, nil, 200)
	plan := id(call("POST", "/api/meal-plans", full, map[string]any{"weekStart": "2026-01-01", "name": "Plan"}, 201))
	call("GET", "/api/meal-plans/week/2026-01-01", full, nil, 200)
	call("PUT", "/api/meal-plans/"+plan, full, map[string]any{"name": "Updated"}, 200)
	call("DELETE", "/api/meal-plans/"+plan, full, nil, 200)
	recipe := id(call("POST", "/api/recipes", full, map[string]any{"name": "Fixture", "servings": 2}, 201))
	foreignRecipe := id(call("POST", "/api/recipes", b.AccessToken, map[string]any{"name": "Private source", "servings": 2}, 201))
	call("POST", "/api/recipes/"+recipe+"/ingredients", full, map[string]any{"name": "Private source", "amount": 1, "unit": "whole", "sourceType": "recipe", "linkedRecipeId": foreignRecipe}, 404)
	call("POST", "/api/share", full, map[string]any{"recipeId": foreignRecipe, "title": "Foreign", "recipeData": "{}", "visibility": "public"}, 404)
	share := decodeJSON(t, call("POST", "/api/share", full, map[string]any{"recipeId": recipe, "title": "Fixture", "recipeData": "{}", "visibility": "public"}, 201))
	call("GET", "/api/share/"+share["shareToken"].(string), full, nil, 200)
	call("DELETE", "/api/share/"+share["id"].(string), full, nil, 200)
	var counter int
	if err := pg.db.QueryRow(`SELECT view_count FROM shared_recipes WHERE id=$1`, share["id"]).Scan(&counter); err != nil || counter != 0 {
		t.Fatal("key share read mutated view count", err)
	}
	call("POST", "/api/templates", full, map[string]any{"name": "Global", "type": "recipe", "isDefault": true}, 403)
	tmpl := id(call("POST", "/api/templates", full, map[string]any{"name": "Fixture", "type": "recipe", "layout": "{}"}, 201))
	call("PUT", "/api/templates/"+tmpl, full, map[string]any{"name": "Updated"}, 200)
	call("DELETE", "/api/templates/"+tmpl, full, nil, 200)
	// Retained older cross-owner links must not turn a key-owned delete into a foreign cascade.
	if _, err := pg.db.Exec(`INSERT INTO recipe_books(id,user_id,title) VALUES ('foreign_book',$1,'Foreign')`, b.User.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pg.db.Exec(`INSERT INTO chapters(id,book_id,title) VALUES ('foreign_chapter','foreign_book','Foreign')`); err != nil {
		t.Fatal(err)
	}
	if _, err := pg.db.Exec(`INSERT INTO chapter_recipes(id,chapter_id,recipe_id) VALUES ('foreign_join','foreign_chapter',$1)`, recipe); err != nil {
		t.Fatal(err)
	}
	call("DELETE", "/api/recipes/"+recipe, full, nil, 403)
	call("GET", "/api/recipes/"+recipe, full, nil, 200)
	bundle := quarantineBundle("key-admin-taxonomy", false)
	bundle.Categories = []BundleCategory{{BundleCategoryID: "unprovisioned", Name: "Key must not provision this category"}}
	call("POST", "/api/recipe-bundles/import", full, bundle, 403)
	var cats int
	if err := pg.db.QueryRow(`SELECT COUNT(*) FROM categories WHERE name=$1`, bundle.Categories[0].Name).Scan(&cats); err != nil || cats != 0 {
		t.Fatal("key inherited SQL administrator taxonomy authority", err)
	}
	for _, blocked := range []string{"/api/account/delete-data", "/api/account/delete", "/api/instance/factory-reset", "/api/keys", "/api/secrets", "/api/categories", "/api/profiles/../profiles", "/api/profiles/%2e"} {
		call(http.MethodPost, blocked, full, map[string]any{"password": "Password123"}, 403)
	}
	for _, wrong := range []string{"/api/recipes/completions", "/api/dietary-profiles/diabetes-aware-starter", "/api/custom-foods/community"} {
		call("DELETE", wrong, full, nil, 403)
	}
}
