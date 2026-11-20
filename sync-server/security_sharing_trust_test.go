package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

func securityOtherEnv(t *testing.T, e *testEnv, suffix string) *testEnv {
	t.Helper()
	resp, err := e.auth.Register(suffix+"@security.test", "Password123", suffix)
	if err != nil {
		t.Fatal(err)
	}
	copy := *e
	copy.token = resp.AccessToken
	copy.userID = resp.User.ID
	return &copy
}

func securityStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("HTTP %d want %d: %s", w.Code, want, w.Body.String())
	}
}

func TestSecurityBundleFoodTrustOfflineRestore(t *testing.T) {
	e := newTestEnv(t)
	s := e.store.(*PostgresStore)
	b := quarantineBundle("Offline source facts", false)
	b.FoodItems = []BundleFoodItem{{FdcID: 920001, Description: "Unconfirmed source description", DataType: "Foundation", Source: "usda", Nutrients: BundleNutrients{Calories: 100, Protein: 7}, Portions: []FoodPortion{{Amount: 1, MeasureUnit: "piece", GramWeight: 42}}}}
	b.Recipes[0].Ingredients[0] = BundleIngredient{BundleIngredientID: "ingredient", Name: "Original ingredient", Amount: 2, Unit: "piece", Source: BundleIngredientSourceRef{Type: "usda", FdcID: 920001}, Nutrients: BundleNutrients{Calories: 84}, SuppliedNutrition: &UnconfirmedIngredientNutrition{Basis: "per100g", Unit: "g", Provenance: "offline package", Nutrients: BundleNutrients{Calories: 100, Protein: 7}}}
	b.Books = []BundleBook{{BundleBookID: "book", Title: "Offline retained book"}}
	b.Chapters = []BundleChapter{{BundleChapterID: "chapter", BundleBookID: "book", Title: "Retained chapter", Position: 2}}
	b.ChapterRecipes = []BundleChapterRecipe{{BundleChapterID: "chapter", BundleRecipeID: b.Recipes[0].BundleRecipeID, Position: 3}}
	summary := quarantineSummary(t, e, b)
	if summary["requiresDecision"] != true {
		t.Fatalf("package FDC facts bypassed quarantine: %+v", summary)
	}
	quarantineKeep(t, e, summary)
	assertNoFood := func() {
		t.Helper()
		var n int
		if err := s.db.QueryRow(`SELECT count(*) FROM food_items WHERE fdc_id=920001`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatalf("bundle certified %d shared food rows", n)
		}
	}
	assertNoFood()
	// Exact retries cannot certify the retained facts, either before or after keep.
	quarantineSummary(t, e, b)
	assertNoFood()
	backup, err := s.ExportOwnerRecipeBookBackup(e.userID)
	if err != nil {
		t.Fatal(err)
	}
	if backup.PendingImports == nil || len(backup.PendingImports.Recipes) != 1 {
		t.Fatalf("offline backup lost quarantine: %+v", backup.PendingImports)
	}
	check := func(backup *RecipeBundle) {
		t.Helper()
		p := backup.PendingImports
		if p == nil || len(p.Recipes) != 1 || len(p.Batches) != 1 {
			t.Fatalf("pending state lost: %+v", p)
		}
		c := p.Batches[0].Context
		if !reflect.DeepEqual(c.FoodItems, b.FoodItems) || !reflect.DeepEqual(c.ChapterRecipes, b.ChapterRecipes) || !reflect.DeepEqual(c.Books, b.Books) || !reflect.DeepEqual(c.Chapters, b.Chapters) {
			t.Fatalf("unconfirmed foods/portions/placement changed: %+v", c)
		}
		if !reflect.DeepEqual(p.Recipes[0].Recipe.Ingredients, b.Recipes[0].Ingredients) {
			t.Fatalf("quantity/source/snapshot/provenance changed: %+v", p.Recipes[0].Recipe.Ingredients)
		}
	}
	check(backup)
	other := securityOtherEnv(t, e, "offline-recipient")
	w := other.doRequest("POST", "/api/recipe-bundles/import", backup)
	securityStatus(t, w, 200)
	w = other.doRequest("POST", "/api/recipe-bundles/import", backup)
	securityStatus(t, w, 200)
	assertNoFood()
	restored, err := s.ExportOwnerRecipeBookBackup(other.userID)
	if err != nil {
		t.Fatal(err)
	}
	check(restored)
	if quarantineMainCount(t, other) != 0 || len(quarantineRows(t, other)) != 1 {
		t.Fatal("offline import published unresolved nutrition")
	}
	// Unconfirmed package data is never visible to another owner in the queue.
	if len(quarantineRows(t, e)) != 1 {
		t.Fatal("recipient restore altered source queue")
	}
}

