import { describe, expect, it } from 'vitest';
import { emptyNutrition, recipeNutrition, recipeMissingNutrients, toPublicRecipe, type Recipe } from './recipe-types';
import { buildRecipeAsIngredientData, buildRescaledIngredientUpdate } from '@/hooks/use-recipes';
import { scaleRecipe } from './recipe-scaling';
import type { RecipeRecord } from './types';

const chicken = {
  id: 'chicken', name: 'Crunchy Chicken Fingers', servings: 4, servingName: '3 chicken strips, ¼ cup sauce',
  description: 'Published recipe description', instructions: null, ingredientGroups: [], createdAt: '', updatedAt: '',
  customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 992, protein: 80, sodium: 1688 }, source: 'NHLBI', sourceLabel: '248 calories per serving', missingNutrients: ['vitaminD'] },
  ingredients: [{ ...emptyNutrition(), id: 'descriptive', recipeId: 'chicken', name: 'Chicken', amount: 1, unit: 'lb', description: '', calories: 100, fdcId: 0, groupId: null, linkedRecipeId: null, prepInstructions: [], zeroNutritionOverride: false }],
} satisfies RecipeRecord;

describe('published whole recipe nutrition', () => {
  it('overrides ingredient snapshots; yield redistributes fixed totals', () => {
    expect(recipeNutrition(chicken).calories).toBe(992);
    expect(recipeMissingNutrients(chicken)).toEqual(['vitaminD']);
    expect(recipeNutrition(chicken, 1 / chicken.servings).calories).toBe(248);
    const redistributed = { ...chicken, servings: 8 };
    expect(recipeNutrition(redistributed, 1 / redistributed.servings).calories).toBe(124);
    expect(recipeNutrition({ ingredients: chicken.ingredients }).calories).toBe(100);
  });

  it('converts API metadata and uses whole recipe fractions for linked parents', () => {
    const local = toPublicRecipe(chicken);
    expect(local.description).toBe(chicken.description);
    expect(local.customNutrition).toEqual(chicken.customNutrition);
    const linked = buildRecipeAsIngredientData(local, 0.5);
    expect(linked.calories).toBe(496);
    expect(linked.missingNutrients).toEqual(['vitaminD']);
    const parent = { ingredients: [{ ...linked, id: 'linked', storageLocation: '' }] };
    expect(recipeNutrition(parent, 0.5).calories).toBe(248);
    expect(recipeMissingNutrients(parent)).toEqual(['vitaminD']);
    expect(buildRescaledIngredientUpdate(parent.ingredients[0], { amount: 0.25 }).missingNutrients).toEqual(['vitaminD']);
    const refreshed = toPublicRecipe({ ...chicken, customNutrition: undefined, ingredients: [{ ...linked, id: 'linked', recipeId: 'parent' }] });
    expect(recipeMissingNutrients(refreshed)).toEqual(['vitaminD']);
    expect(buildRescaledIngredientUpdate(parent.ingredients[0], { amount: 0.25 }).calories).toBe(248);
  });

  it('full recipe scaling multiplies custom totals and retains provenance/missing values', () => {
    const local = toPublicRecipe(chicken) as Recipe;
    const scaled = scaleRecipe(local, { mode: 'multiplier', multiplier: 2, originalServings: 4 });
    expect(scaled.customNutrition).toEqual({ ...chicken.customNutrition, nutrients: { ...emptyNutrition(), calories: 1984, protein: 160, sodium: 3376 } });
    expect(scaled.servings).toBe(8);
    expect(chicken.customNutrition.nutrients.calories).toBe(992);
  });
});
