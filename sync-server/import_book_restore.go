package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Restore uses the same explicit book decisions as ordinary staging. Main
// content is verified before any write, and the receipt makes response-loss
// retries no-ops rather than prompting for the just-restored books.
func (s *PostgresStore) stagePendingBackupTx(tx *sql.Tx, userID string, bundle RecipeBundle, hash string, decisions []BookImportDecision, batches []*recipeImportBatch) (*RecipeBundleImportSummary, error) {
	main := bundle
	if main.Version != 4 {
		main.Version = 2
	}
	main.PendingImports = nil
	b := &recipeImportBatch{ID: uuid.NewString(), Accepted: true, Context: main, Placements: importPlacements{}, BookState: importBookState{Version: 1, Decisions: decisions}, CreatedAt: time.Now().UTC()}
	rows := []*stagedImportRecipe{}
	for i := range b.Context.Recipes {
		r := &b.Context.Recipes[i]
		if r.PortableID == "" {
			r.PortableID = "dietledger:recipe:" + uuid.NewString()
		}
		rows = append(rows, &stagedImportRecipe{BatchID: b.ID, Recipe: *r})
	}
	evaluator := newImportEvaluator(&PostgresStore{db: s.db, readTx: tx}, userID, []*recipeImportBatch{b}, rows)
	missingFoods, err := bundleNeedsFoodQuarantine(tx, main)
	if err != nil {
		return nil, err
	}
	verified := []BundleRecipe{}
	unconfirmed := []*stagedImportRecipe{}
	for _, r := range rows {
		result, err := evaluator.recipeByIdentity(r.Recipe.PortableID)
		if err != nil {
			return nil, err
		}
		if !result.ready {
			if !missingFoods {
				return nil, errors.New("pending-import main section contains unresolved recipes; keep them in pendingImports")
			}
			r.ID = uuid.NewString()
			unconfirmed = append(unconfirmed, r)
			continue
		}
		verified = append(verified, result.recipe)
	}
	context, err := json.Marshal(b.Context)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`INSERT INTO recipe_import_batches(id,user_id,request_hash,accepted,context) VALUES($1,$2,$3,true,$4)`, b.ID, userID, hash, string(context)); err != nil {
		return nil, err
	}
	batches = append(batches, b)
	for _, row := range unconfirmed {
		if err := insertStagedRecipeTx(tx, userID, row); err != nil {
			return nil, err
		}
	}
	summary := newRecipeBundleImportSummary()
	if err := s.persistImportSliceTx(tx, userID, b, batches, verified, &summary); err != nil {
		return nil, err
	}
	if err := s.restorePendingImportsTx(tx, userID, bundle, nil, nil); err != nil {
		return nil, err
	}
	if err := tx.QueryRow(`SELECT count(*) FROM recipe_import_staged WHERE user_id=$1`, userID).Scan(&summary.Quarantined); err != nil {
		return nil, err
	}
	return &summary, nil
}

// Mark stale pending choices before serializing. Restore can bind a still-valid
// choice to newly remapped IDs, but must never launder a stale decision into a
// fresh permission to overwrite. Materialized decisions have already run.
func (s *PostgresStore) backupBookState(userID string, b *recipeImportBatch, bundle RecipeBundle) error {
	for _, d := range activeBookDecisions(b) {
		if !backupHasPlacement(bundle, "book", d.TargetBookID) {
			return errors.New("pending book target is absent from owner backup")
		}
	}
	if b.Materialized || len(activeBookDecisions(b)) == 0 {
		return nil
	}
	conflicts, err := bookConflictsTx(s.reader(), userID, effectiveBookContext(b))
	if err != nil {
		return err
	}
	complete, err := validateBookChoices(conflicts, activeBookDecisions(b))
	if err != nil || !complete {
		b.BookState.Invalidated = true
	}
	return nil
}
