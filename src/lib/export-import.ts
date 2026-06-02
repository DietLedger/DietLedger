import { getApiClient } from './api-client';

export interface ExportData {
  version: 1;
  exportedAt: string;
  data: {
    recipes: unknown[];
    books: unknown[];
    mealPlans: unknown[];
    nutritionProfiles: unknown[];
    templates: unknown[];
    categories: unknown[];
    customFoods: unknown[];
  };
}

export async function exportAllData(): Promise<ExportData> {
  const client = getApiClient();

  const [recipesPage, books, mealPlans, nutritionProfiles, templates, customFoods] = await Promise.all([
    client.getRecipes(1, 10000),
    client.getBooks(),
    client.getMealPlans(),
    client.getNutritionProfiles(),
    client.getTemplates(),
    client.getCustomFoods(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      recipes: recipesPage.data,
      books,
      mealPlans,
      nutritionProfiles,
      templates,
      categories: await client.getCategories(),
      customFoods,
    },
  };
}

export function downloadJson(data: ExportData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dietledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromJson(file: File): Promise<ImportResult> {
  const text = await file.text();
  let data: ExportData;
  try {
    data = JSON.parse(text);
  } catch {
    return { success: false, error: 'Invalid JSON file' };
  }

  if (data.version !== 1 || !data.data) {
    return { success: false, error: 'Unrecognized backup format' };
  }

  const client = getApiClient();
  const counts = { recipes: 0, books: 0, mealPlans: 0, nutritionProfiles: 0, templates: 0, categories: 0, customFoods: 0 };

  try {
    for (const recipe of data.data.recipes as any[]) {
      await client.createRecipe(recipe.name || 'Untitled');
      counts.recipes++;
    }
    for (const book of data.data.books as any[]) {
      await client.createBook(book.title || 'Untitled', book.description, book.coverColor);
      counts.books++;
    }
    for (const plan of data.data.mealPlans as any[]) {
      await client.createMealPlan(plan.name || 'Untitled', plan.weekStart);
      counts.mealPlans++;
    }
    for (const profile of data.data.nutritionProfiles as any[]) {
      await client.createNutritionProfile(profile);
      counts.nutritionProfiles++;
    }
    for (const tmpl of data.data.templates as any[]) {
      await client.createTemplate(tmpl);
      counts.templates++;
    }
    for (const food of data.data.customFoods as any[]) {
      await client.createCustomFood(food);
      counts.customFoods++;
    }
  } catch (e) {
    return { success: false, error: `Import failed: ${e instanceof Error ? e.message : String(e)}`, counts };
  }

  return { success: true, counts };
}

export interface ImportResult {
  success: boolean;
  error?: string;
  counts?: {
    recipes: number;
    books: number;
    mealPlans: number;
    nutritionProfiles: number;
    templates: number;
    categories: number;
    customFoods: number;
  };
}
