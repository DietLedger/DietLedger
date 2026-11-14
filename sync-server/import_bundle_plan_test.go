package main

import "testing"

func TestPlanRecipeBundleImportOrdersFoodBeforeRecipesAndHydration(t *testing.T) {
	bundle := minimalRecipeBundle()

	plan, err := PlanRecipeBundleImport(bundle)
	if err != nil {
		t.Fatalf("PlanRecipeBundleImport() error = %v", err)
	}

	assertStepBefore(t, plan, ImportStepUpsertFoodItems, ImportStepCreateRecipeShells)
	assertStepBefore(t, plan, ImportStepCreateRecipeShells, ImportStepHydrateRecipes)
}

func TestPlanRecipeBundleImportHandlesLinkedRecipesRegardlessOfBundleOrder(t *testing.T) {
	bundle := minimalRecipeBundle()
	base := bundle.Recipes[0]

	child := base
	child.BundleRecipeID = "recipe-child"
	child.Name = "Child Recipe"
	child.Ingredients = nil

	parent := base
	parent.BundleRecipeID = "recipe-parent"
	parent.Name = "Parent Recipe"
	parent.Ingredients[0].Source = BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "recipe-child"}
	parent.Ingredients[0].Name = "Child Recipe"

	// Parent appears before child to prove the planner is graph-based, not order-based.
	bundle.Recipes = []BundleRecipe{parent, child}

	plan, err := PlanRecipeBundleImport(bundle)
	if err != nil {
		t.Fatalf("PlanRecipeBundleImport() error = %v", err)
	}

	if !plan.RequiresRecipeShell("recipe-child") || !plan.RequiresRecipeShell("recipe-parent") {
		t.Fatalf("plan missing required recipe shells: %#v", plan.RecipeShells)
	}
	if !plan.RequiresRecipeLinkRemap("recipe-parent", "recipe-child") {
		t.Fatalf("plan missing linked recipe remap parent -> child: %#v", plan.RecipeLinkRemaps)
	}
	assertStepBefore(t, plan, ImportStepCreateRecipeShells, ImportStepHydrateRecipes)
}

func TestPlanRecipeBundleImportRetainsMissingLinkedRecipeDependency(t *testing.T) {
	bundle := minimalRecipeBundle()
	bundle.Recipes[0].Ingredients[0].Source = BundleIngredientSourceRef{Type: "recipe", BundleRecipeID: "missing-recipe"}

	plan, err := PlanRecipeBundleImport(bundle)
	if err != nil {
		t.Fatalf("PlanRecipeBundleImport() rejected structurally valid unresolved dependency: %v", err)
	}
	if !plan.RequiresRecipeLinkRemap(bundle.Recipes[0].BundleRecipeID, "missing-recipe") {
		t.Fatalf("plan lost unresolved dependency: %#v", plan.RecipeLinkRemaps)
	}
}

func TestPlanRecipeBundleImportIncludesCookbookStructureAfterRecipes(t *testing.T) {
	bundle := minimalRecipeBundle()
	bundle.Books = []BundleBook{{BundleBookID: "book-1", Title: "Cookbook", Description: "", CoverColor: "#059669"}}
	bundle.Chapters = []BundleChapter{{BundleChapterID: "chapter-1", BundleBookID: "book-1", Title: "Mains", Position: 0}}
	bundle.ChapterRecipes = []BundleChapterRecipe{{BundleChapterID: "chapter-1", BundleRecipeID: "recipe-1", Position: 1}}
	bundle.ChapterPages = []BundleChapterPage{{BundleChapterPageID: "chapter-page-1", BundleChapterID: "chapter-1", Title: "Intro", Content: "Welcome", Position: 0}}
	bundle.BookPages = []BundleBookPage{{BundleBookPageID: "book-page-1", BundleBookID: "book-1", Title: "Preface", Content: "Hello", Position: 0}}

	plan, err := PlanRecipeBundleImport(bundle)
	if err != nil {
		t.Fatalf("PlanRecipeBundleImport() error = %v", err)
	}

	if !plan.RequiresBook("book-1") {
		t.Fatalf("plan missing book import: %#v", plan.Books)
	}
	if !plan.RequiresChapter("chapter-1") {
		t.Fatalf("plan missing chapter import: %#v", plan.Chapters)
	}
	if !plan.RequiresChapterRecipe("chapter-1", "recipe-1") {
		t.Fatalf("plan missing chapter recipe placement: %#v", plan.ChapterRecipes)
	}
	assertStepBefore(t, plan, ImportStepHydrateRecipes, ImportStepRebuildCookbookStructure)
}

