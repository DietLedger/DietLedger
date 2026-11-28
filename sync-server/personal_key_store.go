package main

import (
	"database/sql"
	"errors"
)

var errPersonalForeignDependency = errors.New("record has a dependency owned by another account")

func (s *PostgresStore) deletePersonalRecipe(owner, id string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockImportOwner(tx, owner); err != nil {
		return err
	}
	if err = tx.QueryRow(`SELECT id FROM recipes WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, owner).Scan(&id); err != nil {
		return err
	}
	var hasForeign bool
	// A book join has an ON DELETE CASCADE. The recipe row lock excludes new
	// FK references until commit. Plans have no FK, so cleanup is owner-scoped.
	if err = tx.QueryRow(`SELECT EXISTS (SELECT 1 FROM chapter_recipes cr JOIN chapters c ON c.id=cr.chapter_id
  JOIN recipe_books b ON b.id=c.book_id WHERE cr.recipe_id=$1 AND b.user_id IS DISTINCT FROM $2)`, id, owner).Scan(&hasForeign); err != nil {
		return err
	}
	if hasForeign {
		return errPersonalForeignDependency
	}
	if _, err = tx.Exec(`DELETE FROM day_plan_entries e USING meal_plans p WHERE p.id=e.meal_plan_id AND e.recipe_id=$1 AND p.user_id=$2`, id, owner); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM recipes WHERE id=$1 AND user_id=$2`, id, owner); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *PostgresStore) deletePersonalCustomFood(owner, id string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockImportOwner(tx, owner); err != nil {
		return err
	}
	if err = tx.QueryRow(`SELECT id FROM custom_foods WHERE id=$1 AND user_id=$2 FOR UPDATE`, id, owner).Scan(&id); err != nil {
		return err
	}
	var hasForeign bool
	if err = tx.QueryRow(`SELECT EXISTS (SELECT 1 FROM food_storage_defaults WHERE custom_food_id=$1 AND user_id<>$2)`, id, owner).Scan(&hasForeign); err != nil {
		return err
	}
	if hasForeign {
		return errPersonalForeignDependency
	}
	if _, err = tx.Exec(`DELETE FROM custom_foods WHERE id=$1 AND user_id=$2`, id, owner); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *PostgresStore) personalChapterTemplates(owner string, page, recipe *string) error {
	if !s.personalOnly {
		return nil
	}
	for _, id := range []*string{page, recipe} {
		if id == nil || *id == "" {
			continue
		}
		var canUse bool
		if err := s.reader().QueryRow(`SELECT EXISTS (SELECT 1 FROM templates WHERE id=$1 AND (user_id=$2 OR is_default))`, *id, owner).Scan(&canUse); err != nil {
			return err
		}
		if !canUse {
			return sql.ErrNoRows
		}
	}
	return nil
}
