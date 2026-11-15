package main

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func quarantineExportFixture() RecipeBundle {
	complete, missing := "dietledger:recipe:"+uuid.NewString(), "dietledger:recipe:"+uuid.NewString()
	return RecipeBundle{Format: RecipeBundleFormat, Version: 2,
		Recipes: []BundleRecipe{
			{PortableID: complete, BundleRecipeID: complete, Name: "Promoted export fixture", Servings: 1, ServingName: "serving", Ingredients: []BundleIngredient{{BundleIngredientID: "zero", Name: "Intentional zero", Amount: 1, Unit: "pinch", Source: BundleIngredientSourceRef{Type: "manual"}, ZeroNutritionOverride: true}}},
			{PortableID: missing, BundleRecipeID: missing, Name: "Quarantined export fixture", Servings: 1, ServingName: "serving", Ingredients: []BundleIngredient{{BundleIngredientID: "missing", Name: "Missing database source", Amount: 20, Unit: "g", Source: BundleIngredientSourceRef{Type: "usda", FdcID: 99999991}, Nutrients: BundleNutrients{Calories: 10}}}},
		},
		Books:          []BundleBook{{BundleBookID: "import-book", Title: "Staged cookbook", Description: "Both placements must survive", CoverColor: "#059669"}},
		Chapters:       []BundleChapter{{BundleChapterID: "import-chapter", BundleBookID: "import-book", Title: "Mixed chapter", Position: 2}},
		ChapterRecipes: []BundleChapterRecipe{{BundleChapterID: "import-chapter", BundleRecipeID: complete, Position: 1}, {BundleChapterID: "import-chapter", BundleRecipeID: missing, Position: 3}},
	}
}

func stageAndKeepQuarantineExportFixture(t *testing.T, env *testEnv) []map[string]interface{} {
	t.Helper()
	var beforeCount int
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, env.userID).Scan(&beforeCount); err != nil {
		t.Fatal(err)
	}
	w := env.doRequest("POST", "/api/recipe-bundles/import", quarantineExportFixture())
	if w.Code != 200 {
		t.Fatalf("stage status=%d body=%s", w.Code, w.Body.String())
	}
	data := decodeJSON(t, w)["data"].(map[string]interface{})
	batch, ok := data["pendingImportId"].(string)
	if !ok || batch == "" || data["requiresDecision"] != true {
		t.Fatalf("missing-link import did not await a decision: %+v", data)
	}
	var mainCount int
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, env.userID).Scan(&mainCount); err != nil {
		t.Fatal(err)
	}
	if mainCount != beforeCount {
		t.Fatalf("import changed main recipe count from %d to %d before the missing-link decision", beforeCount, mainCount)
	}
	w = env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "keep"})
	if w.Code != 200 {
		t.Fatalf("keep status=%d body=%s", w.Code, w.Body.String())
	}
	w = env.doRequest("GET", "/api/recipe-imports", nil)
	if w.Code != 200 {
		t.Fatalf("quarantine status=%d body=%s", w.Code, w.Body.String())
	}
	var response struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response.Data
}

