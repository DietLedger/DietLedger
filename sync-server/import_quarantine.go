package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
)

var (
	ErrImportNotFound = errors.New("recipe import not found")
	ErrImportAccepted = errors.New("accepted recipe import cannot be cancelled")
)

type ImportIngredientBlocker struct {
	IngredientID string `json:"ingredientId"`
	Reason       string `json:"reason"`
}
type QuarantinedRecipe struct {
	ID                    string                    `json:"id"`
	BatchID               string                    `json:"batchId"`
	RequiresDecision      bool                      `json:"requiresDecision"`
	Recipe                Recipe                    `json:"recipe"`
	UnresolvedIngredients []ImportIngredientBlocker `json:"unresolvedIngredients"`
	BookTitles            []string                  `json:"bookTitles"`
}

// Placement maps are batch-local, so later imports cannot redirect an earlier
// quarantine recipe into a different chapter by overwriting an origin mapping.
type importPlacements map[string]map[string]string

type recipeImportBatch struct {
	ID           string           `json:"id"`
	Accepted     bool             `json:"accepted"`
	Materialized bool             `json:"materialized"`
	Cancelled    bool             `json:"-"`
	Context      RecipeBundle     `json:"bundle"`
	Placements   importPlacements `json:"placements"`
	BookState    importBookState  `json:"bookState,omitempty"`
	CreatedAt    time.Time        `json:"createdAt"`
}
type stagedImportRecipe struct {
	ID        string       `json:"id"`
	BatchID   string       `json:"batchId"`
	Recipe    BundleRecipe `json:"recipe"`
	CreatedAt time.Time    `json:"createdAt"`
}

// V3 is explicitly understood by both validation and restore. IDs inside
// placements in a backup are bundle transport keys, never recipient row IDs.
type PendingRecipeImports struct {
	Version int                  `json:"version"`
	Batches []recipeImportBatch  `json:"batches"`
	Recipes []stagedImportRecipe `json:"recipes"`
}

func validatePendingRecipeImports(bundle RecipeBundle) error {
	if bundle.Version != 3 && bundle.Version != 4 {
		if bundle.PendingImports != nil {
			return errors.New("pendingImports requires recipe bundle version 3 or 4")
		}
		return nil
	}
	p := bundle.PendingImports
	if bundle.Version == 4 && p == nil {
		return nil
	}
	if p == nil || p.Version != 1 {
		return errors.New("version 3 requires supported pendingImports version 1")
	}
	batches := map[string]recipeImportBatch{}
	ids := map[string]bool{}
	identities := map[string]bool{}
	for _, b := range p.Batches {
		if b.ID == "" {
			return errors.New("pending import batch id is required")
		}
		if _, ok := batches[b.ID]; ok {
			return errors.New("duplicate pending import batch")
		}
		if b.Context.Version == 3 || b.Context.PendingImports != nil {
			return errors.New("nested pending imports are invalid")
		}
		if err := ValidateRecipeBundle(b.Context); err != nil {
			return fmt.Errorf("pending import context: %w", err)
		}
		if err := validatePendingBookState(b); err != nil {
			return err
		}
		batches[b.ID] = b
	}
	for _, r := range p.Recipes {
		b, ok := batches[r.BatchID]
		if !ok || r.ID == "" || ids[r.ID] {
			return errors.New("invalid pending recipe identity or batch")
		}
		ids[r.ID] = true
		if r.Recipe.PortableID == "" || identities[r.Recipe.PortableID] {
			return errors.New("pending recipe portable identity is missing or duplicate")
		}
		identities[r.Recipe.PortableID] = true
		found := false
		for _, candidate := range b.Context.Recipes {
			if candidate.BundleRecipeID == r.Recipe.BundleRecipeID && candidate.PortableID == r.Recipe.PortableID {
				found = true
			}
		}
		if !found {
			return errors.New("pending recipe is absent from batch context")
		}
		check := b.Context
		check.Recipes = []BundleRecipe{r.Recipe}
		check.ChapterRecipes = nil
		check.RecipeCategories = nil
		if err := ValidateRecipeBundle(check); err != nil {
			return fmt.Errorf("pending recipe: %w", err)
		}
	}
	return nil
}

func importRequestHash(bundle RecipeBundle) (string, error) {
	bundle.ExportedAt = ""
	b, err := json.Marshal(bundle)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}
