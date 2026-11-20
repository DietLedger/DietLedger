package main

import (
	"encoding/json"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/google/uuid"
)

// Include timestamps, identities and retained payloads: a retry must not merely
// leave the same row counts while rewriting owner content or repair receipts.
func receiptSnapshot(t *testing.T, env *testEnv) string {
	t.Helper()
	db := env.store.(*PostgresStore).db
	all := map[string]string{}
	for _, table := range []string{"recipes", "ingredients", "recipe_books", "chapters", "book_pages", "chapter_pages", "chapter_recipes", "custom_foods", "templates", "import_object_mappings", "recipe_import_batches", "recipe_import_staged", "recipe_import_resolutions"} {
		var payload string
		if err := db.QueryRow(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM ` + table + ` t`).Scan(&payload); err != nil {
			t.Fatal(err)
		}
		all[table] = payload
	}
	raw, err := json.Marshal(all)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestImportReceiptPartialPortableRecipeSetPreservesSurvivor(t *testing.T) {
	env := newTestEnv(t)
	b := duplicateBookBundle("portable-deleted", "Book", true)
	b.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
	other := quarantineBundle("portable-surviving", true).Recipes[0]
	other.PortableID = "dietledger:recipe:" + uuid.NewString()
	b.Recipes = append(b.Recipes, other)
	b.ChapterRecipes = append(b.ChapterRecipes, BundleChapterRecipe{BundleChapterID: b.Chapters[0].BundleChapterID, BundleRecipeID: other.BundleRecipeID, Position: 1})
	duplicateBookResponse(t, env, b)
	db := env.store.(*PostgresStore).db
	var deleted string
	if err := db.QueryRow(`SELECT id FROM recipes WHERE portable_id=$1`, b.Recipes[0].PortableID).Scan(&deleted); err != nil {
		t.Fatal(err)
	}
	receiptDelete(t, env, "/api/recipes/"+deleted)
	if _, err := db.Exec(`UPDATE recipes SET name='Owner survivor'; UPDATE chapter_recipes SET position=42`); err != nil {
		t.Fatal(err)
	}
	var before, after string
	query := `SELECT to_jsonb(r)::text FROM recipes r WHERE portable_id=$1`
	if err := db.QueryRow(query, other.PortableID).Scan(&before); err != nil {
		t.Fatal(err)
	}
	result := duplicateBookResponse(t, env, b)
	if result["created"].(map[string]interface{})["recipes"] != float64(1) || quarantineMainCount(t, env) != 2 || duplicateBookCount(t, env, "chapter_recipes") != 2 {
		t.Fatalf("partial portable set not restored: %+v", result)
	}
	if err := db.QueryRow(query, other.PortableID).Scan(&after); err != nil || before != after {
		t.Fatalf("surviving portable recipe changed: %v", err)
	}
	var position int
	if err := db.QueryRow(`SELECT cr.position FROM chapter_recipes cr JOIN recipes r ON r.id=cr.recipe_id WHERE r.portable_id=$1`, other.PortableID).Scan(&position); err != nil || position != 42 {
		t.Fatalf("surviving placement moved: %d %v", position, err)
	}
}

func TestImportReceiptExactRetryPreservesAllEdits(t *testing.T) {
	env := newTestEnv(t)
	b := duplicateBookBundle("edited-retry", "Book", true)
	b.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
	duplicateBookResponse(t, env, b)
	db := env.store.(*PostgresStore).db
	if _, err := db.Exec(`UPDATE recipes SET name='Owner recipe'; UPDATE ingredients SET description='Owner ingredient'; UPDATE recipe_books SET title='Owner book'; UPDATE book_pages SET content='Owner page'; UPDATE chapters SET title='Owner chapter'; UPDATE chapter_recipes SET position=42`); err != nil {
		t.Fatal(err)
	}
	before := receiptSnapshot(t, env)
	b.ExportedAt = "2026-11-19T00:00:00Z" // Not a new import identity.
	retry := duplicateBookResponse(t, env, b)
	if len(retry["created"].(map[string]interface{})) != 0 || len(retry["updated"].(map[string]interface{})) != 0 || len(retry["reused"].(map[string]interface{})) != 0 {
		t.Fatalf("exact retry was not a no-op: %+v", retry)
	}
	if before != receiptSnapshot(t, env) {
		t.Fatal("exact retry rewrote surviving content or receipts")
	}
}

func TestImportReceiptPendingRetryPreservesDecisionAndRepairs(t *testing.T) {
	for _, accepted := range []bool{false, true} {
		t.Run(map[bool]string{false: "unaccepted", true: "accepted"}[accepted], func(t *testing.T) {
			env := newTestEnv(t)
			b := duplicateBookBundle("pending-retry", "Pending", false)
			b.Recipes[0].Ingredients = append(b.Recipes[0].Ingredients, BundleIngredient{BundleIngredientID: "second", Name: "Second", Amount: 1, Unit: "g", Source: BundleIngredientSourceRef{Type: "manual"}})
			first := duplicateBookResponse(t, env, b)
			batch := first["pendingImportId"].(string)
			if accepted {
				quarantineKeep(t, env, first)
				id := quarantineRows(t, env)[0]["id"].(string)
				w := env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
				if w.Code != 200 {
					t.Fatal(w.Body.String())
				}
			}
			before := receiptSnapshot(t, env)
			retry := duplicateBookResponse(t, env, b)
			if retry["requiresDecision"] != !accepted || len(quarantineRows(t, env)) != 1 || quarantineMainCount(t, env) != 0 {
				t.Fatalf("retry changed decision/staging: %+v", retry)
			}
			if !accepted && retry["pendingImportId"] != batch {
				t.Fatal("retry replaced pending batch")
			}
			if before != receiptSnapshot(t, env) {
				t.Fatal("retry changed mutable staging or receipts")
			}
		})
	}
}

func TestImportReceiptConcurrentRestoreAndRollback(t *testing.T) {
	env := newTestEnv(t)
	b := duplicateBookBundle("rollback", "Book", true)
	duplicateBookResponse(t, env, b)
	book, recipe := receiptIDs(t, env)
	receiptDelete(t, env, "/api/books/"+book)
	receiptDelete(t, env, "/api/recipes/"+recipe)
	db := env.store.(*PostgresStore).db
	if _, err := db.Exec(`CREATE FUNCTION fail_receipt_restore() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected receipt restore failure'; END $$; CREATE TRIGGER fail_receipt_restore BEFORE INSERT ON ingredients FOR EACH ROW EXECUTE FUNCTION fail_receipt_restore()`); err != nil {
		t.Fatal(err)
	}
	before := receiptSnapshot(t, env)
	w := env.doRequest("POST", "/api/recipe-bundles/import", b)
	if w.Code != 400 {
		t.Fatalf("injected restore: %d %s", w.Code, w.Body.String())
	}
	if before != receiptSnapshot(t, env) {
		t.Fatal("failed restore did not roll back receipt, mappings, staging and structure")
	}
	if _, err := db.Exec(`DROP TRIGGER fail_receipt_restore ON ingredients; DROP FUNCTION fail_receipt_restore()`); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, 4)
	start := make(chan struct{})
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; responses <- env.doRequest("POST", "/api/recipe-bundles/import", b) }()
	}
	close(start)
	wg.Wait()
	close(responses)
	created := 0.0
	for response := range responses {
		if response.Code != 200 {
			t.Fatalf("concurrent restore: %d %s", response.Code, response.Body.String())
		}
		summary := decodeJSON(t, response)["data"].(map[string]interface{})
		if n, ok := summary["created"].(map[string]interface{})["recipes"].(float64); ok {
			created += n
		}
	}
	if created != 1 {
		t.Fatalf("concurrent requests restored recipe %v times", created)
	}
	receiptAssertRestored(t, env)
}

