package main

import (
	"sync"
	"testing"

	"github.com/google/uuid"
)

func TestRecipeBundlePortableIdentityAcrossThreeLibraries(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	a := createUser(t, s, "transfer-a")
	b := createUser(t, s, "transfer-b")
	c := createUser(t, s, "transfer-c")
	food, err := s.CreateCustomFood(a.ID, &CreateCustomFoodRequest{Name: "House sauce", Calories: 120})
	if err != nil {
		t.Fatal(err)
	}
	child, err := s.CreateRecipe(a.ID, &CreateRecipeRequest{Name: "Sauce", Servings: 1, Ingredients: []CreateIngredientReq{{Name: "Sauce food", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &food.ID, Calories: 120}}})
	if err != nil {
		t.Fatal(err)
	}
	parent, err := s.CreateRecipe(a.ID, &CreateRecipeRequest{Name: "Dinner", Servings: 1, Ingredients: []CreateIngredientReq{{Name: "Sauce", Amount: 2, Unit: "× recipe", SourceType: "recipe", SourceKey: &child.ID, LinkedRecipeID: &child.ID, Calories: 240}}})
	if err != nil {
		t.Fatal(err)
	}
	originalRecipeIdentity := portableIdentity(t, parent, "dietledger:recipe:")
	originalFoodIdentity := portableIdentity(t, food, "dietledger:food:")
	bundle, err := s.ExportRecipeBundle(a.ID, []string{parent.ID}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Version != 2 {
		t.Fatalf("export version=%d, want 2", bundle.Version)
	}
	if len(bundle.Recipes) != 2 || len(bundle.CustomFoods) != 1 {
		t.Fatalf("incomplete dependency closure: recipes=%d customFoods=%d", len(bundle.Recipes), len(bundle.CustomFoods))
	}
	if _, err := s.ImportRecipeBundle(b.ID, *bundle); err != nil {
		t.Fatal(err)
	}
	var bID string
	if err := s.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND name='Dinner'`, b.ID).Scan(&bID); err != nil {
		t.Fatal(err)
	}
	if bID == parent.ID {
		t.Fatal("import reused installation-local recipe key")
	}
	second, err := s.ExportRecipeBundle(b.ID, []string{bID}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportRecipeBundle(c.ID, *second); err != nil {
		t.Fatal(err)
	}
	var cID string
	if err := s.db.QueryRow(`SELECT id FROM recipes WHERE user_id=$1 AND name='Dinner'`, c.ID).Scan(&cID); err != nil {
		t.Fatal(err)
	}
	final, err := s.GetRecipe(c.ID, cID)
	if err != nil {
		t.Fatal(err)
	}
	if got := portableIdentity(t, final, "dietledger:recipe:"); got != originalRecipeIdentity {
		t.Fatalf("portable recipe changed: %s != %s", got, originalRecipeIdentity)
	}
	var foodIdentity string
	if err := s.db.QueryRow(`SELECT portable_id FROM custom_foods WHERE user_id=$1`, c.ID).Scan(&foodIdentity); err != nil {
		t.Fatal(err)
	}
	if foodIdentity != originalFoodIdentity {
		t.Fatal("portable food identity changed")
	}
	if len(final.Ingredients) != 1 || final.Ingredients[0].LinkedRecipeID == nil {
		t.Fatal("parent lost linked recipe")
	}
	linked, err := s.GetRecipe(c.ID, *final.Ingredients[0].LinkedRecipeID)
	if err != nil || linked == nil {
		t.Fatalf("broken linked recipe: %v", err)
	}
	if len(linked.Ingredients) != 1 || linked.Ingredients[0].SourceKey == nil {
		t.Fatal("child lost custom food reference")
	}
	if _, err := s.GetCustomFood(c.ID, *linked.Ingredients[0].SourceKey); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportRecipeBundle(c.ID, *second); err != nil {
		t.Fatalf("unchanged repeat: %v", err)
	}
	recipes, total, err := s.ListRecipes(c.ID, 1, 20)
	if err != nil || total != 2 {
		t.Fatalf("repeat duplicated recipes: %d %v", total, err)
	}
	_ = recipes
}

func TestRecipeBundleDistinctPortableIdentitiesDoNotContentMerge(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	a := createUser(t, s, "distinct-a")
	b := createUser(t, s, "distinct-b")
	for i := 0; i < 2; i++ {
		f, err := s.CreateCustomFood(a.ID, &CreateCustomFoodRequest{Name: "Identical food", Calories: 10})
		if err != nil {
			t.Fatal(err)
		}
		r, err := s.CreateRecipe(a.ID, &CreateRecipeRequest{Name: "Identical recipe", Servings: 1, Ingredients: []CreateIngredientReq{{Name: "Food", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &f.ID, Calories: 10}}})
		if err != nil {
			t.Fatal(err)
		}
		bundle, err := s.ExportRecipeBundle(a.ID, []string{r.ID}, nil)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.ImportRecipeBundle(b.ID, *bundle); err != nil {
			t.Fatal(err)
		}
	}
	var recipes, foods int
	if err := s.db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, b.ID).Scan(&recipes); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRow(`SELECT count(*) FROM custom_foods WHERE user_id=$1`, b.ID).Scan(&foods); err != nil {
		t.Fatal(err)
	}
	if recipes != 2 || foods != 2 {
		t.Fatalf("different portable IDs merged or skipped: recipes=%d foods=%d", recipes, foods)
	}
}

func TestRecipeBundleIdentityConflictPreservesLocalRepairsAtomically(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	a := createUser(t, s, "conflict-a")
	b := createUser(t, s, "conflict-b")
	r, err := s.CreateRecipe(a.ID, &CreateRecipeRequest{Name: "Original", Servings: 1})
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := s.ExportRecipeBundle(a.ID, []string{r.ID}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportRecipeBundle(b.ID, *bundle); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE recipes SET name='Local repair' WHERE user_id=$1`, b.ID); err != nil {
		t.Fatal(err)
	}
	bundle.FoodItems = append(bundle.FoodItems, BundleFoodItem{FdcID: 999999, Description: "Must roll back", DataType: "Foundation"})
	if _, err := s.ImportRecipeBundle(b.ID, *bundle); err == nil {
		t.Fatal("identity conflict silently overwrote local repair")
	}
	var name string
	if err := s.db.QueryRow(`SELECT name FROM recipes WHERE user_id=$1`, b.ID).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Local repair" {
		t.Fatal("repair was overwritten")
	}
	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM food_items WHERE fdc_id=999999`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("conflicted import partially committed")
	}
}

func TestRecipeBundleMissingPortableIDCannotOverwriteLocalRepairs(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	a := createUser(t, s, "strip-a")
	b := createUser(t, s, "strip-b")
	r, err := s.CreateRecipe(a.ID, &CreateRecipeRequest{Name: "Original", Servings: 1})
	if err != nil {
		t.Fatal(err)
	}
	bundle, err := s.ExportRecipeBundle(a.ID, []string{r.ID}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportRecipeBundle(b.ID, *bundle); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE recipes SET name='Local repair' WHERE user_id=$1`, b.ID); err != nil {
		t.Fatal(err)
	}
	bundle.Recipes[0].PortableID = ""
	if _, err := s.ImportRecipeBundle(b.ID, *bundle); err == nil {
		t.Fatal("omitting portableId bypassed conflict protection")
	}
	var name string
	if err := s.db.QueryRow(`SELECT name FROM recipes WHERE user_id=$1`, b.ID).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Local repair" {
		t.Fatal("local repair overwritten")
	}
}

