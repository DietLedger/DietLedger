import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { getApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { sumNutrition } from '@/lib/recipe-types';
import { buildRescaledIngredientUpdate, buildIngredientRematchUpdate, buildIngredientData, defaultLocationForFood, useAddIngredient, useUpdateIngredient, useFoodStorageDefaults, useFoodStorageDefaultLookup } from './use-recipes';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, getApiClient: vi.fn() };
});
import type { Ingredient } from '@/lib/recipe-types';

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-1',
    fdcId: 123,
    name: 'Flour',
    amount: 100,
    unit: 'g',
    description: '',
    calories: 0,
    totalFat: 0,
    saturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
    sodium: 0,
    totalCarbs: 0,
    dietaryFiber: 0,
    totalSugars: 0,
    addedSugars: 0,
    protein: 0,
    vitaminD: 0,
    calcium: 0,
    iron: 0,
    potassium: 0,
    groupId: null,
    linkedRecipeId: null,
    prepInstructions: [],
    storageLocation: '',
    position: 0,
    zeroNutritionOverride: false,
    ...overrides,
  };
}

describe('saved first-choice defaults', () => {
  it('only updates the ingredient, then reloads the server-owned preference cache for later additions', async () => {
    const getFoodStorageDefaults = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([{ sourceType: 'usda', sourceKey: '123', location: 'Pantry' }]);
    const updateIngredient = vi.fn().mockResolvedValue(makeIngredient({ storageLocation: 'Pantry' }));
    const updateFoodStorageDefault = vi.fn();
    vi.mocked(getApiClient).mockReturnValue({ getFoodStorageDefaults, updateIngredient, updateFoodStorageDefault } as any);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
    const defaults = renderHook(() => useFoodStorageDefaults(), { wrapper });
    await waitFor(() => expect(defaults.result.current.data).toEqual([]));
    const update = renderHook(() => useUpdateIngredient(), { wrapper });
    await act(async () => { await update.result.current.mutateAsync({ recipeId: 'recipe-1', ingredientId: 'ing-1', data: { storageLocation: 'Pantry' } }); });
    await waitFor(() => expect(defaults.result.current.data).toEqual([{ sourceType: 'usda', sourceKey: '123', location: 'Pantry' }]));
    expect(updateFoodStorageDefault).not.toHaveBeenCalled();
    expect(updateIngredient).toHaveBeenCalledWith('recipe-1', 'ing-1', { storageLocation: 'Pantry' });
  });
});

describe('useFoodStorageDefaultLookup', () => {
  it('falls back to cached defaults when the optional lookup fails', async () => {
    const cachedDefaults = [{ sourceType: 'usda' as const, sourceKey: '174260', location: 'Pantry' }];
    const getFoodStorageDefaults = vi.fn().mockRejectedValue(new Error('missing Authorization header'));
    vi.mocked(getApiClient).mockReturnValue({ getFoodStorageDefaults } as any);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['food-storage-defaults'], cachedDefaults);
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
    const lookup = renderHook(() => useFoodStorageDefaultLookup(), { wrapper });

    await expect(lookup.result.current()).resolves.toEqual(cachedDefaults);
    expect(getFoodStorageDefaults).not.toHaveBeenCalled();
  });

  it('returns no preselection when defaults have not loaded yet, without making the ingredient action wait on auth', async () => {
    const getFoodStorageDefaults = vi.fn().mockRejectedValue(new Error('missing Authorization header'));
    vi.mocked(getApiClient).mockReturnValue({ getFoodStorageDefaults } as any);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
    const lookup = renderHook(() => useFoodStorageDefaultLookup(), { wrapper });

    await expect(lookup.result.current()).resolves.toEqual([]);
    expect(getFoodStorageDefaults).not.toHaveBeenCalled();
  });
});

