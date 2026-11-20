import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharedRecipeToBundle } from './recipe-import-bundle';
import { readRecipeBundleFile } from './recipe-bundles';
import { GoApiClient } from './api-client-go';
import { emptyNutrition, toPublicRecipe } from './recipe-types';
import type { RecipeRecord, SharedRecipeRecord } from './types';

const customNutrition = { basis: 'recipeTotal' as const, nutrients: { ...emptyNutrition(), calories: 992 }, source: 'NHLBI', missingNutrients: ['vitaminD'], sourceLabel: '248 kcal per serving' };
const recipe: RecipeRecord = { id: 'one', name: 'Chicken', description: 'Chef notes', customNutrition, servings: 4, servingName: '3 strips', instructions: null, ingredientGroups: [], createdAt: '', updatedAt: '', ingredients: [{ ...emptyNutrition(), id: 'descriptive', recipeId: 'one', fdcId: 0, name: 'Chicken breast', amount: 1, unit: 'lb', description: '', groupId: null, linkedRecipeId: null, prepInstructions: [], position: 2, zeroNutritionOverride: false, missingNutrients: ['vitaminD'] }] };
const file = (bundle: unknown) => ({ name: 'recipes.json', text: async () => JSON.stringify(bundle) }) as File;

afterEach(() => vi.unstubAllGlobals());
describe('custom recipe transfer', () => {
  it('keeps custom facts/description in shared snapshot native v4 and accepts the round trip', async () => {
    const shared = { id: 'share', title: 'Chicken', recipeData: JSON.stringify(toPublicRecipe(recipe)) } as SharedRecipeRecord;
    const bundle = sharedRecipeToBundle(shared);
    expect(bundle.version).toBe(4);
    expect(bundle.recipes![0]).toMatchObject({ description: recipe.description, customNutrition });
    expect((bundle.recipes![0] as { ingredients: unknown[] }).ingredients[0]).toMatchObject({ zeroNutritionOverride: false });
    expect(await readRecipeBundleFile(file(bundle))).toEqual(bundle);
    const described = sharedRecipeToBundle({ ...shared, recipeData: JSON.stringify({ ...recipe, customNutrition: undefined }) });
    expect(described.version).toBe(4);
    const linkedOnly = sharedRecipeToBundle({ ...shared, recipeData: JSON.stringify({ ...recipe, description: undefined, customNutrition: undefined }) });
    expect(linkedOnly.version).toBe(4);
    expect((linkedOnly.recipes![0] as { ingredients: unknown[] }).ingredients[0]).toMatchObject({ missingNutrients: ['vitaminD'] });
  });

  it('reads v4 with or without pending imports; rejects malformed staging without discarding it', async () => {
    const base = { format: 'dietledger.recipe-bundle', version: 4, recipes: [recipe] };
    await expect(readRecipeBundleFile(file(base))).resolves.toEqual(base);
    const backup = { ...base, pendingImports: { version: 1, batches: [{ recipe }] } };
    await expect(readRecipeBundleFile(file(backup))).resolves.toEqual(backup);
    await expect(readRecipeBundleFile(file({ ...base, pendingImports: { version: 2 } }))).rejects.toThrow('Unsupported pending imports');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: backup }) }));
    await expect(new GoApiClient('').exportOwnerRecipeBookBackup()).resolves.toEqual(backup);
  });

  it('updates custom fields without dropping descriptive ingredient intent, and can explicitly clear the override', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: recipe }) }));
    const api = new GoApiClient('');
    const updated = await api.updateRecipe(recipe.id, recipe);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload).toMatchObject({ description: 'Chef notes', customNutrition, ingredients: [{ zeroNutritionOverride: false, position: 2, missingNutrients: ['vitaminD'] }] });
    await api.addIngredient(recipe.id, recipe.ingredients[0]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.lastCall?.[1]?.body)).missingNutrients).toEqual(['vitaminD']);
    expect(toPublicRecipe(updated).customNutrition).toEqual(customNutrition);
    await api.updateRecipe(recipe.id, { customNutrition: null });
    expect(JSON.parse(String(vi.mocked(fetch).mock.lastCall?.[1]?.body)).customNutrition).toBeNull();
  });
});
