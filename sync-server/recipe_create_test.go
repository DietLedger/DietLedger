package main

import (
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
)

func atomicRecipeRequest(t *testing.T, payload map[string]interface{}) *CreateRecipeRequest {
	t.Helper()
	b, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var req CreateRecipeRequest
	if err := json.Unmarshal(b, &req); err != nil {
		t.Fatal(err)
	}
	return &req
}

func atomicRecipePayload() map[string]interface{} {
	return map[string]interface{}{
		"name": "Imported cake", "servings": 4, "servingName": "slice",
		"prepTime": "15 minutes", "cookTime": "30 minutes", "instructions": "Mix and bake.",
		"leftoverStorage": "fridge", "requestKey": "import-draft-1",
		"ingredientGroups": `[{"id":"batter","title":"Batter"}]`,
		"ingredients": []map[string]interface{}{
			{"name": "unresolved flour", "amount": 100, "unit": "g", "groupId": "batter", "description": "sifted", "prepInstructions": []string{"sift"}, "storageLocation": "pantry"},
			{"name": "matched food", "amount": 20, "unit": "g", "fdcId": 123, "sourceType": "usda", "sourceKey": "123", "calories": 80, "protein": 2},
			{"name": "intentional zero", "amount": 1, "unit": "tsp", "fdcId": -3, "sourceType": "manual"},
		},
	}
}

func atomicResponseRecipe(t *testing.T, w *httptest.ResponseRecorder) *Recipe {
	t.Helper()
	if w.Code != 201 {
		t.Fatalf("create status = %d, body = %s", w.Code, w.Body.String())
	}
	var response struct {
		Data Recipe `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return &response.Data
}

func TestAtomicCreateRecipeRetryContract(t *testing.T) {
	env := newTestEnv(t)
	payload := atomicRecipePayload()
	first := atomicResponseRecipe(t, env.doRequest("POST", "/api/recipes", payload))
	second := atomicResponseRecipe(t, env.doRequest("POST", "/api/recipes", payload))
	if first.PortableID == "" {
		t.Fatal("create response omitted the database-generated portable identity")
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("identical retry did not return the same recipe: %s -> %s", first.ID, second.ID)
	}
	if first.Name != payload["name"] || first.Servings != 4 || first.ServingName != "slice" ||
		first.PrepTime == nil || *first.PrepTime != payload["prepTime"] ||
		first.CookTime == nil || *first.CookTime != payload["cookTime"] ||
		first.Instructions == nil || *first.Instructions != payload["instructions"] ||
		first.LeftoverStorage == nil || *first.LeftoverStorage != payload["leftoverStorage"] ||
		first.IngredientGroupsJSON != payload["ingredientGroups"] {
		t.Fatalf("metadata/groups lost: %+v", first)
	}
	if len(first.Ingredients) != 3 {
		t.Fatalf("expected all 3 ingredients, got %+v", first.Ingredients)
	}
	byName := map[string]Ingredient{}
	for _, ing := range first.Ingredients {
		byName[ing.Name] = ing
	}
	unresolved := byName["unresolved flour"]
	if unresolved.FdcID != 0 || unresolved.SourceKey != nil || unresolved.LinkedRecipeID != nil || unresolved.SourceType != "manual" ||
		unresolved.Amount != 100 || unresolved.Unit != "g" || unresolved.Description != "sifted" ||
		unresolved.GroupID == nil || *unresolved.GroupID != "batter" || unresolved.StorageLocation != "pantry" ||
		!reflect.DeepEqual(unresolved.PrepInstructions, []string{"sift"}) {
		t.Fatalf("unresolved ingredient changed or lost facts: %+v", unresolved)
	}
	matched := byName["matched food"]
	if matched.FdcID != 123 || matched.SourceType != "usda" || matched.SourceKey == nil || *matched.SourceKey != "123" || matched.Calories != 80 || matched.Protein != 2 {
		t.Fatalf("matched ingredient lost source/snapshot: %+v", matched)
	}
	if byName["intentional zero"].FdcID != -3 {
		t.Fatal("explicit zero intent lost")
	}

	// Every metadata field and the ingredient list participate in the hash.
	for field, value := range map[string]interface{}{
		"name": "Changed", "servings": 5, "servingName": "portion", "prepTime": "20 minutes", "cookTime": "40 minutes",
		"instructions": "Changed directions", "leftoverStorage": "freezer", "ingredientGroups": "[]",
		"ingredients": []map[string]interface{}{{"name": "different unresolved ingredient", "amount": 2, "unit": "g"}},
	} {
		changed := atomicRecipePayload()
		changed[field] = value
		w := env.doRequest("POST", "/api/recipes", changed)
		if w.Code != 409 {
			t.Fatalf("changed %s: status = %d, body = %s", field, w.Code, w.Body.String())
		}
	}
	persisted, err := env.store.GetRecipe(env.userID, first.ID)
	if err != nil || !reflect.DeepEqual(first, persisted) {
		t.Fatalf("conflict changed saved recipe: %+v, %v", persisted, err)
	}
	other := createUser(t, env.store, "other-atomic")
	otherRecipe, err := env.store.CreateRecipe(other.ID, atomicRecipeRequest(t, payload))
	if err != nil || otherRecipe.ID == first.ID || otherRecipe.UserID != other.ID {
		t.Fatalf("retry key not owner scoped: %+v, %v", otherRecipe, err)
	}
	var count int
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT count(*) FROM recipes`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("expected 2 owner recipes, count=%d, err=%v", count, err)
	}
}