func TestSecurityOfflineMainBackupRestore(t *testing.T) {
	e := newTestEnv(t)
	s := e.store.(*PostgresStore)
	if _, err := s.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories,portions) VALUES(920003,'Trusted at source only','Foundation',100,'[{"amount":1,"measureUnit":"piece","gramWeight":42}]')`); err != nil {
		t.Fatal(err)
	}
	r := exportTestRecipe(t, s, e.userID, "Offline main recipe", CreateIngredientReq{Name: "Original", FdcID: 920003, SourceType: "usda", Amount: 2, Unit: "piece", Calories: 84})
	book, err := s.CreateBook(e.userID, &CreateBookRequest{Title: "Offline main book"})
	if err != nil {
		t.Fatal(err)
	}
	ch, err := s.CreateChapter(book.ID, &CreateChapterRequest{Title: "Offline chapter", Position: 2})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddChapterRecipe(ch.ID, r.ID, 3); err != nil {
		t.Fatal(err)
	}
	backup, err := s.ExportOwnerRecipeBookBackup(e.userID)
	if err != nil {
		t.Fatal(err)
	}
	target := ownerBackupRestoreStore(t, s)
	recipient := newSecurityEnvForStore(t, target)
	summary := quarantineSummary(t, recipient, *backup)
	if summary["requiresDecision"] != true {
		t.Fatal("offline main section trusted package food")
	}
	quarantineKeep(t, recipient, summary)
	if quarantineMainCount(t, recipient) != 0 {
		t.Fatal("offline main recipe published without trusted source")
	}
	saved, err := target.ExportOwnerRecipeBookBackup(recipient.userID)
	if err != nil {
		t.Fatal(err)
	}
	if saved.PendingImports == nil || len(saved.PendingImports.Recipes) != 1 {
		t.Fatal("offline main restore omitted staged recipe")
	}
	context := saved.PendingImports.Batches[0].Context
	if !reflect.DeepEqual(context.FoodItems, backup.FoodItems) || !reflect.DeepEqual(context.ChapterRecipes, backup.ChapterRecipes) {
		t.Fatal("offline main restore lost FDC facts/portions or book placement")
	}
	ing := saved.PendingImports.Recipes[0].Recipe.Ingredients[0]
	if ing.Amount != 2 || ing.Unit != "piece" || ing.Source.FdcID != 920003 || ing.Nutrients.Calories != 84 {
		t.Fatalf("offline main facts changed: %+v", ing)
	}
	profile, err := target.CreateProfile(recipient.userID, &CreateProfileRequest{Name: "Historical profile", Sex: "female"})
	if err != nil {
		t.Fatal(err)
	}
	log, err := target.CreateFoodLogEntry(recipient.userID, profile.ID, &CreateFoodLogRequest{Name: "Historical snapshot", Date: "2026-01-01", MealSlot: "noon", SourceType: "manual", Servings: 1, Calories: 173, Protein: 6})
	if err != nil {
		t.Fatal(err)
	}
	var logBefore string
	if err := target.db.QueryRow(`SELECT row_to_json(f)::text FROM food_log_entries f WHERE id=$1`, log.ID).Scan(&logBefore); err != nil {
		t.Fatal(err)
	}
	// Trusted ingestion later makes source verification possible. Exact retries
	// remain receipts, not an implicit repair; an explicit Keep re-verifies the
	// batch without recomputing the unchanged snapshot.
	if _, err := target.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories,portions) VALUES(920003,'Recipient trusted','Foundation',200,'[{"amount":1,"measureUnit":"piece","gramWeight":50}]')`); err != nil {
		t.Fatal(err)
	}
	securityStatus(t, recipient.doRequest("POST", "/api/recipe-bundles/import", backup), 200)
	securityStatus(t, recipient.doRequest("POST", "/api/recipe-imports/"+saved.PendingImports.Batches[0].ID+"/decision", map[string]string{"action": "keep"}), 200)
	if quarantineMainCount(t, recipient) != 1 || len(quarantineRows(t, recipient)) != 0 {
		t.Fatal("trusted catalog availability did not permit retry promotion")
	}
	var calories float64
	if err := target.db.QueryRow(`SELECT i.calories FROM ingredients i JOIN recipes r ON r.id=i.recipe_id WHERE r.user_id=$1`, recipient.userID).Scan(&calories); err != nil {
		t.Fatal(err)
	}
	if calories != 84 {
		t.Fatalf("verification recalculated unchanged snapshot: %g", calories)
	}
	var joins int
	if err := target.db.QueryRow(`SELECT count(*) FROM chapter_recipes`).Scan(&joins); err != nil {
		t.Fatal(err)
	}
	if joins != 1 {
		t.Fatal("promotion lost retained placement")
	}
	var logAfter string
	if err := target.db.QueryRow(`SELECT row_to_json(f)::text FROM food_log_entries f WHERE id=$1`, log.ID).Scan(&logAfter); err != nil {
		t.Fatal(err)
	}
	if logBefore != logAfter {
		t.Fatal("import/verification changed a historical food-log snapshot")
	}
}

