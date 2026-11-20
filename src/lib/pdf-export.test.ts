import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCookbook, exportGroceryListPdf, exportMealPlanPdf, exportNutritionDashboard, exportNutritionReport, exportRecipeCard } from './pdf-export';
import type { CookbookExportOptions, CustomRecipeNutrition } from './types';
import { emptyNutrition } from './recipe-types';

interface TestIngredient {
  name: string;
  amount: number;
  unit: string;
  fdcId: number;
  sourceType: 'usda' | 'manual';
  calories?: number;
  missingNutrients?: string[];
}

const captureHtml = vi.hoisted(() => vi.fn());
const captureMarkup = vi.hoisted(() => vi.fn());
const captureElement = vi.hoisted(() => vi.fn());
vi.mock('html-to-image', () => ({ toCanvas: async (node: HTMLElement) => { captureElement(node.innerHTML); return { width: 100, height: 100, toDataURL: () => 'data:image/jpeg;base64,dGVzdA==' }; } }));
const getFoodByFdcId = vi.hoisted(() => vi.fn());
const apiState = vi.hoisted(() => ({
  recipeOrder: ['recipe'],
  recipes: {} as Record<string, { name: string; ingredients: TestIngredient[]; description?: string; customNutrition?: CustomRecipeNutrition; servings?: number; servingName?: string }>,
  book: { title: 'Book', description: '', coverColor: '#fff' } as { title: string; description: string; coverColor: string },
  chapters: [{ id: 'chapter', title: 'Dinners', position: 0 }] as Array<{ id: string; title: string; position: number }>,
  brandKit: undefined as unknown,
  template: undefined as unknown,
}));

