import { describe, it, expect } from 'vitest';
import type { DietaryProfileRecord } from './types';
import {
  detectAllergens,
  inferDietaryTags,
  isRecipeCompliant,
  getAllergenNames,
  filterByNutritionAssessment,
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
  const profile: DietaryProfileRecord = {
    id: 'profile-1',
    name: 'Dietary profile',
    allergens: [],
    dietaryTags: [],
    nutrientThresholds: [],
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  const veganProfile: DietaryProfileRecord = { ...profile, dietaryTags: ['vegan'] };
  const peanutAllergyProfile: DietaryProfileRecord = { ...profile, allergens: ['peanuts'] };

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

describe('server-assessed recipe filtering', () => {
  const profile: DietaryProfileRecord = { id: 'diabetes', name: 'My targets', dietaryTags: ['diabetesAware'], allergens: [], nutrientThresholds: [], isActive: false, createdAt: '', updatedAt: '' };
  const recipes = [
    { id: 'match', ingredients: [{ name: 'beans' }] },
    { id: 'low-fiber', ingredients: [{ name: 'rice' }] },
    { id: 'unknown', ingredients: [{ name: 'vegetables' }] },
    { id: 'not-returned', ingredients: [{ name: 'beans' }] },
  ];
  const assessments = [
    { recipeId: 'match', status: 'match' as const, reasons: [] },
    { recipeId: 'low-fiber', status: 'noMatch' as const, reasons: ['Fiber below target'] },
    { recipeId: 'unknown', status: 'notAssessed' as const, reasons: ['Fiber unreported'] },
  ];
  it('shows only server-confirmed matches, never unknown or missing assessments', () => {
    expect(filterByNutritionAssessment(recipes, assessments, profile)).toEqual([recipes[0]]);
    expect(filterByNutritionAssessment(recipes, undefined, profile)).toEqual([]);
  });
  it('also respects the selected profile\'s allergens and ordinary dietary preferences', () => {
    const confirmed = [{ id: 'milk', ingredients: [{ name: 'milk' }] }, { id: 'peanuts', ingredients: [{ name: 'peanut butter' }] }, recipes[0]];
    const matches = confirmed.map(r => ({ recipeId: r.id, status: 'match' as const, reasons: [] }));
    expect(filterByNutritionAssessment(confirmed, matches, { ...profile, dietaryTags: ['diabetesAware', 'vegan'], allergens: ['peanuts'] })).toEqual([recipes[0]]);
  });
  it('never infers diabetes suitability from ingredient names', () => {
    expect(inferDietaryTags([{ name: 'beans' }])).not.toContain('diabetesAware');
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
