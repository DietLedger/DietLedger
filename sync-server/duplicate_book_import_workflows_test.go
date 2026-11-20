package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
)

func duplicateChoiceBody(b RecipeBundle, d map[string]interface{}) map[string]interface{} {
	return map[string]interface{}{"bundle": b, "bookDecisions": []interface{}{d}}
}
func duplicateRepair(t *testing.T, s *PostgresStore, owner, id string) {
	t.Helper()
	yes := true
	if _, err := s.ResolveQuarantinedIngredient(owner, id, "ingredient", CreateIngredientReq{Name: "Original ingredient", Amount: 50, Unit: "g", FdcID: -3, SourceType: "manual", ZeroNutritionOverride: &yes}); err != nil {
		t.Fatal(err)
	}
}
func duplicateRestored(t *testing.T, env *testEnv) (*PostgresStore, string) {
	t.Helper()
	source := env.store.(*PostgresStore)
	backup, err := source.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	// Exercise JSON, not an in-memory struct alias.
	raw, err := json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}
	var b RecipeBundle
	if err := json.Unmarshal(raw, &b); err != nil {
		t.Fatal(err)
	}
	target := ownerBackupRestoreStore(t, source)
	u := createUser(t, target, "book-decisions-restore")
	if _, err := target.StageRecipeBundle(u.ID, b); err != nil {
		t.Fatal(err)
	}
	if _, err := target.StageRecipeBundle(u.ID, b); err != nil {
		t.Fatalf("restore retry: %v", err)
	}
	return target, u.ID
}
func TestDuplicateBookDeferredKeepAndRestore(t *testing.T) {
	for _, action := range []string{"merge", "replace"} {
		t.Run(action, func(t *testing.T) {
			env := newTestEnv(t)
			original := duplicateBookBundle("original", "Book", true)
			original.Books[0].Description = "local metadata"
			duplicateBookResponse(t, env, original)
			b := duplicateBookBundle("missing", "book", false)
			d := duplicateBookChoice(t, duplicateBookResponse(t, env, b), action)
			result := duplicateBookResponse(t, env, duplicateChoiceBody(b, d))
			if result["requiresDecision"] != true || duplicateBookCount(t, env, "chapters") != 1 {
				t.Fatal("missing-link choice not deferred")
			}
			target, owner := duplicateRestored(t, env)
			queue, err := target.ListQuarantinedRecipes(owner)
			if err != nil || len(queue) != 1 || !queue[0].RequiresDecision {
				t.Fatalf("pending restore: %+v %v", queue, err)
			}
			if _, err := target.DecideRecipeImport(owner, queue[0].BatchID, "keep"); err != nil {
				t.Fatal(err)
			}
			// Retry Keep must not replace again or duplicate appended chapters.
			if _, err := target.DecideRecipeImport(owner, queue[0].BatchID, "keep"); err != nil {
				t.Fatal(err)
			}
			duplicateRepair(t, target, owner, queue[0].ID)
			var books, chapters, recipes int
			var description string
			for table, n := range map[string]*int{"recipe_books": &books, "chapters": &chapters, "recipes": &recipes} {
				if err := target.db.QueryRow("SELECT count(*) FROM " + table).Scan(n); err != nil {
					t.Fatal(err)
				}
			}
			if err := target.db.QueryRow(`SELECT description FROM recipe_books`).Scan(&description); err != nil {
				t.Fatal(err)
			}
			expected := 1
			if action == "merge" {
				expected = 2
			}
			if books != 1 || chapters != expected || recipes != 2 {
				t.Fatalf("restore/keep/repair: books=%d chapters=%d recipes=%d", books, chapters, recipes)
			}
			if action == "merge" && description != "local metadata" {
				t.Fatal("merge replaced local metadata")
			}
			if action == "replace" && description != "incoming" {
				t.Fatal("replace lost incoming metadata")
			}
		})
	}
}
func TestDuplicateBookSupersededClaimsSurviveBackup(t *testing.T) {
	for _, accepted := range []bool{false, true} {
		t.Run(fmt.Sprint(accepted), func(t *testing.T) {
			env := newTestEnv(t)
			duplicateBookResponse(t, env, duplicateBookBundle("original", "Book", true))
			old := duplicateBookBundle("older-missing", "Book", false)
			oldDecision := duplicateBookChoice(t, duplicateBookResponse(t, env, old), "merge")
			pending := duplicateBookResponse(t, env, duplicateChoiceBody(old, oldDecision))
			if accepted {
				quarantineKeep(t, env, pending)
			}
			replacement := duplicateBookBundle("replacement", "book", true)
			choice := duplicateBookChoice(t, duplicateBookResponse(t, env, replacement), "replace")
			duplicateBookResponse(t, env, duplicateChoiceBody(replacement, choice))
			target, owner := duplicateRestored(t, env)
			queue, err := target.ListQuarantinedRecipes(owner)
			if err != nil || len(queue) != 1 {
				t.Fatalf("restored superseded row: %+v %v", queue, err)
			}
			if !accepted {
				if _, err := target.DecideRecipeImport(owner, queue[0].BatchID, "keep"); err != nil {
					t.Fatal(err)
				}
			}
			duplicateRepair(t, target, owner, queue[0].ID)
			var chapters, pages, recipes, joins int
			for table, n := range map[string]*int{"chapters": &chapters, "book_pages": &pages, "recipes": &recipes, "chapter_recipes": &joins} {
				if err := target.db.QueryRow("SELECT count(*) FROM " + table).Scan(n); err != nil {
					t.Fatal(err)
				}
			}
			if chapters != 1 || pages != 1 || recipes != 3 || joins != 1 {
				t.Fatalf("superseded claim resurrected: chapters=%d pages=%d recipes=%d joins=%d", chapters, pages, recipes, joins)
			}
			batches, _, err := target.loadImportState(owner)
			if err != nil {
				t.Fatal(err)
			}
			seen := false
			for _, b := range batches {
				if len(b.BookState.SupersededBooks) > 0 {
					seen = true
				}
			}
			if !seen {
				t.Fatal("backup dropped explicit supersession")
			}
		})
	}
}
func TestDuplicateBookMultiBookCandidatesAndOwnerScope(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	for i, title := range []string{"Book", " book ", "Other"} {
		if _, err := s.CreateBook(env.userID, &CreateBookRequest{Title: title, Description: fmt.Sprint(i)}); err != nil {
			t.Fatal(err)
		}
	}
	foreign := createUser(t, s, "foreign-duplicate")
	if _, err := s.CreateBook(foreign.ID, &CreateBookRequest{Title: "BOOK"}); err != nil {
		t.Fatal(err)
	}
	incoming := duplicateBookBundle("first", "BOOK", true)
	second := duplicateBookBundle("second", "other", true)
	incoming.Recipes = append(incoming.Recipes, second.Recipes...)
	incoming.Books = append(incoming.Books, second.Books...)
	incoming.Chapters = append(incoming.Chapters, second.Chapters...)
	incoming.BookPages = append(incoming.BookPages, second.BookPages...)
	incoming.ChapterRecipes = append(incoming.ChapterRecipes, second.ChapterRecipes...)
	pre := duplicateBookResponse(t, env, incoming)
	cs := pre["bookConflicts"].([]interface{})
	if len(cs) != 2 {
		t.Fatal(pre)
	}
	if len(cs[0].(map[string]interface{})["candidates"].([]interface{})) != 2 {
		t.Fatal("candidate set missing duplicate or leaking other owner")
	}
	choices := []interface{}{}
	for i, c := range cs {
		conflict := c.(map[string]interface{})
		candidate := conflict["candidates"].([]interface{})[0].(map[string]interface{})
		action := "merge"
		if i == 1 {
			action = "replace"
		}
		choices = append(choices, map[string]interface{}{"bundleBookId": conflict["bundleBookId"], "targetBookId": candidate["targetBookId"], "targetFingerprint": candidate["targetFingerprint"], "action": action})
	}
	partial := duplicateBookResponse(t, env, map[string]interface{}{"bundle": incoming, "bookDecisions": choices[:1]})
	if partial["requiresBookDecision"] != true || duplicateBookCount(t, env, "recipe_import_batches") != 0 {
		t.Fatal("partial choices wrote data")
	}
	duplicateBookResponse(t, env, map[string]interface{}{"bundle": incoming, "bookDecisions": choices})
	if duplicateBookCount(t, env, "recipe_books") != 4 || duplicateBookCount(t, env, "chapters") != 2 {
		t.Fatal("multi-book targets not honored")
	}
}
func TestDuplicateBookIndependentSameTitleBackup(t *testing.T) {
	env := newTestEnv(t)
	a := duplicateBookBundle("a", "Identical", true)
	b := duplicateBookBundle("b", "Identical", true)
	a.Recipes = append(a.Recipes, b.Recipes...)
	a.Books = append(a.Books, b.Books...)
	a.Chapters = append(a.Chapters, b.Chapters...)
	a.BookPages = append(a.BookPages, b.BookPages...)
	a.ChapterRecipes = append(a.ChapterRecipes, b.ChapterRecipes...)
	duplicateBookResponse(t, env, a)
	if duplicateBookCount(t, env, "recipe_books") != 2 {
		t.Fatal("independent incoming books collapsed")
	}
	target, owner := duplicateRestored(t, env)
	var n int
	if err := target.db.QueryRow(`SELECT count(*) FROM recipe_books WHERE user_id=$1`, owner).Scan(&n); err != nil || n != 2 {
		t.Fatalf("same-title backup collapsed: %d %v", n, err)
	}
}
func TestDuplicateBookRevalidationAndRollback(t *testing.T) {
	for _, mutation := range []string{"metadata", "chapter", "page", "chapterPage", "placement", "candidate", "deleted"} {
		t.Run(mutation, func(t *testing.T) {
			env := newTestEnv(t)
			s := env.store.(*PostgresStore)
			duplicateBookResponse(t, env, duplicateBookBundle("original", "Book", true))
			b := duplicateBookBundle("new", "book", true)
			d := duplicateBookChoice(t, duplicateBookResponse(t, env, b), "replace")
			queries := map[string]string{"metadata": `UPDATE recipe_books SET description='edited'`, "chapter": `UPDATE chapters SET title='edited'`, "page": `UPDATE book_pages SET content='edited'`, "chapterPage": `INSERT INTO chapter_pages(id,chapter_id,title,content,position) SELECT 'extra',id,'Extra','edited',0 FROM chapters`, "placement": `UPDATE chapter_recipes SET position=7`, "candidate": `INSERT INTO recipe_books(id,user_id,title) SELECT 'extra',user_id,' BOOK ' FROM recipe_books LIMIT 1`, "deleted": `DELETE FROM recipe_books`}
			if _, err := s.db.Exec(queries[mutation]); err != nil {
				t.Fatal(err)
			}
			w := env.doRequest("POST", "/api/recipe-bundles/import", duplicateChoiceBody(b, d))
			if w.Code != 409 {
				t.Fatalf("stale choice accepted: %d %s", w.Code, w.Body.String())
			}
			if duplicateBookCount(t, env, "recipe_import_batches") != 1 || quarantineMainCount(t, env) != 1 {
				t.Fatal("failed revalidation wrote data")
			}
		})
	}
}
func TestDuplicateBookReplaceIdentityConflictRollsBack(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	old := duplicateBookBundle("original", "Book", true)
	old.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
	duplicateBookResponse(t, env, old)
	b := duplicateBookBundle("incoming", "book", true)
	b.Recipes[0].PortableID = old.Recipes[0].PortableID
	d := duplicateBookChoice(t, duplicateBookResponse(t, env, b), "replace")
	w := env.doRequest("POST", "/api/recipe-bundles/import", duplicateChoiceBody(b, d))
	if w.Code != 409 {
		t.Fatalf("recipe identity conflict not retained: %d %s", w.Code, w.Body.String())
	}
	var content string
	if err := s.db.QueryRow(`SELECT content FROM book_pages`).Scan(&content); err != nil || content != "original" {
		t.Fatal("failed import replaced structure")
	}
	// An error after structure deletion must roll the deletion and supersession back.
	b.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
	resetExec(t, s, `CREATE FUNCTION reject_book_page() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected replacement failure'; END $$; CREATE TRIGGER reject_book_page BEFORE INSERT ON book_pages FOR EACH ROW EXECUTE FUNCTION reject_book_page()`)
	w = env.doRequest("POST", "/api/recipe-bundles/import", duplicateChoiceBody(b, d))
	if w.Code == 200 {
		t.Fatal("injected failure succeeded")
	}
	if err := s.db.QueryRow(`SELECT content FROM book_pages`).Scan(&content); err != nil || content != "original" {
		t.Fatal("failed replacement lost old pages")
	}
	batches, _, err := s.loadImportState(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	if len(batches) != 1 || len(batches[0].BookState.SupersededBooks) != 0 {
		t.Fatal("rollback retained supersession or batch")
	}
}
func TestDuplicateBookOwnerLockIsolationAndTransactionRevalidation(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	duplicateBookResponse(t, env, duplicateBookBundle("original", "Book", true))
	other := createUser(t, s, "independent-owner")
	b := duplicateBookBundle("new", "Book", true)
	d := duplicateBookChoice(t, duplicateBookResponse(t, env, b), "replace")
	tx, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	// An ordinary child edit must acquire the import owner's lock via the
	// migration trigger, without the editor explicitly taking that lock.
	if _, err := tx.Exec(`UPDATE book_pages SET content='concurrent edit'`); err != nil {
		t.Fatal(err)
	}
	// Another owner must not wait on this import's lock. No global table locks.
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := s.db.ExecContext(ctx, `INSERT INTO recipe_books(id,user_id,title) VALUES('unrelated',$1,'Book')`, other.ID); err != nil {
		t.Fatalf("other owner's edit blocked: %v", err)
	}
	response := make(chan *httptest.ResponseRecorder, 1)
	go func() { response <- env.doRequest("POST", "/api/recipe-bundles/import", duplicateChoiceBody(b, d)) }()
	deadline := time.Now().Add(3 * time.Second)
	waiting := false
	for time.Now().Before(deadline) {
		if err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM users WHERE id=$1 FOR UPDATE%')`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			break
		}
	}
	if !waiting {
		tx.Rollback()
		t.Fatal("import did not wait for owner transaction")
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case w := <-response:
		if w.Code != 409 {
			t.Fatalf("transaction used stale pre-lock fingerprint: %d %s", w.Code, w.Body.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("import timed out")
	}
}