func TestImportReceiptSupersededClaimsNeverRestored(t *testing.T) {
	env := newTestEnv(t)
	old := duplicateBookBundle("old-claim", "Book", true)
	duplicateBookResponse(t, env, old)
	book, recipe := receiptIDs(t, env)
	replacement := duplicateBookBundle("replacement-claim", "Book", true)
	choice := duplicateBookChoice(t, duplicateBookResponse(t, env, replacement), "replace")
	duplicateBookResponse(t, env, duplicateChoiceBody(replacement, choice))
	receiptDelete(t, env, "/api/books/"+book)
	receiptDelete(t, env, "/api/recipes/"+recipe)
	result := duplicateBookResponse(t, env, old)
	if result["created"].(map[string]interface{})["recipes"] != float64(1) || duplicateBookCount(t, env, "recipe_books") != 0 || duplicateBookCount(t, env, "chapter_recipes") != 0 {
		t.Fatal("old completed receipt resurrected superseded book claims or failed to restore independent recipe")
	}
	before := receiptSnapshot(t, env)
	duplicateBookResponse(t, env, old)
	if before != receiptSnapshot(t, env) {
		t.Fatal("superseded retry was not a no-op")
	}
}

func TestImportReceiptNewSameTitleConflictFailsWithoutWrites(t *testing.T) {
	env := newTestEnv(t)
	b := duplicateBookBundle("conflict-restore", "Book", true)
	duplicateBookResponse(t, env, b)
	book, recipe := receiptIDs(t, env)
	receiptDelete(t, env, "/api/books/"+book)
	receiptDelete(t, env, "/api/recipes/"+recipe)
	w := env.doRequest("POST", "/api/books", map[string]string{"title": "Book"})
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	before := receiptSnapshot(t, env)
	w = env.doRequest("POST", "/api/recipe-bundles/import", b)
	if w.Code != 409 || before != receiptSnapshot(t, env) {
		t.Fatalf("new conflict silently reused/overwrote target: %d %s", w.Code, w.Body.String())
	}
}

