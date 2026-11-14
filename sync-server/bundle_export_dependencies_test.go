package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func exportTestRecipe(t *testing.T, s *PostgresStore, owner string, name string, ingredients ...CreateIngredientReq) *Recipe {
	t.Helper()
	r, err := s.CreateRecipe(owner, &CreateRecipeRequest{Name: name, Servings: 1, Ingredients: ingredients})
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func exportTestRecipeBySource(t *testing.T, bundle *RecipeBundle, sourceID string) BundleRecipe {
	t.Helper()
	for _, r := range bundle.Recipes {
		if r.SourceRecipeID == sourceID {
			return r
		}
	}
	t.Fatalf("recipe source %s missing from export", sourceID)
	return BundleRecipe{}
}

func TestBundleExportPortableRecursiveDependencies(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "export-closure")
	food, err := s.CreateCustomFood(u.ID, &CreateCustomFoodRequest{Name: "House sauce", Calories: 120, Sodium: 25})
	if err != nil {
		t.Fatal(err)
	}
	// Export must use the food's FDC ID, not its installation-local row ID.
	if _, err := s.db.Exec(`INSERT INTO food_items (fdc_id, description, data_type, calories) VALUES (987654, 'USDA staple', 'Foundation', 50)`); err != nil {
		t.Fatal(err)
	}
	leaf := exportTestRecipe(t, s, u.ID, "Leaf",
		CreateIngredientReq{Name: "Sauce", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &food.ID, Calories: 120},
		CreateIngredientReq{Name: "Staple", Amount: 50, Unit: "g", SourceType: "usda", FdcID: 987654, Calories: 25})
	middle := exportTestRecipe(t, s, u.ID, "Middle", CreateIngredientReq{Name: "Leaf", Amount: 2, Unit: "recipe", LinkedRecipeID: &leaf.ID, SourceType: "recipe", SourceKey: &leaf.ID, Calories: 290})
	root := exportTestRecipe(t, s, u.ID, "Root", CreateIngredientReq{Name: "Middle", Amount: 1, Unit: "recipe", LinkedRecipeID: &middle.ID, SourceType: "recipe", SourceKey: &middle.ID, Calories: 290})
	bundle, err := s.ExportRecipeBundleForUser(u, []string{root.ID, leaf.ID}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Recipes) != 3 || len(bundle.CustomFoods) != 1 || len(bundle.FoodItems) != 1 {
		t.Fatalf("incomplete or duplicate closure: recipes=%d customFoods=%d foodItems=%d", len(bundle.Recipes), len(bundle.CustomFoods), len(bundle.FoodItems))
	}
	for _, original := range []*Recipe{root, middle, leaf} {
		exported := exportTestRecipeBySource(t, bundle, original.ID)
		if exported.BundleRecipeID != original.PortableID || exported.PortableID != original.PortableID {
			t.Fatalf("recipe identity = %q / %q, want %q", exported.BundleRecipeID, exported.PortableID, original.PortableID)
		}
	}
	if got := exportTestRecipeBySource(t, bundle, root.ID).Ingredients[0].Source.BundleRecipeID; got != middle.PortableID {
		t.Fatalf("root linked recipe = %q, want %q", got, middle.PortableID)
	}
	if got := exportTestRecipeBySource(t, bundle, middle.ID).Ingredients[0].Source.BundleRecipeID; got != leaf.PortableID {
		t.Fatalf("middle linked recipe = %q, want %q", got, leaf.PortableID)
	}
	for _, ing := range exportTestRecipeBySource(t, bundle, leaf.ID).Ingredients {
		switch ing.Name {
		case "Sauce":
			if ing.Source.Type != "custom_food" || ing.Source.BundleCustomFoodID != food.PortableID || ing.Nutrients.Calories != 120 {
				t.Fatalf("lost custom-food identity or snapshot: %+v", ing)
			}
		case "Staple":
			if ing.Source.Type != "usda" || ing.Source.FdcID != 987654 {
				t.Fatalf("USDA identity changed: %+v", ing.Source)
			}
		}
	}
	if f := bundle.CustomFoods[0]; f.BundleCustomFoodID != food.PortableID || f.PortableID != food.PortableID || f.SourceCustomFoodID != food.ID || f.Nutrients.Sodium != 25 {
		t.Fatalf("lost food portable identity/provenance: %+v", f)
	}
	if err := ValidateRecipeBundle(*bundle); err != nil {
		t.Fatalf("exported closure is invalid: %v", err)
	}
}

