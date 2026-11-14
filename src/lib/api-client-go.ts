import type {
  ApiClient,
  AuthResult,
  InstanceState,
  SeedJob,
  UserListEntry,
  RecipeRecord,
  RecipeCompletionRecord,
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
  FoodStorageDefault,
  PaginatedResult,
  TemplateRecord,
  PantryStapleRecord,
  DietaryProfileRecord,
  AllergenRuleRecord,
  SharedRecipeRecord,
  ShareVisibility,
  ExportCandidateRecord,
  UserSecretInfo,
} from './api-client';
import type { TemplateLayout } from './types';

type GroceryChecklistWire = Omit<GroceryChecklistRecord, 'checkedItems'> & { checkedItems: string };

function parseGroceryChecklist(wire: GroceryChecklistWire): GroceryChecklistRecord {
  const checkedItems: unknown = JSON.parse(wire.checkedItems);
  if (!Array.isArray(checkedItems) || !checkedItems.every(item => typeof item === 'string')) {
    throw new Error('Invalid grocery checklist items from server');
  }
  return { ...wire, checkedItems };
}

const TOKEN_KEY = 'dietledger_access_token';
const REFRESH_KEY = 'dietledger_refresh_token';

export class GoApiClient implements ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private setTokens(access: string, refresh: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  }

  private clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    authRetry = true,
    rlRetries = 5
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && rlRetries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      return this.request<T>(method, path, body, authRetry, rlRetries - 1);
    }

    if (res.status === 401 && authRetry) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(method, path, body, false);
      this.clearTokens();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dietledger:unauthorized'));
      }
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  private async tryRefresh(): Promise<boolean> {
    const refresh = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
    if (!refresh) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  private unwrap<T>(resp: { ok: boolean; data: T }): T {
    return resp.data;
  }

  private unwrapPaginated<T>(resp: {
    data: T[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }): PaginatedResult<T> {
    return resp;
  }

  // ── Auth ──────────────────────────────────────────────────────────

  async register(email: string, password: string, displayName: string): Promise<AuthResult> {
    const res = await this.request<AuthResult>('POST', '/api/auth/register', {
      email,
      password,
      displayName,
    });
    this.setTokens(res.accessToken, res.refreshToken);
    return res;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const res = await this.request<AuthResult>('POST', '/api/auth/login', {
      email,
      password,
    });
    this.setTokens(res.accessToken, res.refreshToken);
    return res;
  }

  async refreshToken(token: string): Promise<AuthResult> {
    const res = await this.request<AuthResult>('POST', '/api/auth/refresh', {
      refreshToken: token,
    });
    this.setTokens(res.accessToken, res.refreshToken);
    return res;
  }

  // ── Instance metadata ──────────────────────────────────────────────

  async getInstanceState(): Promise<InstanceState> {
    const resp = await this.request<{ ok: boolean; data: InstanceState }>('GET', '/api/instance/state');
    return this.unwrap(resp);
  }

  async completeOnboarding(): Promise<InstanceState> {
    const resp = await this.request<{ ok: boolean; data: InstanceState }>('POST', '/api/instance/onboarding/complete');
    return this.unwrap(resp);
  }

  async getRecipeCompletions(): Promise<RecipeCompletionRecord[]> {
    const resp = await this.request<{ ok: boolean; data: RecipeCompletionRecord[] }>('GET', '/api/recipes/completions');
    return this.unwrap(resp) ?? [];
  }

  async markRecipeCompleted(recipeId: string, date: string): Promise<void> {
    await this.request<{ ok: boolean }>('PUT', `/api/recipes/completions/${recipeId}`, { date });
  }

  async deleteRecipeCompletion(recipeId: string): Promise<void> {
    await this.request<{ ok: boolean }>('DELETE', `/api/recipes/completions/${recipeId}`);
  }

  async setRegistrationEnabled(enabled: boolean): Promise<InstanceState> {
    const resp = await this.request<{ ok: boolean; data: InstanceState }>(
      'PUT',
      '/api/instance/registration',
      { registrationEnabled: enabled },
    );
    return this.unwrap(resp);
  }

  async resetUserData(password: string): Promise<void> {
    await this.request('POST', '/api/instance/reset-user-data', { password });
  }

  async factoryReset(password: string): Promise<void> {
    await this.request('POST', '/api/instance/factory-reset', { password });
  }

  // ── USDA food data seeding (admin) ──────────────────────────────────

  async startFoodSeed(dataType: string): Promise<{ jobId: number }> {
    const resp = await this.request<{ ok: boolean; data: { jobId: number } }>(
      'POST',
      '/api/foods/seed',
      { dataType },
    );
    return this.unwrap(resp);
  }

  async getSeedJob(jobId: number): Promise<SeedJob> {
    const resp = await this.request<{ ok: boolean; data: SeedJob }>(
      'GET',
      `/api/foods/seed/${jobId}`,
    );
    return this.unwrap(resp);
  }

  // ── Account self-service (password-gated) ──────────────────────────

  async deleteMyData(password: string): Promise<void> {
    await this.request('POST', '/api/account/delete-data', { password });
  }

  async deleteMyAccount(password: string, newAdminUserId?: string): Promise<void> {
    await this.request('POST', '/api/account/delete', { password, newAdminUserId: newAdminUserId || undefined });
  }

  // ── Admin: user list ───────────────────────────────────────────────

  async listUsers(): Promise<UserListEntry[]> {
    const resp = await this.request<{ ok: boolean; data: UserListEntry[] }>('GET', '/api/instance/users');
    return resp?.data ?? [];
  }

  // ── Recipes ──────────────────────────────────────────────────────

  async getRecipes(page = 1, perPage = 20): Promise<PaginatedResult<RecipeRecord>> {
    const resp = await this.request<{
      ok: boolean;
      data: RecipeRecord[];
      total: number;
      page: number;
      perPage: number;
      totalPages: number;
    }>('GET', `/api/recipes?page=${page}&perPage=${perPage}`);
    return this.unwrapPaginated(resp);
  }

  async getRecipe(id: string): Promise<RecipeRecord | null> {
    try {
      const resp = await this.request<{ ok: boolean; data: RecipeRecord }>('GET', `/api/recipes/${id}`);
      return this.unwrap(resp);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found')) return null;
      throw e;
    }
  }

  async createRecipe(name: string): Promise<RecipeRecord> {
    const resp = await this.request<{ ok: boolean; data: RecipeRecord }>('POST', '/api/recipes', {
      name,
      servings: 1,
      servingName: 'serving',
      ingredients: [],
    });
    return this.unwrap(resp);
  }

  async updateRecipe(
    id: string,
    data: Partial<
      Pick<
        RecipeRecord,
        'name' | 'servings' | 'servingName' | 'prepTime' | 'cookTime' | 'instructions' | 'leftoverStorage' | 'ingredients' | 'ingredientGroups'
      >
    >
  ): Promise<RecipeRecord> {
    const payload: Record<string, unknown> = { ...data };
    if (data.ingredients) {
      payload.ingredients = data.ingredients.map((ing) => ({
        fdcId: ing.fdcId,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        description: ing.description,
        calories: ing.calories,
        totalFat: ing.totalFat,
        saturatedFat: ing.saturatedFat,
        transFat: ing.transFat,
        cholesterol: ing.cholesterol,
        sodium: ing.sodium,
        totalCarbs: ing.totalCarbs,
        dietaryFiber: ing.dietaryFiber,
        totalSugars: ing.totalSugars,
        addedSugars: ing.addedSugars,
        protein: ing.protein,
        vitaminD: ing.vitaminD,
        calcium: ing.calcium,
        iron: ing.iron,
        potassium: ing.potassium,
        groupId: ing.groupId || null,
        linkedRecipeId: ing.linkedRecipeId || null,
        sourceType: ing.sourceType || 'manual',
        sourceKey: ing.sourceKey || null,
        prepInstructions: ing.prepInstructions || [],
        storageLocation: ing.storageLocation || '',
      }));
    }
    if (data.ingredientGroups) {
      payload.ingredientGroups = JSON.stringify(data.ingredientGroups);
    }
    const resp = await this.request<{ ok: boolean; data: RecipeRecord }>('PUT', `/api/recipes/${id}`, payload);
    return this.unwrap(resp);
  }

  async deleteRecipe(id: string): Promise<void> {
    await this.request('DELETE', `/api/recipes/${id}`);
  }

  async getRecipeBundleExportCandidates(): Promise<ExportCandidateRecord[]> {
    const resp = await this.request<{ ok: boolean; data: ExportCandidateRecord[] }>('GET', '/api/recipe-bundles/candidates');
    return this.unwrap(resp);
  }

  async exportRecipeBundle(request: { recipeIds?: string[]; bookIds?: string[]; profileIds?: string[]; mealPlanIds?: string[] }): Promise<import('./api-client').RecipeBundle> {
    const resp = await this.request<{ ok: boolean; data: import('./api-client').RecipeBundle }>(
      'POST',
      '/api/recipe-bundles/export',
      { recipeIds: request.recipeIds ?? [], bookIds: request.bookIds ?? [], profileIds: request.profileIds ?? [], mealPlanIds: request.mealPlanIds ?? [] },
    );
    return this.unwrap(resp);
  }

  async importRecipeBundle(bundle: import('./api-client').RecipeBundle): Promise<import('./api-client').RecipeBundleImportSummary> {
    const resp = await this.request<{ ok: boolean; data: import('./api-client').RecipeBundleImportSummary }>(
      'POST',
      '/api/recipe-bundles/import',
      bundle,
    );
    return this.unwrap(resp);
  }

  // ── Food storage defaults ────────────────────────────────────────

  async getFoodStorageDefaults(): Promise<FoodStorageDefault[]> {
    const resp = await this.request<{ ok: boolean; data: FoodStorageDefault[] }>('GET', '/api/food-storage-defaults');
    return this.unwrap(resp);
  }

  async updateFoodStorageDefault(sourceType: FoodStorageDefault['sourceType'], sourceKey: string, location: string): Promise<FoodStorageDefault> {
    const resp = await this.request<{ ok: boolean; data: FoodStorageDefault }>(
      'PUT', `/api/food-storage-defaults/${sourceType}/${encodeURIComponent(sourceKey)}`, { location },
    );
    return this.unwrap(resp);
  }

  // ── Ingredients ──────────────────────────────────────────────────

  async addIngredient(
    recipeId: string,
    ingredient: Omit<IngredientRecord, 'id' | 'recipeId'>
  ): Promise<IngredientRecord> {
    const resp = await this.request<{ ok: boolean; data: IngredientRecord }>(
      'POST',
      `/api/recipes/${recipeId}/ingredients`,
      {
        fdcId: ingredient.fdcId,
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        description: ingredient.description,
        calories: ingredient.calories,
        totalFat: ingredient.totalFat,
        saturatedFat: ingredient.saturatedFat,
        transFat: ingredient.transFat,
        cholesterol: ingredient.cholesterol,
        sodium: ingredient.sodium,
        totalCarbs: ingredient.totalCarbs,
        dietaryFiber: ingredient.dietaryFiber,
        totalSugars: ingredient.totalSugars,
        addedSugars: ingredient.addedSugars,
        protein: ingredient.protein,
        vitaminD: ingredient.vitaminD,
        calcium: ingredient.calcium,
        iron: ingredient.iron,
        potassium: ingredient.potassium,
        groupId: ingredient.groupId || null,
        linkedRecipeId: ingredient.linkedRecipeId || null,
        sourceType: ingredient.sourceType || 'manual',
        sourceKey: ingredient.sourceKey || null,
        prepInstructions: ingredient.prepInstructions || [],
        storageLocation: ingredient.storageLocation || '',
        position: ingredient.position,
        zeroNutritionOverride: ingredient.zeroNutritionOverride,
        unresolvedSource: ingredient.unresolvedSource || null,
        unconfirmedNutrition: ingredient.unconfirmedNutrition || null,
      }
    );
    return this.unwrap(resp);
  }

  async updateIngredient(
    recipeId: string,
    ingredientId: string,
    data: Partial<Omit<IngredientRecord, 'id' | 'recipeId'>>
  ): Promise<IngredientRecord> {
    const resp = await this.request<{ ok: boolean; data: IngredientRecord }>(
      'PUT',
      `/api/recipes/${recipeId}/ingredients/${ingredientId}`,
      data
    );
    return this.unwrap(resp);
  }

  async removeIngredient(recipeId: string, ingredientId: string): Promise<void> {
    await this.request('DELETE', `/api/recipes/${recipeId}/ingredients/${ingredientId}`);
  }

  // ── Books ────────────────────────────────────────────────────────

  async getBooks(): Promise<BookRecord[]> {
    const resp = await this.request<{ ok: boolean; data: BookRecord[] }>('GET', '/api/books');
    return this.unwrap(resp);
  }

  async getBook(id: string): Promise<BookRecord | null> {
    try {
      const resp = await this.request<{ ok: boolean; data: BookRecord }>('GET', `/api/books/${id}`);
      return this.unwrap(resp);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found')) return null;
      throw e;
    }
  }

  async createBook(title: string, description = '', coverColor = '#059669'): Promise<BookRecord> {
    const resp = await this.request<{ ok: boolean; data: BookRecord }>('POST', '/api/books', {
      title,
      description,
      coverColor,
    });
    return this.unwrap(resp);
  }

  async updateBook(
    id: string,
    data: Partial<Pick<BookRecord, 'title' | 'description' | 'coverColor'>>
  ): Promise<BookRecord> {
    const resp = await this.request<{ ok: boolean; data: BookRecord }>('PUT', `/api/books/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteBook(id: string): Promise<void> {
    await this.request('DELETE', `/api/books/${id}`);
  }

  // ── Chapters ─────────────────────────────────────────────────────

  async getChaptersByBook(bookId: string): Promise<ChapterRecord[]> {
    const resp = await this.request<{ ok: boolean; data: ChapterRecord[] }>('GET', `/api/books/${bookId}/chapters`);
    return this.unwrap(resp);
  }

  async createChapter(bookId: string, title: string): Promise<ChapterRecord> {
    const resp = await this.request<{ ok: boolean; data: ChapterRecord }>('POST', `/api/books/${bookId}/chapters`, {
      title,
      position: 0,
    });
    return this.unwrap(resp);
  }

  async updateChapter(
    id: string,
    data: Partial<Pick<ChapterRecord, 'title' | 'position' | 'pageTemplateId' | 'recipeTemplateId'>>
  ): Promise<ChapterRecord> {
    const resp = await this.request<{ ok: boolean; data: ChapterRecord }>('PUT', `/api/chapters/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteChapter(id: string): Promise<void> {
    await this.request('DELETE', `/api/chapters/${id}`);
  }

  async reorderChapters(bookId: string, chapterIds: string[]): Promise<void> {
    await this.request('PUT', `/api/books/${bookId}/chapters/reorder`, { chapterIds });
  }

  // ── Chapter Recipes ──────────────────────────────────────────────

  async getChapterRecipes(chapterId: string): Promise<ChapterRecipeRecord[]> {
    const resp = await this.request<{ ok: boolean; data: ChapterRecipeRecord[] }>(
      'GET',
      `/api/chapters/${chapterId}/recipes`
    );
    return this.unwrap(resp);
  }

  async addRecipeToChapter(chapterId: string, recipeId: string): Promise<ChapterRecipeRecord> {
    const resp = await this.request<{ ok: boolean; data: ChapterRecipeRecord }>(
      'POST',
      `/api/chapters/${chapterId}/recipes`,
      { recipeId }
    );
    return this.unwrap(resp);
  }

  async removeRecipeFromChapter(chapterId: string, recipeId: string): Promise<void> {
    await this.request('DELETE', `/api/chapters/${chapterId}/recipes/${recipeId}`);
  }

  // ── Chapter Pages ────────────────────────────────────────────────

  async getChapterPages(chapterId: string): Promise<ChapterPageRecord[]> {
    const resp = await this.request<{ ok: boolean; data: ChapterPageRecord[] }>(
      'GET',
      `/api/chapters/${chapterId}/pages`
    );
    return this.unwrap(resp);
  }

  async createChapterPage(chapterId: string, title: string, content: string): Promise<ChapterPageRecord> {
    const resp = await this.request<{ ok: boolean; data: ChapterPageRecord }>(
      'POST',
      `/api/chapters/${chapterId}/pages`,
      { title, content }
    );
    return this.unwrap(resp);
  }

  async updateChapterPage(
    id: string,
    data: Partial<Pick<ChapterPageRecord, 'title' | 'content' | 'position'>>
  ): Promise<ChapterPageRecord> {
    const resp = await this.request<{ ok: boolean; data: ChapterPageRecord }>('PUT', `/api/pages/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteChapterPage(id: string): Promise<void> {
    await this.request('DELETE', `/api/pages/${id}`);
  }

  // ── Book Pages ───────────────────────────────────────────────────

  async getBookPages(bookId: string): Promise<BookPageRecord[]> {
    const resp = await this.request<{ ok: boolean; data: BookPageRecord[] }>('GET', `/api/books/${bookId}/pages`);
    return this.unwrap(resp);
  }

  async createBookPage(bookId: string, title: string, content: string): Promise<BookPageRecord> {
    const resp = await this.request<{ ok: boolean; data: BookPageRecord }>('POST', `/api/books/${bookId}/pages`, {
      title,
      content,
    });
    return this.unwrap(resp);
  }

  async updateBookPage(
    id: string,
    data: Partial<Pick<BookPageRecord, 'title' | 'content' | 'position'>>
  ): Promise<BookPageRecord> {
    const resp = await this.request<{ ok: boolean; data: BookPageRecord }>('PUT', `/api/book-pages/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteBookPage(id: string): Promise<void> {
    await this.request('DELETE', `/api/book-pages/${id}`);
  }

  // ── Book/chapter ordering & moves ─────────────────────────────────

  async reorderBookLevelItems(
    bookId: string,
    items: Array<{ id: string; type: 'chapter' | 'book-page' }>
  ): Promise<void> {
    await this.request('PUT', `/api/books/${bookId}/items/reorder`, { items });
  }

  async reorderChapterItems(
    chapterId: string,
    items: Array<{ type: 'recipe'; recipeId: string } | { type: 'page'; pageId: string }>
  ): Promise<void> {
    await this.request('PUT', `/api/chapters/${chapterId}/items/reorder`, { items });
  }

  async moveRecipeBetweenChapters(
    chapterRecipeId: string,
    targetChapterId: string,
    position: number
  ): Promise<void> {
    await this.request('POST', `/api/chapter-recipes/${chapterRecipeId}/move`, {
      targetChapterId,
      position,
    });
  }

  async movePageBetweenChapters(pageId: string, targetChapterId: string, position: number): Promise<void> {
    await this.request('POST', `/api/pages/${pageId}/move`, { targetChapterId, position });
  }

  async convertChapterPageToBookPage(pageId: string, bookId: string, position: number): Promise<void> {
    await this.request('POST', `/api/pages/${pageId}/to-book`, { bookId, position });
  }

  async convertBookPageToChapterPage(pageId: string, chapterId: string, position: number): Promise<void> {
    await this.request('POST', `/api/pages/${pageId}/to-chapter`, { chapterId, position });
  }

  // ── Categories ───────────────────────────────────────────────────

  async getCategories(): Promise<CategoryRecord[]> {
    const resp = await this.request<{ ok: boolean; data: CategoryRecord[] }>('GET', '/api/categories');
    return this.unwrap(resp);
  }

  async createCategory(name: string, parentId?: string | null): Promise<CategoryRecord> {
    const resp = await this.request<{ ok: boolean; data: CategoryRecord }>('POST', '/api/categories', {
      name,
      parentId: parentId || null,
    });
    return this.unwrap(resp);
  }

  async updateCategory(
    id: string,
    data: Partial<Pick<CategoryRecord, 'name' | 'parentId'>>
  ): Promise<CategoryRecord> {
    const resp = await this.request<{ ok: boolean; data: CategoryRecord }>('PUT', `/api/categories/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request('DELETE', `/api/categories/${id}`);
  }

  // ── Recipe Categories ────────────────────────────────────────────

  async getRecipeCategories(recipeId: string): Promise<RecipeCategoryRecord[]> {
    const resp = await this.request<{ ok: boolean; data: RecipeCategoryRecord[] }>(
      'GET',
      `/api/recipes/${recipeId}/categories`
    );
    return this.unwrap(resp);
  }

  async addCategoryToRecipe(recipeId: string, categoryId: string): Promise<RecipeCategoryRecord> {
    const resp = await this.request<{ ok: boolean; data: RecipeCategoryRecord }>(
      'POST',
      `/api/recipes/${recipeId}/categories`,
      { categoryId }
    );
    return this.unwrap(resp);
  }

  async removeCategoryFromRecipe(recipeId: string, categoryId: string): Promise<void> {
    await this.request('DELETE', `/api/recipes/${recipeId}/categories/${categoryId}`);
  }

  async getCategoryDescendants(categoryId: string): Promise<string[]> {
    const resp = await this.request<{ ok: boolean; data: string[] }>('GET', `/api/categories/${categoryId}/descendants`);
    return resp?.data ?? [];
  }

  async getRecipesByCategory(categoryId: string): Promise<RecipeCategoryRecord[]> {
    const resp = await this.request<{ ok: boolean; data: RecipeCategoryRecord[] }>('GET', `/api/categories/${categoryId}/recipes`);
    return resp?.data ?? [];
  }

  // ── Meal Plans ───────────────────────────────────────────────────

  async getMealPlans(): Promise<MealPlanRecord[]> {
    const resp = await this.request<{ ok: boolean; data: MealPlanRecord[] }>('GET', '/api/meal-plans');
    return this.unwrap(resp);
  }

  async getMealPlanByWeekStart(weekStart: string): Promise<MealPlanRecord | null> {
    const plans = await this.getMealPlans();
    return plans.find((p) => p.weekStart === weekStart) || null;
  }

  async createMealPlan(name: string, weekStart: string): Promise<MealPlanRecord> {
    const resp = await this.request<{ ok: boolean; data: MealPlanRecord }>('POST', '/api/meal-plans', {
      name,
      weekStart,
    });
    return this.unwrap(resp);
  }

  async updateMealPlan(
    id: string,
    data: Partial<Pick<MealPlanRecord, 'name' | 'slotTimes'>>
  ): Promise<MealPlanRecord> {
    const resp = await this.request<{ ok: boolean; data: MealPlanRecord }>('PUT', `/api/meal-plans/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteMealPlan(id: string): Promise<void> {
    await this.request('DELETE', `/api/meal-plans/${id}`);
  }

  // ── Day Plan Entries ─────────────────────────────────────────────

  async getDayEntriesByMealPlanId(mealPlanId: string): Promise<DayPlanEntryRecord[]> {
    const resp = await this.request<{ ok: boolean; data: DayPlanEntryRecord[] }>(
      'GET',
      `/api/meal-plans/${mealPlanId}/entries`
    );
    return this.unwrap(resp);
  }

  async createDayPlanEntry(
    mealPlanId: string,
    date: string,
    slot: string,
    recipeId: string | null,
    position: number,
    options?: Partial<Omit<DayPlanEntryRecord, 'id' | 'mealPlanId' | 'date' | 'slot' | 'recipeId' | 'position'>>
  ): Promise<DayPlanEntryRecord> {
    const payload = {
      date,
      slot,
      recipeId,
      position,
      servings: 1,
      isLeftover: false,
      sourceType: 'recipe',
      ...options,
    };
    const resp = await this.request<{ ok: boolean; data: DayPlanEntryRecord }>(
      'POST',
      `/api/meal-plans/${mealPlanId}/entries`,
      payload
    );
    return this.unwrap(resp);
  }

  async updateDayPlanEntry(
    id: string,
    data: Partial<Omit<DayPlanEntryRecord, 'id' | 'mealPlanId'>>
  ): Promise<DayPlanEntryRecord> {
    const resp = await this.request<{ ok: boolean; data: DayPlanEntryRecord }>('PUT', `/api/entries/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteDayPlanEntry(id: string): Promise<void> {
    await this.request('DELETE', `/api/entries/${id}`);
  }

  // ── Meal Groups ──────────────────────────────────────────────────

  async getMealGroupsByMealPlanId(mealPlanId: string): Promise<MealGroupRecord[]> {
    const resp = await this.request<{ ok: boolean; data: MealGroupRecord[] }>(
      'GET',
      `/api/meal-plans/${mealPlanId}/groups`
    );
    return this.unwrap(resp);
  }

  async createMealGroup(
    mealPlanId: string,
    date: string,
    slot: string,
    name: string,
    position: number
  ): Promise<MealGroupRecord> {
    const resp = await this.request<{ ok: boolean; data: MealGroupRecord }>(
      'POST',
      `/api/meal-plans/${mealPlanId}/groups`,
      { date, slot, name, position }
    );
    return this.unwrap(resp);
  }

  async deleteMealGroup(id: string): Promise<void> {
    await this.request('DELETE', `/api/meal-plans/_/groups?id=${id}`);
  }

  // ── Grocery Checklists ───────────────────────────────────────────

  async getGroceryChecklist(weekStart: string): Promise<GroceryChecklistRecord | null> {
    try {
      const resp = await this.request<{ ok: boolean; data: GroceryChecklistWire | null }>(
        'GET',
        `/api/grocery?weekStart=${weekStart}`
      );
      const wire = this.unwrap(resp);
      return wire ? parseGroceryChecklist(wire) : null;
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found')) return null;
      throw e;
    }
  }

  async upsertGroceryChecklist(record: Pick<GroceryChecklistRecord, 'weekStart' | 'checkedItems'>): Promise<GroceryChecklistRecord> {
    const resp = await this.request<{ ok: boolean; data: GroceryChecklistWire }>('PUT', '/api/grocery', {
      weekStart: record.weekStart,
      checkedItems: JSON.stringify(record.checkedItems),
    });
    return parseGroceryChecklist(this.unwrap(resp));
  }

  // ── Nutrition Profiles ───────────────────────────────────────────

  async getNutritionProfiles(): Promise<NutritionProfileRecord[]> {
    const resp = await this.request<{ ok: boolean; data: NutritionProfileRecord[] }>('GET', '/api/profiles');
    return this.unwrap(resp);
  }

  async getNutritionProfile(id: string): Promise<NutritionProfileRecord | null> {
    try {
      const resp = await this.request<{ ok: boolean; data: NutritionProfileRecord }>('GET', `/api/profiles/${id}`);
      return this.unwrap(resp);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found')) return null;
      throw e;
    }
  }

  async createNutritionProfile(
    data: Omit<NutritionProfileRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<NutritionProfileRecord> {
    const resp = await this.request<{ ok: boolean; data: NutritionProfileRecord }>('POST', '/api/profiles', data);
    return this.unwrap(resp);
  }

  async updateNutritionProfile(
    id: string,
    data: Partial<Omit<NutritionProfileRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<NutritionProfileRecord> {
    const resp = await this.request<{ ok: boolean; data: NutritionProfileRecord }>('PUT', `/api/profiles/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteNutritionProfile(id: string): Promise<void> {
    await this.request('DELETE', `/api/profiles/${id}`);
  }

  // ── Food Log ─────────────────────────────────────────────────────

  async getFoodLogByProfileAndDate(profileId: string, date: string): Promise<FoodLogEntryRecord[]> {
    const resp = await this.request<{ ok: boolean; data: FoodLogEntryRecord[] }>(
      'GET',
      `/api/profiles/${profileId}/log?date=${date}`
    );
    return this.unwrap(resp);
  }

  async getFoodLogByProfileAndDateRange(profileId: string, startDate: string, endDate: string): Promise<FoodLogEntryRecord[]> {
    const resp = await this.request<{ ok: boolean; data: FoodLogEntryRecord[] }>(
      'GET',
      `/api/profiles/${profileId}/log?startDate=${startDate}&endDate=${endDate}`
    );
    return this.unwrap(resp);
  }

  async createFoodLogEntry(
    data: Omit<FoodLogEntryRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<FoodLogEntryRecord> {
    if (!data.profileId) throw new Error('No nutrition profile selected');
    const resp = await this.request<{ ok: boolean; data: FoodLogEntryRecord }>(
      'POST',
      `/api/profiles/${data.profileId}/log`,
      data
    );
    return this.unwrap(resp);
  }

  async updateFoodLogEntry(
    id: string,
    data: Partial<Omit<FoodLogEntryRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<FoodLogEntryRecord> {
    const resp = await this.request<{ ok: boolean; data: FoodLogEntryRecord }>('PUT', `/api/log/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteFoodLogEntry(id: string): Promise<void> {
    await this.request('DELETE', `/api/log/${id}`);
  }

  // ── Weight Entries ───────────────────────────────────────────────

  async getWeightByProfile(profileId: string): Promise<WeightEntryRecord[]> {
    const resp = await this.request<{ ok: boolean; data: WeightEntryRecord[] }>(
      'GET',
      `/api/profiles/${profileId}/weight`
    );
    return this.unwrap(resp);
  }

  async createWeightEntry(
    data: Omit<WeightEntryRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WeightEntryRecord> {
    const resp = await this.request<{ ok: boolean; data: WeightEntryRecord }>(
      'POST',
      `/api/profiles/${data.profileId}/weight`,
      data
    );
    return this.unwrap(resp);
  }

  async updateWeightEntry(
    id: string,
    data: Partial<Omit<WeightEntryRecord, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<WeightEntryRecord> {
    const resp = await this.request<{ ok: boolean; data: WeightEntryRecord }>('PUT', `/api/weight/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteWeightEntry(id: string): Promise<void> {
    await this.request('DELETE', `/api/weight/${id}`);
  }

  // ── Custom Foods ─────────────────────────────────────────────────

  async getCustomFoods(): Promise<CustomFoodRecord[]> {
    const resp = await this.request<{ ok: boolean; data: CustomFoodRecord[] }>('GET', '/api/custom-foods');
    return this.unwrap(resp);
  }

  async createCustomFood(
    food: Omit<CustomFoodRecord, 'id' | 'createdAt' | 'sharedWithCommunity'>
  ): Promise<CustomFoodRecord> {
    const resp = await this.request<{ ok: boolean; data: CustomFoodRecord }>('POST', '/api/custom-foods', food);
    return this.unwrap(resp);
  }

  async updateCustomFood(
    id: string,
    data: Partial<Omit<CustomFoodRecord, 'id' | 'createdAt'>>
  ): Promise<CustomFoodRecord> {
    const resp = await this.request<{ ok: boolean; data: CustomFoodRecord }>('PUT', `/api/custom-foods/${id}`, data);
    return this.unwrap(resp);
  }

  async deleteCustomFood(id: string): Promise<void> {
    await this.request('DELETE', `/api/custom-foods/${id}`);
  }

  async shareCustomFood(id: string): Promise<void> {
    await this.request('POST', `/api/custom-foods/${id}/share`);
  }

  async getCommunityFoods(page = 1, perPage = 20): Promise<PaginatedResult<CustomFoodRecord>> {
    const resp = await this.request<{
      ok: boolean;
      data: CustomFoodRecord[];
      total: number;
      page: number;
      perPage: number;
      totalPages: number;
    }>('GET', `/api/custom-foods/community?page=${page}&perPage=${perPage}`);
    return this.unwrapPaginated(resp);
  }

  // ── Food Search ──────────────────────────────────────────────────

  async searchFoods(query: string, page = 1, perPage = 20): Promise<PaginatedResult<FDAFood>> {
    const resp = await this.request<{ foods: FDAFood[]; total: number; page: number; perPage: number; totalPages: number }>(
      'GET',
      `/api/foods/search?q=${encodeURIComponent(query)}&page=${page}&perPage=${perPage}`
    );
    return { data: resp.foods, total: resp.total, page: resp.page, perPage: resp.perPage, totalPages: resp.totalPages };
  }

  async getFoodByFdcId(fdcId: number): Promise<FDAFood | null> {
    try {
      const resp = await this.request<{ ok: boolean; data: FDAFood }>('GET', `/api/foods/${fdcId}`);
      return this.unwrap(resp);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found')) return null;
      throw e;
    }
  }

  async getFoodByUPC(upc: string): Promise<FDAFood | null> {
    try {
      const resp = await this.request<{ ok: boolean; data: FDAFood }>('GET', `/api/foods/upc/${upc}`);
      return this.unwrap(resp);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found')) return null;
      throw e;
    }
  }

  // ── Templates (server-persisted) ──────────────────────────────────

  private parseTemplate(t: TemplateRecord & { layout?: string | TemplateLayout }): TemplateRecord {
    return { ...t, layout: typeof t.layout === 'string' ? JSON.parse(t.layout) : t.layout };
  }

  async getTemplates(): Promise<TemplateRecord[]> {
    const resp = await this.request<{ ok: boolean; data: (TemplateRecord & { layout?: string })[] }>('GET', '/api/templates');
    return (resp?.data ?? []).map(t => this.parseTemplate(t));
  }
  async getTemplatesByType(type: TemplateRecord['type']): Promise<TemplateRecord[]> {
    const resp = await this.request<{ ok: boolean; data: (TemplateRecord & { layout?: string })[] }>('GET', `/api/templates?type=${encodeURIComponent(type)}`);
    return (resp?.data ?? []).map(t => this.parseTemplate(t));
  }
  async getTemplate(id: string): Promise<TemplateRecord | null> {
    try {
      const resp = await this.request<{ ok: boolean; data: TemplateRecord & { layout?: string } }>('GET', `/api/templates/${id}`);
      return resp?.data ? this.parseTemplate(resp.data) : null;
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found')) return null;
      throw e;
    }
  }
  async createTemplate(data: Omit<TemplateRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<TemplateRecord> {
    const resp = await this.request<{ ok: boolean; data: TemplateRecord }>('POST', '/api/templates', {
      name: data.name,
      type: data.type,
      isDefault: data.isDefault,
      layout: JSON.stringify(data.layout),
    });
    const t = resp.data;
    return { ...t, layout: typeof t.layout === 'string' ? JSON.parse(t.layout) : t.layout };
  }
  async updateTemplate(id: string, data: Partial<Omit<TemplateRecord, 'id' | 'createdAt'>>): Promise<TemplateRecord> {
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.layout !== undefined) body.layout = JSON.stringify(data.layout);
    if (data.isDefault !== undefined) body.isDefault = data.isDefault;
    const resp = await this.request<{ ok: boolean; data: TemplateRecord }>('PUT', `/api/templates/${id}`, body);
    const t = resp.data;
    return { ...t, layout: typeof t.layout === 'string' ? JSON.parse(t.layout) : t.layout };
  }
  async deleteTemplate(id: string): Promise<void> {
    await this.request('DELETE', `/api/templates/${id}`);
  }

  // ── Dietary Profiles (server-persisted) ──────────────────────────

  async getDietaryProfiles(): Promise<DietaryProfileRecord[]> {
    type ProfileResponse = Omit<DietaryProfileRecord, 'allergens' | 'dietaryTags' | 'nutrientThresholds'> & {
      allergens: DietaryProfileRecord['allergens'] | string;
      dietaryTags: DietaryProfileRecord['dietaryTags'] | string;
      nutrientThresholds: DietaryProfileRecord['nutrientThresholds'] | string;
    };
    const resp = await this.request<{ ok: boolean; data: ProfileResponse[] }>('GET', '/api/dietary-profiles');
    const profiles = resp?.data ?? [];
    return profiles.map((p) => ({
      ...p,
      allergens: typeof p.allergens === 'string' ? JSON.parse(p.allergens) : p.allergens,
      dietaryTags: typeof p.dietaryTags === 'string' ? JSON.parse(p.dietaryTags) : p.dietaryTags,
      nutrientThresholds: typeof p.nutrientThresholds === 'string' ? JSON.parse(p.nutrientThresholds) : p.nutrientThresholds,
    }));
  }
  async createDietaryProfile(data: Omit<DietaryProfileRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<DietaryProfileRecord> {
    const resp = await this.request<{ ok: boolean; data: DietaryProfileRecord }>('POST', '/api/dietary-profiles', {
      name: data.name,
      allergens: JSON.stringify(data.allergens),
      dietaryTags: JSON.stringify(data.dietaryTags),
      nutrientThresholds: JSON.stringify(data.nutrientThresholds),
      isActive: data.isActive,
    });
    const p = resp.data as DietaryProfileRecord & { allergens?: string; dietaryTags?: string; nutrientThresholds?: string };
    return {
      ...p,
      allergens: typeof p.allergens === 'string' ? JSON.parse(p.allergens) : p.allergens,
      dietaryTags: typeof p.dietaryTags === 'string' ? JSON.parse(p.dietaryTags) : p.dietaryTags,
      nutrientThresholds: typeof p.nutrientThresholds === 'string' ? JSON.parse(p.nutrientThresholds) : p.nutrientThresholds,
    };
  }
  async updateDietaryProfile(id: string, data: Partial<Omit<DietaryProfileRecord, 'id' | 'createdAt'>>): Promise<DietaryProfileRecord> {
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.allergens !== undefined) body.allergens = JSON.stringify(data.allergens);
    if (data.dietaryTags !== undefined) body.dietaryTags = JSON.stringify(data.dietaryTags);
    if (data.nutrientThresholds !== undefined) body.nutrientThresholds = JSON.stringify(data.nutrientThresholds);
    if (data.isActive !== undefined) body.isActive = data.isActive;
    const resp = await this.request<{ ok: boolean; data: DietaryProfileRecord }>('PUT', `/api/dietary-profiles/${id}`, body);
    const p = resp.data as DietaryProfileRecord & { allergens?: string; dietaryTags?: string; nutrientThresholds?: string };
    return {
      ...p,
      allergens: typeof p.allergens === 'string' ? JSON.parse(p.allergens) : p.allergens,
      dietaryTags: typeof p.dietaryTags === 'string' ? JSON.parse(p.dietaryTags) : p.dietaryTags,
      nutrientThresholds: typeof p.nutrientThresholds === 'string' ? JSON.parse(p.nutrientThresholds) : p.nutrientThresholds,
    };
  }
  async deleteDietaryProfile(id: string): Promise<void> {
    await this.request('DELETE', `/api/dietary-profiles/${id}`);
  }
  async getAllergenRulesByProfile(profileId: string): Promise<AllergenRuleRecord[]> {
    type RuleResponse = Omit<AllergenRuleRecord, 'customKeywords'> & {
      customKeywords: AllergenRuleRecord['customKeywords'] | string;
    };
    const resp = await this.request<{ ok: boolean; data: RuleResponse[] }>('GET', `/api/dietary-profiles/${profileId}/allergen-rules`);
    const rules = resp?.data ?? [];
    return rules.map((r) => ({
      ...r,
      customKeywords: typeof r.customKeywords === 'string' ? JSON.parse(r.customKeywords) : r.customKeywords,
    }));
  }
  async createAllergenRule(data: Omit<AllergenRuleRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AllergenRuleRecord> {
    const resp = await this.request<{ ok: boolean; data: AllergenRuleRecord }>('POST', `/api/dietary-profiles/${data.profileId}/allergen-rules`, {
      allergen: data.allergen,
      severity: data.severity,
      customKeywords: JSON.stringify(data.customKeywords),
    });
    const r = resp.data as AllergenRuleRecord & { customKeywords?: string };
    return { ...r, customKeywords: typeof r.customKeywords === 'string' ? JSON.parse(r.customKeywords) : r.customKeywords };
  }
  async updateAllergenRule(id: string, data: Partial<Omit<AllergenRuleRecord, 'id' | 'createdAt'>>): Promise<AllergenRuleRecord> {
    const body: Record<string, unknown> = {};
    if (data.allergen !== undefined) body.allergen = data.allergen;
    if (data.severity !== undefined) body.severity = data.severity;
    if (data.customKeywords !== undefined) body.customKeywords = JSON.stringify(data.customKeywords);
    const resp = await this.request<{ ok: boolean; data: AllergenRuleRecord }>('PUT', `/api/allergen-rules/${id}`, body);
    const r = resp.data as AllergenRuleRecord & { customKeywords?: string };
    return { ...r, customKeywords: typeof r.customKeywords === 'string' ? JSON.parse(r.customKeywords) : r.customKeywords };
  }
  async deleteAllergenRule(id: string): Promise<void> {
    await this.request('DELETE', `/api/allergen-rules/${id}`);
  }

  // ── Settings ──────────────────────────────────────────────────────

  async getSettings(): Promise<Record<string, unknown>> {
    const resp = await this.request<{ ok: boolean; data: { settings?: string } | null }>('GET', '/api/settings');
    const data = resp?.data;
    if (!data || !data.settings) return {};
    return typeof data.settings === 'string' ? JSON.parse(data.settings) : (data.settings as Record<string, unknown>);
  }

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    await this.request('PUT', '/api/settings', { settings: JSON.stringify(settings) });
  }

  // ── Brand Kits ────────────────────────────────────────────────────

  async getBrandKits(): Promise<import('./types').BrandKit[]> {
    const resp = await this.request<{ ok: boolean; data: import('./types').BrandKit[] }>('GET', '/api/brand-kits');
    return resp?.data ?? [];
  }
  async getBrandKit(id: string): Promise<import('./types').BrandKit | null> {
    try {
      const resp = await this.request<{ ok: boolean; data: import('./types').BrandKit }>('GET', `/api/brand-kits/${id}`);
      return resp?.data ?? null;
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('not found')) return null;
      throw e;
    }
  }
  async createBrandKit(data: Omit<import('./types').BrandKit, 'id' | 'createdAt' | 'updatedAt'>): Promise<import('./types').BrandKit> {
    const resp = await this.request<{ ok: boolean; data: import('./types').BrandKit }>('POST', '/api/brand-kits', data);
    return resp.data;
  }
  async updateBrandKit(id: string, data: Partial<Omit<import('./types').BrandKit, 'id' | 'createdAt'>>): Promise<import('./types').BrandKit> {
    const resp = await this.request<{ ok: boolean; data: import('./types').BrandKit }>('PUT', `/api/brand-kits/${id}`, data);
    return resp.data;
  }
  async deleteBrandKit(id: string): Promise<void> {
    await this.request('DELETE', `/api/brand-kits/${id}`);
  }

  // ── Pantry Staples ────────────────────────────────────────────────

  async getPantryStaples(): Promise<PantryStapleRecord[]> {
    const resp = await this.request<{ ok: boolean; data: PantryStapleRecord[] }>('GET', '/api/pantry-staples');
    return resp?.data ?? [];
  }
  async addPantryStaple(name: string): Promise<void> {
    await this.request('POST', '/api/pantry-staples', { name });
  }
  async removePantryStaple(name: string): Promise<void> {
    await this.request('DELETE', '/api/pantry-staples', { name });
  }

  // ── User Location ─────────────────────────────────────────────────

  async getLocation(): Promise<{ country: string; region: string } | null> {
    const resp = await this.request<{ ok: boolean; data: { country: string; region: string } | null }>('GET', '/api/settings/location');
    return resp?.data ?? null;
  }
  async updateLocation(country: string, region: string): Promise<void> {
    await this.request('PUT', '/api/settings/location', { country, region });
  }

  // ── Seasonal Foods ────────────────────────────────────────────────

  async getSeasonalFoods(country: string, region: string, month: number): Promise<string[]> {
    const resp = await this.request<{ ok: boolean; data: string[] }>('GET', `/api/settings/seasonal-foods?country=${encodeURIComponent(country)}&region=${encodeURIComponent(region)}&month=${month}`);
    return resp?.data ?? [];
  }

  // ── User Secrets ──────────────────────────────────────────────────

  async getSecrets(): Promise<UserSecretInfo[]> {
    const resp = await this.request<{ ok: boolean; data: UserSecretInfo[] }>('GET', '/api/secrets');
    return resp?.data ?? [];
  }
  async createSecret(keyName: string, value: string): Promise<UserSecretInfo> {
    const resp = await this.request<{ ok: boolean; data: UserSecretInfo }>('POST', '/api/secrets', { keyName, value });
    return resp.data;
  }
  async getSecretValue(id: string): Promise<string> {
    const resp = await this.request<{ ok: boolean; data: { value: string } }>('GET', `/api/secrets/${id}`);
    return resp.data.value;
  }
  async deleteSecret(id: string): Promise<void> {
    await this.request('DELETE', `/api/secrets/${id}`);
  }

  // ── Sharing ──────────────────────────────────────────────────────

  async createShare(data: {
    recipeId: string;
    title: string;
    description?: string;
    category?: string;
    tags?: string;
    recipeData: string;
    visibility: ShareVisibility;
  }): Promise<SharedRecipeRecord> {
    return this.request<SharedRecipeRecord>('POST', '/api/share', data);
  }

  async updateShareVisibility(id: string, visibility: ShareVisibility): Promise<void> {
    await this.request('PUT', `/api/share/${id}`, { visibility });
  }

  async getSharedRecipe(shareToken: string): Promise<SharedRecipeRecord> {
    return this.request<SharedRecipeRecord>('GET', `/api/share/${shareToken}`);
  }

  async searchCommunity(params: {
    q?: string;
    category?: string;
    sort?: string;
    page?: number;
    perPage?: number;
  }): Promise<SharedRecipeRecord[]> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.category) query.set('category', params.category);
    if (params.sort) query.set('sort', params.sort);
    if (params.page) query.set('page', String(params.page));
    if (params.perPage) query.set('perPage', String(params.perPage));
    const qs = query.toString();
    return this.request<SharedRecipeRecord[]>('GET', `/api/community${qs ? `?${qs}` : ''}`);
  }

  async getCommunityCategories(): Promise<{ id: string; name: string; slug: string }[]> {
    return this.request('GET', '/api/community/categories');
  }
}
