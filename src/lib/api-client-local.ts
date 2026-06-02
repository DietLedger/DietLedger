import * as storage from './storage';
import { generateUUID } from './utils';
import type {
  ApiClient,
  AuthResult,
  RecipeRecord,
  IngredientRecord,
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
  FDAFood,
  PaginatedResult,
  TemplateRecord,
  DietaryProfileRecord,
  AllergenRuleRecord,
} from './api-client';

export class LocalApiClient implements ApiClient {
  // ── Auth (no-op in local mode) ───────────────────────────────────

  async register(_email: string, _password: string, _displayName: string): Promise<AuthResult> {
    throw new Error('Auth not available in local mode');
  }

  async login(_email: string, _password: string): Promise<AuthResult> {
    throw new Error('Auth not available in local mode');
  }

  async refreshToken(_token: string): Promise<AuthResult> {
    throw new Error('Auth not available in local mode');
  }

  // ── Recipes ──────────────────────────────────────────────────────

  async getRecipes(page = 1, perPage = 20): Promise<PaginatedResult<RecipeRecord>> {
    const all = await storage.getAllRecipes();
    const total = all.length;
    const start = (page - 1) * perPage;
    const data = all.slice(start, start + perPage);
    const totalPages = Math.ceil(total / perPage);
    return { data, total, page, perPage, totalPages };
  }

  async getRecipe(id: string): Promise<RecipeRecord | null> {
    return (await storage.getRecipe(id)) ?? null;
  }

  async createRecipe(name: string): Promise<RecipeRecord> {
    return storage.createRecipe(name);
  }

  async updateRecipe(
    id: string,
    data: Partial<
      Pick<
        RecipeRecord,
        'name' | 'servings' | 'servingName' | 'instructions' | 'leftoverStorage' | 'ingredients' | 'ingredientGroups'
      >
    >
  ): Promise<RecipeRecord> {
    return storage.updateRecipe(id, data as Parameters<typeof storage.updateRecipe>[1]);
  }

  async deleteRecipe(id: string): Promise<void> {
    return storage.deleteRecipe(id);
  }

  // ── Ingredients ──────────────────────────────────────────────────

  async addIngredient(
    recipeId: string,
    ingredient: Omit<IngredientRecord, 'id' | 'recipeId'>
  ): Promise<IngredientRecord> {
    return storage.addIngredient(recipeId, ingredient);
  }

  async updateIngredient(
    recipeId: string,
    ingredientId: string,
    data: Partial<Omit<IngredientRecord, 'id' | 'recipeId'>>
  ): Promise<IngredientRecord> {
    return storage.updateIngredient(recipeId, ingredientId, data);
  }

  async removeIngredient(recipeId: string, ingredientId: string): Promise<void> {
    return storage.removeIngredient(recipeId, ingredientId);
  }

  // ── Books ────────────────────────────────────────────────────────

  async getBooks(): Promise<BookRecord[]> {
    return storage.getAllBooks();
  }

  async getBook(id: string): Promise<BookRecord | null> {
    return (await storage.getBook(id)) ?? null;
  }

  async createBook(title: string, description?: string, coverColor?: string): Promise<BookRecord> {
    return storage.createBook(title, description, coverColor);
  }

  async updateBook(
    id: string,
    data: Partial<Pick<BookRecord, 'title' | 'description' | 'coverColor'>>
  ): Promise<BookRecord> {
    return storage.updateBook(id, data);
  }

  async deleteBook(id: string): Promise<void> {
    return storage.deleteBook(id);
  }

  // ── Chapters ─────────────────────────────────────────────────────

  async getChaptersByBook(bookId: string): Promise<ChapterRecord[]> {
    return storage.getChaptersByBook(bookId);
  }

  async createChapter(bookId: string, title: string): Promise<ChapterRecord> {
    return storage.createChapter(bookId, title);
  }

  async updateChapter(
    id: string,
    data: Partial<Pick<ChapterRecord, 'title' | 'position' | 'pageTemplateId' | 'recipeTemplateId'>>
  ): Promise<ChapterRecord> {
    return storage.updateChapter(id, data);
  }

