package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

// Check the assigned disposable identity before any schema-dropping helper.
func checkBookSecurityDatabase(t *testing.T) {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping test requiring PostgreSQL")
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	host := parsed.Hostname()
	ip := net.ParseIP(host)
	loopback := strings.EqualFold(host, "localhost") || (ip != nil && ip.IsLoopback())
	databaseName := strings.TrimPrefix(parsed.Path, "/")
	if !loopback || databaseName == "" {
		t.Fatal("refusing non-loopback or unassigned database URL")
	}
	var name string
	if err := db.QueryRow(`SELECT current_database()`).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != databaseName {
		t.Fatal("refusing database with unexpected identity")
	}
}

type securityBookFixture struct{ book, chapter, page, bookPage, recipe, join string }

func securityBookData(t *testing.T, s Store, owner string) securityBookFixture {
	t.Helper()
	b, err := s.CreateBook(owner, &CreateBookRequest{Title: "Security book"})
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.CreateChapter(b.ID, &CreateChapterRequest{Title: "Chapter", Position: 7})
	if err != nil {
		t.Fatal(err)
	}
	p, err := s.CreateChapterPage(c.ID, "Private page", "VICTIM-CONTENT", 8)
	if err != nil {
		t.Fatal(err)
	}
	bp, err := s.CreateBookPage(b.ID, "Private book page", "VICTIM-CONTENT", 9)
	if err != nil {
		t.Fatal(err)
	}
	r, err := s.CreateRecipe(owner, &CreateRecipeRequest{Name: "Private recipe", Servings: 1})
	if err != nil {
		t.Fatal(err)
	}
	cr, err := s.AddChapterRecipe(c.ID, r.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	return securityBookFixture{b.ID, c.ID, p.ID, bp.ID, r.ID, cr.ID}
}
func securityBookSnapshot(t *testing.T, s Store) string {
	t.Helper()
	var snapshot string
	err := s.(*PostgresStore).db.QueryRow(`SELECT jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM recipe_books x),
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM chapters x),
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM book_pages x),
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM chapter_pages x),
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM chapter_recipes x),
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM recipe_import_batches x))::text`).Scan(&snapshot)
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestSecurityBookChildrenOwnership(t *testing.T) {
	checkBookSecurityDatabase(t)
	env := newTestEnv(t)
	bob := createUser(t, env.store, "book-bob")
	type request struct {
		name, method, path string
		body               interface{}
	}
	cases := []func(a, b, other securityBookFixture) request{
		func(a, b, o securityBookFixture) request {
			return request{"list chapters", "GET", "/api/books/" + b.book + "/chapters/", nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"create chapter", "POST", "/api/books/" + b.book + "/chapters/", map[string]interface{}{"title": "attack"}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"update chapter", "PUT", "/api/chapters/" + b.chapter, map[string]interface{}{"title": "attack"}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"delete chapter", "DELETE", "/api/chapters/" + b.chapter, nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"foreign nested chapter", "PUT", "/api/books/" + a.book + "/chapters/" + b.chapter, map[string]interface{}{"title": "attack"}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"same owner wrong book", "DELETE", "/api/books/" + a.book + "/chapters/" + o.chapter, nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"foreign URL owned child", "DELETE", "/api/books/" + b.book + "/chapters/" + a.chapter, nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"list chapter pages", "GET", "/api/chapters/" + b.chapter + "/pages", nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"create chapter page", "POST", "/api/chapters/" + b.chapter + "/pages", map[string]interface{}{"title": "attack"}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"update chapter page", "PUT", "/api/pages/" + b.page, map[string]interface{}{"title": "attack", "position": 0}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"delete chapter page", "DELETE", "/api/pages/" + b.page, nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"foreign page owned chapter", "PUT", "/api/chapters/" + a.chapter + "/pages/" + b.page, map[string]interface{}{"title": "attack"}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"same owner wrong chapter", "DELETE", "/api/chapters/" + a.chapter + "/pages/" + o.page, nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"nested chapter pages", "GET", "/api/books/" + a.book + "/chapters/" + b.chapter + "/pages", nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"list book pages", "GET", "/api/books/" + b.book + "/pages", nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"create book page", "POST", "/api/books/" + b.book + "/pages", map[string]interface{}{"title": "attack"}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"update book page", "PUT", "/api/book-pages/" + b.bookPage, map[string]interface{}{"title": "attack"}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"delete book page", "DELETE", "/api/book-pages/" + b.bookPage, nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"list placements", "GET", "/api/chapters/" + b.chapter + "/recipes", nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"foreign destination placement", "POST", "/api/chapters/" + b.chapter + "/recipes", map[string]interface{}{"recipeId": a.recipe}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"foreign recipe placement", "POST", "/api/chapters/" + a.chapter + "/recipes", map[string]interface{}{"recipeId": b.recipe}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"delete placement", "DELETE", "/api/chapters/" + b.chapter + "/recipes?recipeId=" + b.recipe, nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"same owner wrong placement parent", "DELETE", "/api/books/" + a.book + "/chapters/" + o.chapter + "/recipes/" + o.recipe, nil}
		},
		func(a, b, o securityBookFixture) request {
			return request{"book reorder foreign parent", "PUT", "/api/books/" + b.book + "/items/reorder", map[string]interface{}{"items": []BookLevelItem{{ID: b.chapter, Type: "chapter"}}}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"book reorder wrong child rollback", "PUT", "/api/books/" + a.book + "/items/reorder", map[string]interface{}{"items": []BookLevelItem{{ID: a.chapter, Type: "chapter"}, {ID: b.bookPage, Type: "book-page"}}}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"book reorder same owner wrong child", "PUT", "/api/books/" + a.book + "/items/reorder", map[string]interface{}{"items": []BookLevelItem{{ID: a.bookPage, Type: "book-page"}, {ID: o.chapter, Type: "chapter"}}}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"chapter reorder foreign parent", "PUT", "/api/chapters/" + b.chapter + "/items/reorder", map[string]interface{}{"items": []ChapterItem{{Type: "page", PageID: b.page}}}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"chapter reorder wrong child rollback", "PUT", "/api/chapters/" + a.chapter + "/items/reorder", map[string]interface{}{"items": []ChapterItem{{Type: "recipe", RecipeID: a.recipe}, {Type: "page", PageID: b.page}}}}
		},
		func(a, b, o securityBookFixture) request {
			return request{"chapter reorder same owner wrong child", "PUT", "/api/chapters/" + a.chapter + "/items/reorder", map[string]interface{}{"items": []ChapterItem{{Type: "page", PageID: a.page}, {Type: "recipe", RecipeID: o.recipe}}}}
		},
	}
	// Both ends of every move/conversion, plus absent source and destination.
	for _, kind := range []string{"recipe", "page", "to-book", "to-chapter"} {
		for _, direction := range []string{"foreign source", "foreign destination", "missing source", "missing destination"} {
			kind, direction := kind, direction
			cases = append(cases, func(a, b, o securityBookFixture) request {
				src, dst := a, b
				if direction == "foreign source" {
					src, dst = b, a
				}
				if direction == "missing source" {
					src = securityBookFixture{page: "missing", bookPage: "missing", join: "missing"}
					dst = a
				}
				if direction == "missing destination" {
					src = a
					dst = securityBookFixture{book: "missing", chapter: "missing"}
				}
				path := "/api/pages/" + src.page + "/move"
				body := map[string]interface{}{"targetChapterId": dst.chapter, "position": 0}
				switch kind {
				case "recipe":
					path = "/api/chapter-recipes/" + src.join + "/move"
				case "to-book":
					path = "/api/pages/" + src.page + "/to-book"
					body = map[string]interface{}{"bookId": dst.book, "position": 0}
				case "to-chapter":
					path = "/api/pages/" + src.bookPage + "/to-chapter"
					body = map[string]interface{}{"chapterId": dst.chapter, "position": 0}
				}
				return request{kind + " " + direction, "POST", path, body}
			})
		}
	}
	for _, makeCase := range cases {
		a := securityBookData(t, env.store, env.userID)
		b := securityBookData(t, env.store, bob.ID)
		other := securityBookData(t, env.store, env.userID)
		tc := makeCase(a, b, other)
		t.Run(tc.name, func(t *testing.T) {
			before := securityBookSnapshot(t, env.store)
			w := env.doRequest(tc.method, tc.path, tc.body)
			if w.Code != 404 {
				t.Errorf("status=%d want 404; body=%s", w.Code, w.Body.String())
			}
			if strings.Contains(w.Body.String(), "VICTIM-CONTENT") {
				t.Error("leaked private page")
			}
			if after := securityBookSnapshot(t, env.store); after != before {
				t.Error("denied operation changed book graph/positions/import state")
			}
		})
	}
	// Authentication remains required independently of resource ownership.
	w := env.doRequestNoAuth("GET", "/api/books/missing/chapters/", nil)
	if w.Code != 401 {
		t.Errorf("anonymous status=%d", w.Code)
	}
}

func TestSecurityBookChildrenStoreOwnership(t *testing.T) {
	checkBookSecurityDatabase(t)
	store := testStore(t)
	alice := createUser(t, store, "store-alice")
	bob := createUser(t, store, "store-bob")
	a := securityBookData(t, store, alice.ID)
	b := securityBookData(t, store, bob.ID)
	other := securityBookData(t, store, alice.ID)
	before := securityBookSnapshot(t, store)
	if err := store.WithOwnedBook(alice.ID, b.book, func(Store) error { return nil }); !errors.Is(err, ErrBookResourceNotFound) {
		t.Fatalf("foreign book error=%v", err)
	}
	if err := store.WithOwnedChapter(alice.ID, other.chapter, a.book, func(Store) error { return nil }); !errors.Is(err, ErrBookResourceNotFound) {
		t.Fatalf("wrong-parent chapter error=%v", err)
	}
	err := store.WithOwnedChapterRecipe(alice.ID, a.join, func(owned Store) error { return owned.MoveRecipeBetweenChapters(a.join, b.chapter, 0) })
	if !errors.Is(err, ErrBookResourceNotFound) {
		t.Fatalf("foreign move destination error=%v", err)
	}
	if after := securityBookSnapshot(t, store); after != before {
		t.Fatal("rejected store operation changed book graph")
	}
}

func TestSecurityBookScopeRollsBackCallbackErrorAfterWrite(t *testing.T) {
	checkBookSecurityDatabase(t)
	env := newTestEnv(t)
	fixture := securityBookData(t, env.store, env.userID)
	response := httptest.NewRecorder()
	env.server.runBookScope(response, func(fn func(Store) error) error { return env.store.WithOwnedBook(env.userID, fixture.book, fn) }, func(scoped *Server, scopedWriter http.ResponseWriter) {
		if _, err := scoped.store.CreateBookPage(fixture.book, "must rollback", "synthetic", 40); err != nil {
			t.Fatal(err)
		}
		writeError(scopedWriter, 400, "synthetic validation failure")
	})
	if response.Code != 400 {
		t.Fatalf("callback status=%d body=%s", response.Code, response.Body.String())
	}
	var count int
	if err := env.store.(*PostgresStore).db.QueryRow(`SELECT count(*) FROM book_pages WHERE title='must rollback'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("callback error committed %d book page writes", count)
	}
}

func TestSecurityBookScopeCommitFailureDiscardsSuccessResponse(t *testing.T) {
	checkBookSecurityDatabase(t)
	env := newTestEnv(t)
	fixture := securityBookData(t, env.store, env.userID)
	db := env.store.(*PostgresStore).db
	if _, err := db.Exec(`CREATE FUNCTION reject_book_page_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected book commit failure'; END $$;
CREATE CONSTRAINT TRIGGER reject_book_page_commit AFTER INSERT ON book_pages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_book_page_commit()`); err != nil {
		t.Fatal(err)
	}
	response := env.doRequest("POST", "/api/books/"+fixture.book+"/pages", map[string]interface{}{"title": "must rollback", "content": "synthetic"})
	if response.Code != 500 {
		t.Fatalf("commit failure status=%d body=%s", response.Code, response.Body.String())
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response must contain only one valid error document: %v; body=%s", err, response.Body.String())
	}
	if payload["ok"] != false || payload["error"] == nil {
		t.Fatalf("commit response was not an error: %#v", payload)
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM book_pages WHERE title='must rollback'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("commit failure persisted %d book pages", count)
	}
	if _, err := db.Exec(`DROP TRIGGER reject_book_page_commit ON book_pages; DROP FUNCTION reject_book_page_commit()`); err != nil {
		t.Fatal(err)
	}
}

func TestSecurityBookOwnerPositiveHTTP(t *testing.T) {
	checkBookSecurityDatabase(t)
	env := newTestEnv(t)
	a := securityBookData(t, env.store, env.userID)
	b := securityBookData(t, env.store, env.userID)
	requests := []struct {
		method, path string
		body         interface{}
		status       int
	}{
		{"GET", "/api/books/" + a.book + "/chapters", nil, 200},
		{"GET", "/api/chapters/" + a.chapter + "/pages", nil, 200},
		{"GET", "/api/books/" + a.book + "/pages", nil, 200},
		{"PUT", "/api/book-pages/" + a.bookPage, map[string]interface{}{"title": "Owner book page", "content": "Updated"}, 200},
		{"GET", "/api/chapters/" + a.chapter + "/recipes", nil, 200},
		{"PUT", "/api/books/" + a.book + "/chapters/" + a.chapter, map[string]interface{}{"title": "Owner edit"}, 200},
		{"PUT", "/api/chapters/" + a.chapter + "/pages/" + a.page, map[string]interface{}{"title": "Owner page"}, 200},
		{"PUT", "/api/books/" + a.book + "/items/reorder", map[string]interface{}{"items": []BookLevelItem{{ID: a.bookPage, Type: "book-page"}, {ID: a.chapter, Type: "chapter"}}}, 200},
		{"PUT", "/api/chapters/" + a.chapter + "/items/reorder", map[string]interface{}{"items": []ChapterItem{{Type: "page", PageID: a.page}, {Type: "recipe", RecipeID: a.recipe}}}, 200},
		{"POST", "/api/chapter-recipes/" + a.join + "/move", map[string]interface{}{"targetChapterId": b.chapter, "position": 0}, 200},
		{"POST", "/api/pages/" + a.page + "/move", map[string]interface{}{"targetChapterId": b.chapter, "position": 0}, 200},
		{"POST", "/api/pages/" + a.page + "/to-book", map[string]interface{}{"bookId": a.book, "position": 0}, 200},
		{"POST", "/api/pages/" + a.page + "/to-chapter", map[string]interface{}{"chapterId": a.chapter, "position": 0}, 200},
		{"DELETE", "/api/pages/" + a.page, nil, 200},
		{"DELETE", "/api/book-pages/" + a.bookPage, nil, 200},
	}
	for i, tc := range requests {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			w := env.doRequest(tc.method, tc.path, tc.body)
			if w.Code != tc.status {
				t.Fatalf("status=%d want %d body=%s", w.Code, tc.status, w.Body.String())
			}
			var result interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
		})
	}
}
