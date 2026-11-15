package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
)

func (s *PostgresStore) backupPendingImports(userID string, bundle *RecipeBundle) error {
	batches, rows, err := s.loadImportState(userID)
	if err != nil {
		return fmt.Errorf("read pending imports for owner backup: %w", err)
	}
	hasPending := len(rows) > 0
	for _, batch := range batches {
		hasPending = hasPending || !batch.Accepted
	}
	if !hasPending {
		return nil
	}
	// V3 restores only verified main content. Do not emit a successful backup
	// that the public restore boundary would reject; existing drafts stay put.
	evaluator := newImportEvaluator(s, userID, batches, rows)
	for _, recipe := range bundle.Recipes {
		result, err := evaluator.recipeByIdentity(recipe.PortableID)
		if err != nil {
			return err
		}
		if !result.ready {
			return errors.New("owner backup cannot restore incomplete main recipes alongside pending imports")
		}
	}
	pending := &PendingRecipeImports{Version: 1, Batches: []recipeImportBatch{}, Recipes: []stagedImportRecipe{}}
	identities := map[string]bool{}
	for _, r := range rows {
		identities[r.Recipe.PortableID] = true
	}
	for _, b := range batches {
		include := !b.Accepted
		for _, r := range b.Context.Recipes {
			if identities[r.PortableID] {
				include = true
			}
		}
		if !include {
			continue
		}
		if b.Placements == nil {
			b.Placements = importPlacements{}
		}
		// An unaccepted file may reuse existing book structure without owning
		// staged rows yet. Retain those authorized aliases as transport keys so
		// Keep after restore does not create a second book/chapter.
		for kind, keys := range placementKeys(b.Context) {
			for _, key := range keys {
				if b.Placements[kind][key] != "" {
					continue
				}
				var target string
				err := s.reader().QueryRow(`SELECT target_id FROM import_object_mappings WHERE user_id=$1 AND source_format=$2 AND source_object_type=$3 AND source_object_key=$4`, userID, RecipeBundleFormat, kind, key).Scan(&target)
				if err != nil && err != sql.ErrNoRows {
					return err
				}
				if err == nil && backupHasPlacement(*bundle, kind, target) {
					if b.Placements[kind] == nil {
						b.Placements[kind] = map[string]string{}
					}
					b.Placements[kind][key] = target
				}
			}
		}
		// Canonicalize references to existing main records to portable identities.
		// Context-local source keys remain intact and are remapped through their
		// retained portable recipe/custom-food records on restore.
		for i := range b.Context.Recipes {
			if err := s.backupStagedSources(userID, &b.Context.Recipes[i], &b.Context); err != nil {
				return err
			}
			if err := s.addStagedCanonicalSources(userID, b.Context.Recipes[i], b.Context, bundle); err != nil {
				return err
			}
		}
		for _, row := range rows {
			if row.BatchID == b.ID {
				copy := *row
				if err := s.backupStagedSources(userID, &copy.Recipe, &b.Context); err != nil {
					return err
				}
				if err := s.addStagedCanonicalSources(userID, copy.Recipe, b.Context, bundle); err != nil {
					return err
				}
				pending.Recipes = append(pending.Recipes, copy)
			}
		}
		// Every materialized placement must be represented in the main snapshot;
		// otherwise restore could create an unrelated book or silently lose a join.
		for kind, mappings := range b.Placements {
			for _, id := range mappings {
				if !backupHasPlacement(*bundle, kind, id) {
					return fmt.Errorf("pending import %s placement %s %s is absent from owner backup", b.ID, kind, id)
				}
			}
		}
		pending.Batches = append(pending.Batches, *b)
	}
	if len(pending.Recipes) != len(rows) {
		return errors.New("owner backup omitted staged recipe batch context")
	}
	bundle.Version = 3
	bundle.PendingImports = pending
	return nil
}

