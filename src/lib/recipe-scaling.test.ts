import { describe, it, expect } from 'vitest';
import { emptyNutrition } from './recipe-types';
import {
  classifyIngredient,
  computeScaleFactor,
  formatScaledAmount,
  scaleIngredient,
  scaleRecipe,
} from './recipe-scaling';

describe('classifyIngredient', () => {
  it('classifies spices', () => {
    expect(classifyIngredient('Salt')).toBe('spice');
    expect(classifyIngredient('black pepper')).toBe('spice');
    expect(classifyIngredient('Cinnamon')).toBe('spice');
    expect(classifyIngredient('cumin')).toBe('spice');
  });

  it('classifies leavening agents', () => {
    expect(classifyIngredient('Baking Powder')).toBe('leavening');
    expect(classifyIngredient('baking soda')).toBe('leavening');
    expect(classifyIngredient('active dry yeast')).toBe('leavening');
  });

  it('classifies acids', () => {
    expect(classifyIngredient('Lemon Juice')).toBe('acid');
    expect(classifyIngredient('vinegar')).toBe('acid');
    expect(classifyIngredient('balsamic vinegar')).toBe('acid');
  });

  it('does not classify seasoning mentions inside composite foods', () => {
    expect(classifyIngredient('Tomato sauce, canned, no salt added')).toBe('linear');
    expect(classifyIngredient('Tomato sauce with basil')).toBe('linear');
    expect(classifyIngredient('Peppermint candy')).toBe('linear');
    expect(classifyIngredient('Tomato sauce, no spices added')).toBe('linear');
    expect(classifyIngredient('Tomato sauce with basil added')).toBe('linear');
    expect(classifyIngredient('Ground cumin')).toBe('spice');
  });

  it('classifies regular ingredients as linear', () => {
    expect(classifyIngredient('Flour')).toBe('linear');
    expect(classifyIngredient('Chicken Breast')).toBe('linear');
    expect(classifyIngredient('Olive Oil')).toBe('linear');
  });

  it('leavening takes priority over spice', () => {
    expect(classifyIngredient('baking powder')).toBe('leavening');
  });

  it('is case insensitive', () => {
    expect(classifyIngredient('SALT')).toBe('spice');
    expect(classifyIngredient('BAKING SODA')).toBe('leavening');
  });
});

describe('computeScaleFactor', () => {
  it('computes servings mode', () => {
    expect(computeScaleFactor({ mode: 'servings', originalServings: 4, targetServings: 8 })).toBe(2);
  });

  it('computes multiplier mode', () => {
    expect(computeScaleFactor({ mode: 'multiplier', originalServings: 4, multiplier: 1.5 })).toBe(1.5);
  });

  it('defaults multiplier to 1', () => {
    expect(computeScaleFactor({ mode: 'multiplier', originalServings: 4 })).toBe(1);
  });

  it('computes calorie target mode', () => {
    expect(computeScaleFactor({ mode: 'calorieTarget', originalServings: 4, originalCalories: 500, calorieTarget: 250 })).toBe(0.5);
  });

  it('returns 1 for zero original servings', () => {
    expect(computeScaleFactor({ mode: 'servings', originalServings: 0, targetServings: 4 })).toBe(1);
  });

  it('returns 1 for unknown mode', () => {
    expect(computeScaleFactor({ mode: 'unknown' as Parameters<typeof computeScaleFactor>[0]['mode'], originalServings: 4 })).toBe(1);
  });
});

describe('formatScaledAmount', () => {
  it('formats whole numbers', () => {
    expect(formatScaledAmount(3)).toBe('3');
  });

  it('formats zero', () => {
    expect(formatScaledAmount(0)).toBe('0');
  });

  it('formats half', () => {
    expect(formatScaledAmount(0.5)).toBe('\u00BD');
  });

  it('formats quarter', () => {
    expect(formatScaledAmount(0.25)).toBe('\u00BC');
  });

  it('formats whole plus fraction', () => {
    expect(formatScaledAmount(1.5)).toBe(`1 \u00BD`);
  });

  it('formats thirds', () => {
    expect(formatScaledAmount(0.333)).toBe('\u2153');
  });
});

describe('scaleIngredient', () => {
  it('scales linear ingredients proportionally', () => {
    const result = scaleIngredient(
      { id: '1', name: 'Flour', amount: 100, unit: 'g' },
      2,
    );
    expect(result.scaledAmount).toBe(200);
    expect(result.classification).toBe('linear');
    expect(result.scaleReason).toBeUndefined();
  });

  it('scales every ingredient proportionally by default, including seasonings and leaveners', () => {
    const sauce = scaleIngredient({ id: '1', name: 'Tomato sauce, canned, no salt added', amount: 4, unit: 'tbsp' }, 100);
    const basil = scaleIngredient({ id: '2', name: 'Basil, fresh', amount: 1, unit: 'leaf' }, 100);
    const spice = scaleIngredient({ id: '3', name: 'Cumin, ground', amount: 1, unit: 'tsp' }, 4);
    const bakingPowder = scaleIngredient({ id: '4', name: 'Baking Powder', amount: 1, unit: 'tsp' }, 4);

    expect(sauce.scaledAmount).toBe(400);
    expect(basil.scaledAmount).toBe(100);
    expect(spice.scaledAmount).toBe(4);
    expect(bakingPowder.scaledAmount).toBe(4);
  });

  it('uses beta 1.5x seasoning estimate at 2x while fresh herbs remain proportional', () => {
    const cumin = scaleIngredient({ id: '1', name: 'Cumin, ground', amount: 1, unit: 'tsp' }, 2, { largeBatchBeta: true });
    const freshBasil = scaleIngredient({ id: '2', name: 'Basil, fresh', amount: 1, unit: 'leaf' }, 2, { largeBatchBeta: true });
    expect(cumin.scaledAmount).toBe(1.5);
    expect(cumin.scaleReason).toContain('beta');
    expect(freshBasil.scaledAmount).toBe(2);
  });

  it('keeps beta proportional below 2x and above 4x', () => {
    expect(scaleIngredient({ id: '1', name: 'Cumin, ground', amount: 1, unit: 'tsp' }, 1.5, { largeBatchBeta: true }).scaledAmount).toBe(1.5);
    expect(scaleIngredient({ id: '1', name: 'Cumin, ground', amount: 1, unit: 'tsp' }, 100, { largeBatchBeta: true }).scaledAmount).toBe(100);
  });

  it('keeps beta proportional for recipes with published custom nutrition', () => {
    const result = scaleRecipe({ id: 'recipe', servings: 1, totalCalories: 100, customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 100 }, source: 'label' }, ingredients: [{ id: '1', name: 'Cumin, ground', amount: 1, unit: 'tsp' }] }, { mode: 'multiplier', originalServings: 1, multiplier: 2, largeBatchBeta: true });
    expect(result.ingredients[0].scaledAmount).toBe(2);
    expect(result.warnings.join(' ')).toContain('unavailable for recipes with published nutrition');
  });

  it('does not change exact proportional scaling when scaling down', () => {
    const result = scaleIngredient(
      { id: '1', name: 'Salt', amount: 2, unit: 'tsp' },
      0.5,
    );
    expect(result.scaledAmount).toBe(1);
  });
});
