package main

import "testing"

func testRecipeBundleForStaleMapping() RecipeBundle {
	return RecipeBundle{
		Format: RecipeBundleFormat, Version: RecipeBundleVersion,
		Recipes: []BundleRecipe{{
			BundleRecipeID: "seed:bread", Name: "Seed bread", Servings: 1, ServingName: "serving",
			Ingredients: []BundleIngredient{{
				BundleIngredientID: "seed:flour", Name: "Flour", Amount: 100, Unit: "g",
				Source: BundleIngredientSourceRef{Type: "manual"},
			}},
		}},
	}
}

func TestImportRecipeBundleAfterDeletingPreviouslyImportedRecipe(t *testing.T) {
	for _, lookup := range []string{"origin", "hash"} {
		t.Run(lookup, func(t *testing.T) {
			store := testStore(t).(*PostgresStore)
			user := createUser(t, store, "bundle-delete")
			bundle := testRecipeBundleForStaleMapping()

			if _, err := store.ImportRecipeBundle(user.ID, bundle); err != nil {
				t.Fatalf("first import: %v", err)
			}
			var firstID string
			if err := store.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND name=$2`, user.ID, "Seed bread").Scan(&firstID); err != nil {
				t.Fatal(err)
			}
			if err := store.DeleteRecipe(user.ID, firstID); err != nil {
				t.Fatal(err)
			}
			if lookup == "hash" {
				if _, err := store.db.Exec(`UPDATE import_object_mappings SET source_object_key='old-key' WHERE user_id=$1 AND source_object_type='recipe'`, user.ID); err != nil {
					t.Fatal(err)
				}
			}

			if _, err := store.ImportRecipeBundle(user.ID, bundle); err != nil {
				t.Fatalf("reimport after delete: %v", err)
			}
			var newID string
			if err := store.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND name=$2`, user.ID, "Seed bread").Scan(&newID); err != nil {
				t.Fatal(err)
			}
			if newID == firstID {
				t.Fatal("deleted recipe ID was reused")
			}
			var count int
			if err := store.db.QueryRow(`SELECT count(*) FROM ingredients WHERE recipe_id=$1`, newID).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 1 {
				t.Fatalf("new recipe has %d ingredients, want 1", count)
			}
			if _, err := store.ImportRecipeBundle(user.ID, bundle); err != nil {
				t.Fatalf("idempotent reimport: %v", err)
			}
			var mappedID string
			if err := store.db.QueryRow(`SELECT target_id FROM import_object_mappings WHERE user_id=$1 AND source_object_type='recipe' AND source_object_key=$2`, user.ID, bundle.Recipes[0].BundleRecipeID).Scan(&mappedID); err != nil {
				t.Fatal(err)
			}
			if mappedID != newID {
				t.Fatalf("reimport mapped to %q, want %q", mappedID, newID)
			}
		})
	}
}

func TestImportRecipeBundleDoesNotReuseAnotherUsersRecipe(t *testing.T) {
	store := testStore(t).(*PostgresStore)
	owner := createUser(t, store, "bundle-owner")
	importer := createUser(t, store, "bundle-importer")
	bundle := testRecipeBundleForStaleMapping()
	if _, err := store.ImportRecipeBundle(owner.ID, bundle); err != nil {
		t.Fatal(err)
	}
	var ownerRecipeID string
	if err := store.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND name=$2`, owner.ID, "Seed bread").Scan(&ownerRecipeID); err != nil {
		t.Fatal(err)
	}
	hash, err := RecipeBundleContentHash("recipe", bundle.Recipes[0])
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.db.Exec(`INSERT INTO import_object_mappings (id,user_id,source_format,source_object_type,source_object_key,content_hash,target_table,target_id) VALUES ('stale-cross-user',$1,$2,'recipe',$3,$4,'recipes',$5)`, importer.ID, RecipeBundleFormat, bundle.Recipes[0].BundleRecipeID, hash, ownerRecipeID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.ImportRecipeBundle(importer.ID, bundle); err != nil {
		t.Fatalf("import with cross-user mapping: %v", err)
	}
	var importedID string
	if err := store.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND name=$2`, importer.ID, "Seed bread").Scan(&importedID); err != nil {
		t.Fatal(err)
	}
	if importedID == ownerRecipeID {
		t.Fatal("reused another user's recipe")
	}
}