func lockImportOwner(tx *sql.Tx, userID string) error {
	var owner string
	return tx.QueryRow(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&owner)
}
func (s *PostgresStore) loadImportState(userID string) ([]*recipeImportBatch, []*stagedImportRecipe, error) {
	batches := []*recipeImportBatch{}
	recipes := []*stagedImportRecipe{}
	rows, err := s.reader().Query(`SELECT id,accepted,materialized,cancelled,context,placements,book_state,created_at FROM recipe_import_batches WHERE user_id=$1 AND NOT cancelled ORDER BY created_at,id`, userID)
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		b := &recipeImportBatch{}
		var context, placements, bookState []byte
		if err := rows.Scan(&b.ID, &b.Accepted, &b.Materialized, &b.Cancelled, &context, &placements, &bookState, &b.CreatedAt); err != nil {
			rows.Close()
			return nil, nil, err
		}
		if err := json.Unmarshal(context, &b.Context); err != nil {
			rows.Close()
			return nil, nil, err
		}
		if err := json.Unmarshal(placements, &b.Placements); err != nil {
			rows.Close()
			return nil, nil, err
		}
		if err := json.Unmarshal(bookState, &b.BookState); err != nil {
			rows.Close()
			return nil, nil, err
		}
		batches = append(batches, b)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, nil, err
	}
	rows, err = s.reader().Query(`SELECT id,batch_id,recipe,created_at FROM recipe_import_staged WHERE user_id=$1 ORDER BY created_at,id`, userID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		r := &stagedImportRecipe{}
		var payload []byte
		if err := rows.Scan(&r.ID, &r.BatchID, &payload, &r.CreatedAt); err != nil {
			return nil, nil, err
		}
		if err := json.Unmarshal(payload, &r.Recipe); err != nil {
			return nil, nil, err
		}
		recipes = append(recipes, r)
	}
	return batches, recipes, rows.Err()
}
func (s *PostgresStore) saveImportBatchTx(tx *sql.Tx, userID string, b *recipeImportBatch) error {
	context, err := json.Marshal(b.Context)
	if err != nil {
		return err
	}
	placements, err := json.Marshal(b.Placements)
	if err != nil {
		return err
	}
	bookState, err := json.Marshal(b.BookState)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE recipe_import_batches SET accepted=$1,cancelled=$2,context=$3,placements=$4,materialized=$7,book_state=$8,updated_at=NOW() WHERE id=$5 AND user_id=$6`, b.Accepted, b.Cancelled, string(context), string(placements), b.ID, userID, b.Materialized, string(bookState))
	return err
}
func insertStagedRecipeTx(tx *sql.Tx, userID string, r *stagedImportRecipe) error {
	payload, err := json.Marshal(r.Recipe)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO recipe_import_staged(id,batch_id,user_id,portable_id,bundle_recipe_id,recipe) VALUES($1,$2,$3,$4,$5,$6)`, r.ID, r.BatchID, userID, r.Recipe.PortableID, r.Recipe.BundleRecipeID, string(payload))
	return err
}

// StageRecipeBundle is the public import boundary. No main-library dependency,
// shell or book is written until the whole incoming batch is accepted.
func (s *PostgresStore) StageRecipeBundle(userID string, bundle RecipeBundle) (*RecipeBundleImportSummary, error) {
	return s.StageRecipeBundleWithDecisions(userID, bundle, nil)
}

