package main

import (
	"fmt"
	"strings"
	"testing"
)

// This inventory is deliberately independent of the implementation: every actual
// public table must be classified when migrations add new persistence.
var resetCustomTables = strings.Fields(`ingredients recipes recipe_categories recipe_ratings categories chapter_recipes chapter_pages book_pages chapters recipe_books shared_recipes community_categories day_plan_entries meal_groups grocery_checklists meal_plans food_log_entries weight_entries person_profiles custom_foods food_storage_defaults allergen_rules dietary_profiles templates brand_kits pantry_staples seasonal_foods user_secrets user_locations devices api_keys personal_api_keys recipe_completions import_object_mappings recipe_create_requests recipe_import_batches recipe_import_staged recipe_import_resolutions custom_recipe_nutrition`)
var resetPreservedTables = strings.Fields(`users refresh_tokens auth_sessions auth_refresh_tokens bootstrap_claim_consumptions user_settings instance_meta food_items seed_jobs schema_migrations`)

func resetCount(t *testing.T, s *PostgresStore, table string) int {
	t.Helper()
	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
func resetExec(t *testing.T, s *PostgresStore, q string, args ...interface{}) {
	t.Helper()
	if _, err := s.db.Exec(q, args...); err != nil {
		t.Fatal(err)
	}
}
func resetSnapshot(t *testing.T, s *PostgresStore, table string) string {
	t.Helper()
	var snapshot string
	if err := s.db.QueryRow(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text FROM ` + table + ` t`).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestResetDataHTTPImportAndInventory(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	known := map[string]bool{}
	for _, table := range append(append([]string{}, resetCustomTables...), resetPreservedTables...) {
		if known[table] {
			t.Fatalf("duplicate classification %s", table)
		}
		known[table] = true
	}
	rows, err := s.db.Query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		if !known[name] {
			t.Errorf("unclassified actual table %s", name)
		}
		delete(known, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	rows.Close()
	if len(known) > 0 {
		t.Fatalf("inventory contains nonexistent tables: %v", known)
	}
	other, err := env.auth.Register("reset-other@test.com", "Password123", "Other")
	if err != nil {
		t.Fatal(err)
	}
	b := quarantineBundle("reset-recipe", true)
	b.Books = []BundleBook{{BundleBookID: "book", Title: "Book", CoverColor: "#059669"}}
	b.Chapters = []BundleChapter{{BundleChapterID: "chapter", BundleBookID: "book", Title: "Chapter"}}
	b.ChapterRecipes = []BundleChapterRecipe{{BundleChapterID: "chapter", BundleRecipeID: "reset-recipe"}}
	quarantineSummary(t, env, b)
	quarantineSummary(t, env, b)
	var recipeID, bookID string
	if err := s.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1`, env.userID).Scan(&recipeID); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, env.userID).Scan(&bookID); err != nil {
		t.Fatal(err)
	}
	quarantineKeep(t, env, quarantineSummary(t, env, quarantineBundle("pending", false)))
	w := env.requestWith(t, other.AccessToken, "POST", "/api/recipe-bundles/import", quarantineBundle("other", true))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	resetExec(t, s, `INSERT INTO recipe_import_resolutions VALUES ($1,'s','i','hash')`, env.userID)
	resetExec(t, s, `INSERT INTO recipe_completions(user_id,recipe_id,completed_date) VALUES ($1,'orphan','2025-01-01')`, other.User.ID)
	resetExec(t, s, `INSERT INTO food_items(fdc_id,description,data_type) VALUES (991234,'reference','Foundation')`)
	resetExec(t, s, `INSERT INTO user_settings(id,user_id,settings_json) VALUES ('settings',$1,'{"theme":"dark"}')`, env.userID)
	resetExec(t, s, `INSERT INTO seed_jobs(data_type,release_date,file_name,status,record_count) VALUES ('Foundation','2025','fixture.json','complete',1)`)
	resetExec(t, s, `INSERT INTO templates(id,name,type) VALUES ('global-template','Global','recipe')`)
	resetExec(t, s, `INSERT INTO categories(id,name) VALUES ('global-category','Global')`)
	resetExec(t, s, `INSERT INTO pantry_staples(id,user_id,name) VALUES ('global-staple',NULL,'Salt')`)
	resetExec(t, s, `INSERT INTO custom_foods(id,user_id,name,shared_with_community) VALUES ('shared-food',$1,'Shared',true)`, other.User.ID)
	resetExec(t, s, `INSERT INTO brand_kits(id,user_id,name) VALUES ('other-brand',$1,'Other brand')`, other.User.ID)
	resetExec(t, s, `INSERT INTO recipe_create_requests(user_id,request_key,request_hash,recipe_id) VALUES ($1,'create',repeat('a',64),$2)`, env.userID, recipeID)
	resetExec(t, s, `INSERT INTO custom_recipe_nutrition(recipe_id,facts) VALUES ($1,'{"basis":"recipeTotal"}')`, recipeID)
	resetSeedRemainingContent(t, s, other.User.ID, recipeID, bookID)
	for _, table := range resetCustomTables {
		if n := resetCount(t, s, table); n == 0 {
			t.Fatalf("fixture did not populate %s", table)
		}
	}
	preserved := map[string]string{}
	for _, table := range resetPreservedTables {
		preserved[table] = resetSnapshot(t, s, table)
	}
	w = env.requestWith(t, "", "POST", "/api/instance/reset-user-data", map[string]string{"password": "Password123"})
	if w.Code != 401 {
		t.Fatalf("anonymous reset %d", w.Code)
	}
	for _, tc := range []struct {
		token, password string
		code            int
	}{{other.AccessToken, "Password123", 403}, {env.token, "wrong", 403}} {
		w = env.requestWith(t, tc.token, "POST", "/api/instance/reset-user-data", map[string]string{"password": tc.password})
		if w.Code != tc.code {
			t.Fatalf("unauthorized reset: %d %s", w.Code, w.Body.String())
		}
	}
	w = env.doRequest("POST", "/api/instance/reset-user-data", map[string]string{"password": "Password123"})
	if w.Code != 200 {
		t.Fatalf("reset: %d %s", w.Code, w.Body.String())
	}
	for _, table := range resetCustomTables {
		if n := resetCount(t, s, table); n != 0 {
			t.Errorf("%s retains %d rows", table, n)
		}
	}
	for table, snapshot := range preserved {
		if got := resetSnapshot(t, s, table); got != snapshot {
			t.Errorf("%s changed despite preservation contract", table)
		}
	}
	// A restart reruns migrations but must not repopulate reset content.
	if err := RunMigrations(s.db, migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	if n := resetCount(t, s, "community_categories"); n != 0 {
		t.Fatalf("restart repopulated community categories: %d", n)
	}
	quarantineSummary(t, env, b)
	var newRecipe, newBook string
	if err := s.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1`, env.userID).Scan(&newRecipe); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, env.userID).Scan(&newBook); err != nil {
		t.Fatal(err)
	}
	if newRecipe == recipeID || newBook == bookID || resetCount(t, s, "chapter_recipes") != 1 {
		t.Fatal("reimport did not restore fresh recipe/book placement")
	}
	quarantineSummary(t, env, b)
	if resetCount(t, s, "recipes") != 1 || resetCount(t, s, "chapter_recipes") != 1 {
		t.Fatal("ordinary retry duplicated content")
	}
}

func TestResetDataPersonalAndRollback(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	other, err := env.auth.Register("personal-other@test.com", "Password123", "Other")
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{env.userID, other.User.ID} {
		resetExec(t, s, `INSERT INTO recipe_completions(user_id,recipe_id,completed_date) VALUES ($1,'orphan','2025-01-01')`, id)
		resetExec(t, s, `INSERT INTO recipe_import_resolutions VALUES ($1,'s','i','hash')`, id)
		resetExec(t, s, `INSERT INTO devices(id,user_id) VALUES ($1,$1)`, id)
		digest := [32]byte{1}
		if id == other.User.ID {
			digest[0] = 2
		}
		resetExec(t, s, `INSERT INTO personal_api_keys(id,user_id,name,scopes,secret_digest,expires_at) VALUES (gen_random_uuid(),$1,'Personal','["profiles:read"]',$2,NOW()+INTERVAL '1 hour')`, id, digest[:])
		resetExec(t, s, `INSERT INTO recipes(id,user_id,name) VALUES ($1,$1,'Personal recipe')`, id)
		resetExec(t, s, `INSERT INTO grocery_checklists(id,user_id,week_start) VALUES ($1,$1,'2025-01-06')`, id)
		resetExec(t, s, `INSERT INTO recipe_import_batches(id,user_id,request_hash,context) VALUES ($1,$1,'hash','{}')`, id)
		resetExec(t, s, `INSERT INTO recipe_import_staged(id,batch_id,user_id,portable_id,bundle_recipe_id,recipe) VALUES ($1,$1,$1,'portable','recipe','{}')`, id)
		resetExec(t, s, `INSERT INTO import_object_mappings(id,user_id,source_format,source_object_type,source_object_key,content_hash,target_table,target_id) VALUES ($1,$1,'native','recipe','key','hash','recipes','missing')`, id)
	}
	resetExec(t, s, `INSERT INTO templates(id,name,type) VALUES ('global','global','recipe')`)
	resetExec(t, s, `INSERT INTO pantry_staples(id,user_id,name) VALUES ('global',NULL,'Salt')`)
	resetExec(t, s, `INSERT INTO categories(id,name) VALUES ('global','Category')`)
	global := map[string]string{}
	for _, table := range []string{"templates", "pantry_staples", "categories", "community_categories", "seasonal_foods"} {
		global[table] = resetSnapshot(t, s, table)
	}
	resetExec(t, s, `CREATE FUNCTION reject_personal_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER reject_personal_reset BEFORE DELETE ON devices FOR EACH ROW EXECUTE FUNCTION reject_personal_reset()`)
	w := env.doRequest("POST", "/api/account/delete-data", map[string]string{"password": "Password123"})
	if w.Code != 500 {
		t.Errorf("failure status %d %s", w.Code, w.Body.String())
	}
	for _, table := range []string{"recipes", "grocery_checklists", "recipe_completions", "recipe_import_batches", "recipe_import_staged", "recipe_import_resolutions", "import_object_mappings", "devices", "personal_api_keys"} {
		if n := resetCount(t, s, table); n != 2 {
			t.Errorf("rollback %s count %d", table, n)
		}
	}
	resetExec(t, s, `DROP TRIGGER reject_personal_reset ON devices`)
	w = env.doRequest("POST", "/api/account/delete-data", map[string]string{"password": "Password123"})
	if w.Code != 200 {
		t.Fatalf("personal %d %s", w.Code, w.Body.String())
	}
	for _, table := range []string{"recipes", "grocery_checklists", "recipe_completions", "recipe_import_batches", "recipe_import_staged", "recipe_import_resolutions", "import_object_mappings", "devices", "personal_api_keys"} {
		if n := resetCount(t, s, table); n != 1 {
			t.Errorf("personal reset %s count %d, want 1", table, n)
		}
		var owner string
		err := s.db.QueryRow(fmt.Sprintf(`SELECT user_id FROM %s`, table)).Scan(&owner)
		if err != nil || owner != other.User.ID {
			t.Errorf("%s owner %q err %v", table, owner, err)
		}
	}
	for table, snapshot := range global {
		if resetSnapshot(t, s, table) != snapshot {
			t.Errorf("personal reset changed global %s", table)
		}
	}
}

func TestResetDataGlobalRollback(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	quarantineSummary(t, env, quarantineBundle("rollback", true))
	resetExec(t, s, `CREATE FUNCTION reject_global_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER reject_global_reset BEFORE TRUNCATE ON recipe_import_batches FOR EACH STATEMENT EXECUTE FUNCTION reject_global_reset()`)
	w := env.doRequest("POST", "/api/instance/reset-user-data", map[string]string{"password": "Password123"})
	if w.Code != 500 {
		t.Errorf("failure status %d %s", w.Code, w.Body.String())
	}
	if resetCount(t, s, "recipes") != 1 || resetCount(t, s, "recipe_import_batches") != 1 {
		t.Fatal("global reset was not rolled back")
	}
}
