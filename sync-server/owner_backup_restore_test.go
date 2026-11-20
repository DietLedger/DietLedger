package main

import (
	"database/sql"
	"encoding/json"
	"net/url"
	"os"
	"reflect"
	"sort"
	"testing"

	"github.com/google/uuid"
)

// This journey uses an independently migrated database, not another owner in
// the source database. TEST_DATABASE_URL must point only at disposable PostgreSQL.
func ownerBackupRestoreStore(t *testing.T, source *PostgresStore) *PostgresStore {
	t.Helper()
	name := "backup_restore_" + uuid.NewString()[:8]
	if _, err := source.db.Exec(`CREATE DATABASE ` + name); err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		if _, err := source.db.Exec(`DROP DATABASE ` + name); err != nil {
			t.Errorf("remove disposable restore database: %v", err)
		}
	})
	if err := RunMigrations(db, migrationFS, "migrations"); err != nil {
		t.Fatal(err)
	}
	target := &PostgresStore{db: db}
	if err := target.SeedCategories(); err != nil {
		t.Fatal(err)
	}
	return target
}

// Canonicalize only installation-local transport keys and top-level set order.
// Every content field, ingredient order, group, position and source identity is
// compared. Recipe/custom-food portable identities are deliberately NOT erased.
func ownerBackupSemanticContent(t *testing.T, b *RecipeBundle, ids map[string]string) interface{} {
	t.Helper()
	raw, err := json.Marshal(b)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	delete(out, "exportedAt")
	var normalize func(interface{}) interface{}
	normalize = func(v interface{}) interface{} {
		switch x := v.(type) {
		case map[string]interface{}:
			for _, key := range []string{"sourceRecipeId", "sourceCustomFoodId", "sourceFoodItemId", "sourceBookId", "sourceChapterId", "sourceChapterPageId", "sourceBookPageId", "sourceCategoryId", "sourceTemplateId", "sourceIngredientId", "bundleIngredientId"} {
				delete(x, key)
			}
			for k, value := range x {
				x[k] = normalize(value)
			}
		case []interface{}:
			for i, value := range x {
				x[i] = normalize(value)
			}
		case string:
			if stable, ok := ids[x]; ok {
				return stable
			}
		}
		return v
	}
	normalize(out)
	for _, value := range out {
		if rows, ok := value.([]interface{}); ok {
			sort.Slice(rows, func(i, j int) bool {
				a, _ := json.Marshal(rows[i])
				c, _ := json.Marshal(rows[j])
				return string(a) < string(c)
			})
		}
	}
	return out
}

