package main

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

func finalFixStage(t *testing.T, env *testEnv, b RecipeBundle) *RecipeBundleImportSummary {
	t.Helper()
	result, err := env.store.(*PostgresStore).StageRecipeBundle(env.userID, b)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
func finalFixDecision(t *testing.T, env *testEnv, batch, action string) {
	t.Helper()
	if _, err := env.store.(*PostgresStore).DecideRecipeImport(env.userID, batch, action); err != nil {
		t.Fatal(err)
	}
}
func finalFixZero(t *testing.T, env *testEnv, row, ingredient string) {
	t.Helper()
	zero := true
	if _, err := env.store.(*PostgresStore).ResolveQuarantinedIngredient(env.userID, row, ingredient, CreateIngredientReq{Name: "Blocker", Amount: 1, Unit: "g", FdcID: -3, SourceType: "manual", ZeroNutritionOverride: &zero}); err != nil {
		t.Fatal(err)
	}
}

func TestFinalStagingPartialDependencyEdits(t *testing.T) {
	for _, portable := range []bool{true, false} {
		t.Run(map[bool]string{true: "portable", false: "legacy"}[portable], func(t *testing.T) {
			env := newTestEnv(t)
			s := env.store.(*PostgresStore)
			b := quarantineBundle("partial dependency edits", false)
			food := BundleCustomFood{BundleCustomFoodID: "packaged-food", Name: "Original food", Nutrients: BundleNutrients{Calories: 100}}
			if portable {
				food.PortableID = "dietledger:food:" + uuid.NewString()
			}
			b.CustomFoods = []BundleCustomFood{food}
			b.FoodItems = []BundleFoodItem{{FdcID: 76234, Description: "Portioned", DataType: "Foundation", Nutrients: BundleNutrients{Calories: 100}, Portions: []FoodPortion{{Amount: 1, MeasureUnit: "piece", GramWeight: 42}}}}
			b.Templates = []BundleTemplate{{BundleTemplateID: "template", Name: "Original template", Type: "recipe", Layout: json.RawMessage(`{}`)}}
			template := "template"
			b.Books = []BundleBook{{BundleBookID: "book", Title: "Partial book"}}
			b.Chapters = []BundleChapter{{BundleChapterID: "chapter", BundleBookID: "book", Title: "Chapter", BundleRecipeTemplateID: &template}}
			b.ChapterRecipes = []BundleChapterRecipe{{BundleChapterID: "chapter", BundleRecipeID: b.Recipes[0].BundleRecipeID}}
			b.Recipes[0].Ingredients = append(b.Recipes[0].Ingredients,
				BundleIngredient{BundleIngredientID: "food", Name: "Custom", Amount: 100, Unit: "g", Source: BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: "packaged-food"}, Nutrients: BundleNutrients{Calories: 37}},
				BundleIngredient{BundleIngredientID: "usda", Name: "USDA", Amount: 2, Unit: "piece", Source: BundleIngredientSourceRef{Type: "usda", FdcID: 76234}, Nutrients: BundleNutrients{Calories: 84}})
			staged := finalFixStage(t, env, b)
			finalFixDecision(t, env, staged.PendingImportID, "keep")
			if _, err := s.db.Exec(`UPDATE custom_foods SET name='Edited food',calories=200; UPDATE templates SET name='Edited template',layout_json='{"edited":true}'; UPDATE food_items SET portions='[{"amount":1,"measureUnit":"piece","gramWeight":50}]' WHERE fdc_id=76234`); err != nil {
				t.Fatal(err)
			}
			rows := quarantineRows(t, env)
			finalFixZero(t, env, rows[0]["id"].(string), "ingredient")
			if quarantineMainCount(t, env) != 1 || len(quarantineRows(t, env)) != 0 {
				t.Fatal("partial batch did not promote")
			}
			var calories, snapshots float64
			var templateName string
			var chapters, joins int
			if err := s.db.QueryRow(`SELECT calories FROM custom_foods WHERE user_id=$1`, env.userID).Scan(&calories); err != nil {
				t.Fatal(err)
			}
			if err := s.db.QueryRow(`SELECT sum(i.calories) FROM ingredients i JOIN recipes r ON r.id=i.recipe_id WHERE r.user_id=$1`, env.userID).Scan(&snapshots); err != nil {
				t.Fatal(err)
			}
			if err := s.db.QueryRow(`SELECT name FROM templates WHERE user_id=$1`, env.userID).Scan(&templateName); err != nil {
				t.Fatal(err)
			}
			if err := s.db.QueryRow(`SELECT count(*) FROM chapters`).Scan(&chapters); err != nil {
				t.Fatal(err)
			}
			if err := s.db.QueryRow(`SELECT count(*) FROM chapter_recipes`).Scan(&joins); err != nil {
				t.Fatal(err)
			}
			live, err := s.GetFoodByFdcID(76234)
			if err != nil {
				t.Fatal(err)
			}
			if calories != 200 || snapshots != 121 || templateName != "Edited template" || len(live.Portions) != 1 || live.Portions[0].GramWeight != 50 || chapters != 1 || joins != 1 {
				t.Fatalf("replayed dependencies or snapshots: food=%g snapshots=%g template=%s portions=%v chapters=%d joins=%d", calories, snapshots, templateName, live.Portions, chapters, joins)
			}
		})
	}
}

