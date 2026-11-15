package main

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
)

func TestImportStagingAbsentSourceMetadataIsUnresolved(t *testing.T) {
	env := newTestEnv(t)
	b := quarantineBundle("absent link metadata", false)
	b.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{}
	w := env.doRequest("POST", "/api/recipe-bundles/import", b)
	if w.Code != 200 {
		t.Fatalf("structurally valid missing link was rejected: %d %s", w.Code, w.Body.String())
	}
	summary := decodeJSON(t, w)["data"].(map[string]interface{})
	if summary["requiresDecision"] != true || quarantineMainCount(t, env) != 0 {
		t.Fatalf("missing link was invented: %v", summary)
	}
}

func TestImportStagingV3CannotBypassVerification(t *testing.T) {
	env := newTestEnv(t)
	b := quarantineBundle("v3 bypass", false)
	b.Version = 3
	b.PendingImports = &PendingRecipeImports{Version: 1, Batches: []recipeImportBatch{}, Recipes: []stagedImportRecipe{}}
	w := env.doRequest("POST", "/api/recipe-bundles/import", b)
	if w.Code == 200 || quarantineMainCount(t, env) != 0 {
		t.Fatalf("v3 bypass published unresolved main section: %d %s", w.Code, w.Body.String())
	}
}
func TestImportStagingCompletedBatchIsNotReplayed(t *testing.T) {
	env := newTestEnv(t)
	b := quarantineBundle("custom complete", false)
	food := "dietledger:food:" + uuid.NewString()
	b.CustomFoods = []BundleCustomFood{{PortableID: food, BundleCustomFoodID: food, Name: "Original custom food", Nutrients: BundleNutrients{Calories: 100}}}
	b.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: food}
	quarantineSummary(t, env, b)
	if _, err := env.store.(*PostgresStore).db.Exec(`UPDATE custom_foods SET name='Owner edited' WHERE portable_id=$1`, food); err != nil {
		t.Fatal(err)
	}
	w := env.doRequest("POST", "/api/recipe-bundles/import", quarantineBundle("unrelated", true))
	if w.Code != 200 || quarantineMainCount(t, env) != 2 {
		t.Fatalf("completed prior batch replayed into unrelated import: %d %s", w.Code, w.Body.String())
	}
}
func TestImportStagingReusedIdentityCancelAndConflict(t *testing.T) {
	env := newTestEnv(t)
	b := quarantineBundle("earlier", false)
	b.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
	b.Recipes[0].Ingredients = append(b.Recipes[0].Ingredients, BundleIngredient{BundleIngredientID: "second", Name: "Second", Amount: 1, Unit: "g", Source: BundleIngredientSourceRef{Type: "manual"}})
	quarantineKeep(t, env, quarantineSummary(t, env, b))
	original := quarantineRows(t, env)[0]
	id := original["id"].(string)
	later := b
	later.Source.Version = "different file"
	summary := quarantineSummary(t, env, later)
	batch := summary["pendingImportId"].(string)
	w := env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "cancel"})
	if w.Code != 200 || len(quarantineRows(t, env)) != 1 || quarantineRows(t, env)[0]["id"] != id {
		t.Fatalf("reused identity cancel affected earlier row: %d %s", w.Code, w.Body.String())
	}
	req := map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true}
	w = env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/ingredient", req)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	// Identical original file retries preserve repairs; changed-content identities
	// from another file cannot silently replace those repairs.
	quarantineSummary(t, env, b)
	after := quarantineRows(t, env)
	if len(after) != 1 || len(after[0]["unresolvedIngredients"].([]interface{})) != 1 {
		t.Fatal("retry reverted repair")
	}
	changed := b
	changed.Recipes = append([]BundleRecipe(nil), b.Recipes...)
	changed.Recipes[0].Name = "Changed same identity"
	w = env.doRequest("POST", "/api/recipe-bundles/import", changed)
	if w.Code != 409 {
		t.Fatalf("changed identity accepted: %d %s", w.Code, w.Body.String())
	}
	if len(quarantineRows(t, env)) != 1 || quarantineMainCount(t, env) != 0 {
		t.Fatal("conflict caused partial publication")
	}
}
func TestImportStagingCanonicalPortionsAndSourceFacts(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := quarantineBundle("source facts", false)
	weight := 42.0
	b.Recipes[0].Ingredients[0].SuppliedNutrition = &UnconfirmedIngredientNutrition{Basis: "perServing", ServingGramWeight: &weight, Unit: "piece", Provenance: "Original source", Nutrients: BundleNutrients{Protein: 9}}
	b.Recipes[0].Ingredients[0].Amount = 2
	b.Recipes[0].Ingredients[0].Unit = "piece"
	quarantineKeep(t, env, quarantineSummary(t, env, b))
	rows := quarantineRows(t, env)
	id := rows[0]["id"].(string)
	if _, err := s.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories,sodium,portions) VALUES(777,'Canonical','Foundation',100,5,'[{"amount":1,"measureUnit":"piece","gramWeight":42}]')`); err != nil {
		t.Fatal(err)
	}
	req := map[string]interface{}{"name": "Changed name must not replace recipe metadata", "amount": 2, "unit": "piece", "sourceType": "usda", "fdcId": 777, "sourceKey": "777", "calories": 999}
	path := "/api/recipe-imports/" + id + "/ingredients/ingredient"
	w := env.doRequest("PUT", path, req)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = env.doRequest("PUT", path, req)
	if w.Code != 200 {
		t.Fatalf("lost-response retry failed: %d %s", w.Code, w.Body.String())
	}
	var calories, sodium float64
	var facts, name, description, prep, storage string
	if err := s.db.QueryRow(`SELECT calories,sodium,unconfirmed_nutrition,name,description,prep_instructions,storage_location FROM ingredients`).Scan(&calories, &sodium, &facts, &name, &description, &prep, &storage); err != nil {
		t.Fatal(err)
	}
	if calories != 84 || sodium != 4.2 || !strings.Contains(facts, "Original source") || name != "Original ingredient" || description != "retained" || storage != "Pantry" || prep != "[\"chopped\"]" {
		t.Fatalf("canonical/source metadata mismatch %.2f %.2f %s %s %s %s %s", calories, sodium, facts, name, description, prep, storage)
	}
}
func TestImportStagingPrivateSourcesAndOwnerIsolation(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	other := createUser(t, s, "private-staged-source")
	private, err := s.CreateCustomFood(other.ID, &CreateCustomFoodRequest{Name: "Private", Calories: 50})
	if err != nil {
		t.Fatal(err)
	}
	b := quarantineBundle("private source", false)
	b.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: private.ID}
	w := env.doRequest("POST", "/api/recipe-bundles/import", b)
	if w.Code != 403 || quarantineMainCount(t, env) != 0 || len(quarantineRows(t, env)) != 0 {
		t.Fatalf("private source import leaked/persisted: %d %s", w.Code, w.Body.String())
	}
	summary := quarantineSummary(t, env, quarantineBundle("owner isolated", false))
	batch := quarantineKeep(t, env, summary)
	rows := quarantineRows(t, env)
	id := rows[0]["id"].(string)
	w = env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -2, "sourceType": "custom_food", "sourceKey": private.ID})
	if w.Code != 403 || len(quarantineRows(t, env)) != 1 {
		t.Fatalf("private repair accepted: %d %s", w.Code, w.Body.String())
	}
	login, err := env.auth.Login(other.Email, "password123")
	if err != nil {
		t.Fatal(err)
	}
	w = doRequestWithToken(env, "GET", "/api/recipe-imports", login.AccessToken, nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), id) {
		t.Fatalf("foreign queue leaked: %d %s", w.Code, w.Body.String())
	}
	w = doRequestWithToken(env, "POST", "/api/recipe-imports/"+batch+"/decision", login.AccessToken, map[string]string{"action": "cancel"})
	if w.Code != 404 {
		t.Fatalf("foreign batch decision: %d %s", w.Code, w.Body.String())
	}
}
func TestImportStagingRollbackAndConcurrentRetries(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := quarantineBundle("concurrent missing", false)
	var wg sync.WaitGroup
	errors := make(chan error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.StageRecipeBundle(env.userID, b); errors <- err }()
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(quarantineRows(t, env)) != 1 {
		t.Fatal("concurrent retry duplicated staged rows")
	}
	summary := quarantineSummary(t, env, b)
	batch := quarantineKeep(t, env, summary)
	_ = batch
	rows := quarantineRows(t, env)
	id := rows[0]["id"].(string)
	if _, err := s.db.Exec(`CREATE FUNCTION fail_staged_promotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected staged promotion failure'; END $$; CREATE TRIGGER fail_staged_promotion BEFORE INSERT ON ingredients FOR EACH ROW EXECUTE FUNCTION fail_staged_promotion()`); err != nil {
		t.Fatal(err)
	}
	req := map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true}
	path := "/api/recipe-imports/" + id + "/ingredients/ingredient"
	w := env.doRequest("PUT", path, req)
	if w.Code == 200 || quarantineMainCount(t, env) != 0 {
		t.Fatalf("failed promotion partially committed: %d %s", w.Code, w.Body.String())
	}
	rows = quarantineRows(t, env)
	if len(rows) != 1 || len(rows[0]["unresolvedIngredients"].([]interface{})) != 1 {
		t.Fatal("failed promotion lost staged content/repair")
	}
	if _, err := s.db.Exec(`DROP TRIGGER fail_staged_promotion ON ingredients;DROP FUNCTION fail_staged_promotion()`); err != nil {
		t.Fatal(err)
	}
	w = env.doRequest("PUT", path, req)
	if w.Code != 200 || quarantineMainCount(t, env) != 1 {
		t.Fatalf("promotion retry failed: %d %s", w.Code, w.Body.String())
	}
}
func TestImportStagingBackupV3RestoreAPIAndFailures(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := quarantineBundle("pending backup", false)
	quarantineSummary(t, env, b)
	backup, err := s.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if backup.Version != 3 || backup.PendingImports == nil {
		t.Fatal("backup omitted unaccepted pending batch")
	}
	target := ownerBackupRestoreStore(t, s)
	owner := createUser(t, target, "staging-api-restore")
	auth, err := NewAuthService(target, "")
	if err != nil {
		t.Fatal(err)
	}
	login, err := auth.Login(owner.Email, "password123")
	if err != nil {
		t.Fatal(err)
	}
	e := &testEnv{store: target, auth: auth, server: NewServer(target, auth, "*", 10, NewRateLimiter()), token: login.AccessToken, userID: owner.ID}
	w := e.doRequest("POST", "/api/recipe-bundles/import", backup)
	if w.Code != 200 || len(quarantineRows(t, e)) != 1 || quarantineMainCount(t, e) != 0 {
		t.Fatalf("API v3 restore: %d %s", w.Code, w.Body.String())
	}
	w = e.doRequest("POST", "/api/recipe-bundles/import", backup)
	if w.Code != 200 || len(quarantineRows(t, e)) != 1 {
		t.Fatalf("restore retry: %d %s", w.Code, w.Body.String())
	}
	row := quarantineRows(t, e)[0]
	w = e.doRequest("PUT", "/api/recipe-imports/"+row["id"].(string)+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
	if w.Code != 200 || quarantineMainCount(t, e) != 1 {
		t.Fatalf("pending restore repair did not accept batch: %d %s", w.Code, w.Body.String())
	}
	// Every staging read participates in the same fail-closed owner snapshot.
	if _, err := s.db.Exec(`ALTER TABLE recipe_import_staged RENAME TO unavailable_staging`); err != nil {
		t.Fatal(err)
	}
	if out, err := s.ExportOwnerRecipeBookBackup(env.userID); err == nil || out != nil {
		raw, _ := json.Marshal(out)
		t.Fatalf("backup silently omitted staging: %s", raw)
	}
}