func TestImportQuarantineOrdinaryExportsReadOnlyPromotedRecipes(t *testing.T) {
	env := newTestEnv(t)
	staged := stageAndKeepQuarantineExportFixture(t, env)
	if len(staged) != 1 {
		t.Fatalf("quarantine count=%d want 1", len(staged))
	}
	stagedID := staged[0]["id"].(string)
	w := env.doRequest("GET", "/api/recipe-bundles/candidates", nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), "Quarantined export fixture") {
		t.Fatalf("ordinary candidates exposed staged recipe: %d %s", w.Code, w.Body.String())
	}
	w = env.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"recipeIds": []string{stagedID}})
	if w.Code != 403 && w.Code != 404 {
		t.Fatalf("direct staged-ID export should be rejected: %d %s", w.Code, w.Body.String())
	}
	var bookID string
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, env.userID).Scan(&bookID); err != nil {
		t.Fatal(err)
	}
	w = env.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"bookIds": []string{bookID}})
	if w.Code != 200 {
		t.Fatalf("ordinary book export status=%d body=%s", w.Code, w.Body.String())
	}
	var response struct {
		Data RecipeBundle `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Data.Recipes) != 1 || response.Data.Recipes[0].Name != "Promoted export fixture" || len(response.Data.ChapterRecipes) != 1 || response.Data.ChapterRecipes[0].Position != 1 {
		t.Fatalf("ordinary export lost valid placement or exposed quarantine: %s", w.Body.String())
	}
	backup, err := env.store.(*PostgresStore).ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}
	if backup.Version != 3 || !strings.Contains(string(raw), "Quarantined export fixture") {
		t.Fatalf("owner backup omitted staged content: %s", raw)
	}
}

func TestImportQuarantinePromotionPreservesBookAndQueueAcrossFiveImports(t *testing.T) {
	env := newTestEnv(t)
	stageAndKeepQuarantineExportFixture(t, env)
	// Four more independent files accumulate; no import replaces the queue.
	for i := 0; i < 4; i++ {
		bundle := quarantineExportFixture()
		bundle.Recipes = bundle.Recipes[1:]
		bundle.Books, bundle.Chapters, bundle.ChapterRecipes = nil, nil, nil
		w := env.doRequest("POST", "/api/recipe-bundles/import", bundle)
		if w.Code != 200 {
			t.Fatalf("stage file %d: %d %s", i, w.Code, w.Body.String())
		}
		batch := decodeJSON(t, w)["data"].(map[string]interface{})["pendingImportId"].(string)
		w = env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "keep"})
		if w.Code != 200 {
			t.Fatalf("keep file %d: %d %s", i, w.Code, w.Body.String())
		}
	}
	w := env.doRequest("GET", "/api/recipe-imports", nil)
	var response struct {
		Data []struct {
			ID         string   `json:"id"`
			BatchID    string   `json:"batchId"`
			BookTitles []string `json:"bookTitles"`
			Unresolved []struct {
				IngredientID string `json:"ingredientId"`
			} `json:"unresolvedIngredients"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Data) != 5 {
		t.Fatalf("five imports should retain five unresolved recipes: %s", w.Body.String())
	}
	var bookRecipeID, ingredientID string
	for _, r := range response.Data {
		if len(r.BookTitles) > 0 {
			bookRecipeID = r.ID
			if len(r.Unresolved) > 0 {
				ingredientID = r.Unresolved[0].IngredientID
			}
		}
	}
	if bookRecipeID == "" {
		t.Fatal("quarantine lost original book context")
	}
	// Canceling a sixth file must not affect the five previous imports.
	incoming := quarantineExportFixture()
	w = env.doRequest("POST", "/api/recipe-bundles/import", incoming)
	if w.Code != 200 {
		t.Fatalf("stage cancellation case: %d %s", w.Code, w.Body.String())
	}
	batch := decodeJSON(t, w)["data"].(map[string]interface{})["pendingImportId"].(string)
	w = env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "cancel"})
	if w.Code != 200 {
		t.Fatalf("cancel new batch: %d %s", w.Code, w.Body.String())
	}
	w = env.doRequest("GET", "/api/recipe-imports", nil)
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Data) != 5 {
		t.Fatalf("cancel cleared prior quarantine: %s", w.Body.String())
	}
	// The existing no-nutrition match is one intentional resolution, not an
	// inferred zero. Promotion removes only this recipe and attaches its join.
	w = env.doRequest("PUT", "/api/recipe-imports/"+bookRecipeID+"/ingredients/"+ingredientID, map[string]interface{}{"fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true, "name": "Missing database source", "amount": 20, "unit": "g"})
	if w.Code != 200 {
		t.Fatalf("repair staged book ingredient: %d %s", w.Code, w.Body.String())
	}
	w = env.doRequest("GET", "/api/recipe-imports", nil)
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Data) != 4 {
		t.Fatalf("promotion did not remove exactly one staged row: %s", w.Body.String())
	}
	var bookID string
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, env.userID).Scan(&bookID); err != nil {
		t.Fatal(err)
	}
	w = env.doRequest("POST", "/api/recipe-bundles/export", map[string]interface{}{"bookIds": []string{bookID}})
	var exported struct {
		Data RecipeBundle `json:"data"`
	}
	if w.Code != 200 {
		t.Fatalf("postrepair export: %d %s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &exported); err != nil {
		t.Fatal(err)
	}
	if len(exported.Data.Recipes) != 2 || len(exported.Data.Chapters) != 1 || len(exported.Data.ChapterRecipes) != 2 {
		t.Fatalf("repair lost prior book joins or duplicated chapters: %s", w.Body.String())
	}
	positions := map[int]bool{}
	for _, join := range exported.Data.ChapterRecipes {
		positions[join.Position] = true
	}
	if !positions[1] || !positions[3] {
		t.Fatalf("original chapter positions not preserved: %+v", exported.Data.ChapterRecipes)
	}
}

