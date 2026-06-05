import type {
  RecipeRecord,
  IngredientRecord,
  IngredientGroup,
  BookRecord,
  ChapterRecord,
  ChapterRecipeRecord,
  ChapterPageRecord,
  BookPageRecord,
  CategoryRecord,
  RecipeCategoryRecord,
  MealPlanRecord,
  DayPlanEntryRecord,
  MealGroupRecord,
  GroceryChecklistRecord,
  NutritionProfileRecord,
  FoodLogEntryRecord,
  WeightEntryRecord,
  CustomFoodRecord,
  TemplateRecord,
  DietaryProfileRecord,
  AllergenRuleRecord,
} from './types';

export type {
  RecipeRecord,
  IngredientRecord,
  IngredientGroup,
  BookRecord,
  ChapterRecord,
  ChapterRecipeRecord,
  ChapterPageRecord,
  BookPageRecord,
  CategoryRecord,
  RecipeCategoryRecord,
  MealPlanRecord,
  DayPlanEntryRecord,
  MealGroupRecord,
  GroceryChecklistRecord,
  NutritionProfileRecord,
  FoodLogEntryRecord,
  WeightEntryRecord,
  CustomFoodRecord,
  TemplateRecord,
  DietaryProfileRecord,
  AllergenRuleRecord,
} from './types';

export interface FDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  gtinUpc?: string;
  servingSize: number;
  servingSizeUnit: string;
  calories: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  totalCarbs: number;
  dietaryFiber: number;
  totalSugars: number;
  addedSugars: number;
  protein: number;
  vitaminD: number;
  calcium: number;
  iron: number;
  potassium: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; displayName: string };
}