func (s *PostgresStore) StageRecipeBundleWithDecisions(userID string, bundle RecipeBundle, decisions []BookImportDecision) (*RecipeBundleImportSummary, error) {
	// Missing link metadata is an unresolved ingredient, not unsafe structure.
	// Unknown or conflicting supplied identities still go through validation.
	bundle.Recipes = append([]BundleRecipe(nil), bundle.Recipes...)
	for i := range bundle.Recipes {
		bundle.Recipes[i].Ingredients = append([]BundleIngredient(nil), bundle.Recipes[i].Ingredients...)
		for j := range bundle.Recipes[i].Ingredients {
			source := &bundle.Recipes[i].Ingredients[j].Source
			if *source == (BundleIngredientSourceRef{}) {
				source.Type = "manual"
			}
		}
	}
	if err := ValidateRecipeBundle(bundle); err != nil {
		return nil, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := lockImportOwner(tx, userID); err != nil {
		return nil, err
	}
	hash, err := importRequestHash(bundle)
	if err != nil {
		return nil, err
	}
	var priorID string
	var cancelled bool
	err = tx.QueryRow(`SELECT id,cancelled FROM recipe_import_batches WHERE user_id=$1 AND request_hash=$2`, userID, hash).Scan(&priorID, &cancelled)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	snapshot := &PostgresStore{db: s.db, readTx: tx}
	if priorID != "" && !cancelled {
		batches, recipes, err := snapshot.loadImportState(userID)
		if err != nil {
			return nil, err
		}
		var prior *recipeImportBatch
		for _, b := range batches {
			if b.ID == priorID {
				prior = b
			}
		}
		if len(decisions) > 0 && (prior == nil || !sameBookChoices(prior.BookState.Decisions, decisions)) {
			return nil, ErrBookImportChanged
		}
		summary, err := s.reconcileImportReceiptTx(tx, userID, prior, batches, recipes)
		if err != nil {
			return nil, err
		}
		batches, recipes, err = snapshot.loadImportState(userID)
		if err != nil {
			return nil, err
		}
		state, err := s.importStateSummaryTx(tx, userID, prior, batches, recipes)
		if err != nil {
			return nil, err
		}
		summary.PendingImportID = state.PendingImportID
		summary.RequiresDecision = state.RequiresDecision
		summary.Quarantined = state.Quarantined
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return summary, nil
	}
	conflicts, err := bookConflictsTx(tx, userID, bundle)
	if err != nil {
		return nil, err
	}
	complete, err := validateBookChoices(conflicts, decisions)
	if err != nil {
		return nil, err
	}
	if !complete {
		summary := newRecipeBundleImportSummary()
		summary.RequiresBookDecision = true
		summary.BookConflicts = conflicts
		return &summary, nil
	}
	if cancelled {
		if _, err := tx.Exec(`DELETE FROM recipe_import_batches WHERE id=$1 AND user_id=$2`, priorID, userID); err != nil {
			return nil, err
		}
	}
	batches, staged, err := snapshot.loadImportState(userID)
	if err != nil {
		return nil, err
	}
	if bundle.PendingImports != nil {
		summary, err := s.stagePendingBackupTx(tx, userID, bundle, hash, decisions, batches)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return summary, nil
	}
	b := &recipeImportBatch{ID: uuid.NewString(), Context: bundle, Placements: importPlacements{}, BookState: importBookState{Version: 1, Decisions: decisions}, CreatedAt: time.Now().UTC()}
	// Legacy payloads acquire identities only once in saved batch context. Retry
	// hashes use the original file, so a retry cannot regenerate identities.
	for i := range b.Context.Recipes {
		r := &b.Context.Recipes[i]
		if r.PortableID == "" {
			var portable string
			err := tx.QueryRow(`SELECT r.portable_id FROM import_object_mappings m JOIN recipes r ON r.id=m.target_id WHERE m.user_id=$1 AND r.user_id=$1 AND m.source_object_type='recipe' AND m.source_object_key=$2`, userID, r.BundleRecipeID).Scan(&portable)
			if err != nil && err != sql.ErrNoRows {
				return nil, err
			}
			if portable == "" {
				portable = "dietledger:recipe:" + uuid.NewString()
			}
			r.PortableID = portable
		}
	}
	context, err := json.Marshal(b.Context)
	if err != nil {
		return nil, err
	}
	bookState, err := json.Marshal(b.BookState)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`INSERT INTO recipe_import_batches(id,user_id,request_hash,context,book_state) VALUES($1,$2,$3,$4,$5)`, b.ID, userID, hash, string(context), string(bookState)); err != nil {
		return nil, err
	}
	for _, r := range b.Context.Recipes {
		reused := false
		for _, old := range staged {
			if old.Recipe.PortableID != r.PortableID {
				continue
			}
			var oldBatch *recipeImportBatch
			for _, candidate := range batches {
				if candidate.ID == old.BatchID {
					oldBatch = candidate
				}
			}
			if oldBatch == nil {
				return nil, errors.New("staged recipe has no batch")
			}
			left, err := normalizedStagedHash(old.Recipe, oldBatch.Context)
			if err != nil {
				return nil, err
			}
			right, err := normalizedStagedHash(r, b.Context)
			if err != nil {
				return nil, err
			}
			if left != right {
				return nil, &RecipeBundleIdentityConflictError{Kind: "recipe", PortableID: r.PortableID}
			}
			reused = true
			break
		}
		if reused {
			continue
		}
		var mainID string
		err := tx.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND portable_id=$2`, userID, r.PortableID).Scan(&mainID)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		if mainID != "" {
			rm, fm, err := s.importReferenceMapsTx(tx, userID, b.Context)
			if err != nil {
				return nil, err
			}
			if err := validateRecipeReuseTx(tx, userID, mainID, r, rm, fm); err != nil {
				return nil, err
			}
			continue
		}
		row := &stagedImportRecipe{ID: uuid.NewString(), BatchID: b.ID, Recipe: r, CreatedAt: time.Now().UTC()}
		if err := insertStagedRecipeTx(tx, userID, row); err != nil {
			return nil, err
		}
		staged = append(staged, row)
	}
	batches = append(batches, b)
	eval := newImportEvaluator(snapshot, userID, batches, staged)
	missing := false
	for _, r := range b.Context.Recipes {
		result, err := eval.recipeByIdentity(r.PortableID)
		if err != nil {
			return nil, err
		}
		if !result.ready {
			missing = true
		}
	}
	summary := newRecipeBundleImportSummary()
	if !missing {
		b.Accepted = true
		if err := s.saveImportBatchTx(tx, userID, b); err != nil {
			return nil, err
		}
		if err := s.promoteImportsTx(tx, userID, batches, staged, &summary); err != nil {
			return nil, err
		}
	}
	batches, staged, err = snapshot.loadImportState(userID)
	if err != nil {
		return nil, err
	}
	state, err := s.importStateSummaryTx(tx, userID, b, batches, staged)
	if err != nil {
		return nil, err
	}
	summary.PendingImportID = state.PendingImportID
	summary.RequiresDecision = state.RequiresDecision
	summary.Quarantined = state.Quarantined
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &summary, nil
}
func normalizedStagedHash(r BundleRecipe, context RecipeBundle) (string, error) {
	r.Ingredients = append([]BundleIngredient(nil), r.Ingredients...)
	for i := range r.Ingredients {
		src := &r.Ingredients[i].Source
		for _, target := range context.Recipes {
			if src.Type == "recipe" && src.BundleRecipeID == target.BundleRecipeID {
				src.BundleRecipeID = target.PortableID
			}
		}
		for _, target := range context.CustomFoods {
			if src.Type == "custom_food" && src.BundleCustomFoodID == target.BundleCustomFoodID && target.PortableID != "" {
				src.BundleCustomFoodID = target.PortableID
			}
		}
	}
	return portableRecipeContentHash(r)
}
func (s *PostgresStore) importStateSummaryTx(tx *sql.Tx, userID string, current *recipeImportBatch, batches []*recipeImportBatch, recipes []*stagedImportRecipe) (*RecipeBundleImportSummary, error) {
	summary := newRecipeBundleImportSummary()
	if current != nil && !current.Cancelled && !current.Accepted {
		summary.PendingImportID = current.ID
		summary.RequiresDecision = true
	}
	eval := newImportEvaluator(&PostgresStore{db: s.db, readTx: tx}, userID, batches, recipes)
	for _, r := range recipes {
		res, err := eval.recipeByIdentity(r.Recipe.PortableID)
		if err != nil {
			return nil, err
		}
		if !res.ready {
			summary.Quarantined++
		}
	}
	return &summary, nil
}
func (s *PostgresStore) DecideRecipeImport(userID, batchID, action string) (*RecipeBundleImportSummary, error) {
	if action != "keep" && action != "cancel" {
		return nil, errors.New("action must be keep or cancel")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := lockImportOwner(tx, userID); err != nil {
		return nil, err
	}
	snapshot := &PostgresStore{db: s.db, readTx: tx}
	batches, recipes, err := snapshot.loadImportState(userID)
	if err != nil {
		return nil, err
	}
	var current *recipeImportBatch
	for _, b := range batches {
		if b.ID == batchID {
			current = b
		}
	}
	if current == nil {
		var cancelled bool
		err := tx.QueryRow(`SELECT cancelled FROM recipe_import_batches WHERE user_id=$1 AND id=$2`, userID, batchID).Scan(&cancelled)
		if err != nil || !cancelled || action != "cancel" {
			if err != nil && err != sql.ErrNoRows {
				return nil, err
			}
			return nil, ErrImportNotFound
		}
		summary, err := s.importStateSummaryTx(tx, userID, nil, batches, recipes)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return summary, nil
	}
	summary := newRecipeBundleImportSummary()
	if action == "cancel" {
		if current.Accepted {
			return nil, ErrImportAccepted
		}
		current.Cancelled = true
		// A single staged identity can be referenced by several incoming files.
		// Transfer it before deleting this batch's otherwise unreferenced rows.
		if err := s.rehomeSharedImportRowsTx(tx, userID, batches, recipes); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(`DELETE FROM recipe_import_staged WHERE batch_id=$1 AND user_id=$2`, batchID, userID); err != nil {
			return nil, err
		}
	} else {
		current.Accepted = true
	}
	if err := s.saveImportBatchTx(tx, userID, current); err != nil {
		return nil, err
	}
	if action == "keep" {
		if err := s.promoteImportsTx(tx, userID, batches, recipes, &summary); err != nil {
			return nil, err
		}
	}
	batches, recipes, err = snapshot.loadImportState(userID)
	if err != nil {
		return nil, err
	}
	state, err := s.importStateSummaryTx(tx, userID, current, batches, recipes)
	if err != nil {
		return nil, err
	}
	summary.Quarantined = state.Quarantined
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &summary, nil
}

func (s *PostgresStore) importReferenceMapsTx(tx *sql.Tx, userID string, bundle RecipeBundle) (map[string]string, map[string]string, error) {
	recipes, foods := map[string]string{}, map[string]string{}
	for _, r := range bundle.Recipes {
		var id string
		err := tx.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND portable_id=$2`, userID, r.PortableID).Scan(&id)
		if err != nil && err != sql.ErrNoRows {
			return nil, nil, err
		}
		if id != "" {
			recipes[r.BundleRecipeID] = id
			recipes[r.PortableID] = id
		}
	}
	for _, r := range bundle.Recipes {
		for _, ing := range r.Ingredients {
			src := ing.Source
			if src.Type == "recipe" && recipes[src.BundleRecipeID] == "" {
				id, err := authorizedImportRecipeID(tx, userID, src.BundleRecipeID)
				if err != nil {
					return nil, nil, err
				}
				if id != "" {
					recipes[src.BundleRecipeID] = id
				}
			}
			if src.Type == "custom_food" {
				id, _, err := importCustomFood(tx, userID, importCustomFoodIdentity(&recipeImportBatch{Context: bundle}, src.BundleCustomFoodID))
				if err != nil {
					return nil, nil, err
				}
				if id != "" {
					foods[src.BundleCustomFoodID] = id
				}
			}
		}
	}
	return recipes, foods, nil
}

