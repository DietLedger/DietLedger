import { describe, it, expect } from 'vitest';
import { buildRescaledIngredientUpdate } from './use-recipes';
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
    ...overrides,
  };
}

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