func TestImportQuarantineV3CannotBypassStaging(t *testing.T) {
	env := newTestEnv(t)
	bundle := quarantineExportFixture()
	bundle.Recipes = bundle.Recipes[1:]
	bundle.Books, bundle.Chapters, bundle.ChapterRecipes = nil, nil, nil
	// A caller-controlled backup envelope must not publish unresolved recipes.
	payload, err := json.Marshal(bundle)
	if err != nil {
		t.Fatal(err)
	}
	var input map[string]interface{}
	if err := json.Unmarshal(payload, &input); err != nil {
		t.Fatal(err)
	}
	input["version"] = 3
	input["pendingImports"] = map[string]interface{}{"version": 1, "batches": []interface{}{}, "recipes": []interface{}{}}
	w := env.doRequest("POST", "/api/recipe-bundles/import", input)
	if w.Code != 200 && w.Code != 400 {
		t.Fatalf("unexpected v3 import result: %d %s", w.Code, w.Body.String())
	}
	var count int
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, env.userID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("v3 envelope bypassed staging and published %d unresolved recipes", count)
	}
}

func TestImportQuarantineLaterImportDoesNotReplayCompletedBatch(t *testing.T) {
	env := newTestEnv(t)
	foodKey := "dietledger:food:" + uuid.NewString()
	first := quarantineExportFixture()
	first.Recipes = first.Recipes[:1]
	first.Books, first.Chapters, first.ChapterRecipes = nil, nil, nil
	first.CustomFoods = []BundleCustomFood{{PortableID: foodKey, BundleCustomFoodID: foodKey, Name: "Original custom food", Nutrients: BundleNutrients{Calories: 50}}}
	first.Recipes[0].Ingredients[0] = BundleIngredient{BundleIngredientID: "custom", Name: "Custom ingredient", Amount: 100, Unit: "g", Source: BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: foodKey}, Nutrients: BundleNutrients{Calories: 50}}
	w := env.doRequest("POST", "/api/recipe-bundles/import", first)
	if w.Code != 200 {
		t.Fatalf("first complete import failed: %d %s", w.Code, w.Body.String())
	}
	if _, err := env.store.(*PostgresStore).db.Exec(`UPDATE custom_foods SET calories=75 WHERE user_id=$1 AND portable_id=$2`, env.userID, foodKey); err != nil {
		t.Fatal(err)
	}
	second := quarantineExportFixture()
	second.Recipes = second.Recipes[:1]
	second.Books, second.Chapters, second.ChapterRecipes = nil, nil, nil
	w = env.doRequest("POST", "/api/recipe-bundles/import", second)
	if w.Code != 200 {
		t.Fatalf("later unrelated import replayed an already-completed batch: %d %s", w.Code, w.Body.String())
	}
	var calories float64
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT calories FROM custom_foods WHERE user_id=$1 AND portable_id=$2`, env.userID, foodKey).Scan(&calories); err != nil {
		t.Fatal(err)
	}
	if calories != 75 {
		t.Fatalf("later import overwrote earlier user edit: calories=%v", calories)
	}
}

func TestImportQuarantineCanonicalRelinkRecalculatesExistingMeasurements(t *testing.T) {
	env := newTestEnv(t)
	queue := stageAndKeepQuarantineExportFixture(t, env)
	if len(queue) != 1 {
		t.Fatal(queue)
	}
	id := queue[0]["id"].(string)
	rows := queue[0]["unresolvedIngredients"].([]interface{})
	ingredientID := rows[0].(map[string]interface{})["ingredientId"].(string)
	if _, err := env.store.(*PostgresStore).db.Exec(`INSERT INTO food_items (fdc_id,description,data_type,calories,sodium) VALUES (87654321,'Canonical replacement','Foundation',50,12)`); err != nil {
		t.Fatal(err)
	}
	w := env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/"+ingredientID, map[string]interface{}{"fdcId": 87654321, "sourceType": "usda", "sourceKey": "87654321", "name": "Missing database source", "amount": 20, "unit": "g", "calories": 999, "sodium": 999})
	if w.Code != 200 {
		t.Fatalf("relink failed: %d %s", w.Code, w.Body.String())
	}
	var calories, sodium float64
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT i.calories,i.sodium FROM ingredients i JOIN recipes r ON r.id=i.recipe_id WHERE r.user_id=$1 AND r.name='Quarantined export fixture'`, env.userID).Scan(&calories, &sodium); err != nil {
		t.Fatal(err)
	}
	if calories != 10 || sodium != 2.4 {
		t.Fatalf("relink used supplied snapshot instead of ordinary canonical scaling: calories=%v sodium=%v", calories, sodium)
	}
}