  async deleteChapter(id: string): Promise<void> {
    return storage.deleteChapter(id);
  }

  async reorderChapters(bookId: string, chapterIds: string[]): Promise<void> {
    return storage.reorderChapters(bookId, chapterIds);
  }

  // ── Chapter Recipes ──────────────────────────────────────────────

  async getChapterRecipes(chapterId: string): Promise<ChapterRecipeRecord[]> {
    return storage.getChapterRecipes(chapterId);
  }

  async addRecipeToChapter(chapterId: string, recipeId: string): Promise<ChapterRecipeRecord> {
    return storage.addRecipeToChapter(chapterId, recipeId);
  }

  async removeRecipeFromChapter(chapterId: string, recipeId: string): Promise<void> {
    return storage.removeRecipeFromChapter(chapterId, recipeId);
  }

  // ── Chapter Pages ────────────────────────────────────────────────

  async getChapterPages(chapterId: string): Promise<ChapterPageRecord[]> {
    return storage.getChapterPages(chapterId);
  }

  async createChapterPage(chapterId: string, title: string, content: string): Promise<ChapterPageRecord> {
    return storage.createChapterPage(chapterId, title, content);
  }

  async updateChapterPage(
    id: string,
    data: Partial<Pick<ChapterPageRecord, 'title' | 'content' | 'position'>>
  ): Promise<ChapterPageRecord> {
    return storage.updateChapterPage(id, data);
  }

  async deleteChapterPage(id: string): Promise<void> {
    return storage.deleteChapterPage(id);
  }

  // ── Book Pages ───────────────────────────────────────────────────

  async getBookPages(bookId: string): Promise<BookPageRecord[]> {
    return storage.getBookPages(bookId);
  }

  async createBookPage(bookId: string, title: string, content: string): Promise<BookPageRecord> {
    return storage.createBookPage(bookId, title, content);
  }

  async updateBookPage(
    id: string,
    data: Partial<Pick<BookPageRecord, 'title' | 'content' | 'position'>>
  ): Promise<BookPageRecord> {
    return storage.updateBookPage(id, data);
  }

  async deleteBookPage(id: string): Promise<void> {
    return storage.deleteBookPage(id);
  }

  // ── Categories ───────────────────────────────────────────────────

  async getCategories(): Promise<CategoryRecord[]> {
    return storage.getAllCategories();
  }

  async createCategory(name: string, parentId?: string | null): Promise<CategoryRecord> {
    return storage.createCategory(name, parentId);
  }

  async updateCategory(
    id: string,
    data: Partial<Pick<CategoryRecord, 'name' | 'parentId'>>
  ): Promise<CategoryRecord> {
    return storage.updateCategory(id, data);
  }

  async deleteCategory(id: string): Promise<void> {
    return storage.deleteCategory(id);
  }

  // ── Recipe Categories ────────────────────────────────────────────

  async getRecipeCategories(recipeId: string): Promise<RecipeCategoryRecord[]> {
    return storage.getRecipeCategories(recipeId);
  }

  async addCategoryToRecipe(recipeId: string, categoryId: string): Promise<RecipeCategoryRecord> {
    return storage.addCategoryToRecipe(recipeId, categoryId);
  }

  async removeCategoryFromRecipe(recipeId: string, categoryId: string): Promise<void> {
    return storage.removeCategoryFromRecipe(recipeId, categoryId);
  }

  // ── Meal Plans ───────────────────────────────────────────────────

  async getMealPlans(): Promise<MealPlanRecord[]> {
    return storage.getAllMealPlans();
  }

  async getMealPlanByWeekStart(weekStart: string): Promise<MealPlanRecord | null> {
    return (await storage.getMealPlanByWeekStart(weekStart)) ?? null;
  }

  async createMealPlan(name: string, weekStart: string): Promise<MealPlanRecord> {
    return storage.createMealPlan(name, weekStart);
  }

  async updateMealPlan(
    id: string,
    data: Partial<Pick<MealPlanRecord, 'name'>>
  ): Promise<MealPlanRecord> {
    return storage.updateMealPlan(id, data);
  }

  async deleteMealPlan(id: string): Promise<void> {
    return storage.deleteMealPlan(id);
  }