func TestImportReceiptUnrelatedPromotionPreservesDeletedPlacements(t *testing.T) {
	env := newTestEnv(t)
	b := duplicateBookBundle("shared-pending", "Book", false)
	ready := quarantineBundle("ready-sibling", true).Recipes[0]
	b.Recipes = append(b.Recipes, ready)
	b.ChapterRecipes = append(b.ChapterRecipes, BundleChapterRecipe{BundleChapterID: b.Chapters[0].BundleChapterID, BundleRecipeID: ready.BundleRecipeID, Position: 1})
	quarantineKeep(t, env, duplicateBookResponse(t, env, b))
	db := env.store.(*PostgresStore).db
	if _, err := db.Exec(`DELETE FROM chapter_recipes; DELETE FROM book_pages`); err != nil {
		t.Fatal(err)
	}
	duplicateBookResponse(t, env, quarantineBundle("unrelated-ready", true))
	if duplicateBookCount(t, env, "book_pages") != 0 || duplicateBookCount(t, env, "chapter_recipes") != 0 {
		t.Fatal("unrelated import replayed deleted placements")
	}
	rows := quarantineRows(t, env)
	w := env.doRequest("PUT", "/api/recipe-imports/"+rows[0]["id"].(string)+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if duplicateBookCount(t, env, "book_pages") != 0 || duplicateBookCount(t, env, "chapter_recipes") != 1 {
		t.Fatal("repair recreated deleted page or surviving recipe's removed join")
	}
	// Explicit reimport, unlike unrelated promotion, can restore missing claims.
	duplicateBookResponse(t, env, b)
	if duplicateBookCount(t, env, "book_pages") != 1 || duplicateBookCount(t, env, "chapter_recipes") != 2 {
		t.Fatal("explicit import failed to restore missing placements")
	}
}

func TestImportReceiptStructureRestoreRetainsLiveTemplateEdits(t *testing.T) {
	for _, deletedTemplate := range []bool{false, true} {
		t.Run(map[bool]string{false: "live", true: "deleted"}[deletedTemplate], func(t *testing.T) {
			env := newTestEnv(t)
			b := duplicateBookBundle("template-restore", "Book", true)
			key := "template"
			b.Templates = []BundleTemplate{{BundleTemplateID: key, Name: "Source template", Type: "recipe", Layout: json.RawMessage(`{"source":true}`)}}
			b.Chapters[0].BundleRecipeTemplateID = &key
			b.ChapterPages = []BundleChapterPage{{BundleChapterPageID: "chapter-page", BundleChapterID: b.Chapters[0].BundleChapterID, Title: "Chapter page", Content: "Preserved source"}}
			b.CustomFoods = []BundleCustomFood{{BundleCustomFoodID: "extra-food", Name: "Source food", Nutrients: BundleNutrients{Calories: 50}}}
			duplicateBookResponse(t, env, b)
			book, _ := receiptIDs(t, env)
			db := env.store.(*PostgresStore).db
			var template string
			if err := db.QueryRow(`SELECT id FROM templates`).Scan(&template); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`UPDATE templates SET name='Owner template',layout_json='{"owner":true}'; UPDATE custom_foods SET name='Owner food',calories=75`); err != nil {
				t.Fatal(err)
			}
			if deletedTemplate {
				if _, err := db.Exec(`DELETE FROM templates`); err != nil {
					t.Fatal(err)
				}
			}
			receiptDelete(t, env, "/api/books/"+book)
			duplicateBookResponse(t, env, b)
			if duplicateBookCount(t, env, "chapter_pages") != 1 {
				t.Fatal("chapter page not restored")
			}
			var ref *string
			if err := db.QueryRow(`SELECT recipe_template_id FROM chapters`).Scan(&ref); err != nil {
				t.Fatal(err)
			}
			if deletedTemplate {
				if ref != nil || duplicateBookCount(t, env, "templates") != 0 {
					t.Fatal("deleted template resurrected or dangling reference installed")
				}
			} else {
				if ref == nil || *ref != template {
					t.Fatal("restored chapter lost its live template reference")
				}
				var name, layout string
				if err := db.QueryRow(`SELECT name,layout_json->>'owner' FROM templates WHERE id=$1`, template).Scan(&name, &layout); err != nil || name != "Owner template" || layout != "true" {
					t.Fatalf("template edit overwritten: %s %s %v", name, layout, err)
				}
			}
			var name string
			var calories float64
			if err := db.QueryRow(`SELECT name,calories FROM custom_foods`).Scan(&name, &calories); err != nil || name != "Owner food" || calories != 75 {
				t.Fatalf("food edit overwritten: %s %v %v", name, calories, err)
			}
		})
	}
}

func TestImportReceiptDeletedDependencyRemainsQuarantined(t *testing.T) {
	env := newTestEnv(t)
	b := duplicateBookBundle("deleted-food", "Book", false)
	food := "dietledger:food:" + uuid.NewString()
	b.CustomFoods = []BundleCustomFood{{PortableID: food, BundleCustomFoodID: food, Name: "Original", Nutrients: BundleNutrients{Calories: 100}}}
	b.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: food}
	duplicateBookResponse(t, env, b)
	_, recipe := receiptIDs(t, env)
	receiptDelete(t, env, "/api/recipes/"+recipe)
	db := env.store.(*PostgresStore).db
	if _, err := db.Exec(`DELETE FROM custom_foods`); err != nil {
		t.Fatal(err)
	}
	result := duplicateBookResponse(t, env, b)
	if result["quarantined"] != float64(1) || result["requiresDecision"] == true || quarantineMainCount(t, env) != 0 || duplicateBookCount(t, env, "custom_foods") != 0 {
		t.Fatalf("deleted food replayed or missing link published: %+v", result)
	}
	before := receiptSnapshot(t, env)
	duplicateBookResponse(t, env, b)
	if before != receiptSnapshot(t, env) {
		t.Fatal("retry reset new quarantine state")
	}
}