func TestPlanRecipeBundleImportClearsMissingTemplateReferences(t *testing.T) {
	bundle := minimalRecipeBundle()
	missingPageTemplate := "missing-page-template"
	missingRecipeTemplate := "missing-recipe-template"
	bundle.Books = []BundleBook{{BundleBookID: "book-1", Title: "Cookbook"}}
	bundle.Chapters = []BundleChapter{
		{
			BundleChapterID:        "chapter-1",
			BundleBookID:           "book-1",
			Title:                  "Mains",
			Position:               0,
			BundlePageTemplateID:   &missingPageTemplate,
			BundleRecipeTemplateID: &missingRecipeTemplate,
		},
	}

	plan, err := PlanRecipeBundleImport(bundle)
	if err != nil {
		t.Fatalf("PlanRecipeBundleImport() error = %v", err)
	}
	if !plan.ClearsMissingTemplateReference("chapter-1", "page", missingPageTemplate) {
		t.Fatalf("plan does not clear missing page template reference: %#v", plan.TemplateReferenceActions)
	}
	if !plan.ClearsMissingTemplateReference("chapter-1", "recipe", missingRecipeTemplate) {
		t.Fatalf("plan does not clear missing recipe template reference: %#v", plan.TemplateReferenceActions)
	}
}

func TestPlanRecipeBundleImportIncludesCategoryClosureBeforeAssignments(t *testing.T) {
	bundle := minimalRecipeBundle()
	bundle.Categories = []BundleCategory{
		{BundleCategoryID: "cat-parent", Name: "Dinner"},
		{BundleCategoryID: "cat-child", ParentBundleCategoryID: strPtr("cat-parent"), Name: "Soup"},
	}
	bundle.RecipeCategories = []BundleRecipeCategory{{BundleRecipeID: "recipe-1", BundleCategoryID: "cat-child"}}

	plan, err := PlanRecipeBundleImport(bundle)
	if err != nil {
		t.Fatalf("PlanRecipeBundleImport() error = %v", err)
	}
	if !plan.RequiresCategory("cat-parent") || !plan.RequiresCategory("cat-child") {
		t.Fatalf("plan missing category closure: %#v", plan.Categories)
	}
	if !plan.RequiresRecipeCategory("recipe-1", "cat-child") {
		t.Fatalf("plan missing recipe category assignment: %#v", plan.RecipeCategories)
	}
	assertStepBefore(t, plan, ImportStepUpsertCategories, ImportStepAssignRecipeCategories)
}

func assertStepBefore(t *testing.T, plan *RecipeBundleImportPlan, before, after ImportStep) {
	t.Helper()
	beforeIndex := plan.StepIndex(before)
	afterIndex := plan.StepIndex(after)
	if beforeIndex < 0 {
		t.Fatalf("plan missing step %q: %#v", before, plan.Steps)
	}
	if afterIndex < 0 {
		t.Fatalf("plan missing step %q: %#v", after, plan.Steps)
	}
	if beforeIndex >= afterIndex {
		t.Fatalf("step %q index %d must be before %q index %d; steps=%#v", before, beforeIndex, after, afterIndex, plan.Steps)
	}
}
