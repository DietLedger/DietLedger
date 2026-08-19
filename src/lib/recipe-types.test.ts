import { describe, it, expect } from 'vitest';
import { convertToGrams } from './recipe-types';

// convertToGrams feeds recipe nutrition scaling (grams / 100g multiplies
// per-100g USDA values), so its constants are nutrition-domain-critical.
// These fixtures pin the canonical single-source values (unit-conversion.ts):
// exact for weight, water-density approximation for volume. There must be
// exactly one table of constants in the codebase — this suite fails if a
// second, divergent table sneaks back in (e.g. oz=28.35 instead of 28.3495).
describe('convertToGrams (nutrition scaling)', () => {
  it('weight units use exact factors', () => {
    expect(convertToGrams(1, 'oz')).toBeCloseTo(28.3495, 4);
    expect(convertToGrams(1, 'lb')).toBeCloseTo(453.592, 3);
    expect(convertToGrams(250, 'g')).toBe(250);
    expect(convertToGrams(1, 'kg')).toBe(1000);
    expect(convertToGrams(1, 'mg')).toBeCloseTo(0.001, 6);
  });

  it('volume units use water-density approximation', () => {
    expect(convertToGrams(1, 'cup')).toBe(240);
    expect(convertToGrams(1, 'tbsp')).toBe(15);
    expect(convertToGrams(1, 'tsp')).toBe(5);
    expect(convertToGrams(1, 'ml')).toBe(1);
    expect(convertToGrams(1, 'fl oz')).toBe(30);
    expect(convertToGrams(1, 'l')).toBe(1000);
  });

  it('whole uses the documented 100g heuristic', () => {
    // A "whole" item is assumed to weigh ~100g for scaling purposes.
    expect(convertToGrams(2, 'whole')).toBe(200);
  });

  it('is case insensitive', () => {
    expect(convertToGrams(1, 'OZ')).toBeCloseTo(28.3495, 4);
    expect(convertToGrams(1, 'Cup')).toBe(240);
  });

  it('returns 0 for unknown units instead of assuming grams', () => {
    // Count/unknown units ("slice", "clove", free text) carry no gram
    // weight; treating the amount as grams silently corrupts nutrition.
    expect(convertToGrams(2, 'slice')).toBe(0);
    expect(convertToGrams(1, 'splash')).toBe(0);
  });
});