func TestRecipeBundleMixedLegacyDependencyIDsRepeatSafely(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "mixed-identities")
	bundle := RecipeBundle{Format: RecipeBundleFormat, Version: 2, CustomFoods: []BundleCustomFood{{BundleCustomFoodID: "legacy-food", Name: "Food", Nutrients: testNutrients(100)}}, Recipes: []BundleRecipe{
		{BundleRecipeID: "parent", PortableID: "dietledger:recipe:" + uuid.NewString(), Name: "Parent", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "p", Name: "Child", Amount: 1, Unit: "× recipe", Source: BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "legacy-child"}, Nutrients: testNutrients(100)}}},
		{BundleRecipeID: "legacy-child", Name: "Child", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "c", Name: "Food", Amount: 100, Unit: "g", Source: BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: "legacy-food"}, Nutrients: testNutrients(100)}}},
	}}
	if _, err := s.ImportRecipeBundle(u.ID, bundle); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportRecipeBundle(u.ID, bundle); err != nil {
		t.Fatalf("unchanged mixed identity repeat conflicted: %v", err)
	}
}

func TestRecipeBundleSharedPortableFoodReuseAndConflict(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	owner := createUser(t, s, "shared-origin")
	recipient := createUser(t, s, "shared-recipient")
	food, err := s.CreateCustomFood(owner.ID, &CreateCustomFoodRequest{Name: "Shared food", Calories: 100})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ShareCustomFood(owner.ID, food.ID); err != nil {
		t.Fatal(err)
	}
	bundle := RecipeBundle{Format: RecipeBundleFormat, Version: 2, CustomFoods: []BundleCustomFood{{BundleCustomFoodID: "food", PortableID: food.PortableID, Name: food.Name, Nutrients: BundleNutrients{Calories: 100}}}, Recipes: []BundleRecipe{{BundleRecipeID: "recipe", PortableID: "dietledger:recipe:" + uuid.NewString(), Name: "Uses shared food", Servings: 1, Ingredients: []BundleIngredient{{BundleIngredientID: "ingredient", Name: "Shared food", Amount: 100, Unit: "g", Source: BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: "food"}, Nutrients: BundleNutrients{Calories: 100}}}}}}
	if _, err := s.ImportRecipeBundle(recipient.ID, bundle); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportRecipeBundle(recipient.ID, bundle); err != nil {
		t.Fatalf("shared-food link repeat: %v", err)
	}
	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM custom_foods WHERE portable_id=$1`, food.PortableID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("accessible shared identity was copied into a private shadow")
	}
	bundle.CustomFoods[0].Nutrients.Calories = 200
	if _, err := s.ImportRecipeBundle(recipient.ID, bundle); err == nil {
		t.Fatal("different content silently shadowed shared identity")
	}
}

func TestRecipeBundleConcurrentIdenticalPortableImport(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "concurrent-import")
	// Widen the absent-row insertion race without relying on network timing.
	if _, err := s.db.Exec(`CREATE FUNCTION slow_bundle_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.05); RETURN NEW; END $$; CREATE TRIGGER slow_bundle_insert BEFORE INSERT ON recipes FOR EACH ROW EXECUTE FUNCTION slow_bundle_insert()`); err != nil {
		t.Fatal(err)
	}
	bundle := RecipeBundle{Format: RecipeBundleFormat, Version: 2, Recipes: []BundleRecipe{{BundleRecipeID: "one", PortableID: "dietledger:recipe:" + uuid.NewString(), Name: "Concurrent", Servings: 1}}}
	start := make(chan struct{})
	results := make(chan error, 8)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; _, err := s.ImportRecipeBundle(u.ID, bundle); results <- err }()
	}
	close(start)
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatalf("identical concurrent retry failed: %v", err)
		}
	}
	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM recipes WHERE user_id=$1`, u.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("concurrent import created %d recipes", count)
	}
}