export interface ApiClient {
  // Auth
  register(email: string, password: string, displayName: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
  refreshToken(token: string): Promise<AuthResult>;

  // Recipes
  getRecipes(page?: number, perPage?: number): Promise<PaginatedResult<RecipeRecord>>;
  getRecipe(id: string): Promise<RecipeRecord | null>;
  createRecipe(name: string): Promise<RecipeRecord>;
  updateRecipe(
    id: string,
    data: Partial<
      Pick<
        RecipeRecord,
        'name' | 'servings' | 'servingName' | 'instructions' | 'leftoverStorage' | 'ingredients' | 'ingredientGroups'
      >
    >
  ): Promise<RecipeRecord>;
  deleteRecipe(id: string): Promise<void>;

  // Ingredients
  addIngredient(
    recipeId: string,
    ingredient: Omit<IngredientRecord, 'id' | 'recipeId'>
  ): Promise<IngredientRecord>;
  updateIngredient(
    recipeId: string,
    ingredientId: string,
    data: Partial<Omit<IngredientRecord, 'id' | 'recipeId'>>
  ): Promise<IngredientRecord>;
  removeIngredient(recipeId: string, ingredientId: string): Promise<void>;

  // Books
  getBooks(): Promise<BookRecord[]>;
  getBook(id: string): Promise<BookRecord | null>;
  createBook(title: string, description?: string, coverColor?: string): Promise<BookRecord>;
  updateBook(id: string, data: Partial<Pick<BookRecord, 'title' | 'description' | 'coverColor'>>): Promise<BookRecord>;
  deleteBook(id: string): Promise<void>;

  // Chapters
  getChaptersByBook(bookId: string): Promise<ChapterRecord[]>;
  createChapter(bookId: string, title: string): Promise<ChapterRecord>;
  updateChapter(
    id: string,
    data: Partial<Pick<ChapterRecord, 'title' | 'position' | 'pageTemplateId' | 'recipeTemplateId'>>
  ): Promise<ChapterRecord>;
  deleteChapter(id: string): Promise<void>;
  reorderChapters(bookId: string, chapterIds: string[]): Promise<void>;

  // Chapter Recipes
  getChapterRecipes(chapterId: string): Promise<ChapterRecipeRecord[]>;
  addRecipeToChapter(chapterId: string, recipeId: string): Promise<ChapterRecipeRecord>;
  removeRecipeFromChapter(chapterId: string, recipeId: string): Promise<void>;

  // Chapter Pages
  getChapterPages(chapterId: string): Promise<ChapterPageRecord[]>;
  createChapterPage(chapterId: string, title: string, content: string): Promise<ChapterPageRecord>;
  updateChapterPage(
    id: string,
    data: Partial<Pick<ChapterPageRecord, 'title' | 'content' | 'position'>>
  ): Promise<ChapterPageRecord>;
  deleteChapterPage(id: string): Promise<void>;

  // Book Pages
  getBookPages(bookId: string): Promise<BookPageRecord[]>;
  createBookPage(bookId: string, title: string, content: string): Promise<BookPageRecord>;
  updateBookPage(id: string, data: Partial<Pick<BookPageRecord, 'title' | 'content' | 'position'>>): Promise<BookPageRecord>;
  deleteBookPage(id: string): Promise<void>;

  // Categories
  getCategories(): Promise<CategoryRecord[]>;
  createCategory(name: string, parentId?: string | null): Promise<CategoryRecord>;
  updateCategory(id: string, data: Partial<Pick<CategoryRecord, 'name' | 'parentId'>>): Promise<CategoryRecord>;
  deleteCategory(id: string): Promise<void>;

  // Recipe Categories
  getRecipeCategories(recipeId: string): Promise<RecipeCategoryRecord[]>;
  addCategoryToRecipe(recipeId: string, categoryId: string): Promise<RecipeCategoryRecord>;
  removeCategoryFromRecipe(recipeId: string, categoryId: string): Promise<void>;
  getCategoryDescendants(categoryId: string): Promise<string[]>;
  getRecipesByCategory(categoryId: string): Promise<RecipeCategoryRecord[]>;

  // Meal Plans
  getMealPlans(): Promise<MealPlanRecord[]>;
  getMealPlanByWeekStart(weekStart: string): Promise<MealPlanRecord | null>;
  createMealPlan(name: string, weekStart: string): Promise<MealPlanRecord>;
  updateMealPlan(
    id: string,
    data: Partial<Pick<MealPlanRecord, 'name'>>
  ): Promise<MealPlanRecord>;
  deleteMealPlan(id: string): Promise<void>;

  // Day Plan Entries
  getDayEntriesByMealPlanId(mealPlanId: string): Promise<DayPlanEntryRecord[]>;
  createDayPlanEntry(
    mealPlanId: string,
    date: string,
    slot: string,
    recipeId: string | null,
    position: number,
    options?: Partial<Omit<DayPlanEntryRecord, 'id' | 'mealPlanId' | 'date' | 'slot' | 'recipeId' | 'position'>>
  ): Promise<DayPlanEntryRecord>;
  updateDayPlanEntry(
    id: string,
    data: Partial<Omit<DayPlanEntryRecord, 'id' | 'mealPlanId'>>
  ): Promise<DayPlanEntryRecord>;
  deleteDayPlanEntry(id: string): Promise<void>;

  // Meal Groups
  getMealGroupsByMealPlanId(mealPlanId: string): Promise<MealGroupRecord[]>;
  createMealGroup(
    mealPlanId: string,
    date: string,
    slot: string,
    name: string,
    position: number
  ): Promise<MealGroupRecord>;
  deleteMealGroup(id: string): Promise<void>;

  // Grocery Checklists
  getGroceryChecklist(weekStart: string): Promise<GroceryChecklistRecord | null>;
  upsertGroceryChecklist(record: GroceryChecklistRecord): Promise<GroceryChecklistRecord>;

  // Nutrition Profiles
  getNutritionProfiles(): Promise<NutritionProfileRecord[]>;
  getNutritionProfile(id: string): Promise<NutritionProfileRecord | null>;
  createNutritionProfile(
    data: Omit<NutritionProfileRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NutritionProfileRecord>;
  updateNutritionProfile(
    id: string,
    data: Partial<Omit<NutritionProfileRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<NutritionProfileRecord>;
  deleteNutritionProfile(id: string): Promise<void>;

  // Food Log
  getFoodLogByProfileAndDate(profileId: string, date: string): Promise<FoodLogEntryRecord[]>;
  getFoodLogByProfileAndDateRange(profileId: string, startDate: string, endDate: string): Promise<FoodLogEntryRecord[]>;
  createFoodLogEntry(
    data: Omit<FoodLogEntryRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<FoodLogEntryRecord>;
  updateFoodLogEntry(
    id: string,
    data: Partial<Omit<FoodLogEntryRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<FoodLogEntryRecord>;
  deleteFoodLogEntry(id: string): Promise<void>;

  // Weight Entries
  getWeightByProfile(profileId: string): Promise<WeightEntryRecord[]>;
  createWeightEntry(
    data: Omit<WeightEntryRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WeightEntryRecord>;
  updateWeightEntry(
    id: string,
    data: Partial<Omit<WeightEntryRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<WeightEntryRecord>;
  deleteWeightEntry(id: string): Promise<void>;

  // Custom Foods
  getCustomFoods(): Promise<CustomFoodRecord[]>;
  createCustomFood(
    food: Omit<CustomFoodRecord, 'id' | 'createdAt' | 'sharedWithCommunity'>
  ): Promise<CustomFoodRecord>;
  updateCustomFood(
    id: string,
    data: Partial<Omit<CustomFoodRecord, 'id' | 'createdAt'>>
  ): Promise<CustomFoodRecord>;
  deleteCustomFood(id: string): Promise<void>;
  shareCustomFood(id: string): Promise<void>;
  getCommunityFoods(page?: number, perPage?: number): Promise<PaginatedResult<CustomFoodRecord>>;

  // Food Search
  searchFoods(query: string, page?: number, perPage?: number): Promise<PaginatedResult<FDAFood>>;
  getFoodByFdcId(fdcId: number): Promise<FDAFood | null>;
  getFoodByUPC(upc: string): Promise<FDAFood | null>;

  // Templates (server-persisted)
  getTemplates(): Promise<TemplateRecord[]>;
  getTemplatesByType(type: TemplateRecord['type']): Promise<TemplateRecord[]>;
  getTemplate(id: string): Promise<TemplateRecord | null>;
  createTemplate(data: Omit<TemplateRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<TemplateRecord>;
  updateTemplate(id: string, data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>>): Promise<TemplateRecord>;
  deleteTemplate(id: string): Promise<void>;

  // Dietary Profiles (server-persisted)
  getDietaryProfiles(): Promise<DietaryProfileRecord[]>;
  createDietaryProfile(data: Omit<DietaryProfileRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<DietaryProfileRecord>;
  updateDietaryProfile(id: string, data: Partial<Omit<DietaryProfileRecord, 'id' | 'createdAt'>>): Promise<DietaryProfileRecord>;
  deleteDietaryProfile(id: string): Promise<void>;
  getAllergenRulesByProfile(profileId: string): Promise<AllergenRuleRecord[]>;
  createAllergenRule(data: Omit<AllergenRuleRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AllergenRuleRecord>;
  updateAllergenRule(id: string, data: Partial<Omit<AllergenRuleRecord, 'id' | 'createdAt'>>): Promise<AllergenRuleRecord>;
  deleteAllergenRule(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<Record<string, unknown>>;
  updateSettings(settings: Record<string, unknown>): Promise<void>;

  // Brand Kits
  getBrandKits(): Promise<import('./types').BrandKit[]>;
  getBrandKit(id: string): Promise<import('./types').BrandKit | null>;
  createBrandKit(data: Omit<import('./types').BrandKit, 'id' | 'createdAt' | 'updatedAt'>): Promise<import('./types').BrandKit>;
  updateBrandKit(id: string, data: Partial<Omit<import('./types').BrandKit, 'id' | 'createdAt'>>): Promise<import('./types').BrandKit>;
  deleteBrandKit(id: string): Promise<void>;

  // Pantry Staples
  getPantryStaples(): Promise<string[]>;
  addPantryStaple(name: string): Promise<void>;
  removePantryStaple(name: string): Promise<void>;

  // User Location
  getLocation(): Promise<{ country: string; region: string } | null>;
  updateLocation(country: string, region: string): Promise<void>;

  // Seasonal Foods
  getSeasonalFoods(country: string, region: string, month: number): Promise<string[]>;

  // User Secrets
  getSecrets(): Promise<{ id: string; keyName: string }[]>;
  createSecret(keyName: string, value: string): Promise<{ id: string; keyName: string }>;
  getSecretValue(id: string): Promise<string>;
  deleteSecret(id: string): Promise<void>;
}

import { GoApiClient } from './api-client-go';

let _client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (_client) return _client;

  _client = new GoApiClient('');

  return _client!;
}

export function resetApiClient(): void {
  _client = null;
}

export function setApiClient(client: ApiClient): void {
  _client = client;
}