func TestFinalStagingDeletedMaterializedFoodStaysMissing(t *testing.T) {
	for _, custom := range []bool{true, false} {
		t.Run(map[bool]string{true: "custom", false: "usda"}[custom], func(t *testing.T) {
			env := newTestEnv(t)
			s := env.store.(*PostgresStore)
			b := quarantineBundle("deleted dependency", false)
			linked := BundleIngredient{BundleIngredientID: "linked", Name: "Linked", Amount: 100, Unit: "g", Nutrients: BundleNutrients{Calories: 37}}
			if custom {
				b.CustomFoods = []BundleCustomFood{{BundleCustomFoodID: "food", PortableID: "dietledger:food:" + uuid.NewString(), Name: "Food", Nutrients: BundleNutrients{Calories: 100}}}
				linked.Source = BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: "food"}
			} else {
				b.FoodItems = []BundleFoodItem{{FdcID: 76234, Description: "Food", DataType: "Foundation", Nutrients: BundleNutrients{Calories: 100}}}
				linked.Source = BundleIngredientSourceRef{Type: "usda", FdcID: 76234}
			}
			b.Recipes[0].Ingredients = append(b.Recipes[0].Ingredients, linked)
			summary := finalFixStage(t, env, b)
			finalFixDecision(t, env, summary.PendingImportID, "keep")
			table := "food_items"
			if custom {
				table = "custom_foods"
			}
			if _, err := s.db.Exec(`DELETE FROM ` + table); err != nil {
				t.Fatal(err)
			}
			finalFixZero(t, env, quarantineRows(t, env)[0]["id"].(string), "ingredient")
			var count int
			if err := s.db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 0 || quarantineMainCount(t, env) != 0 || len(quarantineRows(t, env)) != 1 {
				t.Fatal("materialized context resurrected deleted canonical dependency")
			}
		})
	}
}