  // ── Day Plan Entries ─────────────────────────────────────────────

  async getDayEntriesByMealPlanId(mealPlanId: string): Promise<DayPlanEntryRecord[]> {
    return storage.getDayEntriesByMealPlanId(mealPlanId);
  }

  async createDayPlanEntry(
    mealPlanId: string,
    date: string,
    slot: string,
    recipeId: string | null,
    position: number,
    options?: Partial<Omit<DayPlanEntryRecord, 'id' | 'mealPlanId' | 'date' | 'slot' | 'recipeId' | 'position'>>
  ): Promise<DayPlanEntryRecord> {
    return storage.createDayPlanEntry(mealPlanId, date, slot as any, recipeId, position, options as any);
  }

  async updateDayPlanEntry(
    id: string,
    data: Partial<Omit<DayPlanEntryRecord, 'id' | 'mealPlanId'>>
  ): Promise<DayPlanEntryRecord> {
    return storage.updateDayPlanEntry(id, data as any);
  }

  async deleteDayPlanEntry(id: string): Promise<void> {
    return storage.deleteDayPlanEntry(id);
  }

  // ── Meal Groups ──────────────────────────────────────────────────

  async getMealGroupsByMealPlanId(mealPlanId: string): Promise<MealGroupRecord[]> {
    return storage.getMealGroupsByMealPlanId(mealPlanId);
  }

  async createMealGroup(
    mealPlanId: string,
    date: string,
    slot: string,
    name: string,
    position: number
  ): Promise<MealGroupRecord> {
    return storage.createMealGroup(mealPlanId, date, slot as any, name, position);
  }

  async deleteMealGroup(id: string): Promise<void> {
    return storage.deleteMealGroup(id);
  }

  // ── Grocery Checklists ───────────────────────────────────────────

  async getGroceryChecklist(weekStart: string): Promise<GroceryChecklistRecord | null> {
    return (await storage.getGroceryChecklistByWeekStart(weekStart)) ?? null;
  }

  async upsertGroceryChecklist(record: GroceryChecklistRecord): Promise<GroceryChecklistRecord> {
    await storage.putGroceryChecklist(record);
    return record;
  }

  // ── Nutrition Profiles ───────────────────────────────────────────

  async getNutritionProfiles(): Promise<NutritionProfileRecord[]> {
    return storage.getAllNutritionProfiles();
  }

  async getNutritionProfile(id: string): Promise<NutritionProfileRecord | null> {
    return (await storage.getNutritionProfile(id)) ?? null;
  }

