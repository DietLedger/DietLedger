package main

type Store interface {
	Close() error

	// Users & Auth
	CreateUser(email, password, displayName string) (*User, error)
	GetUserByAPIKey(apiKey string) (*User, error)
	GetUserByID(id string) (*User, error)
	GetUserByEmail(email string) (*User, error)
	UpdateUserLastLogin(id string) error

	// Recipes
	ListRecipes(userID string, page, perPage int) ([]Recipe, int, error)
	GetRecipe(userID, id string) (*Recipe, error)
	CreateRecipe(userID string, r *CreateRecipeRequest) (*Recipe, error)
	UpdateRecipe(userID, id string, r *UpdateRecipeRequest) (*Recipe, error)
	DeleteRecipe(userID, id string) error

	// Ingredients
	CreateIngredient(recipeID string, ing *CreateIngredientReq) (*Ingredient, error)
	UpdateIngredient(id string, ing *CreateIngredientReq) (*Ingredient, error)
	DeleteIngredient(id string) error
	ReplaceIngredients(recipeID string, ingredients []CreateIngredientReq) error

	// Food Items (USDA — shared, read-only for users)
	SearchFoods(query string, page, perPage int) ([]FoodItem, int, error)
	GetFoodByFdcID(fdcID int) (*FoodItem, error)
	GetFoodByGtinUpc(gtinUpc string) (*FoodItem, error)
	CreateFoodItem(f *FoodItem) (*FoodItem, error)
	ListSeedJobs() ([]SeedJob, error)
	CreateSeedJob(dataType, releaseDate, fileName string) (*SeedJob, error)
	UpdateSeedJob(id int, status string, recordCount int, progress float64, errorMsg string) error
	GetFoodStats() (*FoodStats, error)
	DeleteAllFoods() error
	CreateFoodItems(items []FoodItem) (int, error)

	// Nutrition profiles
	ListProfiles(userID string) ([]PersonProfile, error)
	GetProfile(userID, id string) (*PersonProfile, error)
	CreateProfile(userID string, p *CreateProfileRequest) (*PersonProfile, error)
	UpdateProfile(userID, id string, p *CreateProfileRequest) (*PersonProfile, error)
	DeleteProfile(userID, id string) error

	// Food log entries
	ListFoodLogEntries(profileID, date string) ([]FoodLogEntry, error)
	ListFoodLogEntriesByDateRange(profileID, startDate, endDate string) ([]FoodLogEntry, error)
	CreateFoodLogEntry(userID, profileID string, e *CreateFoodLogRequest) (*FoodLogEntry, error)
	UpdateFoodLogEntry(id string, e *CreateFoodLogRequest) (*FoodLogEntry, error)
	DeleteFoodLogEntry(id string) error

	// Weight entries
	ListWeightEntries(profileID, fromDate, toDate string) ([]WeightEntry, error)
	CreateWeightEntry(userID, profileID string, e *CreateWeightEntryRequest) (*WeightEntry, error)
	UpdateWeightEntry(id string, e *CreateWeightEntryRequest) (*WeightEntry, error)
	DeleteWeightEntry(id string) error

	// Meal plans
	ListMealPlans(userID string) ([]MealPlan, error)
	GetMealPlan(userID, id string) (*MealPlan, error)
	GetMealPlanByWeekStart(userID, weekStart string) (*MealPlan, error)
	CreateMealPlan(userID string, m *CreateMealPlanRequest) (*MealPlan, error)
	UpdateMealPlan(userID, id string, m *CreateMealPlanRequest) (*MealPlan, error)
	DeleteMealPlan(userID, id string) error

	// Day plan entries
	ListDayPlanEntries(mealPlanID string) ([]DayPlanEntry, error)
	CreateDayPlanEntry(mealPlanID string, e *CreateDayPlanEntryRequest) (*DayPlanEntry, error)
	UpdateDayPlanEntry(id string, e *CreateDayPlanEntryRequest) (*DayPlanEntry, error)
	DeleteDayPlanEntry(id string) error

	// Meal groups
	ListMealGroups(mealPlanID string) ([]MealGroup, error)
	CreateMealGroup(mealPlanID, name, date, slot string, position int) (*MealGroup, error)
	DeleteMealGroup(id string) error

	// Recipe books
	ListBooks(userID string) ([]RecipeBook, error)
	GetBook(userID, id string) (*RecipeBook, error)
	CreateBook(userID string, b *CreateBookRequest) (*RecipeBook, error)
	UpdateBook(userID, id string, b *CreateBookRequest) (*RecipeBook, error)
	DeleteBook(userID, id string) error

	// Chapters
	ListChapters(bookID string) ([]Chapter, error)
	CreateChapter(bookID string, c *CreateChapterRequest) (*Chapter, error)
	UpdateChapter(id string, c *CreateChapterRequest) (*Chapter, error)
	DeleteChapter(id string) error
	ReorderChapters(bookID string, chapterIDs []string) error

	// Chapter recipes
	ListChapterRecipes(chapterID string) ([]ChapterRecipe, error)
	AddChapterRecipe(chapterID, recipeID string, position int) (*ChapterRecipe, error)
	RemoveChapterRecipe(chapterID, recipeID string) error

	// Chapter pages
	ListChapterPages(chapterID string) ([]ChapterPage, error)
	CreateChapterPage(chapterID, title, content string, position int) (*ChapterPage, error)
	UpdateChapterPage(id, title, content string, position int) (*ChapterPage, error)
	DeleteChapterPage(id string) error

	// Categories
	ListCategories() ([]Category, error)
	CreateCategory(c *CreateCategoryRequest) (*Category, error)
	UpdateCategory(id string, c *CreateCategoryRequest) (*Category, error)
	DeleteCategory(id string) error

	// Recipe categories
	ListRecipeCategories(recipeID string) ([]RecipeCategory, error)
	AddRecipeCategory(recipeID, categoryID string) (*RecipeCategory, error)
	RemoveRecipeCategory(recipeID, categoryID string) error

	// Custom foods
	ListCustomFoods(userID string) ([]CustomFood, error)
	GetCustomFood(userID, id string) (*CustomFood, error)
	CreateCustomFood(userID string, f *CreateCustomFoodRequest) (*CustomFood, error)
	UpdateCustomFood(userID, id string, f *CreateCustomFoodRequest) (*CustomFood, error)
	DeleteCustomFood(userID, id string) error
	ShareCustomFood(userID, id string) error
	ListSharedCustomFoods(page, perPage int) ([]CustomFood, int, error)

	// Grocery checklists
	GetGroceryChecklist(userID, weekStart string) (*GroceryChecklist, error)
	UpsertGroceryChecklist(userID string, g *GroceryChecklist) (*GroceryChecklist, error)

	// Book pages
	ListBookPages(bookID string) ([]BookPage, error)
	CreateBookPage(bookID, title, content string, position int) (*BookPage, error)
	UpdateBookPage(id, title, content string, position int) (*BookPage, error)
	DeleteBookPage(id string) error

	// API keys
	ListAPIKeys(userID string) ([]ApiKey, error)
	CreateAPIKey(userID, name, permissions string) (*ApiKey, string, error)
	DeleteAPIKey(userID, id string) error

	// Sharing (existing)
	CreateSharedRecipe(userID, recipeID, title, description, category, tags, recipeData string, isPublic bool) (*SharedRecipe, error)
	GetSharedRecipeByToken(shareToken string) (*SharedRecipe, error)
	GetSharedRecipesByUser(userID string) ([]SharedRecipe, error)
	SetSharedRecipePublic(id string, isPublic bool) error
	DeleteSharedRecipe(id string) error
	IncrementSharedRecipeViews(id string) error
	IncrementSharedRecipeImports(id string) error
	SearchCommunityRecipes(query, category, sort string, page, perPage int) ([]SharedRecipe, error)
	GetCommunityCategories() ([]CommunityCategory, error)
	UpsertRecipeRating(recipeID, userID string, rating int) error
	SeedCategories() error
}