func TestImportQuarantinePreservesUnchangedSnapshots(t *testing.T) {
	for _, kind := range []string{"v2", "v3", "repair other ingredient"} {
		t.Run(kind, func(t *testing.T) {
			env := newTestEnv(t)
			foodKey := "dietledger:food:" + uuid.NewString()
			bundle := quarantineExportFixture()
			bundle.Books, bundle.Chapters, bundle.ChapterRecipes = nil, nil, nil
			bundle.Recipes = bundle.Recipes[:1]
			bundle.CustomFoods = []BundleCustomFood{{PortableID: foodKey, BundleCustomFoodID: foodKey, Name: "Snapshot source", Nutrients: BundleNutrients{Calories: 100}}}
			bundle.Recipes[0].Ingredients = []BundleIngredient{{BundleIngredientID: "retained", Name: "Retained snapshot", Amount: 50, Unit: "g", Source: BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: foodKey}, Nutrients: BundleNutrients{Calories: 37}}}
			if kind == "repair other ingredient" {
				bundle.Recipes[0].Ingredients = append(bundle.Recipes[0].Ingredients, BundleIngredient{BundleIngredientID: "repair", Name: "Repair this", Amount: 1, Unit: "pinch", Source: BundleIngredientSourceRef{Type: "manual"}})
			}
			payload, err := json.Marshal(bundle)
			if err != nil {
				t.Fatal(err)
			}
			var input map[string]interface{}
			if err := json.Unmarshal(payload, &input); err != nil {
				t.Fatal(err)
			}
			if kind == "v3" {
				input["version"] = 3
				input["pendingImports"] = map[string]interface{}{"version": 1, "batches": []interface{}{}, "recipes": []interface{}{}}
			}
			w := env.doRequest("POST", "/api/recipe-bundles/import", input)
			if w.Code != 200 {
				t.Fatalf("import: %d %s", w.Code, w.Body.String())
			}
			if kind == "repair other ingredient" {
				batch := decodeJSON(t, w)["data"].(map[string]interface{})["pendingImportId"].(string)
				w = env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "keep"})
				if w.Code != 200 {
					t.Fatal(w.Body.String())
				}
				w = env.doRequest("GET", "/api/recipe-imports", nil)
				var queue struct {
					Data []struct {
						ID string `json:"id"`
					} `json:"data"`
				}
				if err := json.Unmarshal(w.Body.Bytes(), &queue); err != nil {
					t.Fatal(err)
				}
				if len(queue.Data) != 1 {
					t.Fatalf("expected mixed staged recipe: %s", w.Body.String())
				}
				w = env.doRequest("PUT", "/api/recipe-imports/"+queue.Data[0].ID+"/ingredients/repair", map[string]interface{}{"fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true, "name": "Repair this", "amount": 1, "unit": "pinch"})
				if w.Code != 200 {
					t.Fatalf("repair: %d %s", w.Code, w.Body.String())
				}
			}
			var calories float64
			if err := env.store.(*PostgresStore).db.QueryRow(`SELECT i.calories FROM ingredients i JOIN recipes r ON r.id=i.recipe_id WHERE r.user_id=$1 AND i.name='Retained snapshot'`, env.userID).Scan(&calories); err != nil {
				t.Fatal(err)
			}
			if calories != 37 {
				t.Fatalf("unchanged ingredient snapshot was rewritten: got %v want37", calories)
			}
		})
	}
}

