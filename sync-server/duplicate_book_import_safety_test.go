package main

import (
	"sync"
	"testing"
)

func TestDuplicateBookBackupDoesNotInventPendingPlacementAliases(t *testing.T) {
	env := newTestEnv(t)
	// Transport keys are package-local, so an unrelated later package can reuse
	// the same keys without owning this older unaccepted book's placements.
	old := duplicateBookBundle("shared-key", "Independent pending book", false)
	duplicateBookResponse(t, env, old)
	later := duplicateBookBundle("shared-key", "Different accepted book", true)
	// Distinct recipe identity/content avoids the separate recipe identity policy.
	later.Recipes[0].BundleRecipeID = "different-recipe"
	later.ChapterRecipes[0].BundleRecipeID = "different-recipe"
	duplicateBookResponse(t, env, later)
	target, owner := duplicateRestored(t, env)
	queue, err := target.ListQuarantinedRecipes(owner)
	if err != nil || len(queue) != 1 {
		t.Fatalf("pending row: %+v %v", queue, err)
	}
	if _, err := target.DecideRecipeImport(owner, queue[0].BatchID, "keep"); err != nil {
		t.Fatal(err)
	}
	var books int
	if err := target.db.QueryRow(`SELECT count(*) FROM recipe_books`).Scan(&books); err != nil {
		t.Fatal(err)
	}
	if books != 2 {
		t.Fatal("backup invented an alias and collapsed independent pending book")
	}
}
func TestDuplicateBookStaleChoiceCannotBeLaunderedByBackup(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	duplicateBookResponse(t, env, duplicateBookBundle("original", "Book", true))
	b := duplicateBookBundle("pending", "Book", false)
	d := duplicateBookChoice(t, duplicateBookResponse(t, env, b), "replace")
	duplicateBookResponse(t, env, duplicateChoiceBody(b, d))
	if _, err := s.db.Exec(`UPDATE book_pages SET content='changed after choosing'`); err != nil {
		t.Fatal(err)
	}
	target, owner := duplicateRestored(t, env)
	queue, err := target.ListQuarantinedRecipes(owner)
	if err != nil || len(queue) != 1 {
		t.Fatalf("pending restore: %+v %v", queue, err)
	}
	if _, err := target.DecideRecipeImport(owner, queue[0].BatchID, "keep"); err == nil {
		t.Fatal("backup refreshed stale replace permission")
	}
	if _, err := target.DecideRecipeImport(owner, queue[0].BatchID, "cancel"); err != nil {
		t.Fatal(err)
	}
	var content string
	if err := target.db.QueryRow(`SELECT content FROM book_pages`).Scan(&content); err != nil || content != "changed after choosing" {
		t.Fatal("stale keep/cancel changed target")
	}
}
func TestDuplicateBookConcurrentChoiceRetries(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	duplicateBookResponse(t, env, duplicateBookBundle("original", "Book", true))
	b := duplicateBookBundle("new", "Book", true)
	raw := duplicateBookChoice(t, duplicateBookResponse(t, env, b), "merge")
	d := BookImportDecision{BundleBookID: raw["bundleBookId"].(string), TargetBookID: raw["targetBookId"].(string), Action: "merge", TargetFingerprint: raw["targetFingerprint"].(string)}
	var wg sync.WaitGroup
	errs := make(chan error, 4)
	start := make(chan struct{})
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := s.StageRecipeBundleWithDecisions(env.userID, b, []BookImportDecision{d})
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if duplicateBookCount(t, env, "recipe_books") != 1 || duplicateBookCount(t, env, "chapters") != 2 || quarantineMainCount(t, env) != 2 {
		t.Fatal("concurrent retry duplicated structure")
	}
}
func TestDuplicateBookPartialSupersessionKeepsOtherBookClaims(t *testing.T) {
	env := newTestEnv(t)
	old := duplicateBookBundle("older", "Replaced book", false)
	other := duplicateBookBundle("other-placement", "Retained book", false)
	old.Books = append(old.Books, other.Books...)
	old.Chapters = append(old.Chapters, other.Chapters...)
	old.BookPages = append(old.BookPages, other.BookPages...)
	other.ChapterRecipes[0].BundleRecipeID = old.Recipes[0].BundleRecipeID
	old.ChapterRecipes = append(old.ChapterRecipes, other.ChapterRecipes...)
	quarantineKeep(t, env, duplicateBookResponse(t, env, old))
	b := duplicateBookBundle("replacement", "Replaced book", true)
	d := duplicateBookChoice(t, duplicateBookResponse(t, env, b), "replace")
	duplicateBookResponse(t, env, duplicateChoiceBody(b, d))
	target, owner := duplicateRestored(t, env)
	queue, err := target.ListQuarantinedRecipes(owner)
	if err != nil || len(queue) != 1 {
		t.Fatalf("partial supersession queue: %+v %v", queue, err)
	}
	if len(queue[0].BookTitles) != 1 || queue[0].BookTitles[0] != "Retained book" {
		t.Fatal("supersession hid unrelated claim or advertised removed placement")
	}
	duplicateRepair(t, target, owner, queue[0].ID)
	var books, chapters, joins int
	for table, n := range map[string]*int{"recipe_books": &books, "chapters": &chapters, "chapter_recipes": &joins} {
		if err := target.db.QueryRow("SELECT count(*) FROM " + table).Scan(n); err != nil {
			t.Fatal(err)
		}
	}
	if books != 2 || chapters != 2 || joins != 2 {
		t.Fatalf("partial tombstone damaged other book: %d %d %d", books, chapters, joins)
	}
}

func TestDuplicateBookDeferredNewNameConflictFailsSafely(t *testing.T) {
	env := newTestEnv(t)
	b := duplicateBookBundle("pending", "Book", false)
	pending := duplicateBookResponse(t, env, b)
	duplicateBookResponse(t, env, duplicateBookBundle("concurrent", "Book", true))
	w := env.doRequest("POST", "/api/recipe-imports/"+pending["pendingImportId"].(string)+"/decision", map[string]string{"action": "keep"})
	if w.Code != 409 || duplicateBookCount(t, env, "recipe_books") != 1 || duplicateBookCount(t, env, "chapters") != 1 {
		t.Fatal("new conflict at acceptance was silently applied")
	}
}

func TestDuplicateBookExactWhitespaceAndUnicodeCase(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	for _, title := range []string{"Book  One", "ΟΣ"} {
		if _, err := s.CreateBook(env.userID, &CreateBookRequest{Title: title}); err != nil {
			t.Fatal(err)
		}
	}
	b := duplicateBookBundle("one-space", "Book One", true)
	summary := duplicateBookResponse(t, env, b)
	if summary["requiresBookDecision"] == true {
		t.Fatal("normalization collapsed internal whitespace")
	}
	pre := duplicateBookResponse(t, env, duplicateBookBundle("sigma", " ος ", true))
	duplicateBookChoice(t, pre, "merge")
}
