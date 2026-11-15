package main

import "fmt"

// Native import reuses categories by (name, parent). Reject source structures
// that would merge distinct nodes or that the parent-first importer cannot save.
// This validates the exported closure only; it does not repair stored categories.
func verifyOwnerBackupCategoryClosure(categories []BundleCategory) error {
	byID := make(map[string]BundleCategory, len(categories))
	type siblingKey struct{ parent, name string }
	siblings := map[siblingKey]bool{}
	for _, c := range categories {
		parent := ""
		if c.ParentBundleCategoryID != nil {
			parent = *c.ParentBundleCategoryID
		}
		key := siblingKey{parent, c.Name}
		if siblings[key] {
			return fmt.Errorf("owner backup contains duplicate sibling categories that native restore would merge")
		}
		siblings[key] = true
		byID[c.BundleCategoryID] = c
	}
	state := map[string]int{}
	var visit func(string) error
	visit = func(id string) error {
		if state[id] == 1 {
			return fmt.Errorf("owner backup contains cyclic category ancestry")
		}
		if state[id] == 2 {
			return nil
		}
		c, ok := byID[id]
		if !ok {
			return fmt.Errorf("owner backup contains missing category ancestry")
		}
		state[id] = 1
		if c.ParentBundleCategoryID != nil {
			if err := visit(*c.ParentBundleCategoryID); err != nil {
				return err
			}
		}
		state[id] = 2
		return nil
	}
	for id := range byID {
		if err := visit(id); err != nil {
			return err
		}
	}
	return nil
}
