package main

import (
	"strings"
	"testing"
)

func TestUserCRUD(t *testing.T) {
	s := testStore(t)

	u, err := s.CreateUser("alice@test.com", "hunter2", "Alice")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if u.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if u.Email != "alice@test.com" {
		t.Fatalf("email = %q, want alice@test.com", u.Email)
	}
	if u.APIKey == "" {
		t.Fatal("expected non-empty API key")
	}

	got, err := s.GetUserByID(u.ID)
	if err != nil {
		t.Fatalf("get by id: %v", err)
	}
	if got.Email != u.Email {
		t.Fatalf("email mismatch: %q vs %q", got.Email, u.Email)
	}

	got, err = s.GetUserByEmail("alice@test.com")
	if err != nil {
		t.Fatalf("get by email: %v", err)
	}
	if got.ID != u.ID {
		t.Fatalf("id mismatch: %q vs %q", got.ID, u.ID)
	}

	got, err = s.GetUserByAPIKey(u.APIKey)
	if err != nil {
		t.Fatalf("get by api key: %v", err)
	}
	if got.ID != u.ID {
		t.Fatalf("id mismatch: %q vs %q", got.ID, u.ID)
	}

	got, err = s.GetUserByAPIKey("nonexistent")
	if err != nil {
		t.Fatalf("get by bad key: %v", err)
	}
	if got != nil {
		t.Fatal("expected nil for bad key")
	}

	if _, err := s.CreateUser("alice@test.com", "x", "Dup"); err == nil {
		t.Fatal("expected error on duplicate email")
	}
}

func TestRecipeCRUD(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")

	r, err := s.CreateRecipe(u.ID, &CreateRecipeRequest{
		Name:        "Pasta",
		Servings:    4,
		ServingName: "bowl",
		Ingredients: []CreateIngredientReq{
			{FdcID: 12345, Name: "Noodles", Amount: 200, Unit: "g", Calories: 350},
		},
	})
	if err != nil {
		t.Fatalf("create recipe: %v", err)
	}
	if r.ID == "" {
		t.Fatal("expected non-empty recipe ID")
	}
	if r.Name != "Pasta" {
		t.Fatalf("name = %q, want Pasta", r.Name)
	}
	if len(r.Ingredients) != 1 {
		t.Fatalf("ingredients = %d, want 1", len(r.Ingredients))
	}
	if r.Ingredients[0].Name != "Noodles" {
		t.Fatalf("ingredient name = %q", r.Ingredients[0].Name)
	}

	got, err := s.GetRecipe(u.ID, r.ID)
	if err != nil {
		t.Fatalf("get recipe: %v", err)
	}
	if got.Name != "Pasta" {
		t.Fatalf("name = %q", got.Name)
	}

	recipes, total, err := s.ListRecipes(u.ID, 1, 10)
	if err != nil {
		t.Fatalf("list recipes: %v", err)
	}
	if total != 1 {
		t.Fatalf("total = %d, want 1", total)
	}
	if len(recipes) != 1 {
		t.Fatalf("len = %d, want 1", len(recipes))
	}

	updated, err := s.UpdateRecipe(u.ID, r.ID, &UpdateRecipeRequest{
		Name:        strPtr("Garlic Pasta"),
		Servings:    intPtr(2),
		ServingName: strPtr("bowl"),
	})
	if err != nil {
		t.Fatalf("update recipe: %v", err)
	}
	if updated.Name != "Garlic Pasta" {
		t.Fatalf("name = %q, want Garlic Pasta", updated.Name)
	}
	if updated.Servings != 2 {
		t.Fatalf("servings = %d, want 2", updated.Servings)
	}

	if err := s.DeleteRecipe(u.ID, r.ID); err != nil {
		t.Fatalf("delete recipe: %v", err)
	}
	got, err = s.GetRecipe(u.ID, r.ID)
	if err != nil {
		t.Fatalf("get deleted: %v", err)
	}
	if got != nil {
		t.Fatal("expected nil after delete")
	}
}

