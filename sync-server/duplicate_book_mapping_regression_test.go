package main

import "testing"

// Import through the public endpoint: an edited package is a new request, but
// the book and placement source keys still identify the existing local objects.
func TestDuplicateBookRenamedSourceMappingReimport(t *testing.T) {
	for _, mixed := range []bool{false, true} {
		name := "no choices"
		if mixed {
			name = "other book explicitly merged"
		}
		t.Run(name, func(t *testing.T) {
			env := newTestEnv(t)
			db := env.store.(*PostgresStore).db
			original := duplicateBookBundle("stable", "Source title", true)
			duplicateBookResponse(t, env, original)
			var bookID, chapterID, pageID string
			if err := db.QueryRow(`SELECT b.id,c.id,p.id FROM recipe_books b JOIN chapters c ON c.book_id=b.id JOIN book_pages p ON p.book_id=b.id WHERE b.user_id=$1`, env.userID).Scan(&bookID, &chapterID, &pageID); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`UPDATE recipe_books SET title='Locally renamed' WHERE id=$1`, bookID); err != nil {
				t.Fatal(err)
			}
			incoming := duplicateBookBundle("stable", "Source title", true)
			incoming.Books[0].Description = "changed incoming metadata"
			incoming.BookPages[0].Content = "changed incoming page"
			var body interface{} = incoming
			if mixed {
				duplicateBookResponse(t, env, duplicateBookBundle("target", "Other book", true))
				other := duplicateBookBundle("new-other", "Other book", true)
				incoming.Books = append(incoming.Books, other.Books...)
				incoming.Chapters = append(incoming.Chapters, other.Chapters...)
				incoming.BookPages = append(incoming.BookPages, other.BookPages...)
				incoming.Recipes = append(incoming.Recipes, other.Recipes...)
				incoming.ChapterRecipes = append(incoming.ChapterRecipes, other.ChapterRecipes...)
				choice := duplicateBookChoice(t, duplicateBookResponse(t, env, incoming), "merge")
				body = duplicateChoiceBody(incoming, choice)
			}
			result := duplicateBookResponse(t, env, body)
			if result["requiresBookDecision"] == true {
				t.Fatalf("renamed book unexpectedly conflicts: %+v", result)
			}
			var count int
			if err := db.QueryRow(`SELECT count(*) FROM recipe_books WHERE user_id=$1`, env.userID).Scan(&count); err != nil {
				t.Fatal(err)
			}
			want := 1
			if mixed {
				want = 2
			}
			if count != want {
				t.Fatalf("reimport created duplicate books: got %d want %d", count, want)
			}
			var title, gotChapter, gotPage, content string
			if err := db.QueryRow(`SELECT b.title,c.id,p.id,p.content FROM recipe_books b JOIN chapters c ON c.book_id=b.id JOIN book_pages p ON p.book_id=b.id WHERE b.id=$1`, bookID).Scan(&title, &gotChapter, &gotPage, &content); err != nil {
				t.Fatal(err)
			}
			if title != "Locally renamed" || gotChapter != chapterID || gotPage != pageID || content != "stable" {
				t.Fatalf("existing placement or local edits changed: %q %q %q %q", title, gotChapter, gotPage, content)
			}
			for _, mapping := range []struct{ kind, key, id string }{{"book", "stable-book", bookID}, {"chapter", "stable-chapter", chapterID}, {"book_page", "stable-page", pageID}} {
				var target string
				if err := db.QueryRow(`SELECT target_id FROM import_object_mappings WHERE user_id=$1 AND source_object_type=$2 AND source_object_key=$3`, env.userID, mapping.kind, mapping.key).Scan(&target); err != nil || target != mapping.id {
					t.Fatalf("%s mapping changed: %s %v", mapping.kind, target, err)
				}
			}
			if duplicateBookCount(t, env, "chapter_recipes") != want+1 && mixed {
				t.Fatal("unexpected recipe placements")
			}
			if !mixed && duplicateBookCount(t, env, "chapter_recipes") != 1 {
				t.Fatal("recipe placement duplicated")
			}
		})
	}
}
