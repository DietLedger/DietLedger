import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCookbook } from './pdf-export';
import type { CookbookExportOptions } from './types';

interface TestIngredient {
  name: string;
  amount: number;
  unit: string;
  fdcId: number;
  sourceType: 'usda' | 'manual';
}

const captureHtml = vi.hoisted(() => vi.fn());
const getFoodByFdcId = vi.hoisted(() => vi.fn());
const apiState = vi.hoisted(() => ({
  recipeOrder: ['recipe'],
  recipes: {} as Record<string, { name: string; ingredients: TestIngredient[] }>,
}));

vi.mock('html2canvas', () => ({
  default: async (node: HTMLElement) => {
    captureHtml(node.innerHTML);
    return { toDataURL: () => 'data:image/jpeg;base64,dGVzdA==' };
  },
}));
vi.mock('jspdf', () => ({
  jsPDF: class {
    addImage() {}
    addPage() {}
    output() { return new Blob(['pdf']); }
  },
}));
vi.mock('@/lib/api-client', () => ({
  getApiClient: () => ({
    getBook: async () => ({ title: 'Book', description: '', coverColor: '#fff' }),
    getChaptersByBook: async () => [{ id: 'chapter', title: 'Dinners', position: 0 }],
    getChapterRecipes: async () => apiState.recipeOrder.map((recipeId, position) => ({ recipeId, position })),
    getRecipe: async (recipeId: string) => {
      const recipe = apiState.recipes[recipeId];
      return {
        id: recipeId, name: recipe.name, servings: 2, servingName: 'servings', instructions: null,
        ingredients: recipe.ingredients,
      };
    },
    getFoodByFdcId,
  }),
}));

const options: CookbookExportOptions = {
  bookId: 'book', measurementSystem: 'grams', pageSize: 'letter',
  includeCover: false, includeToc: false, includeIndex: false, includePageNumbers: false,
};

function usdaIngredient(fdcId: number, name = `Food ${fdcId}`): TestIngredient {
  return { name, amount: 1, unit: 'cup', fdcId, sourceType: 'usda' };
}

describe('cookbook PDF measurements', () => {
  beforeEach(() => {
    captureHtml.mockClear();
    getFoodByFdcId.mockReset();
    getFoodByFdcId.mockImplementation(async (fdcId: number) => ({
      portions: fdcId === 101 ? [{ amount: 1, measureUnit: 'cup', modifier: '', portionDescription: '1 cup', gramWeight: 244 }] : [],
    }));
    apiState.recipeOrder = ['recipe'];
    apiState.recipes = {
      recipe: {
        name: 'Dinner',
        ingredients: [
          { ...usdaIngredient(101, 'Milk'), amount: 2 },
          { ...usdaIngredient(102, 'Eggs'), amount: 2, unit: 'whole' },
          { name: 'Flour', amount: 1, unit: 'lb', fdcId: 0, sourceType: 'manual' },
        ],
      },
    };
  });

  it('prints matched food-specific grams but retains original units for missing weights', async () => {
    await exportCookbook(options);
    const html = captureHtml.mock.lastCall?.[0] as string;
    expect(html).toContain('488 g Milk');
    expect(html).toContain('2 whole Eggs');
    expect(html).toContain('453.59 g Flour');
    expect(html).toMatch(/(?:not converted|original units)/i);
    expect(getFoodByFdcId).toHaveBeenCalledWith(101);
  });

  it('prints metric volume without asking the USDA for weights', async () => {
    await exportCookbook({ ...options, measurementSystem: 'metric' });
    const html = captureHtml.mock.lastCall?.[0] as string;
    expect(html).toContain('473.18 ml Milk');
    expect(getFoodByFdcId).not.toHaveBeenCalled();
  });

  it('loads USDA portions across recipes with bounded concurrency', async () => {
    apiState.recipeOrder = Array.from({ length: 8 }, (_, index) => `recipe-${index + 1}`);
    apiState.recipes = Object.fromEntries(apiState.recipeOrder.map((recipeId, index) => [
      recipeId,
      { name: `Recipe ${index + 1}`, ingredients: [usdaIngredient(200 + index)] },
    ]));

    let active = 0;
    let maxActive = 0;
    const pending: Array<() => void> = [];
    getFoodByFdcId.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => pending.push(resolve));
      active -= 1;
      return { portions: [] };
    });

    const exporting = exportCookbook(options);
    await vi.waitFor(() => expect(getFoodByFdcId).toHaveBeenCalledTimes(6));
    expect(maxActive).toBe(6);

    pending.splice(0, 6).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(getFoodByFdcId).toHaveBeenCalledTimes(8));
    pending.splice(0).forEach((resolve) => resolve());

    await exporting;
    expect(maxActive).toBe(6);
  });
});
