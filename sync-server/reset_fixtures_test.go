package main

import "testing"

// Populate every remaining audited table with meaningful nonempty custom state.
func resetSeedRemainingContent(t *testing.T, s *PostgresStore, owner, recipe, book string) {
	resetExec(t, s, `INSERT INTO chapter_pages(id,chapter_id,title) SELECT 'chapter-page',id,'Notes' FROM chapters WHERE book_id=$1`, book)
	resetExec(t, s, `INSERT INTO book_pages(id,book_id,title) VALUES ('book-page',$1,'Preface')`, book)
	resetExec(t, s, `INSERT INTO recipe_categories(id,recipe_id,category_id) VALUES ('assigned',$1,'global-category')`, recipe)
	resetExec(t, s, `INSERT INTO shared_recipes(id,user_id,recipe_id,share_token,title,recipe_data) VALUES ('share',$1,$2,'token','Shared recipe','{}')`, owner, recipe)
	resetExec(t, s, `INSERT INTO recipe_ratings(id,user_id,recipe_id,rating) VALUES ('rating',$1,'share',4)`, owner)
	resetExec(t, s, `INSERT INTO meal_plans(id,user_id,name,week_start) VALUES ('plan',$1,'Weekly','2025-01-06')`, owner)
	resetExec(t, s, `INSERT INTO day_plan_entries(id,meal_plan_id,date,slot) VALUES ('day','plan','2025-01-06','morning')`)
	resetExec(t, s, `INSERT INTO meal_groups(id,meal_plan_id,date,slot,name) VALUES ('group','plan','2025-01-06','morning','Family')`)
	resetExec(t, s, `INSERT INTO grocery_checklists(id,user_id,week_start) VALUES ('groceries',$1,'2025-01-06')`, owner)
	resetExec(t, s, `INSERT INTO person_profiles(id,user_id,name,sex) VALUES ('person',$1,'Person','female')`, owner)
	resetExec(t, s, `INSERT INTO food_log_entries(id,user_id,profile_id,date,meal_slot,source_type,name) VALUES ('log',$1,'person','2025-01-06','morning','manual','Food')`, owner)
	resetExec(t, s, `INSERT INTO weight_entries(id,user_id,profile_id,date,weight_kg) VALUES ('weight',$1,'person','2025-01-06',60)`, owner)
	resetExec(t, s, `INSERT INTO food_storage_defaults(user_id,source_type,source_key,location) VALUES ($1,'usda','991234','Pantry')`, owner)
	resetExec(t, s, `INSERT INTO allergen_rules(id,user_id,profile_id,allergen,severity) SELECT 'allergen',$1,id,'milk','avoid' FROM dietary_profiles WHERE user_id=$1 LIMIT 1`, owner)
	resetExec(t, s, `INSERT INTO user_secrets(id,user_id,key_name,encrypted_value) VALUES ('secret',$1,'key','value')`, owner)
	resetExec(t, s, `INSERT INTO user_locations(id,user_id,country,region) VALUES ('location',$1,'US','CA')`, owner)
	resetExec(t, s, `INSERT INTO devices(id,user_id,device_name) VALUES ('device',$1,'Device')`, owner)
	resetExec(t, s, `INSERT INTO api_keys(id,user_id,name,key_hash,key_prefix) VALUES ('api',$1,'API','hash','prefix')`, owner)
}

func TestResetDataPersonalCommitFailure(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	quarantineSummary(t, env, quarantineBundle("commit-rollback", true))
	resetExec(t, s, `INSERT INTO devices(id,user_id) VALUES ('device',$1)`, env.userID)
	resetExec(t, s, `CREATE FUNCTION reject_reset_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected commit failure'; END $$; CREATE CONSTRAINT TRIGGER reject_reset_commit AFTER DELETE ON devices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_reset_commit()`)
	before := map[string]string{}
	for _, table := range resetCustomTables {
		before[table] = resetSnapshot(t, s, table)
	}
	w := env.doRequest("POST", "/api/account/delete-data", map[string]string{"password": "Password123"})
	if w.Code != 500 {
		t.Fatalf("commit failure returned %d %s", w.Code, w.Body.String())
	}
	for table, snapshot := range before {
		if resetSnapshot(t, s, table) != snapshot {
			t.Errorf("commit failure changed %s", table)
		}
	}
}
