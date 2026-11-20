package main

import (
	"github.com/google/uuid"
	"testing"
)

func TestImportStagingRejectsDivergentPortableFoodSelection(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	other := createUser(t, s, "portable-food-shadow")
	food, err := s.CreateCustomFood(env.userID, &CreateCustomFoodRequest{Name: "Selected", Calories: 100})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO custom_foods(id,user_id,portable_id,name,calories,shared_with_community) VALUES($1,$2,$3,'Divergent shared copy',200,true)`, uuid.NewString(), other.ID, food.PortableID); err != nil {
		t.Fatal(err)
	}
	quarantineKeep(t, env, quarantineSummary(t, env, quarantineBundle("ambiguous source", false)))
	id := quarantineRows(t, env)[0]["id"].(string)
	w := env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/ingredient", map[string]interface{}{"name": "Original ingredient", "amount": 50, "unit": "g", "sourceType": "custom_food", "fdcId": -2, "sourceKey": food.ID})
	if w.Code == 200 || quarantineMainCount(t, env) != 0 || len(quarantineRows(t, env)) != 1 {
		t.Fatalf("selected row silently switched to divergent shared copy: %d %s", w.Code, w.Body.String())
	}
}
func TestImportStagingLinkedRepairUsesStoredChildSnapshots(t *testing.T) {
	for _, mainChild := range []bool{false, true} {
		t.Run(map[bool]string{false: "staged_child", true: "main_child"}[mainChild], func(t *testing.T) {
			env := newTestEnv(t)
			s := env.store.(*PostgresStore)
			if _, err := s.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories) VALUES(4567,'Canonical source','Foundation',100)`); err != nil {
				t.Fatal(err)
			}
			child := quarantineBundle("snapshot child", false).Recipes[0]
			child.PortableID = "dietledger:recipe:" + uuid.NewString()
			child.Ingredients[0].Source = BundleIngredientSourceRef{Type: "usda", FdcID: 4567}
			child.Ingredients[0].Nutrients = BundleNutrients{Calories: 37}
			parent := quarantineBundle("snapshot parent", false).Recipes[0]
			parent.Ingredients[0].Source = BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: child.BundleRecipeID}
			parent.Ingredients[0].Amount = 2
			parent.Ingredients[0].Unit = "× recipe"
			parent.Ingredients[0].Nutrients = BundleNutrients{Calories: 74}
			b := RecipeBundle{Format: RecipeBundleFormat, Version: 2}
			if mainChild {
				raw := b
				raw.Recipes = []BundleRecipe{child}
				if _, err := s.ImportRecipeBundle(env.userID, raw); err != nil {
					t.Fatal(err)
				}
				parent.Ingredients[0].Source.BundleRecipeID = child.PortableID
				parent.Ingredients = append(parent.Ingredients, BundleIngredient{BundleIngredientID: "blocker", Name: "Blocker", Source: BundleIngredientSourceRef{Type: "manual"}})
				b.Recipes = []BundleRecipe{parent}
			} else {
				child.Ingredients = append(child.Ingredients, BundleIngredient{BundleIngredientID: "blocker", Name: "Blocker", Source: BundleIngredientSourceRef{Type: "manual"}})
				parent.Ingredients[0].Nutrients.Calories = 999
				b.Recipes = []BundleRecipe{child, parent}
			}
			quarantineKeep(t, env, quarantineSummary(t, env, b))
			rows := quarantineRows(t, env)
			var id string
			name := "snapshot child"
			if mainChild {
				name = "snapshot parent"
			}
			for _, row := range rows {
				if row["recipe"].(map[string]interface{})["name"] == name {
					id = row["id"].(string)
				}
			}
			w := env.doRequest("PUT", "/api/recipe-imports/"+id+"/ingredients/blocker", map[string]interface{}{"name": "Blocker", "amount": 1, "unit": "g", "fdcId": -3, "sourceType": "manual", "zeroNutritionOverride": true})
			if w.Code != 200 {
				t.Fatal(w.Body.String())
			}
			var childCalories, parentCalories float64
			if err := s.db.QueryRow(`SELECT sum(i.calories) FROM ingredients i JOIN recipes r ON r.id=i.recipe_id WHERE r.name='snapshot child'`).Scan(&childCalories); err != nil {
				t.Fatal(err)
			}
			if err := s.db.QueryRow(`SELECT sum(i.calories) FROM ingredients i JOIN recipes r ON r.id=i.recipe_id WHERE r.name='snapshot parent'`).Scan(&parentCalories); err != nil {
				t.Fatal(err)
			}
			if childCalories != 37 || parentCalories != 74 {
				t.Fatalf("linked snapshots differ from stored child: child=%g parent=%g", childCalories, parentCalories)
			}
		})
	}
}
func TestImportStagingBackupRestoresCanonicalPortions(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	if _, err := s.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories,portions) VALUES(9876,'Piece food','Foundation',100,'[{"amount":1,"measureUnit":"piece","gramWeight":42}]')`); err != nil {
		t.Fatal(err)
	}
	b := quarantineBundle("portion restore", false)
	b.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "usda", FdcID: 9876}
	b.Recipes[0].Ingredients[0].Amount = 2
	b.Recipes[0].Ingredients[0].Unit = "piece"
	b.Recipes[0].Ingredients[0].Nutrients.Calories = 84
	b.Recipes[0].Ingredients = append(b.Recipes[0].Ingredients, BundleIngredient{BundleIngredientID: "blocker", Name: "Blocker", Source: BundleIngredientSourceRef{Type: "manual"}})
	quarantineKeep(t, env, quarantineSummary(t, env, b))
	backup, err := s.ExportOwnerRecipeBookBackup(env.userID)
	if err != nil {
		t.Fatal(err)
	}
	target := ownerBackupRestoreStore(t, s)
	owner := createUser(t, target, "portion-staging-restore")
	// Trusted ingestion on the recipient is a prerequisite for canonical
	// rematching. The empty-catalog path is covered by the security offline test.
	if _, err := target.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories,portions) VALUES(9876,'Piece food','Foundation',100,'[{"amount":1,"measureUnit":"piece","gramWeight":42}]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := target.ImportRecipeBundle(owner.ID, *backup); err != nil {
		t.Fatal(err)
	}
	rows, err := target.ListQuarantinedRecipes(owner.ID)
	if err != nil || len(rows) != 1 {
		t.Fatalf("restored queue: %v %v", rows, err)
	}
	zero := true
	if _, err := target.ResolveQuarantinedIngredient(owner.ID, rows[0].ID, "blocker", CreateIngredientReq{Name: "Blocker", Amount: 1, Unit: "g", FdcID: -3, SourceType: "manual", ZeroNutritionOverride: &zero}); err != nil {
		t.Fatal(err)
	}
	food, err := target.GetFoodByFdcID(9876)
	if err != nil {
		t.Fatal(err)
	}
	if food == nil || len(food.Portions) != 1 || food.Portions[0].GramWeight != 42 {
		t.Fatalf("restored canonical source lost portions: %+v", food)
	}
	// Re-enter via another staged draft, selecting the restored canonical food.
	extra := quarantineBundle("restored match", false)
	summary, err := target.StageRecipeBundle(owner.ID, extra)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := target.DecideRecipeImport(owner.ID, summary.PendingImportID, "keep"); err != nil {
		t.Fatal(err)
	}
	rows, err = target.ListQuarantinedRecipes(owner.ID)
	if err != nil || len(rows) != 1 {
		t.Fatal(err)
	}
	key := "9876"
	if _, err := target.ResolveQuarantinedIngredient(owner.ID, rows[0].ID, "ingredient", CreateIngredientReq{Name: "Original ingredient", Amount: 2, Unit: "piece", FdcID: 9876, SourceType: "usda", SourceKey: &key}); err != nil {
		t.Fatal(err)
	}
	var calories float64
	if err := target.db.QueryRow(`SELECT i.calories FROM ingredients i JOIN recipes r ON r.id=i.recipe_id WHERE r.name='restored match'`).Scan(&calories); err != nil {
		t.Fatal(err)
	}
	if calories != 84 {
		t.Fatalf("restored rematch no longer uses42g piece: %g", calories)
	}
}