type exportBookFixture struct {
	s              *PostgresStore
	user           *User
	book           *RecipeBook
	recipe         *Recipe
	chapter        *Chapter
	parentCategory *Category
	childCategory  *Category
	template       *Template
}

func newExportBookFixture(t *testing.T) exportBookFixture {
	t.Helper()
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "export-book")
	r := exportTestRecipe(t, s, u.ID, "Book recipe")
	parent, err := s.CreateCategory(&CreateCategoryRequest{Name: "Export parent"})
	if err != nil {
		t.Fatal(err)
	}
	child, err := s.CreateCategory(&CreateCategoryRequest{Name: "Export child", ParentID: &parent.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddRecipeCategory(r.ID, child.ID); err != nil {
		t.Fatal(err)
	}
	template, err := s.CreateTemplate(u.ID, &CreateTemplateRequest{Name: "Book template", Type: "recipe", Layout: `{"blocks":[]}`})
	if err != nil {
		t.Fatal(err)
	}
	book, err := s.CreateBook(u.ID, &CreateBookRequest{Title: "Book", Description: "Description"})
	if err != nil {
		t.Fatal(err)
	}
	chapter, err := s.CreateChapter(book.ID, &CreateChapterRequest{Title: "Chapter", Position: 2, PageTemplateID: &template.ID, RecipeTemplateID: &template.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddChapterRecipe(chapter.ID, r.ID, 4); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateChapterPage(chapter.ID, "Chapter page", "Chapter prose", 3); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateBookPage(book.ID, "Preface", "Book prose", 1); err != nil {
		t.Fatal(err)
	}
	return exportBookFixture{s: s, user: u, book: book, recipe: r, chapter: chapter, parentCategory: parent, childCategory: child, template: template}
}

func TestBundleExportBookPlacementDependencies(t *testing.T) {
	f := newExportBookFixture(t)
	bundle, err := f.s.ExportRecipeBundleForUser(f.user, nil, []string{f.book.ID}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.ChapterRecipes) != 1 || bundle.ChapterRecipes[0].BundleRecipeID != f.recipe.PortableID || bundle.ChapterRecipes[0].Position != 4 {
		t.Fatalf("chapter join must use exported portable recipe key: %+v", bundle.ChapterRecipes)
	}
	if len(bundle.Categories) != 2 || len(bundle.RecipeCategories) != 1 {
		t.Fatalf("missing category closure: categories=%+v joins=%+v", bundle.Categories, bundle.RecipeCategories)
	}
	for _, c := range bundle.Categories {
		if c.BundleCategoryID == f.childCategory.ID && (c.ParentBundleCategoryID == nil || *c.ParentBundleCategoryID != f.parentCategory.ID) {
			t.Fatalf("lost category parent: %+v", c)
		}
	}
	if join := bundle.RecipeCategories[0]; join.BundleRecipeID != f.recipe.PortableID || join.BundleCategoryID != f.childCategory.ID {
		t.Fatalf("invalid category assignment: %+v", join)
	}
	if len(bundle.Templates) != 1 || bundle.Templates[0].BundleTemplateID != f.template.ID {
		t.Fatalf("missing or duplicate referenced templates: %+v", bundle.Templates)
	}
	var layout bytes.Buffer
	if err := json.Compact(&layout, bundle.Templates[0].Layout); err != nil || layout.String() != f.template.LayoutJSON {
		t.Fatalf("lost template layout: %s / %v", bundle.Templates[0].Layout, err)
	}
	if len(bundle.BookPages) != 1 || bundle.BookPages[0].Content != "Book prose" || bundle.BookPages[0].Position != 1 || len(bundle.ChapterPages) != 1 || bundle.ChapterPages[0].Content != "Chapter prose" || bundle.ChapterPages[0].Position != 3 {
		t.Fatalf("lost ordered prose pages: %+v / %+v", bundle.BookPages, bundle.ChapterPages)
	}
	if err := ValidateRecipeBundle(*bundle); err != nil {
		t.Fatalf("exported book is invalid: %v", err)
	}
}

func TestBundleExportCategoryHierarchyRoundTrip(t *testing.T) {
	f := newExportBookFixture(t)
	recipient := createUser(t, f.s, "category-round-trip")
	bundle, err := f.s.ExportRecipeBundleForUser(f.user, nil, []string{f.book.ID}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	// Keep this case focused on hierarchy, independently of template hydration.
	bundle.Templates = nil
	for i := range bundle.Chapters {
		bundle.Chapters[i].BundlePageTemplateID = nil
		bundle.Chapters[i].BundleRecipeTemplateID = nil
	}
	if _, err := f.s.ImportRecipeBundle(recipient.ID, *bundle); err != nil {
		t.Fatal(err)
	}
	var parent string
	err = f.s.db.QueryRow(`SELECT COALESCE(parent.name,'') FROM recipe_categories rc JOIN recipes r ON r.id=rc.recipe_id JOIN categories child ON child.id=rc.category_id LEFT JOIN categories parent ON parent.id=child.parent_id WHERE r.user_id=$1`, recipient.ID).Scan(&parent)
	if err != nil {
		t.Fatal(err)
	}
	if parent != f.parentCategory.Name {
		t.Fatalf("category hierarchy lost during native transfer: parent=%q", parent)
	}
}

func TestBundleExportTemplateRoundTrip(t *testing.T) {
	f := newExportBookFixture(t)
	recipient := createUser(t, f.s, "template-round-trip")
	bundle, err := f.s.ExportRecipeBundleForUser(f.user, nil, []string{f.book.ID}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.ImportRecipeBundle(recipient.ID, *bundle); err != nil {
		t.Fatal(err)
	}
	var layout string
	err = f.s.db.QueryRow(`SELECT t.layout_json FROM chapters ch JOIN recipe_books b ON b.id=ch.book_id JOIN templates t ON t.id=ch.recipe_template_id WHERE b.user_id=$1`, recipient.ID).Scan(&layout)
	if err != nil {
		t.Fatal(err)
	}
	var got, want interface{}
	if err := json.Unmarshal([]byte(layout), &got); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(f.template.LayoutJSON), &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("template layout changed: %s", layout)
	}
}

func TestBundleExportCyclesRetainPortableLinksAndCategoryClosure(t *testing.T) {
	f := newExportBookFixture(t)
	child := exportTestRecipe(t, f.s, f.user.ID, "Cyclic child", CreateIngredientReq{Name: "Parent", Amount: 1, Unit: "recipe", SourceType: "recipe", SourceKey: &f.recipe.ID})
	if _, err := f.s.CreateIngredient(f.recipe.ID, &CreateIngredientReq{Name: "Child", Amount: 1, Unit: "recipe", SourceType: "recipe", SourceKey: &child.ID}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.AddRecipeCategory(child.ID, f.childCategory.ID); err != nil {
		t.Fatal(err)
	}
	bundle, err := f.s.ExportRecipeBundleForUser(f.user, nil, []string{f.book.ID}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Recipes) != 2 || len(bundle.Categories) != 2 || len(bundle.RecipeCategories) != 2 {
		t.Fatalf("cyclic/recursive closure lost or duplicated rows: recipes=%d categories=%d joins=%d", len(bundle.Recipes), len(bundle.Categories), len(bundle.RecipeCategories))
	}
	if got := exportTestRecipeBySource(t, bundle, f.recipe.ID).Ingredients[0].Source.BundleRecipeID; got != child.PortableID {
		t.Fatalf("lost cyclic child portable reference: %q", got)
	}
	if got := exportTestRecipeBySource(t, bundle, child.ID).Ingredients[0].Source.BundleRecipeID; got != f.recipe.PortableID {
		t.Fatalf("lost cyclic parent portable reference: %q", got)
	}
}

func TestBundleExportBookRetrievalErrors(t *testing.T) {
	for _, table := range []string{"book_pages", "chapters", "chapter_pages", "chapter_recipes", "templates", "recipe_categories", "categories", "ingredients"} {
		t.Run(table, func(t *testing.T) {
			f := newExportBookFixture(t)
			if _, err := f.s.db.Exec(`ALTER TABLE ` + table + ` RENAME TO unavailable_export_dependency`); err != nil {
				t.Fatal(err)
			}
			bundle, err := f.s.ExportRecipeBundleForUser(f.user, nil, []string{f.book.ID}, nil, nil)
			if err == nil || bundle != nil {
				t.Fatalf("operational %s lookup failure returned success: bundle=%+v err=%v", table, bundle, err)
			}
		})
	}
}

func TestBundleExportPreservesMissingSourceReferences(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "export-missing")
	missingRecipe, missingFood := "missing-source-recipe", "missing-source-food"
	r := exportTestRecipe(t, s, u.ID, "Unresolved",
		CreateIngredientReq{Name: "Missing recipe", Amount: 2, Unit: "recipe", SourceType: "recipe", SourceKey: &missingRecipe, Calories: 40},
		CreateIngredientReq{Name: "Missing custom", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &missingFood, Calories: 70},
		CreateIngredientReq{Name: "Missing USDA", Amount: 50, Unit: "g", SourceType: "usda", FdcID: 765432, Calories: 20})
	bundle, err := s.ExportRecipeBundleForUser(u, []string{r.ID}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Recipes) != 1 || len(bundle.Recipes[0].Ingredients) != 3 || len(bundle.CustomFoods) != 0 || len(bundle.FoodItems) != 0 {
		t.Fatalf("missing dependencies lost snapshots or invented rows: %+v", bundle)
	}
	for _, ing := range bundle.Recipes[0].Ingredients {
		switch ing.Name {
		case "Missing recipe":
			if ing.Source.Type != "recipe" || ing.Source.BundleRecipeID != missingRecipe || ing.Nutrients.Calories != 40 {
				t.Fatalf("lost unresolved recipe source: %+v", ing)
			}
		case "Missing custom":
			if ing.Source.Type != "custom_food" || ing.Source.BundleCustomFoodID != missingFood || ing.Nutrients.Calories != 70 {
				t.Fatalf("lost unresolved custom source: %+v", ing)
			}
		case "Missing USDA":
			if ing.Source.Type != "usda" || ing.Source.FdcID != 765432 || ing.Nutrients.Calories != 20 {
				t.Fatalf("lost unresolved USDA source: %+v", ing)
			}
		}
	}
}

func TestBundleExportCustomFoodRequiresRequesterAuthorization(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	owner := createUser(t, s, "export-food-owner")
	owner.IsAdmin = false
	other := createUser(t, s, "export-food-other")
	viewer := createUser(t, s, "export-food-viewer")
	makeFood := func(userID, name string) *CustomFood {
		f, err := s.CreateCustomFood(userID, &CreateCustomFoodRequest{Name: name, Calories: 80})
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	makePublicRecipe := func(name string, foods ...*CustomFood) *Recipe {
		var ingredients []CreateIngredientReq
		for _, food := range foods {
			ingredients = append(ingredients, CreateIngredientReq{Name: "Ingredient snapshot", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &food.ID})
		}
		r := exportTestRecipe(t, s, owner.ID, name, ingredients...)
		if _, err := s.CreateSharedRecipe(owner.ID, r.ID, r.Name, "", "", "", `{}`, "public"); err != nil {
			t.Fatal(err)
		}
		return r
	}
	owned := makeFood(owner.ID, "Referenced private owner food")
	shared := makeFood(other.ID, "Referenced shared food")
	foreign := makeFood(other.ID, "Foreign private secret")
	_ = makeFood(owner.ID, "Unreferenced owner secret")
	if err := s.ShareCustomFood(other.ID, shared.ID); err != nil {
		t.Fatal(err)
	}
	r := makePublicRecipe("Public recipe with private dependency", owned, shared)
	t.Run("public recipe cannot expose private food", func(t *testing.T) {
		if bundle, err := s.ExportRecipeBundleForUser(viewer, []string{r.ID}, nil, nil, nil); !errors.Is(err, ErrExportForbidden) || bundle != nil {
			t.Fatalf("public recipe leaked private canonical food: bundle=%+v err=%v", bundle, err)
		}
	})
	t.Run("owner and explicit admin export remain allowed", func(t *testing.T) {
		for _, requester := range []*User{owner, {ID: viewer.ID, IsAdmin: true}} {
			bundle, err := s.ExportRecipeBundleForUser(requester, []string{r.ID}, nil, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			if len(bundle.CustomFoods) != 2 {
				t.Fatalf("lost referenced foods or included unreferenced food: %+v", bundle.CustomFoods)
			}
			for _, food := range bundle.CustomFoods {
				if food.PortableID != owned.PortableID && food.PortableID != shared.PortableID {
					t.Fatalf("exposed unrelated private food: %+v", food)
				}
			}
		}
	})
	t.Run("shared referenced food is exportable", func(t *testing.T) {
		sharedRecipe := makePublicRecipe("Public shared dependency", shared)
		bundle, err := s.ExportRecipeBundleForUser(viewer, []string{sharedRecipe.ID}, nil, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if len(bundle.CustomFoods) != 1 || bundle.CustomFoods[0].PortableID != shared.PortableID {
			t.Fatalf("lost authorized shared dependency: %+v", bundle.CustomFoods)
		}
	})
	t.Run("foreign private sourceKey is forbidden not omitted", func(t *testing.T) {
		foreignRecipe := makePublicRecipe("Invalid private dependency", foreign)
		if bundle, err := s.ExportRecipeBundleForUser(owner, []string{foreignRecipe.ID}, nil, nil, nil); !errors.Is(err, ErrExportForbidden) || bundle != nil {
			t.Fatalf("foreign private source was silently omitted or exposed: bundle=%+v err=%v", bundle, err)
		}
	})
}

func TestBundleExportFoodRetrievalErrors(t *testing.T) {
	for _, table := range []string{"food_items", "custom_foods"} {
		t.Run(table, func(t *testing.T) {
			s := testStore(t).(*PostgresStore)
			u := createUser(t, s, "export-lookup")
			key := "missing-food"
			ing := CreateIngredientReq{Name: "Food", Amount: 100, Unit: "g", SourceType: "usda", FdcID: 123456}
			if table == "custom_foods" {
				ing.SourceType = "custom_food"
				ing.FdcID = 0
				ing.SourceKey = &key
			}
			r := exportTestRecipe(t, s, u.ID, "Recipe", ing)
			if _, err := s.db.Exec(`ALTER TABLE ` + table + ` RENAME TO unavailable_export_dependency`); err != nil {
				t.Fatal(err)
			}
			if bundle, err := s.ExportRecipeBundleForUser(u, []string{r.ID}, nil, nil, nil); err == nil || bundle != nil {
				t.Fatalf("swallowed %s retrieval error: %+v / %v", table, bundle, err)
			}
		})
	}
}

func TestBundleExportLinkedRecipeAuthorizationUnchanged(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "export-owner")
	u.IsAdmin = false
	other := createUser(t, s, "export-private")
	private := exportTestRecipe(t, s, other.ID, "Private dependency")
	root := exportTestRecipe(t, s, u.ID, "Root", CreateIngredientReq{Name: "Private", Amount: 1, Unit: "recipe", LinkedRecipeID: &private.ID, SourceType: "recipe", SourceKey: &private.ID})
	if _, err := s.ExportRecipeBundleForUser(u, []string{root.ID}, nil, nil, nil); !errors.Is(err, ErrExportForbidden) {
		t.Fatalf("linked private recipe must not bypass canExportRecipe: %v", err)
	}
}
