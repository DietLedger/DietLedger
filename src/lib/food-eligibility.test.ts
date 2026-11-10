import { describe, expect, it } from 'vitest';
import { hasMeaningfulNutrition } from './food-eligibility';

describe('hasMeaningfulNutrition', () => {
  it('accepts zero-calorie foods with another positive canonical nutrient', () => {
    expect(hasMeaningfulNutrition({ calories: 0, sodium: 38758 })).toBe(true);
  });

  it('accepts foods with positive calories', () => {
    expect(hasMeaningfulNutrition({ calories: 52, sodium: 0 })).toBe(true);
  });

  it('rejects foods without any positive canonical nutrient values', () => {
    expect(hasMeaningfulNutrition({ calories: 0, sodium: 0, protein: -1 })).toBe(false);
    expect(hasMeaningfulNutrition({ calories: Number.NaN, sodium: Number.POSITIVE_INFINITY })).toBe(false);
  });
});
