package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// BookImportDecision is independent of recipe/food portable-identity decisions.
// A fingerprint binds both the selected structure and the complete candidate set.
type BookImportDecision struct {
	BundleBookID      string `json:"bundleBookId"`
	TargetBookID      string `json:"targetBookId"`
	Action            string `json:"action"`
	TargetFingerprint string `json:"targetFingerprint"`
}
type BookImportCandidate struct {
	TargetBookID      string `json:"targetBookId"`
	Title             string `json:"title"`
	TargetFingerprint string `json:"targetFingerprint"`
}
type BookImportConflict struct {
	BundleBookID string                `json:"bundleBookId"`
	Title        string                `json:"title"`
	Candidates   []BookImportCandidate `json:"candidates"`
}
type importBookState struct {
	Version     int                  `json:"version,omitempty"`
	Decisions   []BookImportDecision `json:"decisions,omitempty"`
	Invalidated bool                 `json:"invalidated,omitempty"`
	// Original context is retained as evidence of the claim; effective placement
	// excludes these books after a newer accepted replacement supersedes it.
	SupersededBooks []string `json:"supersededBooks,omitempty"`
}

var ErrBookImportChanged = errors.New("book import target or candidates changed; cancel the pending import and import again to choose a current target")

// Migration 35 makes ordinary book/child writes take the same owner-row lock
// as import. Candidate inserts and structure edits are serialized per owner;
// unrelated owners never need a global book-table lock.
func normalizedBookTitle(title string) string { return strings.TrimSpace(title) }