func TestSecurityUnconfirmedFoodContextWithoutStagedRows(t *testing.T) {
	e := newTestEnv(t)
	s := e.store.(*PostgresStore)
	b := RecipeBundle{Format: RecipeBundleFormat, Version: 2, FoodItems: []BundleFoodItem{{FdcID: 920004, Description: "Retained unreferenced facts", DataType: "Foundation", Nutrients: BundleNutrients{Protein: 7}, Portions: []FoodPortion{{Amount: 1, MeasureUnit: "piece", GramWeight: 42}}}}}
	securityStatus(t, e.doRequest("POST", "/api/recipe-bundles/import", b), 200)
	backup, err := s.ExportOwnerRecipeBookBackup(e.userID)
	if err != nil {
		t.Fatal(err)
	}
	if backup.PendingImports == nil || len(backup.PendingImports.Batches) != 1 || !reflect.DeepEqual(backup.PendingImports.Batches[0].Context.FoodItems, b.FoodItems) {
		t.Fatal("unreferenced food context was silently discarded")
	}
	other := securityOtherEnv(t, e, "context-only-recipient")
	securityStatus(t, other.doRequest("POST", "/api/recipe-bundles/import", backup), 200)
	restored, err := s.ExportOwnerRecipeBookBackup(other.userID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.PendingImports == nil || len(restored.PendingImports.Batches) != 1 || !reflect.DeepEqual(restored.PendingImports.Batches[0].Context.FoodItems, b.FoodItems) {
		t.Fatal("context-only backup restore dropped food facts/portions")
	}
	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM food_items WHERE fdc_id=920004`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("context-only import provisioned a shared food")
	}
}

func TestSecurityOfflineMixedPendingBackup(t *testing.T) {
	e := newTestEnv(t)
	s := e.store.(*PostgresStore)
	if _, err := s.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories,portions) VALUES(920005,'Source trusted','Foundation',100,'[{"amount":1,"measureUnit":"piece","gramWeight":42}]')`); err != nil {
		t.Fatal(err)
	}
	_ = exportTestRecipe(t, s, e.userID, "Mixed main", CreateIngredientReq{Name: "Original", FdcID: 920005, SourceType: "usda", Amount: 2, Unit: "piece", Calories: 84})
	quarantineKeep(t, e, quarantineSummary(t, e, quarantineBundle("Mixed pending", false)))
	backup, err := s.ExportOwnerRecipeBookBackup(e.userID)
	if err != nil {
		t.Fatal(err)
	}
	if backup.PendingImports == nil || len(backup.Recipes) != 1 {
		t.Fatal("invalid mixed-backup fixture")
	}
	target := ownerBackupRestoreStore(t, s)
	recipient := newSecurityEnvForStore(t, target)
	securityStatus(t, recipient.doRequest("POST", "/api/recipe-bundles/import", backup), 200)
	if quarantineMainCount(t, recipient) != 0 || len(quarantineRows(t, recipient)) != 2 {
		t.Fatal("v3 main food facts bypassed quarantine or lost pending content")
	}
	restored, err := target.ExportOwnerRecipeBookBackup(recipient.userID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, batch := range restored.PendingImports.Batches {
		if reflect.DeepEqual(batch.Context.FoodItems, backup.FoodItems) {
			found = true
		}
	}
	if !found {
		t.Fatal("v3 offline restore lost main-section food facts/portions")
	}
	var n int
	if err := target.db.QueryRow(`SELECT count(*) FROM food_items`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("mixed backup certified shared foods")
	}
}

func TestSecurityDirectBundleFoodTrust(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "direct-trust")
	b := minimalRecipeBundle()
	if _, err := s.ImportRecipeBundle(u.ID, b); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM food_items WHERE fdc_id=12345`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("direct import inserted caller facts into shared standard foods")
	}
	batches, rows, err := s.loadImportState(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(batches) != 1 || len(rows) != 1 || !reflect.DeepEqual(batches[0].Context.FoodItems, b.FoodItems) {
		t.Fatal("direct import lost unconfirmed package context")
	}
}

func TestSecurityRecipeCategoryMatrix(t *testing.T) {
	e := newTestEnv(t)
	other := securityOtherEnv(t, e, "association-owner")
	attacker := securityOtherEnv(t, e, "association-attacker")
	s := e.store.(*PostgresStore)
	cat, err := s.CreateCategory(&CreateCategoryRequest{Name: "Association"})
	if err != nil {
		t.Fatal(err)
	}
	r := exportTestRecipe(t, s, other.userID, "Private association recipe")
	path := "/api/recipes/" + r.ID + "/categories"
	securityStatus(t, other.doRequest("POST", path, map[string]string{"categoryId": cat.ID}), 201)
	for _, actor := range []*testEnv{e, attacker} {
		securityStatus(t, actor.doRequest("GET", path, nil), 404)
		securityStatus(t, actor.doRequest("POST", path, map[string]string{"categoryId": cat.ID}), 404)
		securityStatus(t, actor.doRequest("DELETE", path+"?categoryId="+cat.ID, nil), 404)
		w := actor.doRequest("GET", "/api/categories/"+cat.ID+"/recipes", nil)
		securityStatus(t, w, 200)
		if bytes.Contains(w.Body.Bytes(), []byte(r.ID)) {
			t.Fatal("category read leaked private recipe ID")
		}
	}
	securityStatus(t, other.doRequest("GET", path, nil), 200)
	rcs, err := s.ListRecipeCategories(r.ID)
	if err != nil || len(rcs) != 1 {
		t.Fatalf("victim association changed: %+v %v", rcs, err)
	}
	securityStatus(t, other.doRequest("DELETE", path+"?categoryId="+cat.ID, nil), 200)
}

func TestSecurityShareMutationMatrix(t *testing.T) {
	e := newTestEnv(t)
	owner := securityOtherEnv(t, e, "publisher")
	other := securityOtherEnv(t, e, "share-attacker")
	s := e.store.(*PostgresStore)
	recipe := exportTestRecipe(t, s, owner.userID, "Publisher recipe")
	for _, visibility := range []string{"private", "public"} {
		w := owner.doRequest("POST", "/api/share", map[string]interface{}{"recipeId": recipe.ID, "title": "Owner publication", "recipeData": "{}", "visibility": visibility})
		securityStatus(t, w, 201)
		shared := decodeJSON(t, w)
		id := shared["id"].(string)
		token := shared["shareToken"].(string)
		for _, actor := range []*testEnv{e, other} {
			securityStatus(t, actor.doRequest("PUT", "/api/share/"+id, map[string]string{"visibility": "users"}), 404)
			securityStatus(t, actor.doRequest("DELETE", "/api/share/"+id, nil), 404)
		}
		stored, err := s.GetSharedRecipeByToken(token)
		if err != nil || stored.Visibility != visibility {
			t.Fatalf("victim share changed: %+v %v", stored, err)
		}
		for _, body := range []interface{}{map[string]string{}, map[string]string{"visibility": ""}, map[string]string{"visibility": "typo"}, map[string]interface{}{"visibility": nil}} {
			securityStatus(t, owner.doRequest("PUT", "/api/share/"+id, body), 400)
		}
		securityStatus(t, owner.doRequest("PUT", "/api/share/"+id, map[string]string{"visibility": "users"}), 200)
		securityStatus(t, other.doRequest("GET", "/api/share/"+token, nil), 200)
		securityStatus(t, other.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"recipeIds": []string{recipe.ID}}), 200)
		candidates := other.doRequest("GET", "/api/recipe-bundles/candidates", nil)
		securityStatus(t, candidates, 200)
		if !bytes.Contains(candidates.Body.Bytes(), []byte(recipe.ID)) {
			t.Fatal("legitimate users publication absent from authenticated export candidates")
		}
		securityStatus(t, other.doRequestNoAuth("GET", "/api/share/"+token, nil), 401)
		securityStatus(t, owner.doRequest("DELETE", "/api/share/"+id, nil), 200)
		stored, err = s.GetSharedRecipeByToken(token)
		if err != nil || stored.Visibility != "private" {
			t.Fatalf("owner revocation failed: %+v %v", stored, err)
		}
	}
}

func TestSecurityTemplateMatrix(t *testing.T) {
	e := newTestEnv(t)
	owner := securityOtherEnv(t, e, "template-owner")
	other := securityOtherEnv(t, e, "template-attacker")
	w := e.doRequest("POST", "/api/templates", map[string]interface{}{"name": "Global default", "type": "recipe", "isDefault": true, "layout": "{}"})
	securityStatus(t, w, 201)
	id := decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)
	for _, actor := range []*testEnv{owner, other} {
		securityStatus(t, actor.doRequest("GET", "/api/templates/"+id, nil), 200)
		securityStatus(t, actor.doRequest("PUT", "/api/templates/"+id, map[string]interface{}{"name": "forged", "isDefault": false}), 403)
		securityStatus(t, actor.doRequest("DELETE", "/api/templates/"+id, nil), 403)
	}
	w = owner.doRequest("POST", "/api/templates", map[string]interface{}{"name": "Owned nondefault", "type": "recipe", "layout": "{}"})
	securityStatus(t, w, 201)
	owned := decodeJSON(t, w)["data"].(map[string]interface{})["id"].(string)
	securityStatus(t, owner.doRequest("PUT", "/api/templates/"+owned, map[string]interface{}{"isDefault": true}), 403)
	for _, actor := range []*testEnv{e, other} {
		securityStatus(t, actor.doRequest("GET", "/api/templates/"+owned, nil), 404)
		w = actor.doRequest("PUT", "/api/templates/"+owned, map[string]interface{}{"name": "forged"})
		if w.Code < 400 {
			t.Fatal("foreign template updated")
		}
		securityStatus(t, actor.doRequest("DELETE", "/api/templates/"+owned, nil), 404)
	}
	securityStatus(t, owner.doRequest("PUT", "/api/templates/"+owned, map[string]interface{}{"name": "Owner update"}), 200)
	securityStatus(t, owner.doRequest("DELETE", "/api/templates/"+owned, nil), 200)
	securityStatus(t, e.doRequest("PUT", "/api/templates/"+id, map[string]interface{}{"name": "Admin update"}), 200)
	securityStatus(t, e.doRequest("DELETE", "/api/templates/"+id, nil), 200)
}

func TestSecurityLegacyShareCanonicalExport(t *testing.T) {
	e := newTestEnv(t)
	owner := securityOtherEnv(t, e, "canonical-owner")
	attacker := securityOtherEnv(t, e, "canonical-forger")
	s := e.store.(*PostgresStore)
	victim := exportTestRecipe(t, s, owner.userID, "Secret canonical recipe")
	// Simulate an actual pre-fix forged public share, bypassing today's guarded insert.
	if _, err := s.db.Exec(`INSERT INTO shared_recipes(id,user_id,recipe_id,share_token,visibility,title,recipe_data,description,category) VALUES('legacy-forgery',$1,$2,'legacy-forged-token','public','Forged snapshot','{}','','')`, attacker.userID, victim.ID); err != nil {
		t.Fatal(err)
	}
	for _, actor := range []*testEnv{e, attacker} {
		w := actor.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"recipeIds": []string{victim.ID}})
		securityStatus(t, w, 403)
		w = actor.doRequest("GET", "/api/recipe-bundles/candidates", nil)
		securityStatus(t, w, 200)
		if bytes.Contains(w.Body.Bytes(), []byte(victim.ID)) {
			t.Fatal("forged share/admin exposed private export candidate")
		}
		securityStatus(t, actor.doRequest("GET", "/api/share/legacy-forged-token", nil), 404)
		parent := exportTestRecipe(t, s, actor.userID, "Linked forbidden", CreateIngredientReq{Name: "child", Amount: 1, Unit: "recipe", SourceType: "recipe", SourceKey: &victim.ID})
		if _, err := s.ExportRecipeBundleForUser(&User{ID: actor.userID, IsAdmin: actor == e}, []string{parent.ID}, nil, nil, nil); !errors.Is(err, ErrExportForbidden) {
			t.Fatalf("linked closure exported forged canonical recipe: %v", err)
		}
		if _, err := s.ExportOwnerRecipeBookBackup(actor.userID); !errors.Is(err, ErrExportForbidden) {
			t.Fatalf("owner backup widened dependency access: %v", err)
		}
		book, err := s.CreateBook(actor.userID, &CreateBookRequest{Title: "Owned book forbidden canonical join"})
		if err != nil {
			t.Fatal(err)
		}
		chapter, err := s.CreateChapter(book.ID, &CreateChapterRequest{Title: "Forbidden join"})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.AddChapterRecipe(chapter.ID, victim.ID, 0); err != nil {
			t.Fatal(err)
		}
		securityStatus(t, actor.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"bookIds": []string{book.ID}}), 403)
	}
	legitimate, err := s.CreateSharedRecipe(owner.userID, victim.ID, "Legitimate", "", "", "", "{}", "public")
	if err != nil {
		t.Fatal(err)
	}
	securityStatus(t, attacker.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"recipeIds": []string{victim.ID}}), 200)
	securityStatus(t, attacker.doRequest("GET", "/api/share/"+legitimate.ShareToken, nil), 200)
	// A corrupt legacy visibility must never fall through the token read switch.
	// The disposable fixture removes the CHECK only to model legacy corruption.
	rows, err := s.db.Query(`SELECT conname FROM pg_constraint WHERE conrelid='shared_recipes'::regclass AND contype='c'`)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			t.Fatal(err)
		}
		names = append(names, n)
	}
	rows.Close()
	for _, n := range names {
		if _, err := s.db.Exec(`ALTER TABLE shared_recipes DROP CONSTRAINT ` + n); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.db.Exec(`UPDATE shared_recipes SET visibility='invalid-legacy' WHERE id=$1`, legitimate.ID); err != nil {
		t.Fatal(err)
	}
	securityStatus(t, attacker.doRequestNoAuth("GET", "/api/share/"+legitimate.ShareToken, nil), 404)
}

func TestSecurityConcurrentCategoryReparent(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	a, err := s.CreateCategory(&CreateCategoryRequest{Name: "A"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.CreateCategory(&CreateCategoryRequest{Name: "B"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateCategory(a.ID, &CreateCategoryRequest{Name: "A", ParentID: &a.ID}); err == nil {
		t.Fatal("self-parenting category accepted")
	}
	// Hold the production graph lock until both writers have arrived, then
	// release them together. READ COMMITTED's next statement sees the winner.
	blocker, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Rollback()
	if _, err := blocker.Exec(`SELECT pg_advisory_xact_lock(74192341)`); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 2)
	go func() {
		_, err := s.UpdateCategory(a.ID, &CreateCategoryRequest{Name: "A", ParentID: &b.ID})
		done <- err
	}()
	go func() {
		_, err := s.UpdateCategory(b.ID, &CreateCategoryRequest{Name: "B", ParentID: &a.ID})
		done <- err
	}()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var waiting int
		if err := s.db.QueryRow(`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=74192341 AND NOT granted`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting == 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("writers did not reach graph lock barrier")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if err := blocker.Commit(); err != nil {
		t.Fatal(err)
	}
	failures := 0
	for i := 0; i < 2; i++ {
		select {
		case err := <-done:
			if err != nil {
				failures++
			}
		case <-time.After(5 * time.Second):
			t.Fatal("reparent did not terminate")
		}
	}
	if failures != 1 {
		t.Fatalf("concurrent reciprocal reparents: %d errors, want one", failures)
	}
	// Legacy malformed graph: HTTP traversal must finish and return each ID once.
	if _, err := s.db.Exec(`UPDATE categories SET parent_id=CASE id WHEN $1 THEN $2 ELSE $1 END WHERE id IN ($1,$2)`, a.ID, b.ID); err != nil {
		t.Fatal(err)
	}
	env := newSecurityEnvForStore(t, s)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	req := httptest.NewRequest("GET", "/api/categories/"+a.ID+"/descendants", nil).WithContext(ctx)
	req.Header.Set("Authorization", "Bearer "+env.token)
	rec := httptest.NewRecorder()
	finished := make(chan struct{})
	go func() { env.server.Routes().ServeHTTP(rec, req); close(finished) }()
	select {
	case <-finished:
	case <-ctx.Done():
		t.Fatal("legacy category traversal did not terminate")
	}
	securityStatus(t, rec, 200)
	data := decodeJSON(t, rec)["data"].([]interface{})
	if len(data) != 2 {
		t.Fatalf("legacy cycle repeated IDs: %+v", data)
	}
}

func newSecurityEnvForStore(t *testing.T, s *PostgresStore) *testEnv {
	t.Helper()
	a, err := NewAuthService(s, "")
	if err != nil {
		t.Fatal(err)
	}
	count, err := s.UserCount()
	if err != nil {
		t.Fatal(err)
	}
	claim := ""
	if count == 0 {
		claim = securityClaim
	}
	resp, err := a.Register("graph-reader@security.test", "Password123", "Reader", claim)
	if err != nil {
		t.Fatal(err)
	}
	return &testEnv{store: s, auth: a, server: NewServer(s, a, "*", 10, NewRateLimiter()), userID: resp.User.ID, token: resp.AccessToken}
}

func TestSecurityTemplateStoreGuards(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	admin := createUser(t, s, "template-admin")
	owner := createUser(t, s, "template-owner")
	if _, err := s.CreateTemplate(owner.ID, &CreateTemplateRequest{Name: "Forged", Type: "recipe", Layout: "{}", IsDefault: true}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("store default publication bypass: %v", err)
	}
	legacy, err := s.CreateTemplate(owner.ID, &CreateTemplateRequest{Name: "Legacy owner default", Type: "recipe", Layout: "{}"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE templates SET is_default=true WHERE id=$1`, legacy.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateTemplate(owner.ID, legacy.ID, &UpdateTemplateRequest{Name: strPtr("Tampered"), IsDefault: boolPointer(false)}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("owner changed legacy default at store boundary: %v", err)
	}
	if err := s.DeleteTemplate(owner.ID, legacy.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("owner deleted legacy default at store boundary: %v", err)
	}
	if _, err := s.UpdateTemplate(admin.ID, legacy.ID, &UpdateTemplateRequest{Name: strPtr("Admin edited")}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteTemplate(admin.ID, legacy.ID); err != nil {
		t.Fatal(err)
	}
}
func TestSecurityTemplateConcurrentPublication(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	_ = createUser(t, s, "publisher-admin")
	owner := createUser(t, s, "publisher-owner")
	row, err := s.CreateTemplate(owner.ID, &CreateTemplateRequest{Name: "Owned before publish", Type: "recipe", Layout: "{}"})
	if err != nil {
		t.Fatal(err)
	}
	tx, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE templates SET is_default=true WHERE id=$1`, row.ID); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, err := s.UpdateTemplate(owner.ID, row.ID, &UpdateTemplateRequest{Name: strPtr("Racing owner overwrite")})
		done <- err
	}()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var waiting int
		if err := s.db.QueryRow(`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE templates SET name=%'`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("owner update did not reach publication barrier")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("racing owner overwrote published default: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("template write did not terminate")
	}
	var name string
	if err := s.db.QueryRow(`SELECT name FROM templates WHERE id=$1`, row.ID).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Owned before publish" {
		t.Fatal("published default content changed")
	}
}