// Package-local keys identify the retained dependency, never an unrelated live
// row that happens to have the same transport key. Legacy dependencies acquire
// their canonical identity when this batch first materializes.
func importCustomFoodIdentity(batch *recipeImportBatch, key string) string {
	if batch != nil {
		for _, food := range batch.Context.CustomFoods {
			if food.BundleCustomFoodID == key && food.PortableID != "" {
				return food.PortableID
			}
		}
	}
	return key
}

func authorizedImportRecipeID(reader postgresReader, userID, key string) (string, error) {
	var id, owner string
	err := reader.QueryRow(`SELECT id,user_id FROM recipes WHERE id=$1 OR (user_id=$2 AND portable_id=$1) ORDER BY CASE WHEN user_id=$2 THEN 0 ELSE 1 END LIMIT 1`, key, userID).Scan(&id, &owner)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if owner != userID {
		return "", ErrExportForbidden
	}
	return id, nil
}
func importCustomFood(reader postgresReader, userID, key string) (string, *BundleCustomFood, error) {
	var id, owner string
	var shared bool
	f := &BundleCustomFood{}
	err := reader.QueryRow(`SELECT id,user_id,shared_with_community,portable_id,name,calories,total_fat,saturated_fat,trans_fat,cholesterol,sodium,total_carbs,dietary_fiber,total_sugars,added_sugars,protein,vitamin_d,calcium,iron,potassium FROM custom_foods WHERE id=$1 OR (portable_id=$1 AND (user_id=$2 OR shared_with_community)) ORDER BY shared_with_community DESC,id LIMIT 1`, key, userID).Scan(&id, &owner, &shared, &f.PortableID, &f.Name, &f.Nutrients.Calories, &f.Nutrients.TotalFat, &f.Nutrients.SaturatedFat, &f.Nutrients.TransFat, &f.Nutrients.Cholesterol, &f.Nutrients.Sodium, &f.Nutrients.TotalCarbs, &f.Nutrients.DietaryFiber, &f.Nutrients.TotalSugars, &f.Nutrients.AddedSugars, &f.Nutrients.Protein, &f.Nutrients.VitaminD, &f.Nutrients.Calcium, &f.Nutrients.Iron, &f.Nutrients.Potassium)
	if err == sql.ErrNoRows {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, err
	}
	if owner != userID && !shared {
		return "", nil, ErrExportForbidden
	}
	// Converting a selected local row to a portable reference must not redirect
	// it to a different accessible copy with conflicting canonical facts.
	rows, err := reader.Query(`SELECT name,calories,total_fat,saturated_fat,trans_fat,cholesterol,sodium,total_carbs,dietary_fiber,total_sugars,added_sugars,protein,vitamin_d,calcium,iron,potassium FROM custom_foods WHERE portable_id=$1 AND (user_id=$2 OR shared_with_community)`, f.PortableID, userID)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var candidate BundleCustomFood
		n := &candidate.Nutrients
		if err := rows.Scan(&candidate.Name, &n.Calories, &n.TotalFat, &n.SaturatedFat, &n.TransFat, &n.Cholesterol, &n.Sodium, &n.TotalCarbs, &n.DietaryFiber, &n.TotalSugars, &n.AddedSugars, &n.Protein, &n.VitaminD, &n.Calcium, &n.Iron, &n.Potassium); err != nil {
			return "", nil, err
		}
		if candidate.Name != f.Name || candidate.Nutrients != f.Nutrients {
			return "", nil, &RecipeBundleIdentityConflictError{Kind: "custom food", PortableID: f.PortableID}
		}
	}
	if err := rows.Err(); err != nil {
		return "", nil, err
	}
	return id, f, nil
}

