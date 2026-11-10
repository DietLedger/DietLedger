import { describe, expect, it } from 'vitest';
import { formatCookbookIngredient } from './cookbook-unit-display';

describe('cookbook PDF ingredient measurements', () => {
  it('converts weight across Imperial and Metric, without changing stored amounts', () => {
    expect(formatCookbookIngredient(1, 'lb', 'metric')).toEqual({ text: '453.59 g', retainedOriginal: false });
    expect(formatCookbookIngredient(100, 'g', 'imperial')).toEqual({ text: '3.53 oz', retainedOriginal: false });
    expect(formatCookbookIngredient(1, 'pound', 'grams')).toEqual({ text: '453.59 g', retainedOriginal: false });
  });

  it('converts recognized volume only to another volume in Imperial and Metric', () => {
    expect(formatCookbookIngredient(1, 'cup', 'metric')).toEqual({ text: '236.59 ml', retainedOriginal: false });
    expect(formatCookbookIngredient(1000, 'ml', 'imperial')).toEqual({ text: '4.23 cups', retainedOriginal: false });
    expect(formatCookbookIngredient(2, 'cups', 'metric')).toEqual({ text: '473.18 ml', retainedOriginal: false });
  });

  it('formats exact weights as grams, not kilograms', () => {
    expect(formatCookbookIngredient(1, 'kg', 'grams')).toEqual({ text: '1000 g', retainedOriginal: false });
    expect(formatCookbookIngredient(1, 'oz', 'grams')).toEqual({ text: '28.35 g', retainedOriginal: false });
  });

  it('never rounds a small nonzero converted weight to zero', () => {
    expect(formatCookbookIngredient(0.001, 'g', 'imperial')).toEqual({ text: '0.000035 oz', retainedOriginal: false });
    expect(formatCookbookIngredient(0.001, 'g', 'metric')).toEqual({ text: '0.001 g', retainedOriginal: false });
  });

  it('uses the matching USDA food-specific portion mass for volume and count', () => {
    expect(formatCookbookIngredient(2, 'cup', 'grams', [
      { amount: 1, measureUnit: 'cup', modifier: '', portionDescription: '1 cup', gramWeight: 244 },
    ])).toEqual({ text: '488 g', retainedOriginal: false });
    expect(formatCookbookIngredient(3, 'slice', 'grams', [
      { amount: 2, measureUnit: 'slice', modifier: '', portionDescription: '2 slices', gramWeight: 50 },
    ])).toEqual({ text: '75 g', retainedOriginal: false });
    expect(formatCookbookIngredient(2, 'tablespoons', 'grams', [
      { amount: 1, measureUnit: 'tablespoon', modifier: '', portionDescription: '1 tablespoon', gramWeight: 14 },
    ])).toEqual({ text: '28 g', retainedOriginal: false });
    expect(formatCookbookIngredient(1, 'cup', 'grams', [
      { amount: 1, measureUnit: 'undetermined', modifier: '', portionDescription: '1 cup', gramWeight: 220 },
    ])).toEqual({ text: '220 g', retainedOriginal: false });
    expect(formatCookbookIngredient(2, 'each', 'grams', [
      { amount: 1, measureUnit: 'each', modifier: '', portionDescription: '1 each', gramWeight: 54 },
    ])).toEqual({ text: '108 g', retainedOriginal: false });
    expect(formatCookbookIngredient(1, 'cup', 'grams', [
      { amount: 1, measureUnit: 'undetermined', modifier: 'cup', portionDescription: '', gramWeight: 230 },
    ])).toEqual({ text: '230 g', retainedOriginal: false });
  });

  it('refuses ambiguous, invalid, or modified portions instead of assuming a weight', () => {
    const cup = (gramWeight: number, modifier = '') => ({ amount: 1, measureUnit: 'cup', modifier, portionDescription: '1 cup', gramWeight });
    expect(formatCookbookIngredient(1, 'cup', 'grams', [cup(120), cup(240)])).toEqual({ text: '1 cup', retainedOriginal: true });
    expect(formatCookbookIngredient(1, 'cup', 'grams', [cup(0)])).toEqual({ text: '1 cup', retainedOriginal: true });
    expect(formatCookbookIngredient(1, 'cup', 'grams', [cup(120, 'chopped')])).toEqual({ text: '1 cup', retainedOriginal: true });
    expect(formatCookbookIngredient(1, 'cup', 'grams', [
      { amount: 1, measureUnit: 'tablespoon', modifier: '', portionDescription: '1 tablespoon', gramWeight: 12 },
    ])).toEqual({ text: '1 cup', retainedOriginal: true });
  });

  it('preserves unconvertible amounts rather than inventing mass for count, volume or unknown units', () => {
    expect(formatCookbookIngredient(2, 'whole', 'grams')).toEqual({ text: '2 whole', retainedOriginal: true });
    expect(formatCookbookIngredient(1, 'cup', 'grams')).toEqual({ text: '1 cup', retainedOriginal: true });
    expect(formatCookbookIngredient(3, 'handfuls', 'grams')).toEqual({ text: '3 handfuls', retainedOriginal: true });
    expect(formatCookbookIngredient(2, 'whole', 'metric')).toEqual({ text: '2 whole', retainedOriginal: true });
  });
});