// Resolve target local keys through persisted import mappings. Category imports
// currently reuse full name/ancestry paths; assert those paths are bijective too.
func ownerBackupRestoredKeys(t *testing.T, target *PostgresStore, owner string, original, restored *RecipeBundle) map[string]string {
	t.Helper()
	ids := map[string]string{}
	rows, err := target.db.Query(`SELECT target_id, source_object_key FROM import_object_mappings WHERE user_id=$1 AND source_object_type IN ('book','chapter','book_page','chapter_page','template')`, owner)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	seen := map[string]string{}
	for rows.Next() {
		var local, source string
		if err := rows.Scan(&local, &source); err != nil {
			t.Fatal(err)
		}
		if previous, ok := ids[local]; ok && previous != source {
			t.Fatalf("distinct source objects merged into %s", local)
		}
		if previous, ok := seen[source]; ok && previous != local {
			t.Fatalf("source object %s duplicated", source)
		}
		ids[local], seen[source] = source, local
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	paths := func(categories []BundleCategory) map[string]string {
		byID := map[string]BundleCategory{}
		for _, c := range categories {
			byID[c.BundleCategoryID] = c
		}
		out := map[string]string{}
		var path func(string, map[string]bool) string
		path = func(id string, active map[string]bool) string {
			if active[id] {
				t.Fatal("cyclic category in successful backup")
			}
			c, ok := byID[id]
			if !ok {
				t.Fatalf("missing category %s", id)
			}
			active[id] = true
			parent := ""
			if c.ParentBundleCategoryID != nil {
				parent = path(*c.ParentBundleCategoryID, active)
			}
			delete(active, id)
			encoded, _ := json.Marshal([]string{parent, c.Name})
			return string(encoded)
		}
		for _, c := range categories {
			p := path(c.BundleCategoryID, map[string]bool{})
			if _, ok := out[p]; ok {
				t.Fatal("duplicate category path in successful backup")
			}
			out[p] = c.BundleCategoryID
		}
		return out
	}
	originalPaths := paths(original.Categories)
	for path, local := range paths(restored.Categories) {
		source, ok := originalPaths[path]
		if !ok {
			t.Fatalf("restored category path not in original: %s", path)
		}
		ids[local] = source
	}
	return ids
}

func TestOwnerBackupRestoreAcrossDatabases(t *testing.T) {
	f := newExportBookFixture(t)
	zero := true
	group := "sauce"
	food, err := f.s.CreateCustomFood(f.user.ID, &CreateCustomFoodRequest{Name: "Private sauce", Calories: 123, Sodium: 45})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.db.Exec(`INSERT INTO food_items (fdc_id, description, data_type, calories) VALUES (989898, 'USDA fixture', 'Foundation', 50)`); err != nil {
		t.Fatal(err)
	}
	missing := "dietledger:recipe:" + uuid.NewString()
	facts := &UnconfirmedIngredientNutrition{Basis: "perServing", Unit: "bowl", ServingGramWeight: floatPointer(42), Provenance: "original label", Nutrients: BundleNutrients{Calories: 91, Protein: 3, Sodium: 12}}
	detailed, err := f.s.CreateRecipe(f.user.ID, &CreateRecipeRequest{
		Name: "Detailed standalone", Servings: 3, ServingName: "bowl", PrepTime: strPtr("10 minutes"), CookTime: strPtr("20 minutes"), Instructions: strPtr(`{"steps":["Mix","Cook"]}`), LeftoverStorage: strPtr("Refrigerate for 2 days"), IngredientGroups: `[{"id":"sauce","title":"Sauce"}]`,
		Ingredients: []CreateIngredientReq{
			{Name: "Zero choice", FdcID: -3, SourceType: "manual", ZeroNutritionOverride: &zero, Amount: 1, Unit: "pinch", GroupID: &group, PrepInstructions: []string{"crush", "stir"}, StorageLocation: "pantry", Description: "fresh"},
			{Name: "Unresolved recipe", SourceType: "recipe", UnresolvedSource: &BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: missing}, Amount: 2, Unit: "bowl", GroupID: &group, UnconfirmedNutrition: facts, Calories: 182, Protein: 6},
			{Name: "Sauce", SourceType: "custom_food", SourceKey: &food.ID, Amount: 100, Unit: "g", Calories: 123},
			{Name: "USDA", SourceType: "usda", FdcID: 989898, Amount: 50, Unit: "g", Calories: 25},
			{Name: "Unresolved food", SourceType: "custom_food", UnresolvedSource: &BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: "dietledger:food:" + uuid.NewString()}, Amount: 20, Unit: "g", UnconfirmedNutrition: &UnconfirmedIngredientNutrition{Basis: "per100g", Unit: "g", Provenance: "source facts", Nutrients: BundleNutrients{Iron: 2}}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = exportTestRecipe(t, f.s, f.user.ID, "Empty standalone")
	// Same-name objects with distinct relationships must not be made equal by
	// the comparison. Local keys are mapped bijectively, never replaced by names.
	secondBook, err := f.s.CreateBook(f.user.ID, &CreateBookRequest{Title: f.book.Title, Description: f.book.Description})
	if err != nil {
		t.Fatal(err)
	}
	secondTemplate, err := f.s.CreateTemplate(f.user.ID, &CreateTemplateRequest{Name: f.template.Name, Type: "recipe", Layout: `{"blocks":[],"second":true}`})
	if err != nil {
		t.Fatal(err)
	}
	secondChapter, err := f.s.CreateChapter(secondBook.ID, &CreateChapterRequest{Title: f.chapter.Title, Position: 5, RecipeTemplateID: &secondTemplate.ID})
	if err != nil {
		t.Fatal(err)
	}
	emptyBookRecipe := exportTestRecipe(t, f.s, f.user.ID, "Empty book recipe")
	if _, err := f.s.AddChapterRecipe(secondChapter.ID, emptyBookRecipe.ID, 7); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.CreateChapterPage(secondChapter.ID, "Chapter page", "Distinct same-name chapter prose", 6); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.CreateBookPage(secondBook.ID, "Preface", "Distinct same-name book prose", 0); err != nil {
		t.Fatal(err)
	}
	secondParent, err := f.s.CreateCategory(&CreateCategoryRequest{Name: "Other parent"})
	if err != nil {
		t.Fatal(err)
	}
	secondChild, err := f.s.CreateCategory(&CreateCategoryRequest{Name: f.childCategory.Name, ParentID: &secondParent.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.AddRecipeCategory(detailed.ID, secondChild.ID); err != nil {
		t.Fatal(err)
	}
	cycle := exportTestRecipe(t, f.s, f.user.ID, "Cycle", CreateIngredientReq{Name: "Book recipe", Amount: 1, Unit: "recipe", SourceType: "recipe", SourceKey: &f.recipe.ID})
	if _, err := f.s.CreateIngredient(f.recipe.ID, &CreateIngredientReq{Name: "Cycle", Amount: 1, Unit: "recipe", SourceType: "recipe", SourceKey: &cycle.ID}); err != nil {
		t.Fatal(err)
	}
	foreign := createUser(t, f.s, "backup-authorized-dependency")
	sharedFood, err := f.s.CreateCustomFood(foreign.ID, &CreateCustomFoodRequest{Name: "Shared dependency food", Calories: 77})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.db.Exec(`UPDATE custom_foods SET shared_with_community=true WHERE id=$1`, sharedFood.ID); err != nil {
		t.Fatal(err)
	}
	leaf := exportTestRecipe(t, f.s, foreign.ID, "Public leaf", CreateIngredientReq{Name: "Shared food", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &sharedFood.ID, Calories: 77})
	middle := exportTestRecipe(t, f.s, foreign.ID, "Public middle", CreateIngredientReq{Name: "Leaf", Amount: 1, Unit: "recipe", SourceType: "recipe", SourceKey: &leaf.ID})
	for _, r := range []*Recipe{leaf, middle} {
		if _, err := f.s.CreateSharedRecipe(foreign.ID, r.ID, r.Name, "", "", "", "{}", "public"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.s.CreateIngredient(detailed.ID, &CreateIngredientReq{Name: "Recursive public dependency", Amount: 1, Unit: "recipe", SourceType: "recipe", SourceKey: &middle.ID}); err != nil {
		t.Fatal(err)
	}
	bundle, err := f.s.ExportOwnerRecipeBookBackup(f.user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Recipes) != 7 || len(bundle.CustomFoods) != 2 || len(bundle.Books) != 2 || len(bundle.Templates) != 2 {
		t.Fatalf("unexpected fixture closure: %d recipes, %d custom foods", len(bundle.Recipes), len(bundle.CustomFoods))
	}
	// Exercise the downloadable JSON boundary before restoring.
	raw, err := json.Marshal(bundle)
	if err != nil {
		t.Fatal(err)
	}
	var downloaded RecipeBundle
	if err := json.Unmarshal(raw, &downloaded); err != nil {
		t.Fatal(err)
	}
	target := ownerBackupRestoreStore(t, f.s)
	recipient := createUser(t, target, "backup-restored")
	// Different local integer IDs must not alter the canonical USDA source.
	if _, err := target.db.Exec(`INSERT INTO food_items (fdc_id, description, data_type, calories) VALUES (111111, 'Unrelated target food', 'Foundation', 1)`); err != nil {
		t.Fatal(err)
	}
	// This equality test assumes the recipient has trusted canonical sources.
	// Bundle facts themselves must not provision the shared food database.
	if _, err := target.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories) VALUES(987654,'USDA staple','Foundation',50),(989898,'USDA fixture','Foundation',50)`); err != nil {
		t.Fatal(err)
	}
	if _, err := target.ImportRecipeBundle(recipient.ID, downloaded); err != nil {
		t.Fatal(err)
	}
	restored, err := target.ExportOwnerRecipeBookBackup(recipient.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := ownerBackupSemanticContent(t, restored, ownerBackupRestoredKeys(t, target, recipient.ID, bundle, restored)), ownerBackupSemanticContent(t, bundle, nil); !reflect.DeepEqual(got, want) {
		g, _ := json.MarshalIndent(got, "", "  ")
		w, _ := json.MarshalIndent(want, "", "  ")
		t.Fatalf("restored content differs\nGOT %s\nWANT %s", g, w)
	}
	for _, r := range restored.Recipes {
		for _, old := range bundle.Recipes {
			if r.PortableID == old.PortableID && r.SourceRecipeID == old.SourceRecipeID {
				t.Fatalf("local recipe ID was not remapped: %s", r.SourceRecipeID)
			}
		}
	}
	for _, food := range restored.CustomFoods {
		for _, old := range bundle.CustomFoods {
			if food.PortableID == old.PortableID && food.SourceCustomFoodID == old.SourceCustomFoodID {
				t.Fatal("local custom food ID was not remapped")
			}
		}
	}
	if restored.FoodItems[0].SourceFoodItemID == bundle.FoodItems[0].SourceFoodItemID {
		t.Fatal("USDA local row ID was not remapped")
	}
	if _, err := target.ImportRecipeBundle(recipient.ID, *restored); err != nil {
		t.Fatalf("restored backup cannot be reimported unchanged: %v", err)
	}
}