vi.mock('html2canvas', () => ({
  default: async (node: HTMLElement) => {
    captureHtml(node.innerHTML);
    captureMarkup(node.outerHTML);
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
    getBook: async () => apiState.book,
    getChaptersByBook: async () => apiState.chapters,
    getBrandKit: async () => apiState.brandKit,
    getTemplate: async () => apiState.template,
    getChapterRecipes: async () => apiState.recipeOrder.map((recipeId, position) => ({ recipeId, position })),
    getRecipe: async (recipeId: string) => {
      const recipe = apiState.recipes[recipeId];
      return {
        id: recipeId, name: recipe.name, servings: recipe.servings ?? 2, servingName: recipe.servingName ?? 'servings', instructions: null,
        description: recipe.description, customNutrition: recipe.customNutrition,
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
    captureMarkup.mockClear();
    getFoodByFdcId.mockReset();
    getFoodByFdcId.mockImplementation(async (fdcId: number) => ({
      portions: fdcId === 101 ? [{ amount: 1, measureUnit: 'cup', modifier: '', portionDescription: '1 cup', gramWeight: 244 }] : [],
    }));
    apiState.recipeOrder = ['recipe'];
    apiState.book = { title: 'Book', description: '', coverColor: '#fff' };
    apiState.chapters = [{ id: 'chapter', title: 'Dinners', position: 0 }];
    apiState.brandKit = undefined;
    apiState.template = undefined;
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

  it('prints authoritative per-serving facts, original source label and unknown nutrients, escaping description/source', async () => {
    apiState.recipes.recipe = { name: 'Chicken', ingredients: [], servings: 4, servingName: '3 chicken strips, ¼ cup sauce', description: '<script>bad()</script>Chef notes', customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 992 }, source: 'NHLBI <img src=x onerror=bad()>', sourceLabel: '248 kcal per serving; <b>original</b>', missingNutrients: ['vitaminD'] } };
    await exportCookbook(options);
    const html = captureHtml.mock.lastCall?.[0] as string;
    expect(html).toContain('248');
    expect(html).toContain('3 chicken strips, ¼ cup sauce');
    expect(html).toContain('Not reported');
    expect(html).toContain('vitaminD');
    expect(html).toContain('Chef notes');
    expect(html).toContain('248 kcal per serving; &lt;b&gt;original&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Vitamin D Not reported');
  });

  it('keeps persisted linked-parent missing facts unknown in PDF after a fresh API read', async () => {
    apiState.recipes.recipe = { name: 'Parent recipe', servings: 4, ingredients: [{ name: 'Linked child', amount: 1, unit: '× recipe', fdcId: 0, sourceType: 'manual', calories: 992, missingNutrients: ['vitaminD'] }] };
    await exportCookbook(options);
    const html = captureHtml.mock.lastCall?.[0] as string;
    expect(html).toContain('248');
    expect(html).toContain('Vitamin D Not reported');
    expect(html).toContain('Not reported: vitaminD');
    expect(html).not.toContain('Vitamin D 0mcg');
  });

  it('prints metric volume without asking the USDA for weights', async () => {
    await exportCookbook({ ...options, measurementSystem: 'metric' });
    const html = captureHtml.mock.lastCall?.[0] as string;
    expect(html).toContain('473.18 ml Milk');
    expect(getFoodByFdcId).not.toHaveBeenCalled();
  });

  it('renders all cookbook content and brand/style inputs as inert text or allowlisted values', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    apiState.recipes.recipe = {
      name: payload,
      description: payload,
      ingredients: [{ ...usdaIngredient(101, payload), amount: 1, unit: `${payload}` }],
    };
    // Cover/TOC/index and brand fields exercise independent template families.
    apiState.book = { title: payload, description: payload, coverColor: 'red; background-image:url(javascript:alert(1))' };
    apiState.chapters = [{ id: 'chapter', title: payload, position: 0 }];
    apiState.brandKit = { name: payload, tagline: payload, primaryColor: 'red" onmouseover="alert(1)', secondaryColor: '#123456', logoDataUrl: 'data:image/svg+xml,<svg onload=alert(1) />' };
    apiState.template = { layout: { theme: { backgroundColor: '#fff; background-image:url(javascript:1)', textColor: '#000', primaryColor: '#000', accentColor: '#000', fontFamily: 'Arial; background:url(javascript:1)', borderRadius: 0 } } };
    apiState.recipes.recipe = { name: payload, ingredients: [{ name: payload, amount: 1, unit: payload, fdcId: 0, sourceType: 'manual' }], description: payload };

    await exportCookbook({ ...options, includeCover: true, includeToc: true, includeIndex: true, brandKitId: 'brand', templateId: 'template' });
    const html = captureHtml.mock.calls.map(([markup]) => String(markup)).join('\n');
    expect(html).not.toContain('<img src=x onerror=');
    expect(html).not.toContain('<svg onload=');
    expect(html).not.toContain('onmouseover=');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  // Exact choices from template-editor-panel.tsx FONT_OPTIONS; shipped packs
  // use inherit and Georgia, serif. Both printable root styles must survive.
  it.each([
    ['inherit', 'system-ui'],
    ['Arial, sans-serif', 'Arial, sans-serif'],
    ['Georgia, serif', 'Georgia, serif'],
    ['"Times New Roman", serif', '"Times New Roman", serif'],
    ['"Courier New", monospace', '"Courier New", monospace'],
    ['Verdana, sans-serif', 'Verdana, sans-serif'],
  ])('preserves the supported template font %s in recipe and index', async (fontFamily, expected) => {
    apiState.template = { layout: { theme: { fontFamily } } };
    await exportCookbook({ ...options, templateId: 'template', includeIndex: true });
    expect(captureMarkup).toHaveBeenCalledTimes(2);
    for (const [markup] of captureMarkup.mock.calls) {
      const root = new DOMParser().parseFromString(String(markup), 'text/html').body.firstElementChild as HTMLElement;
      expect(root.style.fontFamily).toBe(expected);
      expect([...root.attributes].map(attribute => attribute.name)).toEqual(['style']);
      expect(root.querySelector('script, img, svg')).toBeNull();
    }
  });

  it.each([
    'Arial, sans-serif; background-image:url(https://example.invalid/tracker)',
    '"Times New Roman", serif" onmouseover="alert(1)',
    'Georgia, serif</style><img src=x onerror=alert(1)>',
  ])('rejects CSS or attribute breakout appended to a supported font: %s', async (fontFamily) => {
    apiState.template = { layout: { theme: { fontFamily } } };
    await exportCookbook({ ...options, templateId: 'template', includeIndex: true });
    expect(captureMarkup).toHaveBeenCalledTimes(2);
    for (const [markup] of captureMarkup.mock.calls) {
      const root = new DOMParser().parseFromString(String(markup), 'text/html').body.firstElementChild as HTMLElement;
      expect(root.style.fontFamily).toBe('system-ui');
      expect([...root.attributes].map(attribute => attribute.name)).toEqual(['style']);
      expect(root.querySelector('script, img, svg')).toBeNull();
      expect(String(markup)).not.toMatch(/onmouseover|onerror|url\(/);
    }
  });

  it('keeps malicious text inert in meal plans, groceries, reports and the main-document dashboard header', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    captureElement.mockClear();
    await exportMealPlanPdf(payload, [{ date: '', dayLabel: payload, slots: [{ slot: 'morning', label: payload, entries: [{ name: payload, servings: 1, isLeftover: false }] }] }]);
    await exportGroceryListPdf(payload, [{ name: payload, displayAmount: payload, recipeNames: [payload] }]);
    await exportNutritionReport(payload, { start: '2024-01-01', end: '2024-01-02' }, []);
    await exportNutritionDashboard(document.createElement('div'), { profileName: payload, periodLabel: payload, dateRange: payload, dietaryTags: [payload], allergens: [payload] });
    const html = [...captureHtml.mock.calls, ...captureElement.mock.calls].map(([value]) => String(value)).join('\n');
    expect(html).not.toMatch(/<img\s+src="?x/i);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('explains omitted SVG and remote logos in the exported document without requesting them', async () => {
    for (const logoDataUrl of ['https://example.invalid/logo.png', 'data:image/svg+xml,<svg/>']) {
      await exportNutritionReport('Profile', { start: '2026-01-01', end: '2026-01-02' }, [], { id: 'b', name: 'Kitchen', primaryColor: '#123456', secondaryColor: '#abcdef', fontFamily: 'Arial', logoDataUrl, createdAt: '', updatedAt: '' });
      const html = String(captureHtml.mock.lastCall?.[0]);
      expect(html).toContain('Logo omitted');
      expect(html).toContain('external image requests');
      expect(html).not.toContain(logoDataUrl);
    }
  });

  it('preserves a valid raster logo and encodes recipe instructions and serving text', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const logo = 'data:image/png;base64,aGVsbG8=';
    await exportRecipeCard({ id: 'r', name: payload, servings: 1, servingName: payload, description: payload, instructionSteps: [{ id: 's', text: payload, groupId: null }], instructionGroups: [], ingredients: [{ name: payload, amount: 1, unit: payload }], nutrition: emptyNutrition() }, undefined, { id: 'b', name: 'Kitchen', primaryColor: '#123456', secondaryColor: '#abcdef', fontFamily: 'Arial', logoDataUrl: logo, createdAt: '', updatedAt: '' });
    const html = String(captureHtml.mock.lastCall?.[0]);
    expect(html).toContain(logo);
    expect(html).not.toMatch(/<img\s+src="?x/i);
    expect(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g)?.length).toBeGreaterThanOrEqual(5);
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