func addImportSummary(dst *RecipeBundleImportSummary, src *RecipeBundleImportSummary) {
	for k, v := range src.Created {
		dst.Created[k] += v
	}
	for k, v := range src.Reused {
		dst.Reused[k] += v
	}
	for k, v := range src.Updated {
		dst.Updated[k] += v
	}
}

// Rehome only mutable staging ownership; each batch retains its independent
// decision, source snapshot and requested placements. Accepted references take
// precedence so an unrelated pending decision cannot hold their ready recipe.
func (s *PostgresStore) rehomeSharedImportRowsTx(tx *sql.Tx, userID string, batches []*recipeImportBatch, rows []*stagedImportRecipe) error {
	for _, row := range rows {
		var owner, target *recipeImportBatch
		for _, b := range batches {
			if b.ID == row.BatchID {
				owner = b
				if !b.Cancelled {
					target = b
				}
			}
		}
		for _, b := range batches {
			if b.Cancelled || (target != nil && (target.Accepted || !b.Accepted)) {
				continue
			}
			for _, candidate := range b.Context.Recipes {
				if candidate.PortableID == row.Recipe.PortableID {
					target = b
					break
				}
			}
		}
		if target == nil || target == owner {
			continue
		}
		if owner == nil {
			return errors.New("staged recipe has no batch")
		}
		// Preserve the mutable recipe, repairs and group/ingredient IDs. Only
		// transport references change when moving between package namespaces.
		row.Recipe.Ingredients = append([]BundleIngredient(nil), row.Recipe.Ingredients...)
		for i := range row.Recipe.Ingredients {
			src := &row.Recipe.Ingredients[i].Source
			if src.Type == "recipe" {
				for _, dependency := range owner.Context.Recipes {
					if dependency.BundleRecipeID == src.BundleRecipeID {
						src.BundleRecipeID = dependency.PortableID
						break
					}
				}
			}
			if src.Type == "custom_food" {
				for _, dependency := range owner.Context.CustomFoods {
					if dependency.BundleCustomFoodID != src.BundleCustomFoodID && dependency.PortableID != src.BundleCustomFoodID {
						continue
					}
					if dependency.PortableID != "" {
						src.BundleCustomFoodID = dependency.PortableID
					}
					// Pending contexts have not materialized their packaged food.
					// Retain it if the destination uses a different transport key.
					found := false
					for _, existing := range target.Context.CustomFoods {
						if dependency.PortableID != "" && existing.PortableID == dependency.PortableID {
							found = true
						}
						if dependency.PortableID == "" && existing.BundleCustomFoodID == dependency.BundleCustomFoodID && existing.Name == dependency.Name && existing.Nutrients == dependency.Nutrients {
							found = true
						}
					}
					if !found && !owner.Materialized {
						dependency.BundleCustomFoodID = src.BundleCustomFoodID
						// Legacy transport keys are not portable identities.
						if dependency.PortableID == "" {
							dependency.BundleCustomFoodID = "shared-food:" + uuid.NewString()
							src.BundleCustomFoodID = dependency.BundleCustomFoodID
						}
						target.Context.CustomFoods = append(target.Context.CustomFoods, dependency)
					}
					break
				}
			}
		}
		for _, candidate := range target.Context.Recipes {
			if candidate.PortableID == row.Recipe.PortableID {
				row.Recipe.BundleRecipeID = candidate.BundleRecipeID
				break
			}
		}
		row.BatchID = target.ID
		payload, err := json.Marshal(row.Recipe)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE recipe_import_staged SET batch_id=$1,bundle_recipe_id=$2,recipe=$3 WHERE id=$4 AND user_id=$5`, row.BatchID, row.Recipe.BundleRecipeID, string(payload), row.ID, userID); err != nil {
			return err
		}
		if err := s.saveImportBatchTx(tx, userID, target); err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) promoteImportsTx(tx *sql.Tx, userID string, batches []*recipeImportBatch, rows []*stagedImportRecipe, summary *RecipeBundleImportSummary, repaired ...string) error {
	if err := s.rehomeSharedImportRowsTx(tx, userID, batches, rows); err != nil {
		return err
	}
	snapshot := &PostgresStore{db: s.db, readTx: tx}
	eval := newImportEvaluator(snapshot, userID, batches, rows)
	for _, identity := range repaired {
		eval.changed[identity] = true
	}
	// Evaluate first. An operational/private-source failure aborts the entire
	// transaction before accepting even an unrelated ready sibling.
	for _, r := range rows {
		if _, err := eval.recipeByIdentity(r.Recipe.PortableID); err != nil {
			return err
		}
	}
	// Persist refreshed staged parents even when another ingredient still
	// blocks promotion. Only the repaired dependency chain is changed; main
	// recipes and historical logs are never rewritten here.
	for _, row := range rows {
		result := eval.results[row.Recipe.PortableID]
		if recipeHasV4Metadata(result.recipe) {
			if b := eval.batches[row.BatchID]; b != nil {
				b.Context.Version = 4
			}
		}
		if result.changed && !result.ready {
			payload, err := json.Marshal(result.recipe)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(`UPDATE recipe_import_staged SET recipe=$1 WHERE id=$2 AND user_id=$3`, string(payload), row.ID, userID); err != nil {
				return err
			}
			row.Recipe = result.recipe
		}
	}
	// Completed contexts are retry receipts, not a command to replay their
	// original foods/templates on every future import or repair.
	active := map[string]bool{}
	for _, b := range batches {
		if !b.Materialized {
			active[b.ID] = true
		}
		for _, r := range b.Context.Recipes {
			if eval.staged[r.PortableID] != nil {
				active[b.ID] = true
			}
		}
	}
	if err := s.validateDeferredBooksTx(tx, userID, batches); err != nil {
		return err
	}
	// Materialize structure at acceptance, even if all recipes remain blocked.
	for _, b := range batches {
		if b.Accepted && !b.Cancelled && active[b.ID] {
			if err := s.persistImportSliceTx(tx, userID, b, batches, nil, summary); err != nil {
				return err
			}
		}
	}
	for _, r := range eval.order {
		b := eval.batches[r.BatchID]
		if b == nil || !b.Accepted || b.Cancelled {
			continue
		}
		result := eval.results[r.Recipe.PortableID]
		if !result.ready {
			continue
		}
		if err := s.persistImportSliceTx(tx, userID, b, batches, []BundleRecipe{result.recipe}, summary); err != nil {
			return err
		}
		var id string
		if err := tx.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND portable_id=$2`, userID, r.Recipe.PortableID).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM recipe_import_staged WHERE id=$1 AND user_id=$2`, r.ID, userID); err != nil {
			return err
		}
		summary.PromotedRecipeIDs = append(summary.PromotedRecipeIDs, id)
	}
	// A later batch can refer to a staged identity originally owned by an earlier
	// batch. Append its requested joins once that identity has been promoted.
	for _, b := range batches {
		if b.Accepted && !b.Cancelled && active[b.ID] {
			if err := s.persistImportSliceTx(tx, userID, b, batches, nil, summary); err != nil {
				return err
			}
		}
	}
	return nil
}
func (s *PostgresStore) persistImportSliceTx(tx *sql.Tx, userID string, b *recipeImportBatch, batches []*recipeImportBatch, recipes []BundleRecipe, summary *RecipeBundleImportSummary, restoreMissing ...bool) error {
	if !b.Materialized {
		if err := s.initializeBookChoicesTx(tx, userID, b, batches, summary); err != nil {
			return err
		}
	}
	// Restore this batch's mappings before append-only persistence. Main IDs are
	// retained only internally; backup exports them as remappable transport keys.
	for kind, mappings := range b.Placements {
		for key, id := range mappings {
			if err := s.upsertImportMappingTx(tx, userID, kind, key, "", placementTable(kind), id); err != nil {
				return err
			}
		}
	}
	refs, foods, err := s.importReferenceMapsTx(tx, userID, b.Context)
	if err != nil {
		return err
	}
	// Repair payloads can introduce new external identities absent from the
	// original file. Include their references in the seeded persistence maps.
	extra := b.Context
	extra.Recipes = recipes
	rm, fm, err := s.importReferenceMapsTx(tx, userID, extra)
	if err != nil {
		return err
	}
	for k, v := range rm {
		refs[k] = v
	}
	for k, v := range fm {
		foods[k] = v
	}
	slice := effectiveBookContext(b)
	if b.Materialized && (len(restoreMissing) == 0 || !restoreMissing[0]) {
		slice, err = liveImportBookContextTx(tx, userID, b)
		if err != nil {
			return err
		}
		// Append joins for newly promoted identities only. Retained context
		// must not undo a user's removal of an already-published placement.
		joins := slice.ChapterRecipes
		slice.ChapterRecipes = nil
		for _, join := range joins {
			include := containsString(summary.PromotedRecipeIDs, refs[join.BundleRecipeID])
			for _, recipe := range recipes {
				include = include || recipe.BundleRecipeID == join.BundleRecipeID
			}
			if include {
				slice.ChapterRecipes = append(slice.ChapterRecipes, join)
			}
		}
	}
	slice.PendingImports = nil
	slice.Recipes = recipes
	if b.Materialized {
		// Context is a source snapshot, not permission to replay dependencies.
		// Live authorized food mappings above preserve owner edits and deletion;
		// existing structure is appended without recreating old template data.
		slice.CustomFoods = nil
		slice.FoodItems = nil
		slice.Templates = nil
		slice.Categories = nil
		if len(restoreMissing) > 0 && restoreMissing[0] {
			// Reuse live template IDs for restored chapters, without replaying
			// template contents or resurrecting a deleted dependency.
			for _, template := range b.Context.Templates {
				var exists bool
				if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM templates WHERE id=$1 AND user_id=$2)`, b.Placements["template"][template.BundleTemplateID], userID).Scan(&exists); err != nil {
					return err
				}
				if exists {
					slice.Templates = append(slice.Templates, template)
				}
			}
		}
	}
	result, err := s.importRecipeBundleTx(tx, userID, slice, refs, foods, true)
	if err != nil {
		return err
	}
	addImportSummary(summary, result)
	if !b.Materialized {
		for i := range b.Context.CustomFoods {
			food := &b.Context.CustomFoods[i]
			if food.PortableID != "" {
				continue
			}
			id := foods[food.BundleCustomFoodID]
			if id != "" {
				if err := tx.QueryRow(`SELECT portable_id FROM custom_foods WHERE id=$1 AND (user_id=$2 OR shared_with_community)`, id, userID).Scan(&food.PortableID); err != nil {
					return err
				}
			}
		}
	}
	if b.Placements == nil {
		b.Placements = importPlacements{}
	}
	for kind, keys := range placementKeys(effectiveBookContext(b)) {
		if b.Placements[kind] == nil {
			b.Placements[kind] = map[string]string{}
		}
		for _, key := range keys {
			id, found, err := s.lookupImportMappingTx(tx, userID, kind, key)
			if err != nil {
				return err
			}
			if found {
				b.Placements[kind][key] = id
			}
		}
	}
	b.Materialized = true
	return s.saveImportBatchTx(tx, userID, b)
}
func placementTable(kind string) string {
	switch kind {
	case "book":
		return "recipe_books"
	case "chapter":
		return "chapters"
	case "book_page":
		return "book_pages"
	case "chapter_page":
		return "chapter_pages"
	case "template":
		return "templates"
	}
	return ""
}
func placementKeys(bundle RecipeBundle) map[string][]string {
	out := map[string][]string{}
	for _, v := range bundle.Books {
		out["book"] = append(out["book"], v.BundleBookID)
	}
	for _, v := range bundle.Chapters {
		out["chapter"] = append(out["chapter"], v.BundleChapterID)
	}
	for _, v := range bundle.BookPages {
		out["book_page"] = append(out["book_page"], v.BundleBookPageID)
	}
	for _, v := range bundle.ChapterPages {
		out["chapter_page"] = append(out["chapter_page"], v.BundleChapterPageID)
	}
	for _, v := range bundle.Templates {
		out["template"] = append(out["template"], v.BundleTemplateID)
	}
	return out
}

