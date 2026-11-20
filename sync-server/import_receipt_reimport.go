package main

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// A receipt records acceptance, not the continued existence of its content.
// Only an explicit identical import may restore its missing effective claims.
// Keep the receipt and its generated legacy identities; never revalidate or
// rehydrate surviving recipes against the original (possibly stale) snapshot.
func (s *PostgresStore) reconcileImportReceiptTx(tx *sql.Tx, userID string, b *recipeImportBatch, batches []*recipeImportBatch, rows []*stagedImportRecipe) (*RecipeBundleImportSummary, error) {
	summary := newRecipeBundleImportSummary()
	if b == nil || !b.Accepted || !b.Materialized {
		return &summary, nil
	}
	context := effectiveBookContext(b)
	live, err := liveImportBookContextTx(tx, userID, b)
	if err != nil {
		return nil, err
	}
	missingStructure := len(context.Books) != len(live.Books) || len(context.Chapters) != len(live.Chapters) || len(context.BookPages) != len(live.BookPages) || len(context.ChapterPages) != len(live.ChapterPages)
	// A deleted target does not grant permission to merge into a new same-title
	// book, or to replay an old Replace decision against its former target.
	missingBooks := context
	missingBooks.Books = nil
	for _, book := range context.Books {
		found := false
		for _, existing := range live.Books {
			if existing.BundleBookID == book.BundleBookID {
				found = true
			}
		}
		if !found {
			missingBooks.Books = append(missingBooks.Books, book)
		}
	}
	conflicts, err := bookConflictsTx(tx, userID, missingBooks)
	if err != nil {
		return nil, err
	}
	if len(conflicts) > 0 {
		return nil, ErrBookImportChanged
	}
	added := false
	for _, recipe := range b.Context.Recipes {
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipes WHERE user_id=$1 AND portable_id=$2)`, userID, recipe.PortableID).Scan(&exists); err != nil {
			return nil, err
		}
		for _, row := range rows {
			if row.Recipe.PortableID == recipe.PortableID {
				exists = true
			}
		}
		if exists {
			continue
		}
		row := &stagedImportRecipe{ID: uuid.NewString(), BatchID: b.ID, Recipe: recipe, CreatedAt: time.Now().UTC()}
		if err := insertStagedRecipeTx(tx, userID, row); err != nil {
			return nil, err
		}
		rows = append(rows, row)
		added = true
	}
	missingJoin := false
	for _, join := range live.ChapterRecipes {
		var missing bool
		var identity string
		for _, recipe := range b.Context.Recipes {
			if recipe.BundleRecipeID == join.BundleRecipeID {
				identity = recipe.PortableID
			}
		}
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipes r WHERE r.user_id=$2 AND r.portable_id=$3 AND NOT EXISTS(SELECT 1 FROM chapter_recipes cr WHERE cr.chapter_id=$1 AND cr.recipe_id=r.id))`, b.Placements["chapter"][join.BundleChapterID], userID, identity).Scan(&missing); err != nil {
			return nil, err
		}
		missingJoin = missingJoin || missing
	}
	if missingStructure || missingJoin {
		if err := s.persistImportSliceTx(tx, userID, b, batches, nil, &summary, true); err != nil {
			return nil, err
		}
	}
	if added {
		if err := s.promoteImportsTx(tx, userID, batches, rows, &summary); err != nil {
			return nil, err
		}
	}
	return &summary, nil
}

// Materialized context is historical evidence, not permission for unrelated
// imports/repairs to recreate deleted structure. Resolve only batch-local live
// aliases, with ownership and parent checks, never the mutable global key map.
func liveImportBookContextTx(tx *sql.Tx, userID string, b *recipeImportBatch) (RecipeBundle, error) {
	source := effectiveBookContext(b)
	out := source
	out.Books, out.Chapters, out.BookPages, out.ChapterPages, out.ChapterRecipes = nil, nil, nil, nil, nil
	books, chapters := map[string]string{}, map[string]string{}
	for _, book := range source.Books {
		id := b.Placements["book"][book.BundleBookID]
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipe_books WHERE id=$1 AND user_id=$2)`, id, userID).Scan(&exists); err != nil {
			return out, err
		}
		if exists {
			out.Books = append(out.Books, book)
			books[book.BundleBookID] = id
		}
	}
	for _, chapter := range source.Chapters {
		id := b.Placements["chapter"][chapter.BundleChapterID]
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM chapters WHERE id=$1 AND book_id=$2)`, id, books[chapter.BundleBookID]).Scan(&exists); err != nil {
			return out, err
		}
		if exists {
			out.Chapters = append(out.Chapters, chapter)
			chapters[chapter.BundleChapterID] = id
		}
	}
	for _, page := range source.BookPages {
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM book_pages WHERE id=$1 AND book_id=$2)`, b.Placements["book_page"][page.BundleBookPageID], books[page.BundleBookID]).Scan(&exists); err != nil {
			return out, err
		}
		if exists {
			out.BookPages = append(out.BookPages, page)
		}
	}
	for _, page := range source.ChapterPages {
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM chapter_pages WHERE id=$1 AND chapter_id=$2)`, b.Placements["chapter_page"][page.BundleChapterPageID], chapters[page.BundleChapterID]).Scan(&exists); err != nil {
			return out, err
		}
		if exists {
			out.ChapterPages = append(out.ChapterPages, page)
		}
	}
	for _, join := range source.ChapterRecipes {
		if chapters[join.BundleChapterID] != "" {
			out.ChapterRecipes = append(out.ChapterRecipes, join)
		}
	}
	return out, nil
}