describe('useAddIngredient', () => {
  it('adds the server-saved storage location to the active recipe cache immediately', async () => {
    const existing = makeIngredient({ calories: 50 });
    const created = { ...makeIngredient({ id: 'ing-2', calories: 0, storageLocation: 'Freezer' }), recipeId: 'recipe-1' };
    const addIngredient = vi.fn().mockResolvedValue(created);
    vi.mocked(getApiClient).mockReturnValue({ addIngredient } as any);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.recipes.detail('recipe-1'), {
      id: 'recipe-1', ingredients: [existing],
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
    const add = renderHook(() => useAddIngredient(), { wrapper });

    await act(async () => {
      await add.result.current.mutateAsync({ recipeId: 'recipe-1', ingredient: created });
    });

    const cachedRecipe = client.getQueryData<{ ingredients: Ingredient[] }>(queryKeys.recipes.detail('recipe-1'))!;
    expect(cachedRecipe.ingredients).toHaveLength(2);
    expect(cachedRecipe.ingredients[1]).toMatchObject({ id: 'ing-2', storageLocation: 'Freezer' });
  });
});

describe('useUpdateIngredient', () => {
  it('updates the cached recipe ingredient and totals immediately from the saved server result', async () => {
    const original = makeIngredient({ calories: 40 });
    const other = makeIngredient({ id: 'ing-2', calories: 90 });
    const updated = { ...makeIngredient({ calories: 0, unit: 'tsp' }), recipeId: 'recipe-1' };
    const updateIngredient = vi.fn().mockResolvedValue(updated);
    vi.mocked(getApiClient).mockReturnValue({ updateIngredient } as any);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.recipes.detail('recipe-1'), {
      id: 'recipe-1', ingredients: [original, other],
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
    const update = renderHook(() => useUpdateIngredient(), { wrapper });

    await act(async () => {
      await update.result.current.mutateAsync({ recipeId: 'recipe-1', ingredientId: 'ing-1', data: { calories: 0, unit: 'tsp' } });
    });

    const cachedRecipe = client.getQueryData<{ ingredients: Ingredient[] }>(queryKeys.recipes.detail('recipe-1'))!;
    expect(cachedRecipe.ingredients[0]).toMatchObject({ calories: 0, unit: 'tsp' });
    expect(sumNutrition(cachedRecipe.ingredients).calories).toBe(90);
  });
});

describe('buildRescaledIngredientUpdate', () => {
  it('preserves groupId when editing a grouped ingredient', () => {
    const ingredient = makeIngredient({ groupId: 'group-abc' });
    const update = buildRescaledIngredientUpdate(ingredient, {
      name: 'Whole Wheat Flour',
      amount: 100,
      unit: 'g',
    });
    expect(update.groupId).toBe('group-abc');
  });

  it('preserves groupId: null for an ungrouped ingredient', () => {
    const ingredient = makeIngredient({ groupId: null });
    const update = buildRescaledIngredientUpdate(ingredient, {
      name: 'Flour',
      amount: 100,
      unit: 'g',
    });
    expect(update.groupId).toBeNull();
  });

  it('preserves linkedRecipeId when editing a linked ingredient', () => {
    const ingredient = makeIngredient({ linkedRecipeId: 'recipe-xyz' });
    const update = buildRescaledIngredientUpdate(ingredient, {
      name: 'Sub-recipe',
      amount: 100,
      unit: 'g',
    });
    expect(update.linkedRecipeId).toBe('recipe-xyz');
  });

  it('preserves explicit zero intent when editing non-nutrition parameters', () => {
    const update = buildRescaledIngredientUpdate(makeIngredient({ fdcId: -3, sourceType: 'manual', zeroNutritionOverride: true }), { name: 'Trace spice' });
    expect(update.zeroNutritionOverride).toBe(true);
  });

  it('preserves nutrient values when editing non-nutrition parameters', () => {
    const ingredient = makeIngredient({
      calories: 120,
      totalFat: 3,
      saturatedFat: 1,
      transFat: 0,
      cholesterol: 5,
      sodium: 80,
      totalCarbs: 20,
      dietaryFiber: 2,
      totalSugars: 4,
      addedSugars: 1,
      protein: 6,
      vitaminD: 0.5,
      calcium: 30,
      iron: 1.2,
      potassium: 140,
    });
    const update = buildRescaledIngredientUpdate(ingredient, {
      name: 'Whole Wheat Flour',
      description: 'updated',
      amount: 100,
      unit: 'g',
      prepInstructions: ['sifted'],
      storageLocation: 'pantry',
    });
    expect(update).toMatchObject({
      calories: 120,
      totalFat: 3,
      saturatedFat: 1,
      transFat: 0,
      cholesterol: 5,
      sodium: 80,
      totalCarbs: 20,
      dietaryFiber: 2,
      totalSugars: 4,
      addedSugars: 1,
      protein: 6,
      vitaminD: 0.5,
      calcium: 30,
      iron: 1.2,
      potassium: 140,
    });
  });

  it('still applies the edited fields', () => {
    const ingredient = makeIngredient({ groupId: 'group-abc' });
    const update = buildRescaledIngredientUpdate(ingredient, {
      name: 'New Name',
      description: 'updated desc',
      amount: 200,
      unit: 'g',
      prepInstructions: ['diced'],
      storageLocation: 'pantry',
    });
    expect(update.name).toBe('New Name');
    expect(update.description).toBe('updated desc');
    expect(update.amount).toBe(200);
    expect(update.unit).toBe('g');
    expect(update.prepInstructions).toEqual(['diced']);
    expect(update.storageLocation).toBe('pantry');
    expect(update.groupId).toBe('group-abc');
  });
});

describe('buildIngredientData', () => {
  it('records deliberate no-nutrition intent separately from numeric zeros', () => {
    const ingredient = buildIngredientData({
      fdcId: -3, description: 'Water', brandOwner: null, dataType: 'Manual', servingSize: 100, servingSizeUnit: 'g',
      nutrients: { calories: 0, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 0, totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0, calcium: 0, iron: 0, potassium: 0 },
    }, 1, 'cup');
    expect(ingredient).toMatchObject({ fdcId: -3, sourceType: 'manual', zeroNutritionOverride: true });
  });

  it('floors negative analytical USDA nutrients from existing food rows while preserving positive values', () => {
    const food = {
      fdcId: 2727569, description: 'Chicken, breast, meat and skin, raw',
      brandOwner: null, dataType: 'Foundation', servingSize: 100, servingSizeUnit: 'g',
      nutrients: {
        calories: 133, totalFat: 4.78, saturatedFat: 0, transFat: 0,
        cholesterol: 75.4, sodium: 48.1, totalCarbs: -0.43, dietaryFiber: 0,
        totalSugars: 0, addedSugars: 0, protein: 21.4, vitaminD: 0,
        calcium: -0.01, iron: 0.35, potassium: 332,
      },
    };
    const ingredient = buildIngredientData(food, 100, 'g');
    expect(ingredient).toMatchObject({
      fdcId: 2727569, amount: 100, unit: 'g', calories: 133, protein: 21.4,
      totalCarbs: 0, calcium: 0, totalFat: 4.78, sourceType: 'usda',
    });
  });
});

describe('food storage defaults', () => {
  const food = {
    fdcId: 456, description: 'Potatoes', brandOwner: null, dataType: 'Foundation',
    servingSize: 100, servingSizeUnit: 'g',
    nutrients: { calories: 80, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0,
      sodium: 0, totalCarbs: 20, dietaryFiber: 0, totalSugars: 0, addedSugars: 0,
      protein: 2, vitaminD: 0, calcium: 0, iron: 0, potassium: 0 },
  };
  const defaults = [
    { sourceType: 'usda' as const, sourceKey: '456', location: 'Pantry' },
    { sourceType: 'custom_food' as const, sourceKey: 'custom-9', location: 'Freezer' },
  ];

  it('preselects only the exact database food and never manual food with the same name', () => {
    expect(buildIngredientData(food, 100, 'g', defaultLocationForFood(food, defaults)).storageLocation).toBe('Pantry');
    expect(defaultLocationForFood({ ...food, fdcId: -2, dataType: 'Custom', customFoodId: 'custom-9' }, defaults)).toBe('Freezer');
    expect(defaultLocationForFood({ ...food, fdcId: -2, dataType: 'Manual' }, defaults)).toBe('');
    expect(defaultLocationForFood({ ...food, fdcId: 999 }, defaults)).toBe('');
  });

  it('keeps the real custom food ID when adding from search', () => {
    expect(buildIngredientData({ ...food, fdcId: -2, dataType: 'Custom', customFoodId: 'custom-9' }, 100, 'g', 'Freezer'))
      .toMatchObject({ fdcId: -2, sourceType: 'custom_food', sourceKey: 'custom-9', storageLocation: 'Freezer' });
  });

  it('applies a rematch default only when the recipe-specific location is empty', () => {
    const original = makeIngredient({ storageLocation: 'Refrigerator' });
    expect(buildIngredientRematchUpdate(original, food, 'Pantry').storageLocation).toBe('Refrigerator');
    expect(original.storageLocation).toBe('Refrigerator');
    expect(buildIngredientRematchUpdate(makeIngredient({ storageLocation: '' }), food, 'Pantry').storageLocation).toBe('Pantry');
    expect(buildIngredientRematchUpdate(makeIngredient({ storageLocation: '' }), food).storageLocation).toBe('');
  });
});

describe('buildIngredientRematchUpdate', () => {
  it('clears an explicit zero override when rematched to a database food', () => {
    const ingredient = makeIngredient({ fdcId: -3, sourceType: 'manual', zeroNutritionOverride: true });
    const food = {
      fdcId: 456, description: 'Onions', brandOwner: null, dataType: 'Foundation', servingSize: 100, servingSizeUnit: 'g',
      nutrients: { calories: 40, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 0, totalCarbs: 9, dietaryFiber: 2, totalSugars: 4, addedSugars: 0, protein: 1, vitaminD: 0, calcium: 0, iron: 0, potassium: 0 },
    };
    expect(buildIngredientRematchUpdate(ingredient, food).zeroNutritionOverride).toBe(false);
  });

  it('treats a legacy blank unit as grams when rematching at 100', () => {
    const ingredient = makeIngredient({ amount: 100, unit: '' });
    const chicken = {
      fdcId: 171514, description: 'Chicken breast tenders, breaded, cooked, microwaved', brandOwner: null,
      dataType: 'SR Legacy', servingSize: 100, servingSizeUnit: 'g',
      nutrients: {
        calories: 252, totalFat: 12.9, saturatedFat: 3.2, transFat: 0, cholesterol: 45,
        sodium: 446, totalCarbs: 17.6, dietaryFiber: 0, totalSugars: 0, addedSugars: 0,
        protein: 16.4, vitaminD: 0, calcium: 14, iron: 1, potassium: 225,
      },
    };

    expect(buildIngredientRematchUpdate(ingredient, chicken, undefined, 100, ''))
      .toMatchObject({ fdcId: 171514, calories: 252, totalFat: 12.9, amount: 100, unit: 'g' });
  });

  it('preserves the selected peanuts snapshot at 100 grams', () => {
    const ingredient = makeIngredient({ amount: 100, unit: 'g' });
    const peanuts = {
      fdcId: 174260, description: 'Peanuts, all types, cooked, boiled, with salt', brandOwner: null,
      dataType: 'SR Legacy', servingSize: 100, servingSizeUnit: 'g',
      nutrients: {
        calories: 318, totalFat: 22, saturatedFat: 3, transFat: 0, cholesterol: 0,
        sodium: 751, totalCarbs: 21, dietaryFiber: 9, totalSugars: 4, addedSugars: 0,
        protein: 13, vitaminD: 0, calcium: 55, iron: 2, potassium: 180,
      },
    };

    expect(buildIngredientRematchUpdate(ingredient, peanuts, undefined, 100, 'g'))
      .toMatchObject({ fdcId: 174260, calories: 318, totalFat: 22, sodium: 751, totalCarbs: 21, protein: 13, amount: 100, unit: 'g' });
  });

  it('uses USDA food portions to rescale rematches when the recipe unit is not directly convertible to grams', () => {
    const ingredient = makeIngredient({ fdcId: -2, amount: 2, unit: 'piece' });
    const food = {
      fdcId: 456, description: 'Onions, white, raw', brandOwner: null,
      dataType: 'Foundation', servingSize: 100, servingSizeUnit: 'g',
      portions: [{ amount: 1, measureUnit: 'piece', modifier: '', portionDescription: '1 piece', gramWeight: 50 }],
      nutrients: {
        calories: 40, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0,
        sodium: 0, totalCarbs: 9, dietaryFiber: 2, totalSugars: 4, addedSugars: 0,
        protein: 1, vitaminD: 0, calcium: 0, iron: 0, potassium: 0,
      },
    };

    expect(buildIngredientRematchUpdate(ingredient, food)).toMatchObject({ calories: 40, totalCarbs: 9, amount: 2, unit: 'piece' });
  });

  it('recalculates rematch nutrition from the editor’s current amount and unit drafts', () => {
    const ingredient = makeIngredient({ fdcId: -2, amount: 100, unit: 'g' });
    const food = {
      fdcId: 456, description: 'Onions, white, raw', brandOwner: null,
      dataType: 'Foundation', servingSize: 100, servingSizeUnit: 'g',
      portions: [{ amount: 1, measureUnit: 'piece', modifier: '', portionDescription: '1 piece', gramWeight: 50 }],
      nutrients: {
        calories: 40, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0,
        sodium: 0, totalCarbs: 9, dietaryFiber: 2, totalSugars: 4, addedSugars: 0,
        protein: 1, vitaminD: 0, calcium: 0, iron: 0, potassium: 0,
      },
    };

    expect(buildIngredientRematchUpdate(ingredient, food, undefined, 2, 'piece'))
      .toMatchObject({ calories: 40, totalCarbs: 9, amount: 2, unit: 'piece' });
  });

  it('uses the new database ID and nutrition while preserving recipe-specific details', () => {
    const ingredient = makeIngredient({
      fdcId: -2, name: 'My diced potato', amount: 200, unit: 'g', description: 'peeled',
      groupId: 'group-abc', prepInstructions: ['diced'], storageLocation: 'pantry',
      sourceType: 'manual', calories: 0,
    });
    const food = {
      fdcId: 456, description: 'Potatoes, raw', brandOwner: null,
      dataType: 'Foundation', servingSize: 100, servingSizeUnit: 'g',
      nutrients: {
        calories: 80, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0,
        sodium: 0, totalCarbs: 20, dietaryFiber: 2, totalSugars: 0, addedSugars: 0,
        protein: 2, vitaminD: 0, calcium: 0, iron: 0, potassium: 0,
      },
    };
    expect(buildIngredientRematchUpdate(ingredient, food)).toMatchObject({
      fdcId: 456, sourceType: 'usda', sourceKey: '456', calories: 160, totalCarbs: 40,
      name: 'My diced potato', amount: 200, unit: 'g', description: 'peeled',
      groupId: 'group-abc', prepInstructions: ['diced'], storageLocation: 'pantry',
    });
  });
});
