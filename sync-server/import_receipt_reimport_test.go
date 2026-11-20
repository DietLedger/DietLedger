package main

import (
	"testing"
)

func receiptIDs(t *testing.T, env *testEnv) (book, recipe string) {
	t.Helper()
	db := env.store.(*PostgresStore).db
	if err := db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, env.userID).Scan(&book); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1`, env.userID).Scan(&recipe); err != nil {
		t.Fatal(err)
	}
	return
}
func receiptDelete(t *testing.T, env *testEnv, path string) {
	t.Helper()
	w := env.doRequest("DELETE", path, nil)
	if w.Code != 200 {
		t.Fatalf("DELETE %s: %d %s", path, w.Code, w.Body.String())
	}
	w = env.doRequest("GET", path, nil)
	if w.Code != 404 {
		t.Fatalf("deleted resource still readable: %s: %d %s", path, w.Code, w.Body.String())
	}
}
func receiptAssertRestored(t *testing.T, env *testEnv) {
	t.Helper()
	for table, want := range map[string]int{"recipes": 1, "ingredients": 1, "recipe_books": 1, "chapters": 1, "book_pages": 1, "chapter_recipes": 1, "recipe_import_batches": 1, "recipe_import_staged": 0} {
		if got := duplicateBookCount(t, env, table); got != want {
			t.Fatalf("%s: got %d want %d", table, got, want)
		}
	}
}
func TestImportReceiptReimportAfterIndividualDeletes(t *testing.T) {
	for _, order := range []string{"book-first", "recipe-first"} {
		t.Run(order, func(t *testing.T) {
			env := newTestEnv(t)
			b := duplicateBookBundle("receipt", "Deleted book", true)
			duplicateBookResponse(t, env, b)
			book, recipe := receiptIDs(t, env)
			paths := []string{"/api/books/" + book, "/api/recipes/" + recipe}
			if order == "recipe-first" {
				paths[0], paths[1] = paths[1], paths[0]
			}
			for _, path := range paths {
				receiptDelete(t, env, path)
			}
			if duplicateBookCount(t, env, "chapters") != 0 || duplicateBookCount(t, env, "chapter_recipes") != 0 || quarantineMainCount(t, env) != 0 {
				t.Fatal("delete did not remove content/placements")
			}
			result := duplicateBookResponse(t, env, b)
			if result["created"].(map[string]interface{})["recipes"] != float64(1) || result["created"].(map[string]interface{})["books"] != float64(1) {
				t.Fatalf("identical import did not restore deleted content: %+v", result)
			}
			receiptAssertRestored(t, env)
			restoredBook, restoredRecipe := receiptIDs(t, env)
			if restoredBook == book || restoredRecipe == recipe {
				t.Fatal("deleted row IDs were reused")
			}
			retry := duplicateBookResponse(t, env, b)
			if len(retry["created"].(map[string]interface{})) != 0 {
				t.Fatalf("retry created content: %+v", retry)
			}
			receiptAssertRestored(t, env)
		})
	}
}

func TestImportReceiptPartialDeletionPreservesEditedSurvivors(t *testing.T) {
	for _, missing := range []string{"book", "recipe"} {
		t.Run(missing, func(t *testing.T) {
			env := newTestEnv(t)
			b := duplicateBookBundle("partial", "Book", true)
			duplicateBookResponse(t, env, b)
			book, recipe := receiptIDs(t, env)
			db := env.store.(*PostgresStore).db
			if missing == "book" {
				w := env.doRequest("PUT", "/api/recipes/"+recipe, map[string]interface{}{"name": "Owner edited recipe"})
				if w.Code != 200 {
					t.Fatal(w.Body.String())
				}
				receiptDelete(t, env, "/api/books/"+book)
			} else {
				w := env.doRequest("PUT", "/api/books/"+book, map[string]interface{}{"title": "Owner renamed book", "description": "Owner description", "coverColor": "#abcdef"})
				if w.Code != 200 {
					t.Fatal(w.Body.String())
				}
				if _, err := db.Exec(`UPDATE book_pages SET content='Owner page'; UPDATE chapters SET title='Owner chapter',position=7`); err != nil {
					t.Fatal(err)
				}
				receiptDelete(t, env, "/api/recipes/"+recipe)
			}
			duplicateBookResponse(t, env, b)
			receiptAssertRestored(t, env)
			gotBook, gotRecipe := receiptIDs(t, env)
			var text string
			if missing == "book" {
				if err := db.QueryRow(`SELECT name FROM recipes WHERE id=$1`, recipe).Scan(&text); err != nil || text != "Owner edited recipe" || gotRecipe != recipe {
					t.Fatalf("surviving recipe changed: %s %v", text, err)
				}
			} else {
				if err := db.QueryRow(`SELECT title FROM recipe_books WHERE id=$1`, book).Scan(&text); err != nil || text != "Owner renamed book" || gotBook != book {
					t.Fatalf("surviving book changed: %s %v", text, err)
				}
				if err := db.QueryRow(`SELECT content FROM book_pages`).Scan(&text); err != nil || text != "Owner page" {
					t.Fatalf("surviving page changed: %s %v", text, err)
				}
				var pos int
				if err := db.QueryRow(`SELECT position FROM chapters`).Scan(&pos); err != nil || pos != 7 {
					t.Fatalf("surviving chapter changed: %d %v", pos, err)
				}
			}
		})
	}
}

func TestImportReceiptRepairDoesNotResurrectDeletedBook(t *testing.T) {
	env := newTestEnv(t)
	b := duplicateBookBundle("pending-delete", "Deleted pending book", false)
	quarantineKeep(t, env, duplicateBookResponse(t, env, b))
	var book string
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT id FROM recipe_books`).Scan(&book); err != nil {
		t.Fatal(err)
	}
	receiptDelete(t, env, "/api/books/"+book)
	rows := quarantineRows(t, env)
	w := env.doRequest("PUT", "/api/recipe-imports/"+rows[0]["id"].(string)+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if duplicateBookCount(t, env, "recipe_books") != 0 || duplicateBookCount(t, env, "chapters") != 0 || duplicateBookCount(t, env, "book_pages") != 0 || duplicateBookCount(t, env, "chapter_recipes") != 0 || quarantineMainCount(t, env) != 1 {
		t.Fatal("ingredient repair resurrected deleted book structure")
	}
}
