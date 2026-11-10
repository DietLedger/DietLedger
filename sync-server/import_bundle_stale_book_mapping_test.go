package main

import "testing"

func testBookBundleForStaleMapping() RecipeBundle {
	return RecipeBundle{
		Format: RecipeBundleFormat, Version: RecipeBundleVersion,
		Books:     []BundleBook{{BundleBookID: "seed:public-book", Title: "Public Book", Description: "Author: Various", CoverColor: "#526c54"}},
		BookPages: []BundleBookPage{{BundleBookPageID: "seed:preface", BundleBookID: "seed:public-book", Title: "Preface", Content: "Attribution and license", Position: 0}},
		Chapters:  []BundleChapter{{BundleChapterID: "seed:breakfast", BundleBookID: "seed:public-book", Title: "Breakfast", Position: 1}},
	}
}

func TestImportRecipeBundleAfterDeletingPreviouslyImportedBook(t *testing.T) {
	for _, lookup := range []string{"origin", "hash"} {
		t.Run(lookup, func(t *testing.T) {
			store := testStore(t).(*PostgresStore)
			user := createUser(t, store, "stale-book")
			bundle := testBookBundleForStaleMapping()
			if _, err := store.ImportRecipeBundle(user.ID, bundle); err != nil {
				t.Fatalf("first import: %v", err)
			}
			var oldID string
			if err := store.db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, user.ID).Scan(&oldID); err != nil {
				t.Fatal(err)
			}
			if err := store.DeleteBook(user.ID, oldID); err != nil {
				t.Fatal(err)
			}
			if lookup == "hash" {
				if _, err := store.db.Exec(`UPDATE import_object_mappings SET source_object_key='old-key' WHERE user_id=$1 AND source_object_type='book'`, user.ID); err != nil {
					t.Fatal(err)
				}
			}

			if _, err := store.ImportRecipeBundle(user.ID, bundle); err != nil {
				t.Fatalf("reimport deleted book: %v", err)
			}
			var newID string
			if err := store.db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, user.ID).Scan(&newID); err != nil {
				t.Fatal(err)
			}
			if newID == oldID {
				t.Fatal("reused deleted book ID")
			}
			var pages, chapters int
			if err := store.db.QueryRow(`SELECT count(*) FROM book_pages WHERE book_id=$1`, newID).Scan(&pages); err != nil {
				t.Fatal(err)
			}
			if err := store.db.QueryRow(`SELECT count(*) FROM chapters WHERE book_id=$1`, newID).Scan(&chapters); err != nil {
				t.Fatal(err)
			}
			if pages != 1 || chapters != 1 {
				t.Fatalf("new book has %d pages and %d chapters; want one of each", pages, chapters)
			}
			if _, err := store.ImportRecipeBundle(user.ID, bundle); err != nil {
				t.Fatalf("idempotent reimport: %v", err)
			}
			var mappedID string
			if err := store.db.QueryRow(`SELECT target_id FROM import_object_mappings WHERE user_id=$1 AND source_object_type='book' AND source_object_key=$2`, user.ID, bundle.Books[0].BundleBookID).Scan(&mappedID); err != nil {
				t.Fatal(err)
			}
			if mappedID != newID {
				t.Fatalf("mapped to %q, want %q", mappedID, newID)
			}
		})
	}
}

func TestImportRecipeBundleDoesNotReuseAnotherUsersBook(t *testing.T) {
	store := testStore(t).(*PostgresStore)
	owner := createUser(t, store, "book-owner")
	importer := createUser(t, store, "book-importer")
	bundle := testBookBundleForStaleMapping()
	if _, err := store.ImportRecipeBundle(owner.ID, bundle); err != nil {
		t.Fatal(err)
	}
	var ownerBookID string
	if err := store.db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, owner.ID).Scan(&ownerBookID); err != nil {
		t.Fatal(err)
	}
	hash, err := RecipeBundleContentHash("book", bundle.Books[0])
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.db.Exec(`INSERT INTO import_object_mappings (id,user_id,source_format,source_object_type,source_object_key,content_hash,target_table,target_id) VALUES ('cross-user-book',$1,$2,'book',$3,$4,'recipe_books',$5)`, importer.ID, RecipeBundleFormat, bundle.Books[0].BundleBookID, hash, ownerBookID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.ImportRecipeBundle(importer.ID, bundle); err != nil {
		t.Fatalf("import with cross-user mapping: %v", err)
	}
	var importedID string
	if err := store.db.QueryRow(`SELECT id FROM recipe_books WHERE user_id=$1`, importer.ID).Scan(&importedID); err != nil {
		t.Fatal(err)
	}
	if importedID == ownerBookID {
		t.Fatal("reused another user's book")
	}
}

func TestImportRecipeBundleUpdatesExistingOwnedBook(t *testing.T) {
	store := testStore(t).(*PostgresStore)
	user := createUser(t, store, "owned-book")
	bundle := testBookBundleForStaleMapping()
	if _, err := store.ImportRecipeBundle(user.ID, bundle); err != nil {
		t.Fatal(err)
	}
	bundle.Books[0].Description = "Author: Updated"
	bundle.BookPages[0].Content = "Updated attribution"
	if _, err := store.ImportRecipeBundle(user.ID, bundle); err != nil {
		t.Fatalf("update existing book: %v", err)
	}
	var bookCount, pageCount, chapterCount int
	if err := store.db.QueryRow(`SELECT count(*) FROM recipe_books WHERE user_id=$1 AND description=$2`, user.ID, "Author: Updated").Scan(&bookCount); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT count(*) FROM book_pages WHERE content='Updated attribution'`).Scan(&pageCount); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT count(*) FROM chapters WHERE title='Breakfast'`).Scan(&chapterCount); err != nil {
		t.Fatal(err)
	}
	if bookCount != 1 || pageCount != 1 || chapterCount != 1 {
		t.Fatalf("updated book=%d page=%d chapter=%d, want one of each", bookCount, pageCount, chapterCount)
	}
}
