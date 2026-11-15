package main

import (
	"testing"
	"time"
)

func TestImportStagingPendingDecisionVisibleAfterRefresh(t *testing.T) {
	env := newTestEnv(t)
	summary := quarantineSummary(t, env, quarantineBundle("resume pending", false))
	rows := quarantineRows(t, env)
	if len(rows) != 1 || rows[0]["requiresDecision"] != true {
		t.Fatalf("refreshed queue cannot resume pending choice: %v", rows)
	}
	quarantineKeep(t, env, summary)
	rows = quarantineRows(t, env)
	if len(rows) != 1 || rows[0]["requiresDecision"] != false {
		t.Fatalf("accepted queue still pending: %v", rows)
	}
}
func TestImportStagingDependencyNumbersValidated(t *testing.T) {
	for _, tc := range []struct {
		name   string
		food   BundleFoodItem
		custom *BundleCustomFood
	}{
		{name: "negative portion", food: BundleFoodItem{FdcID: 1, Portions: []FoodPortion{{Amount: 1, MeasureUnit: "piece", GramWeight: -1}}}},
		{name: "zero portion amount", food: BundleFoodItem{FdcID: 1, Portions: []FoodPortion{{Amount: 0, MeasureUnit: "piece", GramWeight: 42}}}},
		{name: "missing portion measure", food: BundleFoodItem{FdcID: 1, Portions: []FoodPortion{{Amount: 1, GramWeight: 42}}}},
		{name: "negative food nutrients", food: BundleFoodItem{FdcID: 1, Nutrients: BundleNutrients{Calories: -1}}},
		{name: "negative custom nutrients", custom: &BundleCustomFood{BundleCustomFoodID: "custom", Name: "Invalid", Nutrients: BundleNutrients{Calories: -1}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := quarantineBundle("safe numeric", true)
			if tc.custom != nil {
				b.CustomFoods = []BundleCustomFood{*tc.custom}
			} else {
				b.FoodItems = []BundleFoodItem{tc.food}
			}
			if err := ValidateRecipeBundle(b); err == nil {
				t.Fatal("unsafe dependency facts accepted")
			}
		})
	}
}
func TestImportStagingPendingBackupPromotionUsesOneSnapshot(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	quarantineKeep(t, env, quarantineSummary(t, env, quarantineBundle("snapshot staged", false)))
	rows := quarantineRows(t, env)
	id := rows[0]["id"].(string)
	barrier := &ownerBackupReadBarrier{match: "SELECT id FROM recipes WHERE user_id=$1 ORDER BY created_at, id", reached: make(chan struct{}), resume: make(chan struct{})}
	snapshot := ownerBackupTracedStore(t, barrier)
	type result struct {
		bundle *RecipeBundle
		err    error
	}
	done := make(chan result, 1)
	go func() { b, err := snapshot.ExportOwnerRecipeBookBackup(env.userID); done <- result{b, err} }()
	released := false
	defer func() {
		if !released {
			close(barrier.resume)
		}
	}()
	select {
	case <-barrier.reached:
	case <-time.After(10 * time.Second):
		t.Fatal("backup never reached snapshot barrier")
	}
	w := env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	close(barrier.resume)
	released = true
	var first result
	select {
	case first = <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("backup did not complete")
	}
	if first.err != nil {
		t.Fatal(first.err)
	}
	if first.bundle.Version != 3 || len(first.bundle.Recipes) != 0 || first.bundle.PendingImports == nil || len(first.bundle.PendingImports.Recipes) != 1 {
		t.Fatalf("promotion fell between backup stores: %+v", first.bundle)
	}
	next, err := s.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if next.Version != 2 || len(next.Recipes) != 1 || next.PendingImports != nil {
		t.Fatalf("next snapshot missed promotion: %+v", next)
	}
}
func TestImportStagingDecisionCommitFailureIsAtomic(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	b := quarantineBundle("commit mixed unresolved", false)
	complete := quarantineBundle("commit mixed complete", true).Recipes[0]
	b.Recipes = append(b.Recipes, complete)
	summary := quarantineSummary(t, env, b)
	batch := summary["pendingImportId"].(string)
	if _, err := s.db.Exec(`CREATE FUNCTION reject_import_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected import commit failure'; END $$;CREATE CONSTRAINT TRIGGER reject_import_commit AFTER INSERT ON recipes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_import_commit()`); err != nil {
		t.Fatal(err)
	}
	w := env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "keep"})
	if w.Code == 200 || quarantineMainCount(t, env) != 0 {
		t.Fatalf("commit failure published main: %d %s", w.Code, w.Body.String())
	}
	rows := quarantineRows(t, env)
	if len(rows) != 2 {
		t.Fatalf("commit failure lost staging: %v", rows)
	}
	var accepted bool
	if err := s.db.QueryRow(`SELECT accepted FROM recipe_import_batches WHERE id=$1`, batch).Scan(&accepted); err != nil {
		t.Fatal(err)
	}
	if accepted {
		t.Fatal("failed commit accepted batch")
	}
	if _, err := s.db.Exec(`DROP TRIGGER reject_import_commit ON recipes;DROP FUNCTION reject_import_commit()`); err != nil {
		t.Fatal(err)
	}
	w = env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "keep"})
	if w.Code != 200 || quarantineMainCount(t, env) != 1 || len(quarantineRows(t, env)) != 1 {
		t.Fatalf("retry after commit rollback: %d %s", w.Code, w.Body.String())
	}
}
