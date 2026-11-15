package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestOwnerRecipeBookBackupReturnsValidEmptyBundle(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "owner-backup-empty")
	bundle, err := s.ExportOwnerRecipeBookBackup(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Recipes) != 0 || len(bundle.Books) != 0 {
		t.Fatalf("empty owner backup contains content: recipes=%d books=%d", len(bundle.Recipes), len(bundle.Books))
	}
	if err := ValidateRecipeBundle(*bundle); err != nil {
		t.Fatalf("empty owner backup is invalid: %v", err)
	}
}

func TestOwnerRecipeBookBackupEnumeratesOwnedContentServerSide(t *testing.T) {
	f := newExportBookFixture(t)
	other := createUser(t, f.s, "owner-backup-other")
	_ = exportTestRecipe(t, f.s, other.ID, "Other recipe")
	if _, err := f.s.CreateBook(other.ID, &CreateBookRequest{Title: "Other book"}); err != nil {
		t.Fatal(err)
	}

	missingFood := "dietledger:food:missing-owner-backup"
	groupID := "filling"
	servingWeight := 30.0
	standalone, err := f.s.CreateRecipe(f.user.ID, &CreateRecipeRequest{
		Name:             "Unresolved standalone",
		Servings:         2,
		ServingName:      "serving",
		IngredientGroups: `[{"id":"filling","title":"Filling"}]`,
		Ingredients: []CreateIngredientReq{{
			Name:             "Missing filling",
			Amount:           30,
			Unit:             "g",
			GroupID:          &groupID,
			SourceType:       "custom_food",
			UnresolvedSource: &BundleIngredientSourceRef{Type: "custom_food", BundleCustomFoodID: missingFood},
			UnconfirmedNutrition: &UnconfirmedIngredientNutrition{
				Basis:             "perServing",
				ServingGramWeight: &servingWeight,
				Provenance:        "owner backup fixture",
				Nutrients:         BundleNutrients{Calories: 90, Protein: 3},
			},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	bundle, err := f.s.ExportOwnerRecipeBookBackup(f.user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Recipes) != 2 || len(bundle.Books) != 1 {
		t.Fatalf("backup did not enumerate all and only owned content: recipes=%d books=%d", len(bundle.Recipes), len(bundle.Books))
	}
	if len(bundle.Chapters) != 1 || len(bundle.ChapterRecipes) != 1 || len(bundle.BookPages) != 1 || len(bundle.ChapterPages) != 1 || len(bundle.Templates) != 1 {
		t.Fatalf("book structure missing from backup: chapters=%d joins=%d bookPages=%d chapterPages=%d templates=%d", len(bundle.Chapters), len(bundle.ChapterRecipes), len(bundle.BookPages), len(bundle.ChapterPages), len(bundle.Templates))
	}
	if len(bundle.Categories) != 2 || len(bundle.RecipeCategories) != 1 {
		t.Fatalf("category hierarchy missing from backup: categories=%d joins=%d", len(bundle.Categories), len(bundle.RecipeCategories))
	}

	exported := exportTestRecipeBySource(t, bundle, standalone.ID)
	if len(exported.IngredientGroups) != 1 || exported.IngredientGroups[0].BundleGroupID != "filling" || len(exported.Ingredients) != 1 {
		t.Fatalf("ingredient groups or ingredients missing: %+v", exported)
	}
	ing := exported.Ingredients[0]
	if ing.Position == nil || *ing.Position != 0 || ing.Source.Type != "custom_food" || ing.Source.BundleCustomFoodID != missingFood {
		t.Fatalf("ingredient order or unresolved identity missing: %+v", ing)
	}
	if ing.SuppliedNutrition == nil || ing.SuppliedNutrition.Basis != "perServing" || ing.SuppliedNutrition.ServingGramWeight == nil || *ing.SuppliedNutrition.ServingGramWeight != servingWeight || ing.SuppliedNutrition.Nutrients.Calories != 90 {
		t.Fatalf("supplied facts missing from backup: %+v", ing.SuppliedNutrition)
	}
	if err := ValidateRecipeBundle(*bundle); err != nil {
		t.Fatalf("owner backup is not a valid native bundle: %v", err)
	}
}

func TestOwnerRecipeBookBackupRejectsInaccessibleDependenciesWithoutLeakingContent(t *testing.T) {
	t.Run("linked recipe", func(t *testing.T) {
		s := testStore(t).(*PostgresStore)
		owner := createUser(t, s, "owner-backup-recipe")
		other := createUser(t, s, "owner-backup-foreign-recipe")
		foreign := exportTestRecipe(t, s, other.ID, "Foreign private recipe")
		_ = exportTestRecipe(t, s, owner.ID, "Owned root", CreateIngredientReq{Name: "Foreign recipe snapshot", Amount: 1, Unit: "recipe", SourceType: "recipe", SourceKey: &foreign.ID, LinkedRecipeID: &foreign.ID, Calories: 25})
		if bundle, err := s.ExportOwnerRecipeBookBackup(owner.ID); !errors.Is(err, ErrExportForbidden) || bundle != nil {
			t.Fatalf("foreign private recipe content was not rejected: bundle=%+v err=%v", bundle, err)
		}
	})

	t.Run("custom food", func(t *testing.T) {
		s := testStore(t).(*PostgresStore)
		owner := createUser(t, s, "owner-backup-food")
		other := createUser(t, s, "owner-backup-foreign-food")
		foreign, err := s.CreateCustomFood(other.ID, &CreateCustomFoodRequest{Name: "Foreign private food", Calories: 75})
		if err != nil {
			t.Fatal(err)
		}
		_ = exportTestRecipe(t, s, owner.ID, "Owned root", CreateIngredientReq{Name: "Foreign food snapshot", Amount: 50, Unit: "g", SourceType: "custom_food", SourceKey: &foreign.ID, Calories: 37.5})
		if bundle, err := s.ExportOwnerRecipeBookBackup(owner.ID); !errors.Is(err, ErrExportForbidden) || bundle != nil {
			t.Fatalf("foreign private food content was not rejected: bundle=%+v err=%v", bundle, err)
		}
	})
}

func TestOwnerRecipeBookBackupFailsClosed(t *testing.T) {
	t.Run("enumeration error", func(t *testing.T) {
		s := testStore(t).(*PostgresStore)
		u := createUser(t, s, "owner-backup-enumeration")
		_ = exportTestRecipe(t, s, u.ID, "Recipe")
		if _, err := s.db.Exec(`ALTER TABLE recipe_books RENAME TO unavailable_owner_backup_books`); err != nil {
			t.Fatal(err)
		}
		if bundle, err := s.ExportOwnerRecipeBookBackup(u.ID); err == nil || bundle != nil {
			t.Fatalf("enumeration failure returned a partial backup: bundle=%+v err=%v", bundle, err)
		}
	})

	t.Run("malformed stored ingredient groups", func(t *testing.T) {
		s := testStore(t).(*PostgresStore)
		u := createUser(t, s, "owner-backup-groups")
		r := exportTestRecipe(t, s, u.ID, "Recipe")
		if _, err := s.db.Exec(`UPDATE recipes SET ingredient_groups='{' WHERE id=$1`, r.ID); err != nil {
			t.Fatal(err)
		}
		if bundle, err := s.ExportOwnerRecipeBookBackup(u.ID); err == nil || bundle != nil {
			t.Fatalf("malformed groups were silently omitted: bundle=%+v err=%v", bundle, err)
		}
	})

	t.Run("missing referenced template", func(t *testing.T) {
		f := newExportBookFixture(t)
		if _, err := f.s.db.Exec(`DELETE FROM templates WHERE id=$1`, f.template.ID); err != nil {
			t.Fatal(err)
		}
		if bundle, err := f.s.ExportOwnerRecipeBookBackup(f.user.ID); err == nil || bundle != nil {
			t.Fatalf("missing referenced template returned a non-restorable backup: bundle=%+v err=%v", bundle, err)
		}
	})
}

func TestOwnerRecipeBookBackupOperationalFailuresReturnNoPartialBundle(t *testing.T) {
	for _, table := range []string{"recipes", "recipe_books", "ingredients", "custom_foods", "food_items", "recipe_categories", "categories", "book_pages", "chapters", "chapter_pages", "chapter_recipes", "templates"} {
		t.Run(table, func(t *testing.T) {
			f := newExportBookFixture(t)
			food, err := f.s.CreateCustomFood(f.user.ID, &CreateCustomFoodRequest{Name: "Secret backup food", Calories: 25})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := f.s.CreateIngredient(f.recipe.ID, &CreateIngredientReq{Name: "Secret backup ingredient", Amount: 1, Unit: "g", SourceType: "custom_food", SourceKey: &food.ID}); err != nil {
				t.Fatal(err)
			}
			if _, err := f.s.CreateIngredient(f.recipe.ID, &CreateIngredientReq{Name: "USDA", Amount: 1, Unit: "g", SourceType: "usda", FdcID: 987654}); err != nil {
				t.Fatal(err)
			}
			if _, err := f.s.db.Exec(`ALTER TABLE ` + table + ` RENAME TO unavailable_owner_dependency`); err != nil {
				t.Fatal(err)
			}
			bundle, err := f.s.ExportOwnerRecipeBookBackup(f.user.ID)
			if err == nil || bundle != nil {
				t.Fatalf("%s failure returned partial success: bundle=%+v err=%v", table, bundle, err)
			}
		})
	}

	env := newTestEnv(t)
	if _, err := env.store.(*PostgresStore).db.Exec(`ALTER TABLE recipes RENAME TO unavailable_owner_recipes`); err != nil {
		t.Fatal(err)
	}
	w := env.doRequest("POST", "/api/recipe-bundles/owner-backup", nil)
	if w.Code != 500 || strings.Contains(w.Body.String(), `"data"`) || strings.Contains(w.Body.String(), "unavailable_owner_recipes") {
		t.Fatalf("operational failure must return only a generic error, status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestOwnerRecipeBookBackupEndpointUsesAuthenticatedOwner(t *testing.T) {
	env := newTestEnv(t)
	adminRecipeID := responseID(t, env.doRequest("POST", "/api/recipes", map[string]interface{}{"name": "Admin recipe", "servings": 1, "servingName": "serving"}))
	other, err := env.auth.Register("owner-backup-endpoint@test.com", "Password123", "Backup Owner")
	if err != nil {
		t.Fatal(err)
	}
	otherRecipeID := responseID(t, doRequestWithToken(env, "POST", "/api/recipes", other.AccessToken, map[string]interface{}{"name": "Other recipe", "servings": 1, "servingName": "serving"}))

	w := doRequestWithToken(env, "POST", "/api/recipe-bundles/owner-backup", other.AccessToken, nil)
	if w.Code != 200 {
		t.Fatalf("owner backup status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		OK   bool         `json:"ok"`
		Data RecipeBundle `json:"data"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data.Recipes) != 1 || resp.Data.Recipes[0].SourceRecipeID != otherRecipeID || resp.Data.Recipes[0].SourceRecipeID == adminRecipeID {
		t.Fatalf("endpoint did not scope backup to authenticated owner: %+v", resp.Data.Recipes)
	}

	for _, method := range []string{"GET", "PUT", "PATCH", "DELETE"} {
		w = doRequestWithToken(env, method, "/api/recipe-bundles/owner-backup", other.AccessToken, nil)
		if w.Code != 405 {
			t.Fatalf("%s owner backup status=%d want 405", method, w.Code)
		}
	}
	w = env.doRequestNoAuth("POST", "/api/recipe-bundles/owner-backup", nil)
	if w.Code != 401 {
		t.Fatalf("unauthenticated backup status=%d want 401", w.Code)
	}

	// Even an administrator's request body cannot select foreign top-level
	// content or omit the administrator's own library.
	w = env.doRequest("POST", "/api/recipe-bundles/owner-backup", map[string]interface{}{
		"recipeIds": []string{otherRecipeID}, "bookIds": []string{},
	})
	if w.Code != 200 {
		t.Fatalf("admin backup status=%d body=%s", w.Code, w.Body.String())
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data.Recipes) != 1 || resp.Data.Recipes[0].SourceRecipeID != adminRecipeID {
		t.Fatalf("selection fields changed owner enumeration: %+v", resp.Data.Recipes)
	}
}
