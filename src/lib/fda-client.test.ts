import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapFoodItemToFDASearchResult, searchFDAFoods } from './fda-client';

vi.mock('@/lib/fallback-foods', () => ({
  searchFallbackFoodsAsResult: vi.fn(),
}));
import { searchFallbackFoodsAsResult } from '@/lib/fallback-foods';

const food = (description: string, calories: number, sodium = 0) => ({
  fdcId: calories > 0 ? 123 : 124,
  description,
  brandOwner: null,
  dataType: 'Foundation',
  servingSize: 100,
  servingSizeUnit: 'g',
  nutrients: {
    calories,
    totalFat: 0,
    saturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
    sodium,
    totalCarbs: 0,
    dietaryFiber: 0,
    totalSugars: 0,
    addedSugars: 0,
    protein: 0,
    vitaminD: 0,
    calcium: 0,
    iron: 0,
    potassium: 0,
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('mapFoodItemToFDASearchResult', () => {
  it('preserves USDA portion weights needed for recipe ingredient rematches', () => {
    const portions = [{ amount: 1, measureUnit: 'piece', modifier: '', portionDescription: '1 piece', gramWeight: 50 }];
    const food = mapFoodItemToFDASearchResult({
      fdcId: 123, description: 'Onions, white, raw', dataType: 'Foundation', calories: 40, portions,
    });
    expect(food.portions).toEqual(portions);
  });
});

describe('searchFDAFoods', () => {
  it('keeps zero-calorie API foods with meaningful nutrients but excludes nutritionally empty foods', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ foods: [food('Water', 0), food('Table salt', 0, 38758), food('Apple', 52)] }),
    }));

    const result = await searchFDAFoods('food');

    expect(result.foods.map(item => item.description)).toEqual(['Table salt', 'Apple']);
  });

  it('applies the same eligibility rule to offline fallback search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.mocked(searchFallbackFoodsAsResult).mockReturnValue([food('Water', 0), food('Table salt', 0, 38758), food('Apple', 52)] as any);

    const result = await searchFDAFoods('food');

    expect(result.foods.map(item => item.description)).toEqual(['Table salt', 'Apple']);
  });
});
