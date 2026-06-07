import { describe, it, expect } from 'vitest';
import {
  classifyIngredient,
  computeScaleFactor,
  formatScaledAmount,
  scaleIngredient,
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
    expect(computeScaleFactor({ mode: 'multiplier', multiplier: 1.5 })).toBe(1.5);
  });

  it('defaults multiplier to 1', () => {
    expect(computeScaleFactor({ mode: 'multiplier' })).toBe(1);
  });

  it('computes calorie target mode', () => {
    expect(computeScaleFactor({ mode: 'calorieTarget', originalCalories: 500, calorieTarget: 250 })).toBe(0.5);
  });

  it('returns 1 for zero original servings', () => {
    expect(computeScaleFactor({ mode: 'servings', originalServings: 0, targetServings: 4 })).toBe(1);
  });

  it('returns 1 for unknown mode', () => {
    expect(computeScaleFactor({ mode: 'unknown' as any })).toBe(1);
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

  it('caps leavening scaling at 1.5x', () => {
    const result = scaleIngredient(
      { id: '1', name: 'Baking Powder', amount: 1, unit: 'tsp' },
      4,
    );
    expect(result.scaledAmount).toBe(1.5);
    expect(result.classification).toBe('leavening');
    expect(result.scaleReason).toContain('capped');
  });

  it('applies sub-linear scaling to spices', () => {
    const result = scaleIngredient(
      { id: '1', name: 'Salt', amount: 1, unit: 'tsp' },
      4,
    );
    expect(result.scaledAmount).toBeCloseTo(Math.pow(4, 0.5), 5);
    expect(result.classification).toBe('spice');
  });

  it('does not cap spices when scaling down', () => {
    const result = scaleIngredient(
      { id: '1', name: 'Salt', amount: 2, unit: 'tsp' },
      0.5,
    );
    expect(result.scaledAmount).toBe(1);
  });
});
