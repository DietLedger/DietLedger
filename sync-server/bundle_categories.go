package main

import (
	"database/sql"
	"errors"
)

// Package array order is not a parent-before-child guarantee. Resolve parents
// before inserting children so imports cannot silently flatten category trees.
func (s *PostgresStore) importBundleCategoriesTx(tx *sql.Tx, categories []BundleCategory, mapped map[string]string) error {
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
			id, err := s.findOrCreateCategoryTx(tx, c.Name, parentID)
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