func TestFinalStagingSharedIdentityCancellation(t *testing.T) {
	for _, scenario := range []string{"keep_b_cancel_a", "keep_a_cancel_b", "pending_b_cancel_a"} {
		t.Run(scenario, func(t *testing.T) {
			env := newTestEnv(t)
			s := env.store.(*PostgresStore)
			a := quarantineBundle("shared recipe", false)
			a.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
			a.Recipes[0].IngredientGroups = []BundleIngredientGroup{{BundleGroupID: "old-group", Title: "Retained group"}}
			a.Recipes[0].Ingredients[0].BundleGroupID = strPtr("old-group")
			first := finalFixStage(t, env, a)
			var b RecipeBundle
			encoded, err := json.Marshal(a)
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(encoded, &b); err != nil {
				t.Fatal(err)
			}
			b.Source.Version = "different incoming batch"
			b.Recipes[0].BundleRecipeID = "new-transport-key"
			b.Recipes[0].IngredientGroups[0].BundleGroupID = "new-group"
			b.Recipes[0].Ingredients[0].BundleGroupID = strPtr("new-group")
			b.Recipes[0].Ingredients[0].BundleIngredientID = "new-ingredient"
			second := finalFixStage(t, env, b)
			if scenario == "keep_b_cancel_a" {
				finalFixDecision(t, env, second.PendingImportID, "keep")
				finalFixDecision(t, env, first.PendingImportID, "cancel")
			} else if scenario == "keep_a_cancel_b" {
				finalFixDecision(t, env, first.PendingImportID, "keep")
				finalFixDecision(t, env, second.PendingImportID, "cancel")
			} else {
				finalFixDecision(t, env, first.PendingImportID, "cancel")
			}
			rows, err := s.ListQuarantinedRecipes(env.userID)
			if err != nil || len(rows) != 1 {
				t.Fatalf("cancellation lost another batch's shared recipe: rows=%+v err=%v", rows, err)
			}
			if rows[0].RequiresDecision != (scenario == "pending_b_cancel_a") {
				t.Fatalf("silently accepted another batch: %+v", rows)
			}
			if rows[0].Recipe.Ingredients[0].GroupID == nil || *rows[0].Recipe.Ingredients[0].GroupID != "old-group" {
				t.Fatal("shared row lost group metadata")
			}
			backup, err := s.ExportOwnerRecipeBookBackup(env.userID)
			if err != nil || backup.PendingImports == nil || len(backup.PendingImports.Recipes) != 1 {
				t.Fatalf("backup lost adopted row: %v %+v", err, backup)
			}
			if err := ValidateRecipeBundle(*backup); err != nil {
				t.Fatalf("adopted transport keys cannot restore: %v", err)
			}
		})
	}
}

func TestFinalStagingSharedPendingDecisionResumes(t *testing.T) {
	env := newTestEnv(t)
	a := quarantineBundle("shared pending", false)
	a.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
	first := finalFixStage(t, env, a)
	b := a
	b.Source.Version = "second batch"
	second := finalFixStage(t, env, b)
	rows := quarantineRows(t, env)
	decisions := map[string]bool{}
	for _, row := range rows {
		if row["requiresDecision"] == true {
			decisions[row["batchId"].(string)] = true
		}
	}
	if !decisions[first.PendingImportID] || !decisions[second.PendingImportID] {
		t.Fatalf("refresh lost rowless pending batch decision: %v", rows)
	}
	found := false
	for _, row := range rows {
		if row["id"] == "pending-import:"+second.PendingImportID {
			found = true
			if row["recipe"].(map[string]interface{})["name"] != "shared pending" {
				t.Fatal("placeholder ignored staging context")
			}
		}
	}
	if !found {
		t.Fatal("missing decision-only placeholder")
	}
}

func TestFinalStagingAcceptedReferencePromotesReadySharedRow(t *testing.T) {
	env := newTestEnv(t)
	s := env.store.(*PostgresStore)
	a := quarantineBundle("shared ready", false)
	a.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
	a.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "usda", FdcID: 99887}
	a.Recipes[0].Ingredients[0].Nutrients.Calories = 37
	first := finalFixStage(t, env, a)
	if _, err := s.db.Exec(`INSERT INTO food_items(fdc_id,description,data_type,calories) VALUES(99887,'Newly available','Foundation',100)`); err != nil {
		t.Fatal(err)
	}
	b := a
	b.Source.Version = "accept second only"
	blocker := quarantineBundle("B blocker", false).Recipes[0]
	blocker.PortableID = "dietledger:recipe:" + uuid.NewString()
	b.Recipes = append([]BundleRecipe{a.Recipes[0]}, blocker)
	second := finalFixStage(t, env, b)
	finalFixDecision(t, env, second.PendingImportID, "keep")
	if quarantineMainCount(t, env) != 1 {
		t.Fatal("accepted batch waited for pending owner of ready shared recipe")
	}
	rows := quarantineRows(t, env)
	found := false
	for _, row := range rows {
		if row["batchId"] == first.PendingImportID && row["requiresDecision"] == true {
			found = true
		}
	}
	if !found {
		t.Fatal("promoting shared recipe silently accepted/lost original pending decision")
	}
	finalFixDecision(t, env, first.PendingImportID, "cancel")
	if quarantineMainCount(t, env) != 1 {
		t.Fatal("cancel removed accepted main recipe")
	}
}

