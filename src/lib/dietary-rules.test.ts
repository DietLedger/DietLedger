import { describe, it, expect } from 'vitest';
import {
  detectAllergens,
  inferDietaryTags,
  isRecipeCompliant,
  getAllergenNames,
} from './dietary-rules';

describe('detectAllergens', () => {
  it('detects milk allergen', () => {
    const result = detectAllergens([{ name: 'whole milk' }]);
    expect(result.length).toBeGreaterThan(0);
    const milk = result.find((d) => d.allergen === 'milk');
    expect(milk).toBeDefined();
    expect(milk!.ingredients).toContain('whole milk');
  });

  it('detects peanut allergen', () => {
    const result = detectAllergens([{ name: 'peanut butter' }]);
    const peanut = result.find((d) => d.allergen === 'peanuts');
    expect(peanut).toBeDefined();
  });

  it('detects egg allergen', () => {
    const result = detectAllergens([{ name: 'egg' }]);
    const egg = result.find((d) => d.allergen === 'eggs');
    expect(egg).toBeDefined();
  });

  it('detects wheat allergen', () => {
    const result = detectAllergens([{ name: 'wheat flour' }]);
    const wheat = result.find((d) => d.allergen === 'wheat');
    expect(wheat).toBeDefined();
  });

  it('returns empty for no allergens', () => {
    const result = detectAllergens([{ name: 'rice' }, { name: 'water' }]);
    expect(result).toEqual([]);
  });

  it('detects multiple allergens', () => {
    const result = detectAllergens([
      { name: 'milk' },
      { name: 'egg' },
    ]);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('aggregates same allergen from multiple ingredients', () => {
    const result = detectAllergens([{ name: 'milk' }, { name: 'cheese' }]);
    const milk = result.find((d) => d.allergen === 'milk');
    expect(milk).toBeDefined();
    expect(milk!.ingredients.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty ingredients', () => {
    expect(detectAllergens([])).toEqual([]);
  });
});

describe('inferDietaryTags', () => {
  it('infers vegan for plant-based ingredients', () => {
    const tags = inferDietaryTags([{ name: 'rice' }, { name: 'beans' }, { name: 'tomato' }]);
    expect(tags).toContain('vegan');
  });

  it('does not infer vegan for ingredients with milk', () => {
    const tags = inferDietaryTags([{ name: 'rice' }, { name: 'milk' }]);
    expect(tags).not.toContain('vegan');
  });

  it('does not infer vegan for ingredients with egg', () => {
    const tags = inferDietaryTags([{ name: 'egg' }, { name: 'rice' }]);
    expect(tags).not.toContain('vegan');
  });

  it('infers vegetarian for dairy + plant ingredients', () => {
    const tags = inferDietaryTags([{ name: 'milk' }, { name: 'rice' }]);
    expect(tags).toContain('vegetarian');
    expect(tags).not.toContain('vegan');
  });

  it('does not infer vegetarian for meat', () => {
    const tags = inferDietaryTags([{ name: 'chicken breast' }]);
    expect(tags).not.toContain('vegetarian');
  });
});

describe('isRecipeCompliant', () => {
  const veganProfile = {
    allergens: [] as string[],
    dietaryTags: ['vegan'] as string[],
  };

  const peanutAllergyProfile = {
    allergens: ['peanuts'] as string[],
    dietaryTags: [] as string[],
  };

  it('compliant for vegan recipe with vegan profile', () => {
    const result = isRecipeCompliant(
      { ingredients: [{ name: 'rice' }, { name: 'beans' }] },
      veganProfile,
    );
    expect(result.compliant).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('non-compliant for milk recipe with vegan profile', () => {
    const result = isRecipeCompliant(
      { ingredients: [{ name: 'milk' }] },
      veganProfile,
    );
    expect(result.compliant).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('non-compliant for peanut ingredient with peanut allergy', () => {
    const result = isRecipeCompliant(
      { ingredients: [{ name: 'peanut butter' }] },
      peanutAllergyProfile,
    );
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.includes('peanuts'))).toBe(true);
  });

  it('compliant for safe ingredients with peanut allergy', () => {
    const result = isRecipeCompliant(
      { ingredients: [{ name: 'rice' }] },
      peanutAllergyProfile,
    );
    expect(result.compliant).toBe(true);
  });
});

describe('getAllergenNames', () => {
  it('returns human-readable names', () => {
    const names = getAllergenNames(['milk', 'eggs', 'peanuts']);
    expect(names).toContain('Milk/Dairy');
    expect(names).toContain('Eggs');
    expect(names).toContain('Peanuts');
  });

  it('returns empty for empty input', () => {
    expect(getAllergenNames([])).toEqual([]);
  });
});
