package main

import (
	"database/sql"
	"errors"
)

// Package array order is not a parent-before-child guarantee. Resolve parents
// before inserting children so imports cannot silently flatten category trees.
func (s *PostgresStore) importBundleCategoriesTx(tx *sql.Tx, userID string, categories []BundleCategory, mapped map[string]string) error {
	if len(categories) > 0 {
		if _, err := tx.Exec(`SELECT pg_advisory_xact_lock(74192341)`); err != nil {
			return err
		}
	}
	pending := categories
	for len(pending) > 0 {
		next := make([]BundleCategory, 0, len(pending))
		for _, c := range pending {
			var parentID *string
			if c.ParentBundleCategoryID != nil {
				parent := mapped[*c.ParentBundleCategoryID]
				if parent == "" {
					next = append(next, c)
					continue
				}
				parentID = &parent
			}
			id, err := s.findOrCreateCategoryTx(tx, userID, c.Name, parentID)
			if err != nil {
				return err
			}
			mapped[c.BundleCategoryID] = id
		}
		if len(next) == len(pending) {
			return errors.New("category dependency cycle or missing parent")
		}
		pending = next
	}
	return nil
}
