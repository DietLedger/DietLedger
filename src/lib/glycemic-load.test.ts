import { describe, expect, it } from 'vitest';
import { computeRecipeGL, sumGL } from './glycemic-load';
import { emptyNutrition } from './recipe-types';
describe('published recipe glycemic load', () => {
  it('does not infer low/zero GL from descriptive ingredients, even in linked parents', () => {
    const custom = { id: 'custom', servings: 4, customNutrition: { basis: 'recipeTotal' as const, nutrients: { ...emptyNutrition(), calories: 992, totalCarbs: 72 }, source: 'Published' }, ingredients: [{ name: 'Chicken', amount: 1, linkedRecipeId: null, totalCarbs: 0, dietaryFiber: 0 }] };
    expect(computeRecipeGL(custom)).toBeNull();
    expect(sumGL([computeRecipeGL(custom), { gl: 1, category: 'Low', colorClass: '', matchedCount: 1, totalCount: 1 }])).toBeNull();
    const parent = { id: 'parent', servings: 2, ingredients: [{ name: 'Chicken', amount: 0.5, linkedRecipeId: 'custom', totalCarbs: 36, dietaryFiber: 0 }] };
    expect(computeRecipeGL(parent, 1, [custom, parent])).toBeNull();
    expect(computeRecipeGL(parent)).toBeNull();
  });
});