func bookFingerprintTx(tx postgresReader, userID, id string, candidateIDs []string) (string, error) {
	var payload []byte
	err := tx.QueryRow(`SELECT jsonb_build_object(
 'book',to_jsonb(b),
 'chapters',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM chapters c WHERE c.book_id=b.id),'[]'::jsonb),
 'pages',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM book_pages p WHERE p.book_id=b.id),'[]'::jsonb),
 'chapterPages',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM chapter_pages p JOIN chapters c ON c.id=p.chapter_id WHERE c.book_id=b.id),'[]'::jsonb),
 'recipes',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM chapter_recipes r JOIN chapters c ON c.id=r.chapter_id WHERE c.book_id=b.id),'[]'::jsonb))
 FROM recipe_books b WHERE b.id=$1 AND b.user_id=$2`, id, userID).Scan(&payload)
	if err != nil {
		return "", err
	}
	ids, _ := json.Marshal(candidateIDs)
	sum := sha256.Sum256(append(payload, ids...))
	return hex.EncodeToString(sum[:]), nil
}
func bookConflictsTx(tx postgresReader, userID string, bundle RecipeBundle) ([]BookImportConflict, error) {
	rows, err := tx.Query(`SELECT id,title FROM recipe_books WHERE user_id=$1 ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	owned := []BookImportCandidate{}
	for rows.Next() {
		var c BookImportCandidate
		if err := rows.Scan(&c.TargetBookID, &c.Title); err != nil {
			rows.Close()
			return nil, err
		}
		owned = append(owned, c)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	conflicts := []BookImportConflict{}
	for _, b := range bundle.Books {
		candidates := []BookImportCandidate{}
		for _, candidate := range owned {
			if strings.EqualFold(normalizedBookTitle(candidate.Title), normalizedBookTitle(b.Title)) {
				candidates = append(candidates, candidate)
			}
		}
		if len(candidates) == 0 {
			continue
		}
		ids := []string{}
		for _, c := range candidates {
			ids = append(ids, c.TargetBookID)
		}
		for i := range candidates {
			candidates[i].TargetFingerprint, err = bookFingerprintTx(tx, userID, candidates[i].TargetBookID, ids)
			if err != nil {
				return nil, err
			}
		}
		conflicts = append(conflicts, BookImportConflict{BundleBookID: b.BundleBookID, Title: b.Title, Candidates: candidates})
	}
	return conflicts, nil
}
func validateBookChoices(conflicts []BookImportConflict, choices []BookImportDecision) (bool, error) {
	byKey := map[string]BookImportDecision{}
	for _, d := range choices {
		if d.BundleBookID == "" || d.TargetBookID == "" || d.TargetFingerprint == "" || (d.Action != "merge" && d.Action != "replace") {
			return false, errors.New("invalid book decision; select merge or replace with a target and fingerprint")
		}
		if _, exists := byKey[d.BundleBookID]; exists {
			return false, errors.New("duplicate book decision")
		}
		byKey[d.BundleBookID] = d
	}
	complete := true
	targets := map[string]string{}
	for _, c := range conflicts {
		d, ok := byKey[c.BundleBookID]
		if !ok {
			complete = false
			continue
		}
		valid := false
		for _, candidate := range c.Candidates {
			if candidate.TargetBookID == d.TargetBookID && candidate.TargetFingerprint == d.TargetFingerprint {
				valid = true
			}
		}
		if !valid {
			return false, ErrBookImportChanged
		}
		if previous := targets[d.TargetBookID]; previous != "" && (previous == "replace" || d.Action == "replace") {
			return false, errors.New("multiple incoming books cannot replace the same target")
		}
		targets[d.TargetBookID] = d.Action
		delete(byKey, c.BundleBookID)
	}
	if len(byKey) > 0 {
		return false, ErrBookImportChanged
	}
	return complete, nil
}

// Pending state is opaque to browser readers, not trusted by the API. Validate
// its transport keys and decision shape before restoring any library content.
func validatePendingBookState(b recipeImportBatch) error {
	if b.BookState.Version < 0 || b.BookState.Version > 1 {
		return errors.New("unsupported pending book state version")
	}
	books := map[string]bool{}
	for _, book := range b.Context.Books {
		books[book.BundleBookID] = true
	}
	seen := map[string]bool{}
	for _, key := range b.BookState.SupersededBooks {
		if !books[key] || seen[key] {
			return errors.New("invalid superseded book claim")
		}
		seen[key] = true
	}
	conflicts := []BookImportConflict{}
	for _, d := range b.BookState.Decisions {
		if !books[d.BundleBookID] {
			return errors.New("pending book decision is absent from context")
		}
		conflicts = append(conflicts, BookImportConflict{BundleBookID: d.BundleBookID, Candidates: []BookImportCandidate{{TargetBookID: d.TargetBookID, TargetFingerprint: d.TargetFingerprint}}})
	}
	_, err := validateBookChoices(conflicts, b.BookState.Decisions)
	return err
}

func sameBookChoices(a, b []BookImportDecision) bool {
	a = append([]BookImportDecision(nil), a...)
	b = append([]BookImportDecision(nil), b...)
	sort.Slice(a, func(i, j int) bool { return a[i].BundleBookID < a[j].BundleBookID })
	sort.Slice(b, func(i, j int) bool { return b[i].BundleBookID < b[j].BundleBookID })
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return string(left) == string(right)
}

// Filter only structure, never recipe/food payloads or their identity claims.
func effectiveBookContext(b *recipeImportBatch) RecipeBundle {
	out := b.Context
	out.Books = nil
	out.Chapters = nil
	out.BookPages = nil
	out.ChapterPages = nil
	out.ChapterRecipes = nil
	chapters := map[string]bool{}
	for _, v := range b.Context.Books {
		if !containsString(b.BookState.SupersededBooks, v.BundleBookID) {
			out.Books = append(out.Books, v)
		}
	}
	for _, v := range b.Context.Chapters {
		if !containsString(b.BookState.SupersededBooks, v.BundleBookID) {
			out.Chapters = append(out.Chapters, v)
			chapters[v.BundleChapterID] = true
		}
	}
	for _, v := range b.Context.BookPages {
		if !containsString(b.BookState.SupersededBooks, v.BundleBookID) {
			out.BookPages = append(out.BookPages, v)
		}
	}
	for _, v := range b.Context.ChapterPages {
		if chapters[v.BundleChapterID] {
			out.ChapterPages = append(out.ChapterPages, v)
		}
	}
	for _, v := range b.Context.ChapterRecipes {
		if chapters[v.BundleChapterID] {
			out.ChapterRecipes = append(out.ChapterRecipes, v)
		}
	}
	return out
}
func activeBookDecisions(b *recipeImportBatch) []BookImportDecision {
	out := []BookImportDecision{}
	for _, d := range b.BookState.Decisions {
		if !containsString(b.BookState.SupersededBooks, d.BundleBookID) {
			out = append(out, d)
		}
	}
	return out
}
func (s *PostgresStore) validateDeferredBooksTx(tx *sql.Tx, userID string, batches []*recipeImportBatch) error {
	// Validate every newly accepted choice before any materialization changes a
	// fingerprint shared by two intentional merges in this transaction.
	for _, b := range batches {
		if !b.Accepted || b.Cancelled || b.Materialized {
			continue
		}
		if b.BookState.Invalidated && len(activeBookDecisions(b)) > 0 {
			return ErrBookImportChanged
		}
		context := effectiveBookContext(b)
		// Older backups can carry authorized, already-materialized placement aliases
		// without explicit choices. Do not turn those into fresh same-title matches.
		context.Books = nil
		for _, book := range effectiveBookContext(b).Books {
			if b.Placements["book"][book.BundleBookID] == "" {
				context.Books = append(context.Books, book)
				continue
			}
			for _, d := range activeBookDecisions(b) {
				if d.BundleBookID == book.BundleBookID {
					context.Books = append(context.Books, book)
				}
			}
		}
		conflicts, err := bookConflictsTx(tx, userID, context)
		if err != nil {
			return err
		}
		complete, err := validateBookChoices(conflicts, activeBookDecisions(b))
		if err != nil {
			return err
		}
		if !complete {
			return ErrBookImportChanged
		}
	}
	return nil
}
func (s *PostgresStore) supersedeBookClaimsTx(tx *sql.Tx, userID, target string, current *recipeImportBatch, batches []*recipeImportBatch) error {
	for _, old := range batches {
		if old.ID == current.ID {
			continue
		}
		changed := false
		for _, book := range old.Context.Books {
			id := old.Placements["book"][book.BundleBookID]
			for _, d := range old.BookState.Decisions {
				if d.BundleBookID == book.BundleBookID {
					id = d.TargetBookID
				}
			}
			if id != target || containsString(old.BookState.SupersededBooks, book.BundleBookID) {
				continue
			}
			old.BookState.Version = 1
			old.BookState.SupersededBooks = append(old.BookState.SupersededBooks, book.BundleBookID)
			changed = true
		}
		if !changed {
			continue
		}
		// Deleted live placement IDs must not be exported as aliases. The original
		// claim remains in context plus SupersededBooks, including across restore.
		active := placementKeys(effectiveBookContext(old))
		for kind, mappings := range old.Placements {
			for key := range mappings {
				if !containsString(active[kind], key) {
					delete(mappings, key)
				}
			}
		}
		if err := s.saveImportBatchTx(tx, userID, old); err != nil {
			return err
		}
	}
	return nil
}
func (s *PostgresStore) initializeBookChoicesTx(tx *sql.Tx, userID string, b *recipeImportBatch, batches []*recipeImportBatch, summary *RecipeBundleImportSummary) error {
	context := effectiveBookContext(b)
	decisions := map[string]BookImportDecision{}
	for _, d := range activeBookDecisions(b) {
		decisions[d.BundleBookID] = d
	}
	if b.Placements == nil {
		b.Placements = importPlacements{}
	}
	if b.Placements["book"] == nil {
		b.Placements["book"] = map[string]string{}
	}
	chapterTails, pageTails := map[string]int{}, map[string]int{}
	for _, book := range context.Books {
		d, chosen := decisions[book.BundleBookID]
		// Preserve the importer's established source-key/hash resolution for books
		// that do not have an explicit same-title decision. In particular, a
		// source key may still point to a locally renamed book after reimport.
		if !chosen {
			continue
		}
		id := d.TargetBookID
		if d.Action == "replace" {
			if err := s.supersedeBookClaimsTx(tx, userID, id, b, batches); err != nil {
				return err
			}
			if _, err := tx.Exec(`DELETE FROM book_pages WHERE book_id=$1`, id); err != nil {
				return err
			}
			if _, err := tx.Exec(`DELETE FROM chapters WHERE book_id=$1`, id); err != nil {
				return err
			}
			if _, err := tx.Exec(`UPDATE recipe_books SET title=$1,description=$2,cover_color=$3,updated_at=NOW() WHERE id=$4 AND user_id=$5`, book.Title, book.Description, emptyDefault(book.CoverColor, "#059669"), id, userID); err != nil {
				return err
			}
			incCount(summary.Updated, "books")
		}
		b.Placements["book"][book.BundleBookID] = id
		// Only explicitly selected conflict books bypass the old child aliases:
		// their incoming chapters/pages must be appended as distinct placements.
		for _, chapter := range context.Chapters {
			if chapter.BundleBookID != book.BundleBookID {
				continue
			}
			if _, err := tx.Exec(`DELETE FROM import_object_mappings WHERE user_id=$1 AND source_object_type='chapter' AND source_object_key=$2`, userID, chapter.BundleChapterID); err != nil {
				return err
			}
			for _, page := range context.ChapterPages {
				if page.BundleChapterID == chapter.BundleChapterID {
					if _, err := tx.Exec(`DELETE FROM import_object_mappings WHERE user_id=$1 AND source_object_type='chapter_page' AND source_object_key=$2`, userID, page.BundleChapterPageID); err != nil {
						return err
					}
				}
			}
		}
		for _, page := range context.BookPages {
			if page.BundleBookID == book.BundleBookID {
				if _, err := tx.Exec(`DELETE FROM import_object_mappings WHERE user_id=$1 AND source_object_type='book_page' AND source_object_key=$2`, userID, page.BundleBookPageID); err != nil {
					return err
				}
			}
		}
		if d.Action == "merge" {
			var nextChapter, nextPage int
			if tail, ok := chapterTails[id]; ok {
				nextChapter = tail
			} else if err := tx.QueryRow(`SELECT COALESCE(max(position)+1,0) FROM chapters WHERE book_id=$1`, id).Scan(&nextChapter); err != nil {
				return err
			}
			if tail, ok := pageTails[id]; ok {
				nextPage = tail
			} else if err := tx.QueryRow(`SELECT COALESCE(max(position)+1,0) FROM book_pages WHERE book_id=$1`, id).Scan(&nextPage); err != nil {
				return err
			}
			// Shift all incoming positions by the live tail, preserving relative order
			// (including gaps/ties) rather than renumbering or coalescing chapter names.
			b.Context.Chapters = append([]BundleChapter(nil), b.Context.Chapters...)
			b.Context.BookPages = append([]BundleBookPage(nil), b.Context.BookPages...)
			for i := range b.Context.Chapters {
				if b.Context.Chapters[i].BundleBookID == book.BundleBookID {
					b.Context.Chapters[i].Position += nextChapter
					if end := b.Context.Chapters[i].Position + 1; end > chapterTails[id] {
						chapterTails[id] = end
					}
				}
			}
			for i := range b.Context.BookPages {
				if b.Context.BookPages[i].BundleBookID == book.BundleBookID {
					b.Context.BookPages[i].Position += nextPage
					if end := b.Context.BookPages[i].Position + 1; end > pageTails[id] {
						pageTails[id] = end
					}
				}
			}
		}
	}
	return nil
}

func (s *PostgresStore) restoreBookStateTx(tx *sql.Tx, userID string, bundle RecipeBundle, b *recipeImportBatch) error {
	for i := range b.BookState.Decisions {
		d := &b.BookState.Decisions[i]
		if containsString(b.BookState.SupersededBooks, d.BundleBookID) {
			continue
		}
		if !backupHasPlacement(bundle, "book", d.TargetBookID) {
			return fmt.Errorf("pending book target %s is absent from owner backup", d.TargetBookID)
		}
		target, found, err := s.lookupImportMappingTx(tx, userID, "book", d.TargetBookID)
		if err != nil {
			return err
		}
		if !found {
			return errors.New("pending book target was not restored")
		}
		d.TargetBookID = target
	}
	// The backup is a trusted source snapshot only after its aliases have been
	// authorized/remapped. Bind deferred choices to the newly restored structure.
	conflicts, err := bookConflictsTx(tx, userID, effectiveBookContext(b))
	if err != nil {
		return err
	}
	for i := range b.BookState.Decisions {
		d := &b.BookState.Decisions[i]
		if containsString(b.BookState.SupersededBooks, d.BundleBookID) {
			continue
		}
		found := false
		for _, c := range conflicts {
			if c.BundleBookID == d.BundleBookID {
				for _, target := range c.Candidates {
					if target.TargetBookID == d.TargetBookID {
						d.TargetFingerprint = target.TargetFingerprint
						found = true
					}
				}
			}
		}
		if !found && !b.Materialized {
			b.BookState.Invalidated = true
		}
	}
	return nil
}