func boolPointer(b bool) *bool { return &b }

func TestSecurityBundleGlobalCategoryAndTemplate(t *testing.T) {
	e := newTestEnv(t)
	owner := securityOtherEnv(t, e, "bundle-global-owner")
	s := e.store.(*PostgresStore)
	b := quarantineBundle("Global import", true)
	b.Categories = []BundleCategory{{BundleCategoryID: "global", Name: "New global taxonomy"}}
	b.RecipeCategories = []BundleRecipeCategory{{BundleRecipeID: b.Recipes[0].BundleRecipeID, BundleCategoryID: "global"}}
	b.Templates = []BundleTemplate{{BundleTemplateID: "template", Name: "Imported copy", Type: "recipe", Layout: json.RawMessage(`{}`)}}
	// Fail closed atomically; caller can ask an administrator to provision taxonomy.
	encoded, err := json.Marshal(b)
	if err != nil {
		t.Fatal(err)
	}
	var untrusted map[string]interface{}
	if err := json.Unmarshal(encoded, &untrusted); err != nil {
		t.Fatal(err)
	}
	untrusted["templates"].([]interface{})[0].(map[string]interface{})["isDefault"] = true
	w := owner.doRequest("POST", "/api/recipe-bundles/import", untrusted)
	if w.Code < 400 {
		t.Fatalf("ordinary import created global taxonomy: %s", w.Body.String())
	}
	var cats, recipes int
	s.db.QueryRow(`SELECT count(*) FROM categories WHERE name='New global taxonomy'`).Scan(&cats)
	s.db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, owner.userID).Scan(&recipes)
	if cats != 0 || recipes != 0 {
		t.Fatal("rejected global import did not roll back")
	}
	category, err := s.CreateCategory(&CreateCategoryRequest{Name: "New global taxonomy"})
	if err != nil {
		t.Fatal(err)
	}
	securityStatus(t, owner.doRequest("GET", "/api/categories", nil), 200)
	securityStatus(t, owner.doRequest("PUT", "/api/categories/"+category.ID, map[string]string{"name": "forged"}), 403)
	securityStatus(t, owner.doRequest("DELETE", "/api/categories/"+category.ID, nil), 403)
	securityStatus(t, owner.doRequest("POST", "/api/recipe-bundles/import", untrusted), 200)
	var defaults int
	if err := s.db.QueryRow(`SELECT count(*) FROM templates WHERE user_id=$1 AND is_default`, owner.userID).Scan(&defaults); err != nil {
		t.Fatal(err)
	}
	if defaults != 0 {
		t.Fatal("native import elevated template to global default")
	}
}