  async createNutritionProfile(
    data: Omit<NutritionProfileRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NutritionProfileRecord> {
    return storage.createNutritionProfile(data);
  }

  async updateNutritionProfile(
    id: string,
    data: Partial<Omit<NutritionProfileRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<NutritionProfileRecord> {
    return storage.updateNutritionProfile(id, data);
  }

  async deleteNutritionProfile(id: string): Promise<void> {
    return storage.deleteNutritionProfile(id);
  }

  // ── Food Log ─────────────────────────────────────────────────────

  async getFoodLogByProfileAndDate(profileId: string, date: string): Promise<FoodLogEntryRecord[]> {
    return storage.getFoodLogByProfileAndDate(profileId, date);
  }

  async getFoodLogByProfileAndDateRange(profileId: string, startDate: string, endDate: string): Promise<FoodLogEntryRecord[]> {
    return storage.getFoodLogByProfileAndDateRange(profileId, startDate, endDate);
  }

  async createFoodLogEntry(
    data: Omit<FoodLogEntryRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<FoodLogEntryRecord> {
    return storage.createFoodLogEntry(data);
  }

  async updateFoodLogEntry(
    id: string,
    data: Partial<Omit<FoodLogEntryRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<FoodLogEntryRecord> {
    return storage.updateFoodLogEntry(id, data);
  }

  async deleteFoodLogEntry(id: string): Promise<void> {
    return storage.deleteFoodLogEntry(id);
  }

  // ── Weight Entries ───────────────────────────────────────────────

  async getWeightByProfile(profileId: string): Promise<WeightEntryRecord[]> {
    return storage.getWeightByProfile(profileId);
  }

  async createWeightEntry(
    data: Omit<WeightEntryRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WeightEntryRecord> {
    return storage.createWeightEntry(data);
  }

  async updateWeightEntry(
    id: string,
    data: Partial<Omit<WeightEntryRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<WeightEntryRecord> {
    return storage.updateWeightEntry(id, data);
  }

  async deleteWeightEntry(id: string): Promise<void> {
    return storage.deleteWeightEntry(id);
  }

  // ── Custom Foods ─────────────────────────────────────────────────

  async getCustomFoods(): Promise<CustomFoodRecord[]> {
    return storage.getAllCustomFoods();
  }

  async createCustomFood(
    food: Omit<CustomFoodRecord, 'id' | 'createdAt' | 'sharedWithCommunity'>
  ): Promise<CustomFoodRecord> {
    return storage.addCustomFood(food);
  }

  async updateCustomFood(
    id: string,
    data: Partial<Omit<CustomFoodRecord, 'id' | 'createdAt'>>
  ): Promise<CustomFoodRecord> {
    return storage.updateCustomFood(id, data);
  }

  async deleteCustomFood(id: string): Promise<void> {
    return storage.deleteCustomFood(id);
  }

  async shareCustomFood(_id: string): Promise<void> {
    // no-op in local mode — sharing requires server
  }

  async getCommunityFoods(_page?: number, _perPage?: number): Promise<PaginatedResult<CustomFoodRecord>> {
    return { data: [], total: 0, page: 1, perPage: 20, totalPages: 0 };
  }

  // ── Food Search (no-op in local mode) ────────────────────────────

  async searchFoods(_query: string, page = 1, perPage = 20): Promise<PaginatedResult<FDAFood>> {
    return { data: [], total: 0, page, perPage, totalPages: 0 };
  }

  async getFoodByFdcId(_fdcId: number): Promise<FDAFood | null> {
    return null;
  }

  async getFoodByUPC(_upc: string): Promise<FDAFood | null> {
    return null;
  }

  // ── Templates (IndexedDB) ────────────────────────────────────────

  async getTemplates(): Promise<TemplateRecord[]> {
    return storage.getAllTemplates();
  }
  async getTemplatesByType(type: TemplateRecord['type']): Promise<TemplateRecord[]> {
    return storage.getTemplatesByType(type);
  }
  async getTemplate(id: string): Promise<TemplateRecord | null> {
    return (await storage.getTemplate(id)) ?? null;
  }
  async createTemplate(data: Omit<TemplateRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<TemplateRecord> {
    return storage.createTemplate(data);
  }
  async updateTemplate(id: string, data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>>): Promise<TemplateRecord> {
    return storage.updateTemplate(id, data);
  }
  async deleteTemplate(id: string): Promise<void> {
    return storage.deleteTemplate(id);
  }

  // ── Dietary Profiles (IndexedDB) ─────────────────────────────────

  async getDietaryProfiles(): Promise<DietaryProfileRecord[]> {
    return storage.getAllDietaryProfiles();
  }
  async createDietaryProfile(data: Omit<DietaryProfileRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<DietaryProfileRecord> {
    return storage.createDietaryProfile(data);
  }
  async updateDietaryProfile(id: string, data: Partial<Omit<DietaryProfileRecord, 'id' | 'createdAt'>>): Promise<DietaryProfileRecord> {
    return storage.updateDietaryProfile(id, data);
  }
  async deleteDietaryProfile(id: string): Promise<void> {
    return storage.deleteDietaryProfile(id);
  }
  async getAllergenRulesByProfile(profileId: string): Promise<AllergenRuleRecord[]> {
    return storage.getAllergenRulesByProfile(profileId);
  }
  async createAllergenRule(data: Omit<AllergenRuleRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AllergenRuleRecord> {
    return storage.createAllergenRule(data);
  }
  async updateAllergenRule(id: string, data: Partial<Omit<AllergenRuleRecord, 'id' | 'createdAt'>>): Promise<AllergenRuleRecord> {
    return storage.updateAllergenRule(id, data);
  }
  async deleteAllergenRule(id: string): Promise<void> {
    return storage.deleteAllergenRule(id);
  }
}