func (s *PostgresStore) ListQuarantinedRecipes(userID string) ([]QuarantinedRecipe, error) {
	// A single snapshot prevents a promotion racing this read from making a row
	// vanish between context and payload reads.
	tx, err := s.db.BeginTx(context.Background(), &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	snapshot := &PostgresStore{db: s.db, readTx: tx}
	batches, rows, err := snapshot.loadImportState(userID)
	if err != nil {
		return nil, err
	}
	eval := newImportEvaluator(snapshot, userID, batches, rows)
	out := []QuarantinedRecipe{}
	owned := map[string]bool{}
	for _, row := range rows {
		owned[row.BatchID] = true
		b := eval.batches[row.BatchID]
		if b == nil {
			return nil, errors.New("staged recipe batch is missing")
		}
		result, err := eval.recipeByIdentity(row.Recipe.PortableID)
		if err != nil {
			return nil, err
		}
		recipe := stagedRecipeModel(userID, row)
		titles := []string{}
		seen := map[string]bool{}
		// Include placements from batches reusing this staged identity as well.
		for _, placementBatch := range batches {
			placementContext := effectiveBookContext(placementBatch)
			for _, candidate := range placementContext.Recipes {
				if candidate.PortableID != row.Recipe.PortableID {
					continue
				}
				for _, join := range placementContext.ChapterRecipes {
					if join.BundleRecipeID != candidate.BundleRecipeID {
						continue
					}
					for _, chapter := range placementContext.Chapters {
						if chapter.BundleChapterID != join.BundleChapterID {
							continue
						}
						for _, book := range placementContext.Books {
							if book.BundleBookID == chapter.BundleBookID && !seen[book.Title] {
								titles = append(titles, book.Title)
								seen[book.Title] = true
							}
						}
					}
				}
			}
		}
		sort.Strings(titles)
		out = append(out, QuarantinedRecipe{ID: row.ID, BatchID: row.BatchID, RequiresDecision: !b.Accepted, Recipe: recipe, UnresolvedIngredients: result.blockers, BookTitles: titles})
	}
	for _, b := range batches {
		if b.Accepted || b.Cancelled || owned[b.ID] {
			continue
		}
		id := "pending-import:" + b.ID
		name := "Pending import"
		if len(b.Context.Recipes) > 0 {
			name = b.Context.Recipes[0].Name
		}
		// A decision-only row comes solely from staging context, even when all
		// this file's identities have already been promoted by another file.
		out = append(out, QuarantinedRecipe{ID: id, BatchID: b.ID, RequiresDecision: true, Recipe: Recipe{ID: id, UserID: userID, Name: name, Ingredients: []Ingredient{}}, UnresolvedIngredients: []ImportIngredientBlocker{}, BookTitles: []string{}})
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return out, nil
}
func stagedRecipeModel(userID string, row *stagedImportRecipe) Recipe {
	r := row.Recipe
	groups, _ := json.Marshal(bundleGroupsToIngredientGroups(r.IngredientGroups))
	recipe := Recipe{Description: r.Description, CustomNutrition: r.CustomNutrition, ID: row.ID, PortableID: r.PortableID, UserID: userID, Name: r.Name, Servings: r.Servings, ServingName: emptyDefault(r.ServingName, "serving"), PrepTime: r.PrepTime, CookTime: r.CookTime, Instructions: r.Instructions, LeftoverStorage: r.LeftoverStorage, IngredientGroupsJSON: string(groups), CreatedAt: row.CreatedAt, UpdatedAt: row.CreatedAt, Ingredients: []Ingredient{}}
	for pos, ing := range orderedBundleIngredients(r.Ingredients) {
		n := ing.Nutrients
		i := Ingredient{MissingNutrients: ing.MissingNutrients, ID: ing.BundleIngredientID, RecipeID: row.ID, Name: ing.Name, Amount: ing.Amount, Unit: ing.Unit, Description: ing.Description, GroupID: ing.BundleGroupID, SourceType: ing.Source.Type, PrepInstructions: ing.PrepInstructions, StorageLocation: ing.StorageLocation, Position: pos, ZeroNutritionOverride: ing.ZeroNutritionOverride, UnconfirmedNutrition: ing.SuppliedNutrition, Calories: n.Calories, TotalFat: n.TotalFat, SaturatedFat: n.SaturatedFat, TransFat: n.TransFat, Cholesterol: n.Cholesterol, Sodium: n.Sodium, TotalCarbs: n.TotalCarbs, DietaryFiber: n.DietaryFiber, TotalSugars: n.TotalSugars, AddedSugars: n.AddedSugars, Protein: n.Protein, VitaminD: n.VitaminD, Calcium: n.Calcium, Iron: n.Iron, Potassium: n.Potassium}
		if ing.ZeroNutritionOverride {
			i.FdcID = -3
		} else {
			src := ing.Source
			i.UnresolvedSource = &src
		}
		recipe.Ingredients = append(recipe.Ingredients, i)
	}
	return recipe
}