func TestRecipeUserScoping(t *testing.T) {
	s := testStore(t)
	u1 := createUser(t, s, "a")
	u2 := createUser(t, s, "b")

	r1, _ := s.CreateRecipe(u1.ID, &CreateRecipeRequest{Name: "R1", Servings: 1, ServingName: "serving"})
	r2, _ := s.CreateRecipe(u2.ID, &CreateRecipeRequest{Name: "R2", Servings: 1, ServingName: "serving"})

	got, err := s.GetRecipe(u1.ID, r2.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != nil {
		t.Fatal("user1 should not see user2's recipe")
	}

	got, err = s.GetRecipe(u2.ID, r1.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != nil {
		t.Fatal("user2 should not see user1's recipe")
	}

	recipes1, _, _ := s.ListRecipes(u1.ID, 1, 10)
	if len(recipes1) != 1 || recipes1[0].Name != "R1" {
		t.Fatal("user1 list should only contain R1")
	}

	recipes2, _, _ := s.ListRecipes(u2.ID, 1, 10)
	if len(recipes2) != 1 || recipes2[0].Name != "R2" {
		t.Fatal("user2 list should only contain R2")
	}
}

func TestIngredientCascade(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")

	r, _ := s.CreateRecipe(u.ID, &CreateRecipeRequest{
		Name:        "Soup",
		Servings:    2,
		ServingName: "bowl",
		Ingredients: []CreateIngredientReq{
			{FdcID: 1, Name: "Carrot", Amount: 100, Unit: "g"},
			{FdcID: 2, Name: "Potato", Amount: 200, Unit: "g"},
		},
	})

	ing, err := s.CreateIngredient(r.ID, &CreateIngredientReq{FdcID: 3, Name: "Onion", Amount: 50, Unit: "g"})
	if err != nil {
		t.Fatalf("create ingredient: %v", err)
	}
	if ing.Name != "Onion" {
		t.Fatalf("name = %q", ing.Name)
	}

	updated, err := s.UpdateIngredient(ing.ID, &CreateIngredientReq{FdcID: 3, Name: "Red Onion", Amount: 75, Unit: "g"})
	if err != nil {
		t.Fatalf("update ingredient: %v", err)
	}
	if updated.Name != "Red Onion" || updated.Amount != 75 {
		t.Fatalf("updated = %+v", updated)
	}

	if err := s.DeleteRecipe(u.ID, r.ID); err != nil {
		t.Fatalf("delete recipe: %v", err)
	}

	recipes, _, _ := s.ListRecipes(u.ID, 1, 10)
	if len(recipes) != 0 {
		t.Fatal("recipes should be cascade deleted")
	}
}

func TestProfileCRUD(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")

	p, err := s.CreateProfile(u.ID, &CreateProfileRequest{
		Name:          "Alice",
		Sex:           "female",
		ActivityLevel: "moderate",
	})
	if err != nil {
		t.Fatalf("create profile: %v", err)
	}
	if p.ID == "" {
		t.Fatal("expected non-empty ID")
	}

	got, err := s.GetProfile(u.ID, p.ID)
	if err != nil {
		t.Fatalf("get profile: %v", err)
	}
	if got.Name != "Alice" {
		t.Fatalf("name = %q", got.Name)
	}

	profiles, err := s.ListProfiles(u.ID)
	if err != nil {
		t.Fatalf("list profiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("len = %d, want 1", len(profiles))
	}

	updated, err := s.UpdateProfile(u.ID, p.ID, &CreateProfileRequest{
		Name:          "Alice Updated",
		Sex:           "female",
		ActivityLevel: "active",
	})
	if err != nil {
		t.Fatalf("update profile: %v", err)
	}
	if updated.Name != "Alice Updated" {
		t.Fatalf("name = %q", updated.Name)
	}

	if err := s.DeleteProfile(u.ID, p.ID); err != nil {
		t.Fatalf("delete profile: %v", err)
	}
	got, err = s.GetProfile(u.ID, p.ID)
	if err != nil {
		t.Fatalf("get deleted: %v", err)
	}
	if got != nil {
		t.Fatal("expected nil after delete")
	}
}

func TestFoodLogCRUD(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")
	p, _ := s.CreateProfile(u.ID, &CreateProfileRequest{Name: "P", Sex: "female", ActivityLevel: "moderate"})

	entry, err := s.CreateFoodLogEntry(u.ID, p.ID, &CreateFoodLogRequest{
		Date:       "2025-01-15",
		MealSlot:   "breakfast",
		SourceType: "custom",
		Name:       "Oatmeal",
		Servings:   1,
		Calories:   150,
		Protein:    5,
	})
	if err != nil {
		t.Fatalf("create food log: %v", err)
	}
	if entry.ID == "" {
		t.Fatal("expected non-empty ID")
	}

	entries, err := s.ListFoodLogEntries(p.ID, "2025-01-15")
	if err != nil {
		t.Fatalf("list entries: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("len = %d, want 1", len(entries))
	}

	other, err := s.ListFoodLogEntries(p.ID, "2025-01-16")
	if err != nil {
		t.Fatalf("list other date: %v", err)
	}
	if len(other) != 0 {
		t.Fatalf("len = %d, want 0 for different date", len(other))
	}

	updated, err := s.UpdateFoodLogEntry(entry.ID, &CreateFoodLogRequest{
		Date:       "2025-01-15",
		MealSlot:   "breakfast",
		SourceType: "custom",
		Name:       "Oatmeal w/ Honey",
		Servings:   1,
		Calories:   200,
	})
	if err != nil {
		t.Fatalf("update food log: %v", err)
	}
	if updated.Calories != 200 {
		t.Fatalf("calories = %f, want 200", updated.Calories)
	}

	if err := s.DeleteFoodLogEntry(entry.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	entries, _ = s.ListFoodLogEntries(p.ID, "2025-01-15")
	if len(entries) != 0 {
		t.Fatal("expected empty after delete")
	}
}

func TestWeightEntryCRUD(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")
	p, _ := s.CreateProfile(u.ID, &CreateProfileRequest{Name: "P", Sex: "female", ActivityLevel: "moderate"})

	w, err := s.CreateWeightEntry(u.ID, p.ID, &CreateWeightEntryRequest{
		Date:     "2025-01-15",
		WeightKg: 70.5,
	})
	if err != nil {
		t.Fatalf("create weight: %v", err)
	}
	if w.ID == "" {
		t.Fatal("expected non-empty ID")
	}

	entries, err := s.ListWeightEntries(p.ID, "2025-01-01", "2025-01-31")
	if err != nil {
		t.Fatalf("list weights: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("len = %d, want 1", len(entries))
	}

	outside, err := s.ListWeightEntries(p.ID, "2025-02-01", "2025-02-28")
	if err != nil {
		t.Fatalf("list outside range: %v", err)
	}
	if len(outside) != 0 {
		t.Fatalf("len = %d, want 0 outside range", len(outside))
	}

	updated, err := s.UpdateWeightEntry(w.ID, &CreateWeightEntryRequest{
		Date:     "2025-01-15",
		WeightKg: 69.8,
	})
	if err != nil {
		t.Fatalf("update weight: %v", err)
	}
	if updated.WeightKg != 69.8 {
		t.Fatalf("weight = %f, want 69.8", updated.WeightKg)
	}

	if err := s.DeleteWeightEntry(w.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestWeightEntryUniqueDate(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")
	p, _ := s.CreateProfile(u.ID, &CreateProfileRequest{Name: "P", Sex: "female", ActivityLevel: "moderate"})

	_, err := s.CreateWeightEntry(u.ID, p.ID, &CreateWeightEntryRequest{Date: "2025-01-15", WeightKg: 70})
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	_, err = s.CreateWeightEntry(u.ID, p.ID, &CreateWeightEntryRequest{Date: "2025-01-15", WeightKg: 71})
	if err == nil {
		t.Fatal("expected error on duplicate date")
	}
	if !strings.Contains(err.Error(), "UNIQUE") {
		t.Fatalf("expected UNIQUE constraint error, got: %v", err)
	}
}

func TestMealPlanCRUD(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")

	mp, err := s.CreateMealPlan(u.ID, &CreateMealPlanRequest{
		Name:      "Week 1",
		WeekStart: "2025-01-13",
	})
	if err != nil {
		t.Fatalf("create meal plan: %v", err)
	}

	got, err := s.GetMealPlan(u.ID, mp.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "Week 1" {
		t.Fatalf("name = %q", got.Name)
	}

	plans, err := s.ListMealPlans(u.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(plans) != 1 {
		t.Fatalf("len = %d, want 1", len(plans))
	}

	updated, err := s.UpdateMealPlan(u.ID, mp.ID, &CreateMealPlanRequest{
		Name:      "Week 1 Updated",
		WeekStart: "2025-01-13",
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Week 1 Updated" {
		t.Fatalf("name = %q", updated.Name)
	}

	if err := s.DeleteMealPlan(u.ID, mp.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestDayPlanEntryCRUD(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")
	mp, _ := s.CreateMealPlan(u.ID, &CreateMealPlanRequest{Name: "W1", WeekStart: "2025-01-13"})

	entry, err := s.CreateDayPlanEntry(mp.ID, &CreateDayPlanEntryRequest{
		Date:       "2025-01-13",
		Slot:       "breakfast",
		SourceType: "recipe",
		Position:   1,
		FoodName:   strPtr("Toast"),
	})
	if err != nil {
		t.Fatalf("create entry: %v", err)
	}

	entries, err := s.ListDayPlanEntries(mp.ID)
	if err != nil {
		t.Fatalf("list entries: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("len = %d, want 1", len(entries))
	}

	updated, err := s.UpdateDayPlanEntry(entry.ID, &CreateDayPlanEntryRequest{
		Date:       "2025-01-13",
		Slot:       "breakfast",
		SourceType: "recipe",
		Position:   2,
		FoodName:   strPtr("Eggs"),
	})
	if err != nil {
		t.Fatalf("update entry: %v", err)
	}
	if updated.Position != 2 {
		t.Fatalf("position = %d, want 2", updated.Position)
	}

	if err := s.DeleteDayPlanEntry(entry.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestBookCRUD(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")

	book, err := s.CreateBook(u.ID, &CreateBookRequest{Title: "My Book", Description: "Desc", CoverColor: "#000"})
	if err != nil {
		t.Fatalf("create book: %v", err)
	}

	got, err := s.GetBook(u.ID, book.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Title != "My Book" {
		t.Fatalf("title = %q", got.Title)
	}

	books, err := s.ListBooks(u.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(books) != 1 {
		t.Fatalf("len = %d, want 1", len(books))
	}

	updated, err := s.UpdateBook(u.ID, book.ID, &CreateBookRequest{Title: "Updated Book", Description: "New", CoverColor: "#fff"})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Title != "Updated Book" {
		t.Fatalf("title = %q", updated.Title)
	}

	if err := s.DeleteBook(u.ID, book.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestChapterAndPages(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")
	book, _ := s.CreateBook(u.ID, &CreateBookRequest{Title: "B"})

	ch, err := s.CreateChapter(book.ID, &CreateChapterRequest{Title: "Chapter 1", Position: 1})
	if err != nil {
		t.Fatalf("create chapter: %v", err)
	}

	chapters, err := s.ListChapters(book.ID)
	if err != nil {
		t.Fatalf("list chapters: %v", err)
	}
	if len(chapters) != 1 {
		t.Fatalf("len = %d, want 1", len(chapters))
	}

	updated, err := s.UpdateChapter(ch.ID, &CreateChapterRequest{Title: "Chapter 1 Updated", Position: 1})
	if err != nil {
		t.Fatalf("update chapter: %v", err)
	}
	if updated.Title != "Chapter 1 Updated" {
		t.Fatalf("title = %q", updated.Title)
	}

	page, err := s.CreateChapterPage(ch.ID, "Page 1", "Content here", 1)
	if err != nil {
		t.Fatalf("create page: %v", err)
	}

	pages, err := s.ListChapterPages(ch.ID)
	if err != nil {
		t.Fatalf("list pages: %v", err)
	}
	if len(pages) != 1 {
		t.Fatalf("len = %d, want 1", len(pages))
	}

	updatedPage, err := s.UpdateChapterPage(page.ID, "Page 1 Updated", "New content", 1)
	if err != nil {
		t.Fatalf("update page: %v", err)
	}
	if updatedPage.Title != "Page 1 Updated" {
		t.Fatalf("title = %q", updatedPage.Title)
	}

	if err := s.DeleteChapterPage(page.ID); err != nil {
		t.Fatalf("delete page: %v", err)
	}
	if err := s.DeleteChapter(ch.ID); err != nil {
		t.Fatalf("delete chapter: %v", err)
	}
}

func TestCategoryCRUD(t *testing.T) {
	s := testStore(t)

	cat, err := s.CreateCategory(&CreateCategoryRequest{Name: "Desserts"})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}

	cats, err := s.ListCategories()
	if err != nil {
		t.Fatalf("list categories: %v", err)
	}
	if len(cats) < 1 {
		t.Fatalf("len = %d, want >= 1", len(cats))
	}

	updated, err := s.UpdateCategory(cat.ID, &CreateCategoryRequest{Name: "Desserts & Sweets"})
	if err != nil {
		t.Fatalf("update category: %v", err)
	}
	if updated.Name != "Desserts & Sweets" {
		t.Fatalf("name = %q", updated.Name)
	}

	if err := s.DeleteCategory(cat.ID); err != nil {
		t.Fatalf("delete category: %v", err)
	}
}

func TestRecipeCategoryAssociation(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")
	r, _ := s.CreateRecipe(u.ID, &CreateRecipeRequest{Name: "Cake", Servings: 1, ServingName: "slice"})
	cat, _ := s.CreateCategory(&CreateCategoryRequest{Name: "Baking"})

	rc, err := s.AddRecipeCategory(r.ID, cat.ID)
	if err != nil {
		t.Fatalf("add recipe category: %v", err)
	}
	if rc.RecipeID != r.ID || rc.CategoryID != cat.ID {
		t.Fatalf("rc = %+v", rc)
	}

	rcs, err := s.ListRecipeCategories(r.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rcs) != 1 {
		t.Fatalf("len = %d, want 1", len(rcs))
	}

	if err := s.RemoveRecipeCategory(r.ID, cat.ID); err != nil {
		t.Fatalf("remove: %v", err)
	}
	rcs, _ = s.ListRecipeCategories(r.ID)
	if len(rcs) != 0 {
		t.Fatalf("len = %d, want 0 after remove", len(rcs))
	}
}

func TestCustomFoodCRUD(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")

	cf, err := s.CreateCustomFood(u.ID, &CreateCustomFoodRequest{
		Name:     "My Granola",
		Calories: 200,
		Protein:  8,
	})
	if err != nil {
		t.Fatalf("create custom food: %v", err)
	}

	got, err := s.GetCustomFood(u.ID, cf.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "My Granola" {
		t.Fatalf("name = %q", got.Name)
	}

	foods, err := s.ListCustomFoods(u.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(foods) != 1 {
		t.Fatalf("len = %d, want 1", len(foods))
	}

	updated, err := s.UpdateCustomFood(u.ID, cf.ID, &CreateCustomFoodRequest{
		Name:     "My Granola Updated",
		Calories: 180,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Calories != 180 {
		t.Fatalf("calories = %f", updated.Calories)
	}

	if err := s.DeleteCustomFood(u.ID, cf.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestCustomFoodSharing(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")

	cf, _ := s.CreateCustomFood(u.ID, &CreateCustomFoodRequest{Name: "Shared Granola", Calories: 200})

	if err := s.ShareCustomFood(u.ID, cf.ID); err != nil {
		t.Fatalf("share: %v", err)
	}

	shared, total, err := s.ListSharedCustomFoods(1, 10)
	if err != nil {
		t.Fatalf("list shared: %v", err)
	}
	if total != 1 {
		t.Fatalf("total = %d, want 1", total)
	}
	if len(shared) != 1 {
		t.Fatalf("len = %d, want 1", len(shared))
	}
	if shared[0].Name != "Shared Granola" {
		t.Fatalf("name = %q", shared[0].Name)
	}
}

func TestGroceryChecklist(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "1")

	got, err := s.GetGroceryChecklist(u.ID, "2025-01-13")
	if err != nil {
		t.Fatalf("get non-existent: %v", err)
	}
	if got != nil {
		t.Fatal("expected nil for non-existent checklist")
	}

	upserted, err := s.UpsertGroceryChecklist(u.ID, &GroceryChecklist{
		WeekStart:    "2025-01-13",
		CheckedItems: `{"milk":true}`,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if upserted.CheckedItems != `{"milk":true}` {
		t.Fatalf("checked = %q", upserted.CheckedItems)
	}

	upserted2, err := s.UpsertGroceryChecklist(u.ID, &GroceryChecklist{
		WeekStart:    "2025-01-13",
		CheckedItems: `{"milk":true,"eggs":true}`,
	})
	if err != nil {
		t.Fatalf("upsert2: %v", err)
	}
	if upserted2.CheckedItems != `{"milk":true,"eggs":true}` {
		t.Fatalf("checked = %q", upserted2.CheckedItems)
	}
}

func TestFoodItemSearch(t *testing.T) {
	s := testStore(t)

	food := &FoodItem{FdcID: 12345, Description: "Apple, Raw", DataType: "SR Legacy", ServingSize: 100, ServingSizeUnit: "g", Source: "usda"}
	created, err := s.CreateFoodItem(food)
	if err != nil {
		t.Fatalf("create food: %v", err)
	}
	if created.ID == 0 {
		t.Fatal("expected non-zero ID")
	}

	results, total, err := s.SearchFoods("Apple", 1, 10)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if total < 1 {
		t.Fatalf("total = %d, want >= 1", total)
	}
	if len(results) < 1 {
		t.Fatalf("results = %d, want >= 1", len(results))
	}

	got, err := s.GetFoodByFdcID(12345)
	if err != nil {
		t.Fatalf("get by fdc: %v", err)
	}
	if got == nil || got.Description != "Apple, Raw" {
		t.Fatalf("got = %+v", got)
	}
}

func TestFoodItemUPC(t *testing.T) {
	s := testStore(t)

	upc := "04163100067"
	_, err := s.CreateFoodItem(&FoodItem{
		FdcID: 99999, Description: "Test Product", DataType: "Branded",
		GtinUpc: &upc, ServingSize: 1, ServingSizeUnit: "cup", Source: "usda",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := s.GetFoodByGtinUpc(upc)
	if err != nil {
		t.Fatalf("get by upc: %v", err)
	}
	if got == nil {
		t.Fatal("expected food item")
	}
	if got.FdcID != 99999 {
		t.Fatalf("fdcID = %d, want 99999", got.FdcID)
	}

	got, err = s.GetFoodByGtinUpc("00000000000")
	if err != nil {
		t.Fatalf("get by bad upc: %v", err)
	}
	if got != nil {
		t.Fatal("expected nil for unknown UPC")
	}
}

func strPtr(s string) *string { return &s }
func intPtr(i int) *int       { return &i }