func TestImportQuarantineBackupRetainsRowlessPendingDecisions(t *testing.T) {
	env := newTestEnv(t)
	b := quarantineBundle("Shared pending import", false)
	b.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
	first := quarantineSummary(t, env, b)
	b.Source.Version = "Second incoming file"
	second := quarantineSummary(t, env, b)
	quarantineKeep(t, env, second)
	rows := quarantineRows(t, env)
	var stagedID string
	for _, row := range rows {
		if row["requiresDecision"] == false {
			stagedID = row["id"].(string)
		}
	}
	if stagedID == "" {
		t.Fatal("accepted file lost its shared staged row")
	}
	w := env.doRequest("PUT", "/api/recipe-imports/"+stagedID+"/ingredients/ingredient", map[string]interface{}{"fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true, "name": "Original ingredient", "amount": 50, "unit": "g"})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	source := env.store.(*PostgresStore)
	backup, err := source.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if backup.Version != 3 || backup.PendingImports == nil || len(backup.PendingImports.Batches) != 1 || len(backup.PendingImports.Recipes) != 0 {
		t.Fatalf("backup lost pending choice after another file promoted the shared recipe: %+v", backup)
	}
	if backup.PendingImports.Batches[0].ID != first["pendingImportId"] {
		t.Fatal("backup retained wrong pending batch")
	}
	target := ownerBackupRestoreStore(t, source)
	owner := createUser(t, target, "rowless-backup")
	if _, err := target.StageRecipeBundle(owner.ID, *backup); err != nil {
		t.Fatal(err)
	}
	queue, err := target.ListQuarantinedRecipes(owner.ID)
	if err != nil || len(queue) != 1 || !queue[0].RequiresDecision {
		t.Fatalf("restored pending choice is inaccessible: %+v %v", queue, err)
	}
	if _, err := target.DecideRecipeImport(owner.ID, queue[0].BatchID, "cancel"); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := target.db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, owner.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("cancelling restored pending choice deleted published recipe")
	}
}

func TestImportQuarantineBackupRetainsUnacceptedExistingBookAliases(t *testing.T) {
	env := newTestEnv(t)
	first := quarantineExportFixture()
	first.Recipes = first.Recipes[:1]
	first.ChapterRecipes = first.ChapterRecipes[:1]
	if w := env.doRequest("POST", "/api/recipe-bundles/import", first); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	incoming := first
	incoming.Source.Version = "Later file sharing the existing book"
	missing := quarantineExportFixture().Recipes[1]
	incoming.Recipes = append(append([]BundleRecipe(nil), first.Recipes...), missing)
	incoming.ChapterRecipes = append(append([]BundleChapterRecipe(nil), first.ChapterRecipes...), BundleChapterRecipe{BundleChapterID: "import-chapter", BundleRecipeID: missing.BundleRecipeID, Position: 3})
	w := env.doRequest("POST", "/api/recipe-bundles/import", incoming)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	backup, err := env.store.(*PostgresStore).ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	target := ownerBackupRestoreStore(t, env.store.(*PostgresStore))
	owner := createUser(t, target, "existing-book-alias")
	if _, err := target.StageRecipeBundle(owner.ID, *backup); err != nil {
		t.Fatal(err)
	}
	queue, err := target.ListQuarantinedRecipes(owner.ID)
	if err != nil || len(queue) != 1 {
		t.Fatalf("restored pending rows: %+v %v", queue, err)
	}
	if _, err := target.DecideRecipeImport(owner.ID, queue[0].BatchID, "keep"); err != nil {
		t.Fatal(err)
	}
	var books, chapters int
	if err := target.db.QueryRow(`SELECT count(*) FROM recipe_books WHERE user_id=$1`, owner.ID).Scan(&books); err != nil {
		t.Fatal(err)
	}
	if err := target.db.QueryRow(`SELECT count(*) FROM chapters ch JOIN recipe_books b ON b.id=ch.book_id WHERE b.user_id=$1`, owner.ID).Scan(&chapters); err != nil {
		t.Fatal(err)
	}
	if books != 1 || chapters != 1 {
		t.Fatalf("pending restore lost existing book aliases: books=%d chapters=%d", books, chapters)
	}
}

func TestImportQuarantineBackupFailsClosedForUnrestorableMainSnapshot(t *testing.T) {
	env := newTestEnv(t)
	source := env.store.(*PostgresStore)
	_ = exportTestRecipe(t, source, env.userID, "Manual incomplete main draft")
	w := env.doRequest("POST", "/api/recipe-bundles/import", quarantineBundle("Imported unresolved draft", false))
	if w.Code != 200 {
		t.Fatalf("stage: %d %s", w.Code, w.Body.String())
	}
	if backup, err := source.ExportOwnerRecipeBookBackup(env.userID); err == nil || backup != nil {
		t.Fatalf("backup returned a v3 envelope that public restore would reject: %+v err=%v", backup, err)
	}
}

func TestImportQuarantineOwnerBackupRestoresBothStores(t *testing.T) {
	env := newTestEnv(t)
	staged := stageAndKeepQuarantineExportFixture(t, env)
	source := env.store.(*PostgresStore)
	backup, err := source.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	target := ownerBackupRestoreStore(t, source)
	recipient := createUser(t, target, "staged-backup-restore")
	if _, err := target.ImportRecipeBundle(recipient.ID, *backup); err != nil {
		t.Fatalf("restore main and staged content: %v", err)
	}
	reexport, err := target.ExportOwnerRecipeBookBackup(recipient.ID)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(reexport)
	if err != nil {
		t.Fatal(err)
	}
	if reexport.Version != 3 || !strings.Contains(string(raw), "Quarantined export fixture") || !strings.Contains(string(raw), "Promoted export fixture") || !strings.Contains(string(raw), "Both placements must survive") {
		t.Fatalf("restore omitted staged/promoted content or pending placement: %s", raw)
	}
	var mainCount int
	if err := target.db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, recipient.ID).Scan(&mainCount); err != nil {
		t.Fatal(err)
	}
	if mainCount != 1 {
		t.Fatalf("restored %d main recipes, expected only the promoted recipe; staged=%v", mainCount, staged)
	}
	// Restoring bytes is not enough: a restored staged recipe must still be
	// repairable, and its original book position must materialize on promotion.
	auth, err := NewAuthService(target, "")
	if err != nil {
		t.Fatal(err)
	}
	login, err := auth.Login(recipient.Email, "password123")
	if err != nil {
		t.Fatal(err)
	}
	restoredEnv := &testEnv{store: target, auth: auth, server: NewServer(target, auth, "*", 10, NewRateLimiter()), token: login.AccessToken, userID: recipient.ID}
	w := restoredEnv.doRequest("GET", "/api/recipe-imports", nil)
	var queue struct {
		Data []struct {
			ID         string `json:"id"`
			Unresolved []struct {
				IngredientID string `json:"ingredientId"`
			} `json:"unresolvedIngredients"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &queue); err != nil {
		t.Fatal(err)
	}
	if len(queue.Data) != 1 || len(queue.Data[0].Unresolved) != 1 {
		t.Fatalf("restore did not retain actionable quarantine: %d %s", w.Code, w.Body.String())
	}
	w = restoredEnv.doRequest("PUT", "/api/recipe-imports/"+queue.Data[0].ID+"/ingredients/"+queue.Data[0].Unresolved[0].IngredientID, map[string]interface{}{"fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true, "name": "Missing database source", "amount": 20, "unit": "g"})
	if w.Code != 200 {
		t.Fatalf("restored quarantine could not be repaired: %d %s", w.Code, w.Body.String())
	}
	var joins int
	if err := target.db.QueryRow(`SELECT count(*) FROM chapter_recipes cr JOIN chapters ch ON ch.id=cr.chapter_id JOIN recipe_books b ON b.id=ch.book_id WHERE b.user_id=$1`, recipient.ID).Scan(&joins); err != nil {
		t.Fatal(err)
	}
	if joins != 2 {
		t.Fatalf("restored promotion did not reconstruct original book placement: joins=%d", joins)
	}
	final, err := target.ExportOwnerRecipeBookBackup(recipient.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(final.Recipes) != 2 || len(final.Books) != 1 || len(final.Chapters) != 1 || len(final.ChapterRecipes) != 2 {
		t.Fatalf("restored promotion lost or duplicated main graph: %+v", final)
	}
}
