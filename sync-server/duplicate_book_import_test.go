package main

import (
	"encoding/json"
	"testing"
)

func duplicateBookBundle(key, title string, complete bool) RecipeBundle {
	b := quarantineBundle(key, complete)
	b.Books = []BundleBook{{BundleBookID: key + "-book", Title: title, Description: "incoming", CoverColor: "#123456"}}
	b.Chapters = []BundleChapter{{BundleChapterID: key + "-chapter", BundleBookID: key + "-book", Title: "Chapter", Position: 0}}
	b.BookPages = []BundleBookPage{{BundleBookPageID: key + "-page", BundleBookID: key + "-book", Title: "Page", Content: key, Position: 0}}
	b.ChapterRecipes = []BundleChapterRecipe{{BundleChapterID: key + "-chapter", BundleRecipeID: key, Position: 0}}
	return b
}
func duplicateBookResponse(t *testing.T, env *testEnv, body interface{}) map[string]interface{} {
	t.Helper()
	w := env.doRequest("POST", "/api/recipe-bundles/import", body)
	if w.Code != 200 {
		t.Fatalf("import %d: %s", w.Code, w.Body.String())
	}
	return decodeJSON(t, w)["data"].(map[string]interface{})
}
func duplicateBookChoice(t *testing.T, summary map[string]interface{}, action string) map[string]interface{} {
	t.Helper()
	if summary["requiresBookDecision"] != true {
		t.Fatalf("expected book preflight, got %+v", summary)
	}
	conflicts := summary["bookConflicts"].([]interface{})
	c := conflicts[0].(map[string]interface{})
	target := c["candidates"].([]interface{})[0].(map[string]interface{})
	return map[string]interface{}{"bundleBookId": c["bundleBookId"], "targetBookId": target["targetBookId"], "action": action, "targetFingerprint": target["targetFingerprint"]}
}
func duplicateBookCount(t *testing.T, env *testEnv, table string) int {
	t.Helper()
	var n int
	if err := env.store.(*PostgresStore).db.QueryRow("SELECT count(*) FROM " + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
func TestDuplicateBookPreflightAndMerge(t *testing.T) {
	env := newTestEnv(t)
	duplicateBookResponse(t, env, duplicateBookBundle("old", "  COOKBOOK ", true))
	incoming := duplicateBookBundle("new", "cookbook", true)
	pre := duplicateBookResponse(t, env, incoming)
	choice := duplicateBookChoice(t, pre, "merge")
	if duplicateBookCount(t, env, "recipe_import_batches") != 1 || quarantineMainCount(t, env) != 1 {
		t.Fatal("preflight wrote batch or recipes")
	}
	req := map[string]interface{}{"bundle": incoming, "bookDecisions": []interface{}{choice}}
	duplicateBookResponse(t, env, req)
	if duplicateBookCount(t, env, "recipe_books") != 1 || duplicateBookCount(t, env, "chapters") != 2 || duplicateBookCount(t, env, "book_pages") != 2 || quarantineMainCount(t, env) != 2 {
		t.Fatal("merge lost or duplicated structure")
	}
	var title, description string
	var max int
	db := env.store.(*PostgresStore).db
	if err := db.QueryRow(`SELECT title,description FROM recipe_books`).Scan(&title, &description); err != nil {
		t.Fatal(err)
	}
	if title != "  COOKBOOK " || description != "incoming" {
		t.Fatal("merge changed metadata")
	}
	if err := db.QueryRow(`SELECT max(position) FROM chapters`).Scan(&max); err != nil || max != 1 {
		t.Fatalf("chapters not appended: %d %v", max, err)
	}
	duplicateBookResponse(t, env, req)
	if duplicateBookCount(t, env, "chapters") != 2 {
		t.Fatal("retry replayed merge")
	}
}
func TestDuplicateBookReplaceDeferredAndStale(t *testing.T) {
	env := newTestEnv(t)
	duplicateBookResponse(t, env, duplicateBookBundle("old", "Book", true))
	incoming := duplicateBookBundle("missing", "book", false)
	choice := duplicateBookChoice(t, duplicateBookResponse(t, env, incoming), "replace")
	req := map[string]interface{}{"bundle": incoming, "bookDecisions": []interface{}{choice}}
	pending := duplicateBookResponse(t, env, req)
	if duplicateBookCount(t, env, "chapters") != 1 || duplicateBookCount(t, env, "book_pages") != 1 {
		t.Fatal("unaccepted replace changed structure")
	}
	batch := pending["pendingImportId"].(string)
	w := env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "cancel"})
	if w.Code != 200 || duplicateBookCount(t, env, "chapters") != 1 {
		t.Fatal("cancel changed existing book")
	}
	pending = duplicateBookResponse(t, env, req)
	db := env.store.(*PostgresStore).db
	if _, err := db.Exec(`UPDATE book_pages SET content='edited'`); err != nil {
		t.Fatal(err)
	}
	batch = pending["pendingImportId"].(string)
	w = env.doRequest("POST", "/api/recipe-imports/"+batch+"/decision", map[string]string{"action": "keep"})
	if w.Code == 200 {
		t.Fatal("stale deferred replacement accepted")
	}
	if quarantineMainCount(t, env) != 1 || duplicateBookCount(t, env, "chapters") != 1 {
		t.Fatal("failed keep changed library")
	}
}
func TestDuplicateBookReplacePreservesRecipesAndSupersedesOlderPlacement(t *testing.T) {
	env := newTestEnv(t)
	old := duplicateBookBundle("old-missing", "Book", false)
	old.CustomFoods = []BundleCustomFood{{BundleCustomFoodID: "retained-food", Name: "Retained food", Nutrients: BundleNutrients{Calories: 20}}}
	quarantineKeep(t, env, duplicateBookResponse(t, env, old))
	if duplicateBookCount(t, env, "recipe_books") != 1 || duplicateBookCount(t, env, "chapters") != 1 {
		t.Fatal("replacement fixture must materialize the earlier accepted batch first")
	}
	incoming := duplicateBookBundle("replacement", "Book", true)
	choice := duplicateBookChoice(t, duplicateBookResponse(t, env, incoming), "replace")
	target := choice["targetBookId"].(string)
	duplicateBookResponse(t, env, map[string]interface{}{"bundle": incoming, "bookDecisions": []interface{}{choice}})
	rows := quarantineRows(t, env)
	w := env.doRequest("PUT", "/api/recipe-imports/"+rows[0]["id"].(string)+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var id, content string
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT b.id,p.content FROM recipe_books b JOIN book_pages p ON p.book_id=b.id`).Scan(&id, &content); err != nil {
		t.Fatal(err)
	}
	if duplicateBookCount(t, env, "custom_foods") != 1 {
		t.Fatal("replacement deleted food records")
	}
	if id != target || content != "replacement" || duplicateBookCount(t, env, "chapters") != 1 || quarantineMainCount(t, env) != 2 {
		t.Fatal("repair resurrected replaced structure or lost recipe")
	}
	backup, err := env.store.(*PostgresStore).ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(backup)
	if len(raw) == 0 {
		t.Fatal("empty backup")
	}
}
