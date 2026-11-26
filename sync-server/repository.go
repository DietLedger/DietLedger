package main

import (
	"context"
	"time"
)

type Store interface {
	WithOwnedBook(userID, bookID string, fn func(Store) error) error
	WithOwnedChapter(userID, chapterID, expectedBookID string, fn func(Store) error) error
	WithOwnedChapterPage(userID, pageID, expectedChapterID string, fn func(Store) error) error
	WithOwnedBookPage(userID, pageID string, fn func(Store) error) error
	WithOwnedChapterRecipe(userID, joinID string, fn func(Store) error) error
	Close() error

	// Users & Auth
	CreateUser(email, password, displayName string, setupClaim ...string) (*User, error)
	CreateSession(userID, sessionID, refreshHash string) (time.Time, error)
	RotateSession(refreshHash, nextHash string) (string, string, time.Time, error)
	SessionActive(sessionID, userID string) (bool, error)
	RevokeSession(refreshHash string) error
	LookupPersonalKey(ctx context.Context, digest [32]byte) (*personalKeyDiscovery, error)
	CreatePersonalKey(ctx context.Context, owner, name string, scopes []string, digest [32]byte) (*personalKeyMetadata, error)
	ListPersonalKeys(ctx context.Context, owner string) ([]personalKeyMetadata, error)
	DeletePersonalKey(ctx context.Context, owner, id string) (bool, error)
	GetUserByID(id string) (*User, error)
	GetUserByEmail(email string) (*User, error)
	UpdateUserLastLogin(id string) error
	UserCount() (int, error)
	ListUsers() ([]UserListEntry, error)
	SetUserAdmin(userID string, isAdmin bool) error
	AdminCount() (int, error)
	DeleteAccount(userID string, successorID ...string) error
	DeleteUserData(userID string) error
	SeedGlobalStaples() error

	// Instance metadata (single-row, instance-wide)
	GetInstanceState() (*InstanceState, error)
	CompleteOnboarding(version int) error
	SetRegistrationEnabled(enabled bool) error
	ResetUserData() error
	FactoryReset() error

	// Recipes
	ListRecipes(userID string, page, perPage int) ([]Recipe, int, error)
	GetRecipe(userID, id string) (*Recipe, error)
	CreateRecipe(userID string, r *CreateRecipeRequest) (*Recipe, error)
	UpdateRecipe(userID, id string, r *UpdateRecipeRequest) (*Recipe, error)
	DeleteRecipe(userID, id string) error

	// Ingredients
	CreateIngredient(recipeID string, ing *CreateIngredientReq) (*Ingredient, error)
	UpdateIngredient(userID, recipeID, id string, ing *CreateIngredientReq) (*Ingredient, error)
	DeleteIngredient(userID, recipeID, id string) error
	ListFoodStorageDefaults(userID string) ([]FoodStorageDefault, error)
	UpsertFoodStorageDefault(userID, sourceType, sourceKey, location string) (*FoodStorageDefault, error)
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
	ListFoodLogEntries(profileID, date string, owners ...string) ([]FoodLogEntry, error)
	ListFoodLogEntriesByDateRange(profileID, startDate, endDate string, owners ...string) ([]FoodLogEntry, error)
	CreateFoodLogEntry(userID, profileID string, e *CreateFoodLogRequest) (*FoodLogEntry, error)
	OwnsFoodLogEntry(userID, profileID, id string) (bool, error)
	UpdateFoodLogEntry(id string, e *CreateFoodLogRequest, scope ...foodLogOwner) (*FoodLogEntry, error)
	DeleteFoodLogEntry(id string, scope ...foodLogOwner) error

	// Weight entries
	ListWeightEntries(userID, profileID, fromDate, toDate string) ([]WeightEntry, error)
	CreateWeightEntry(userID, profileID string, e *CreateWeightEntryRequest) (*WeightEntry, error)
	UpdateWeightEntry(userID, profileID, id string, e *CreateWeightEntryRequest) (*WeightEntry, error)
	DeleteWeightEntry(userID, profileID, id string) error

	// Meal plans
	ListMealPlans(userID string) ([]MealPlan, error)
	GetMealPlan(userID, id string) (*MealPlan, error)
	GetMealPlanByWeekStart(userID, weekStart string) (*MealPlan, error)
	CreateMealPlan(userID string, m *CreateMealPlanRequest) (*MealPlan, error)
	UpdateMealPlan(userID, id string, m *CreateMealPlanRequest) (*MealPlan, error)
	DeleteMealPlan(userID, id string) error

	// Day plan entries
	ListDayPlanEntries(userID, mealPlanID string) ([]DayPlanEntry, error)
	GetDayPlanEntryByID(userID, mealPlanID, id string) (*DayPlanEntry, error)
	CreateDayPlanEntry(userID, mealPlanID string, e *CreateDayPlanEntryRequest) (*DayPlanEntry, error)
	UpdateDayPlanEntry(userID, mealPlanID, id string, e *CreateDayPlanEntryRequest) (*DayPlanEntry, error)
	DeleteDayPlanEntry(userID, mealPlanID, id string) error

	// Meal groups
	ListMealGroups(userID, mealPlanID string) ([]MealGroup, error)
	CreateMealGroup(userID, mealPlanID, name, date, slot string, position int) (*MealGroup, error)
	DeleteMealGroup(userID, mealPlanID, id string) error

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
	RecipeCategoriesByCategory(categoryID, userID string) ([]RecipeCategory, error)

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

	// Book/chapter ordering & moves (the book level interleaves chapters and
	// book pages by position; a chapter interleaves recipes and pages).
	ReorderBookLevelItems(bookID string, items []BookLevelItem) error
	ReorderChapterItems(chapterID string, items []ChapterItem) error
	MoveRecipeBetweenChapters(chapterRecipeID, targetChapterID string, position int) error
	MovePageBetweenChapters(pageID, targetChapterID string, position int) error
	ConvertChapterPageToBookPage(pageID, bookID string, position int) (*BookPage, error)
	ConvertBookPageToChapterPage(pageID, chapterID string, position int) (*ChapterPage, error)

	// API keys
	ListAPIKeys(userID string) ([]ApiKey, error)
	CreateAPIKey(userID, name, permissions string) (*ApiKey, string, error)
	DeleteAPIKey(userID, id string) error

	// Sharing (existing)
	CreateSharedRecipe(userID, recipeID, title, description, category, tags, recipeData, visibility string) (*SharedRecipe, error)
	GetSharedRecipeByToken(shareToken string) (*SharedRecipe, error)
	GetSharedRecipesByUser(userID string) ([]SharedRecipe, error)
	SetSharedRecipeVisibility(userID, id string, visibility string) error
	DeleteSharedRecipe(userID, id string) error
	IncrementSharedRecipeViews(id string) error
	IncrementSharedRecipeImports(id string) error
	SearchCommunityRecipes(query, category, sort string, authenticated bool, page, perPage int) ([]SharedRecipe, error)
	GetCommunityCategories() ([]CommunityCategory, error)
	UpsertRecipeRating(recipeID, userID string, rating int) error
	SeedCategories() error

	// User settings
	GetSettings(userID string) (*UserSettings, error)
	UpsertSettings(userID string, settingsJSON string) (*UserSettings, error)

	// Templates
	ListTemplates(userID string) ([]Template, error)
	ListTemplatesByType(userID, tmplType string) ([]Template, error)
	GetTemplate(userID, id string) (*Template, error)
	CreateTemplate(userID string, req *CreateTemplateRequest) (*Template, error)
	UpdateTemplate(userID, id string, req *UpdateTemplateRequest) (*Template, error)
	DeleteTemplate(userID, id string) error

	// Dietary profiles
	ListDietaryProfiles(userID string) ([]DietaryProfile, error)
	RestoreDiabetesAwareProfile(userID string) (*DietaryProfile, error)
	GetDietaryProfile(userID, id string) (*DietaryProfile, error)
	CreateDietaryProfile(userID string, req *CreateDietaryProfileRequest) (*DietaryProfile, error)
	UpdateDietaryProfile(userID, id string, req *UpdateDietaryProfileRequest) (*DietaryProfile, error)
	DeleteDietaryProfile(userID, id string) error

	// Allergen rules
	ListAllergenRules(userID, profileID string) ([]AllergenRule, error)
	CreateAllergenRule(userID, profileID string, req *CreateAllergenRuleRequest) (*AllergenRule, error)
	UpdateAllergenRule(userID, profileID, id string, req *UpdateAllergenRuleRequest) (*AllergenRule, error)
	DeleteAllergenRule(userID, profileID, id string) error

	// Brand kits
	ListBrandKits(userID string) ([]BrandKit, error)
	GetBrandKit(userID, id string) (*BrandKit, error)
	CreateBrandKit(userID string, req *CreateBrandKitRequest) (*BrandKit, error)
	UpdateBrandKit(userID, id string, req *UpdateBrandKitRequest) (*BrandKit, error)
	DeleteBrandKit(userID, id string) error

	// Pantry staples
	ListPantryStaples(userID string) ([]PantryStaple, error)
	AddPantryStaple(userID, name string) (*PantryStaple, error)
	RemovePantryStaple(userID, name string) error

	// Recipe completions (Phase P1)
	ListRecipeCompletions(userID string) ([]RecipeCompletion, error)
	UpsertRecipeCompletion(userID, recipeID, date string) error
	DeleteRecipeCompletion(userID, recipeID string) error

	// User location
	GetLocation(userID string) (*UserLocation, error)
	UpsertLocation(userID string, req *UpdateLocationRequest) (*UserLocation, error)

	// Seasonal foods
	GetSeasonalFoods(country, region string, month int) ([]string, error)
	SetSeasonalFoods(country, region string, month int, foods string) error

	// User secrets
	ListSecrets(userID string) ([]UserSecret, error)
	CreateSecret(userID string, req *CreateSecretRequest, encryptedValue []byte) (*UserSecret, error)
	GetSecret(userID, keyName string) ([]byte, error)
	DeleteSecret(userID, id string) error
}