func TestFinalStagingRehomePreservesSourcesAndRepairs(t *testing.T) {
	for _, portable := range []bool{true, false} {
		t.Run(map[bool]string{true: "portable", false: "legacy"}[portable], func(t *testing.T) {
			env := newTestEnv(t)
			s := env.store.(*PostgresStore)
			a := quarantineBundle("shared dependencies", false)
			a.Recipes[0].PortableID = "dietledger:recipe:" + uuid.NewString()
			food := BundleCustomFood{BundleCustomFoodID: "old-food-key", Name: "Packaged", Nutrients: BundleNutrients{Calories: 100}}
			if portable {
				food.PortableID = "dietledger:food:" + uuid.NewString()
			}
			a.CustomFoods = []BundleCustomFood{food}
			a.Recipes[0].Ingredients = append(a.Recipes[0].Ingredients,
				BundleIngredient{BundleIngredientID: "second-blocker", Name: "Second", Source: BundleIngredientSourceRef{Type: "manual"}},
				BundleIngredient{BundleIngredientID: "food", Name: "Food", Amount: 100, Unit: "g", Source: BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: food.BundleCustomFoodID}, Nutrients: BundleNutrients{Calories: 37}})
			first := finalFixStage(t, env, a)
			var b RecipeBundle
			raw, _ := json.Marshal(a)
			if err := json.Unmarshal(raw, &b); err != nil {
				t.Fatal(err)
			}
			b.Source.Version = "new incoming"
			b.Recipes[0].BundleRecipeID = "new-recipe-key"
			if portable {
				b.CustomFoods[0].BundleCustomFoodID = "new-food-key"
				b.Recipes[0].Ingredients[2].Source.BundleCustomFoodID = "new-food-key"
			}
			second := finalFixStage(t, env, b)
			finalFixDecision(t, env, second.PendingImportID, "keep")
			rows, err := s.ListQuarantinedRecipes(env.userID)
			if err != nil {
				t.Fatal(err)
			}
			var row QuarantinedRecipe
			for _, candidate := range rows {
				if !candidate.RequiresDecision {
					row = candidate
				}
			}
			finalFixZero(t, env, row.ID, "ingredient")
			finalFixDecision(t, env, first.PendingImportID, "cancel")
			rows, err = s.ListQuarantinedRecipes(env.userID)
			if err != nil || len(rows) != 1 || !rows[0].Recipe.Ingredients[0].ZeroNutritionOverride {
				t.Fatalf("cancel lost existing repair: %v %+v", err, rows)
			}
			finalFixZero(t, env, rows[0].ID, "second-blocker")
			var foods int
			var calories float64
			if err := s.db.QueryRow(`SELECT count(*) FROM custom_foods`).Scan(&foods); err != nil {
				t.Fatal(err)
			}
			if err := s.db.QueryRow(`SELECT sum(calories) FROM ingredients`).Scan(&calories); err != nil {
				t.Fatal(err)
			}
			if foods != 1 || calories != 37 || quarantineMainCount(t, env) != 1 {
				t.Fatalf("rehome duplicated dependencies or changed snapshots: foods=%d calories=%g", foods, calories)
			}
		})
	}
}
