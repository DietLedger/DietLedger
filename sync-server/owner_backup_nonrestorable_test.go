package main

import (
	"github.com/google/uuid"
	"testing"
)

func TestOwnerBackupRejectsNonRestorableCategories(t *testing.T) {
	for _, kind := range []string{"self cycle", "two-node cycle", "duplicate roots", "duplicate siblings"} {
		t.Run(kind, func(t *testing.T) {
			f := newExportBookFixture(t)
			switch kind {
			case "self cycle":
				if _, err := f.s.db.Exec(`UPDATE categories SET parent_id=id WHERE id=$1`, f.parentCategory.ID); err != nil {
					t.Fatal(err)
				}
			case "two-node cycle":
				if _, err := f.s.db.Exec(`UPDATE categories SET parent_id=$1 WHERE id=$2`, f.childCategory.ID, f.parentCategory.ID); err != nil {
					t.Fatal(err)
				}
			default:
				original := f.parentCategory
				var parent *string
				if kind == "duplicate siblings" {
					original = f.childCategory
					parent = &f.parentCategory.ID
				}
				duplicate, err := f.s.CreateCategory(&CreateCategoryRequest{Name: original.Name, ParentID: parent})
				if err != nil {
					t.Fatal(err)
				}
				if _, err := f.s.AddRecipeCategory(f.recipe.ID, duplicate.ID); err != nil {
					t.Fatal(err)
				}
			}
			if bundle, err := f.s.ExportOwnerRecipeBookBackup(f.user.ID); err == nil || bundle != nil {
				t.Fatalf("%s returned successful non-restorable backup: bundle=%+v err=%v", kind, bundle, err)
			}
		})
	}
}

func TestOwnerBackupRejectsConflictingAuthorizedFoodCopies(t *testing.T) {
	for _, conflict := range []string{"name", "nutrients"} {
		t.Run(conflict, func(t *testing.T) {
			s := testStore(t).(*PostgresStore)
			owner := createUser(t, s, "food-copy-owner")
			other := createUser(t, s, "food-copy-other")
			food, err := s.CreateCustomFood(owner.ID, &CreateCustomFoodRequest{Name: "Sauce", Calories: 100})
			if err != nil {
				t.Fatal(err)
			}
			id := uuid.NewString()
			name, calories := "Sauce", 100
			if conflict == "name" {
				name = "Changed sauce"
			} else {
				calories = 101
			}
			if _, err := s.db.Exec(`INSERT INTO custom_foods (id,user_id,name,calories,portable_id,shared_with_community) VALUES ($1,$2,$3,$4,$5,true)`, id, other.ID, name, calories, food.PortableID); err != nil {
				t.Fatal(err)
			}
			_ = exportTestRecipe(t, s, owner.ID, "Food copies", CreateIngredientReq{Name: "Owned food", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &food.ID}, CreateIngredientReq{Name: "Authorized shared copy", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &id})
			if bundle, err := s.ExportOwnerRecipeBookBackup(owner.ID); err == nil || bundle != nil {
				t.Fatalf("conflicting %s canonical facts silently deduplicated: bundle=%+v err=%v", conflict, bundle, err)
			}
		})
	}
}

func TestOwnerBackupRejectsMalformedPreparationInstructions(t *testing.T) {
	for _, invalid := range []string{`{`, `["chop",5]`} {
		t.Run(invalid, func(t *testing.T) {
			s := testStore(t).(*PostgresStore)
			owner := createUser(t, s, "malformed-preparation")
			r := exportTestRecipe(t, s, owner.ID, "Preparation", CreateIngredientReq{Name: "Herbs", Amount: 1, Unit: "g", PrepInstructions: []string{"chop"}})
			if _, err := s.db.Exec(`UPDATE ingredients SET prep_instructions=$1 WHERE recipe_id=$2`, invalid, r.ID); err != nil {
				t.Fatal(err)
			}
			if bundle, err := s.ExportOwnerRecipeBookBackup(owner.ID); err == nil || bundle != nil {
				t.Fatalf("malformed preparation was silently normalized: bundle=%+v err=%v", bundle, err)
			}
		})
	}
}