func TestSecurityBundleTrustedFoodReuseAndRollback(t *testing.T) {
	e := newTestEnv(t)
	s := e.store.(*PostgresStore)
	if _, err := s.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories,portions) VALUES(12345,'Trusted','Foundation',100,'[{"amount":1,"measureUnit":"piece","gramWeight":42}]')`); err != nil {
		t.Fatal(err)
	}
	b := minimalRecipeBundle()
	b.FoodItems[0].Description = "Forged"
	b.FoodItems[0].Nutrients.Calories = 999
	b.FoodItems[0].Portions = []FoodPortion{{Amount: 1, MeasureUnit: "piece", GramWeight: 999}}
	for i := 0; i < 2; i++ {
		securityStatus(t, e.doRequest("POST", "/api/recipe-bundles/import", b), 200)
	}
	food, err := s.GetFoodByFdcID(12345)
	if err != nil {
		t.Fatal(err)
	}
	if food.Description != "Trusted" || food.Calories != 100 || food.Portions[0].GramWeight != 42 {
		t.Fatalf("import overwrote trusted food: %+v", food)
	}
	// An accepted partial batch must roll back every dependency/promotion write
	// if persistence fails, without deleting the retained unconfirmed source.
	pending := quarantineBundle("rollback facts", false)
	pending.FoodItems = []BundleFoodItem{{FdcID: 920002, Description: "Unconfirmed", DataType: "Foundation", Nutrients: BundleNutrients{Calories: 500}}}
	pending.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "usda", FdcID: 920002}
	summary := quarantineSummary(t, e, pending)
	if _, err := s.db.Exec(`CREATE FUNCTION reject_import_book() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic persistence failure'; END$$; CREATE TRIGGER reject_import_book BEFORE INSERT ON recipe_books FOR EACH ROW EXECUTE FUNCTION reject_import_book()`); err != nil {
		t.Fatal(err)
	}
	// Add placement to a distinct pending file so failure occurs on keep.
	pending.Books = []BundleBook{{BundleBookID: "rollback-book", Title: "Rollback book"}}
	summary = quarantineSummary(t, e, pending)
	w := e.doRequest("POST", "/api/recipe-imports/"+summary["pendingImportId"].(string)+"/decision", map[string]string{"action": "keep"})
	if w.Code < 400 {
		t.Fatalf("synthetic write failure returned success: %s", w.Body.String())
	}
	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM food_items WHERE fdc_id=920002`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("failed import certified package food")
	}
	if err := s.db.QueryRow(`SELECT count(*) FROM recipe_import_batches WHERE user_id=$1 AND accepted AND context->'books' @> '[{"title":"Rollback book"}]'::jsonb`, e.userID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("failed keep persisted acceptance")
	}
}