func TestAtomicCreateRecipeConcurrentRetries(t *testing.T) {
	env := newTestEnv(t)
	const workers = 8
	start := make(chan struct{})
	results := make(chan *httptest.ResponseRecorder, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			results <- env.doRequest("POST", "/api/recipes", atomicRecipePayload())
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	var id string
	for result := range results {
		recipe := atomicResponseRecipe(t, result)
		if id == "" {
			id = recipe.ID
		}
		if recipe.ID != id || len(recipe.Ingredients) != 3 {
			t.Fatalf("concurrent retry produced duplicate/partial recipe: %+v", recipe)
		}
	}
	var count int
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT count(*) FROM recipes`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("concurrent retries: count=%d, err=%v", count, err)
	}
}

func TestAtomicCreateRecipeConcurrentChangedPayload(t *testing.T) {
	env := newTestEnv(t)
	start := make(chan struct{})
	results := make(chan *httptest.ResponseRecorder, 2)
	for _, name := range []string{"Concurrent A", "Concurrent B"} {
		go func(name string) {
			payload := atomicRecipePayload()
			payload["name"] = name
			<-start
			results <- env.doRequest("POST", "/api/recipes", payload)
		}(name)
	}
	close(start)
	statuses := map[int]int{}
	for i := 0; i < 2; i++ {
		w := <-results
		statuses[w.Code]++
		if w.Code != 201 && w.Code != 409 {
			t.Errorf("unexpected concurrent response: %d %s", w.Code, w.Body.String())
		}
	}
	if statuses[201] != 1 || statuses[409] != 1 {
		t.Fatalf("expected one committed create and one conflict, got %v", statuses)
	}
}

func TestAtomicCreateRecipeRollsBackCommitFailure(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	// Defer the failure to COMMIT, after every statement has succeeded.
	if _, err := s.db.Exec(`
		CREATE FUNCTION reject_atomic_commit() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'injected commit failure'; END $$;
		CREATE CONSTRAINT TRIGGER reject_atomic_commit AFTER INSERT ON recipes
		DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_atomic_commit();
	`); err != nil {
		t.Fatal(err)
	}
	w := env.doRequest("POST", "/api/recipes", atomicRecipePayload())
	if w.Code != 500 {
		t.Fatalf("commit failure reported success: %d %s", w.Code, w.Body.String())
	}
	for _, table := range []string{"recipes", "ingredients", "recipe_create_requests"} {
		var count int
		if err := s.db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("commit failure left partial %s: count=%d, err=%v", table, count, err)
		}
	}
	if _, err := s.db.Exec(`DROP TRIGGER reject_atomic_commit ON recipes; DROP FUNCTION reject_atomic_commit()`); err != nil {
		t.Fatal(err)
	}
	first := atomicResponseRecipe(t, env.doRequest("POST", "/api/recipes", atomicRecipePayload()))
	retry := atomicResponseRecipe(t, env.doRequest("POST", "/api/recipes", atomicRecipePayload()))
	if first.ID != retry.ID || len(retry.Ingredients) != 3 {
		t.Fatalf("retry after commit failure duplicated/lost recipe: %+v, %+v", first, retry)
	}
}

func TestAtomicCreateRecipeWithoutKeyPreservesLegacyCreation(t *testing.T) {
	env := newTestEnv(t)
	payload := map[string]interface{}{"name": "New draft", "servings": 1}
	first := atomicResponseRecipe(t, env.doRequest("POST", "/api/recipes", payload))
	second := atomicResponseRecipe(t, env.doRequest("POST", "/api/recipes", payload))
	if first.ID == second.ID || first.ServingName != "serving" || first.IngredientGroupsJSON != "[]" {
		t.Fatalf("legacy defaults/independent creation changed: %+v, %+v", first, second)
	}
}

func TestAtomicCreateRecipeRollsBackIngredientFailure(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	owner := createUser(t, s, "atomic")
	// A database-side failure occurs after the recipe and first ingredient insert.
	if _, err := s.db.Exec(`ALTER TABLE ingredients ADD CONSTRAINT reject_atomic_test CHECK (name <> 'fail insert')`); err != nil {
		t.Fatal(err)
	}
	req := atomicRecipeRequest(t, map[string]interface{}{
		"name": "Interrupted import", "servings": 2, "requestKey": "retry-after-failure",
		"ingredientGroups": `[{"id":"batter","title":"Batter"}]`,
		"ingredients": []map[string]interface{}{
			{"name": "unresolved flour", "amount": 100, "unit": "g", "groupId": "batter"},
			{"name": "fail insert", "amount": 1, "unit": "tsp"},
		},
	})
	if _, err := s.CreateRecipe(owner.ID, req); err == nil {
		t.Fatal("expected ingredient insert failure")
	}
	for _, table := range []string{"recipes", "ingredients", "recipe_create_requests"} {
		var count int
		if err := s.db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("failed creation left %d partial %s rows", count, table)
		}
	}
	if _, err := s.db.Exec(`ALTER TABLE ingredients DROP CONSTRAINT reject_atomic_test`); err != nil {
		t.Fatal(err)
	}
	recipe, err := s.CreateRecipe(owner.ID, req)
	if err != nil {
		t.Fatalf("retry after rollback: %v", err)
	}
	if len(recipe.Ingredients) != 2 || recipe.IngredientGroupsJSON != `[{"id":"batter","title":"Batter"}]` {
		t.Fatalf("retry lost unresolved ingredients/groups: %+v", recipe)
	}
}