// Current canonical dependencies belong in the native closure, not only in a
// retained source context. Restore installs them once; later repairs must not
// replay old package food facts over canonical edits or resurrect deleted rows.
func (s *PostgresStore) addStagedCanonicalSources(userID string, recipe BundleRecipe, context RecipeBundle, bundle *RecipeBundle) error {
	for _, ingredient := range recipe.Ingredients {
		source := ingredient.Source
		switch source.Type {
		case "usda":
			if err := s.addFoodItemToBundle(source.FdcID, bundle); err != nil {
				return err
			}
		case "custom_food":
			key := source.BundleCustomFoodID
			for _, food := range context.CustomFoods {
				if (food.BundleCustomFoodID == key || food.PortableID == key) && food.PortableID != "" {
					key = food.PortableID
					break
				}
			}
			id, food, err := importCustomFood(s.reader(), userID, key)
			if err != nil {
				return err
			}
			if food != nil {
				if _, err := s.addReferencedCustomFoodToBundle(&User{ID: userID}, userID, id, bundle); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func backupHasPlacement(bundle RecipeBundle, kind, id string) bool {
	switch kind {
	case "book":
		for _, v := range bundle.Books {
			if v.BundleBookID == id {
				return true
			}
		}
	case "chapter":
		for _, v := range bundle.Chapters {
			if v.BundleChapterID == id {
				return true
			}
		}
	case "book_page":
		for _, v := range bundle.BookPages {
			if v.BundleBookPageID == id {
				return true
			}
		}
	case "chapter_page":
		for _, v := range bundle.ChapterPages {
			if v.BundleChapterPageID == id {
				return true
			}
		}
	case "template":
		for _, v := range bundle.Templates {
			if v.BundleTemplateID == id {
				return true
			}
		}
	}
	return false
}
func (s *PostgresStore) backupStagedSources(userID string, r *BundleRecipe, context *RecipeBundle) error {
	r.Ingredients = append([]BundleIngredient(nil), r.Ingredients...)
	for i := range r.Ingredients {
		ing := &r.Ingredients[i]
		src := &ing.Source
		switch src.Type {
		case "recipe":
			local := false
			for _, candidate := range context.Recipes {
				if candidate.BundleRecipeID == src.BundleRecipeID || candidate.PortableID == src.BundleRecipeID {
					local = true
					break
				}
			}
			if local {
				continue
			}
			id, err := authorizedImportRecipeID(s.reader(), userID, src.BundleRecipeID)
			if err != nil {
				return err
			}
			if id != "" {
				if err := s.reader().QueryRow(`SELECT portable_id FROM recipes WHERE id=$1 AND user_id=$2`, id, userID).Scan(&src.BundleRecipeID); err != nil {
					return err
				}
			}
		case "custom_food":
			local := false
			for _, candidate := range context.CustomFoods {
				if candidate.BundleCustomFoodID == src.BundleCustomFoodID || candidate.PortableID == src.BundleCustomFoodID {
					local = true
					break
				}
			}
			if local {
				continue
			}
			id, f, err := importCustomFood(s.reader(), userID, src.BundleCustomFoodID)
			if err != nil {
				return err
			}
			if f != nil {
				f.BundleCustomFoodID = f.PortableID
				f.SourceCustomFoodID = id
				context.CustomFoods = append(context.CustomFoods, *f)
				src.BundleCustomFoodID = f.PortableID
			}
		case "usda":
			exists := false
			for _, f := range context.FoodItems {
				if f.FdcID == src.FdcID {
					exists = true
					break
				}
			}
			if exists {
				continue
			}
			f, err := s.GetFoodByFdcID(src.FdcID)
			if err != nil {
				return err
			}
			if f != nil {
				context.FoodItems = append(context.FoodItems, BundleFoodItem{Portions: f.Portions, FdcID: f.FdcID, Description: f.Description, DataType: f.DataType, BrandOwner: f.BrandOwner, GtinUpc: f.GtinUpc, ServingSize: f.ServingSize, ServingSizeUnit: f.ServingSizeUnit, Source: f.Source, Nutrients: nutrientsFromFoodItem(*f)})
			}
		}
	}
	return nil
}
func (s *PostgresStore) restorePendingImportsTx(tx *sql.Tx, userID string, bundle RecipeBundle, recipeMap, foodMap map[string]string) error {
	if bundle.PendingImports == nil {
		return nil
	}
	pending := bundle.PendingImports
	snapshot := &PostgresStore{db: s.db, readTx: tx}
	existingBatches, existing, err := snapshot.loadImportState(userID)
	if err != nil {
		return err
	}
	batchMap := map[string]string{}
	for _, saved := range pending.Batches {
		sourceID := saved.ID
		hash := "restore:" + sourceID
		var id string
		err := tx.QueryRow(`SELECT id FROM recipe_import_batches WHERE user_id=$1 AND request_hash=$2 AND NOT cancelled`, userID, hash).Scan(&id)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if id != "" {
			batchMap[sourceID] = id
			continue
		}
		saved.ID = uuid.NewString()
		saved.Cancelled = false
		for kind, mappings := range saved.Placements {
			for key, transport := range mappings {
				if !backupHasPlacement(bundle, kind, transport) {
					return fmt.Errorf("pending import placement %s is absent from native bundle", transport)
				}
				target, found, err := s.lookupImportMappingTx(tx, userID, kind, transport)
				if err != nil {
					return err
				}
				if !found {
					return fmt.Errorf("pending import placement %s was not restored", transport)
				}
				saved.Placements[kind][key] = target
			}
		}
		context, err := json.Marshal(saved.Context)
		if err != nil {
			return err
		}
		placements, err := json.Marshal(saved.Placements)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO recipe_import_batches(id,user_id,request_hash,accepted,context,placements,materialized) VALUES($1,$2,$3,$4,$5,$6,$7)`, saved.ID, userID, hash, saved.Accepted, string(context), string(placements), saved.Materialized); err != nil {
			return err
		}
		batchMap[sourceID] = saved.ID
		copy := saved
		existingBatches = append(existingBatches, &copy)
	}
	for _, saved := range pending.Recipes {
		var sourceContext RecipeBundle
		for _, b := range pending.Batches {
			if b.ID == saved.BatchID {
				sourceContext = b.Context
			}
		}
		reused := false
		for _, old := range existing {
			if old.Recipe.PortableID != saved.Recipe.PortableID {
				continue
			}
			var targetContext RecipeBundle
			for _, b := range existingBatches {
				if b.ID == old.BatchID {
					targetContext = b.Context
				}
			}
			left, err := normalizedStagedHash(old.Recipe, targetContext)
			if err != nil {
				return err
			}
			right, err := normalizedStagedHash(saved.Recipe, sourceContext)
			if err != nil {
				return err
			}
			if left != right {
				return &RecipeBundleIdentityConflictError{Kind: "recipe", PortableID: saved.Recipe.PortableID}
			}
			reused = true
			break
		}
		if reused {
			continue
		}
		var main bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM recipes WHERE user_id=$1 AND portable_id=$2)`, userID, saved.Recipe.PortableID).Scan(&main); err != nil {
			return err
		}
		if main {
			return &RecipeBundleIdentityConflictError{Kind: "staged recipe", PortableID: saved.Recipe.PortableID}
		}
		saved.ID = uuid.NewString()
		saved.BatchID = batchMap[saved.BatchID]
		if saved.BatchID == "" {
			return errors.New("pending import batch was not restored")
		}
		if err := insertStagedRecipeTx(tx, userID, &saved); err != nil {
			return err
		}
		copy := saved
		existing = append(existing, &copy)
	}
	return nil
}
