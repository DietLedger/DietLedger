import { searchFallbackFoodsAsResult } from '@/lib/fallback-foods';
import { hasMeaningfulNutrition } from '@/lib/food-eligibility';
import type { FoodPortion } from '@/lib/types';

export interface FDASearchResult {
  fdcId: number;
  description: string;
  brandOwner: string | null;
  dataType: string;
  gtinUpc?: string | null;
  servingSize: number;
  servingSizeUnit: string;
  portions?: FoodPortion[];
  nutrients: {
    calories: number;
    totalFat: number;
    saturatedFat: number;
    transFat: number;
    cholesterol: number;
    sodium: number;
    totalCarbs: number;
    dietaryFiber: number;
    totalSugars: number;
    addedSugars: number;
    protein: number;
    vitaminD: number;
    calcium: number;
    iron: number;
    potassium: number;
  };
}

export interface FDASearchResponse {
  foods: FDASearchResult[];
  source: 'fda' | 'fallback' | 'local';
}

import { getAccessToken } from './auth-session';
import { authenticatedFetch } from './api-auth';

export function mapFoodItemToFDASearchResult(f: any): FDASearchResult {
  if (f.nutrients && typeof f.nutrients === 'object') return f as FDASearchResult;
  return {
    fdcId: f.fdcId,
    description: f.description,
    brandOwner: f.brandOwner ?? null,
    dataType: f.dataType,
    gtinUpc: f.gtinUpc ?? null,
    servingSize: f.servingSize ?? 0,
    servingSizeUnit: f.servingSizeUnit ?? '',
    portions: f.portions ?? [],
    nutrients: {
      calories: f.calories ?? 0,
      totalFat: f.totalFat ?? 0,
      saturatedFat: f.saturatedFat ?? 0,
      transFat: f.transFat ?? 0,
      cholesterol: f.cholesterol ?? 0,
      sodium: f.sodium ?? 0,
      totalCarbs: f.totalCarbs ?? 0,
      dietaryFiber: f.dietaryFiber ?? 0,
      totalSugars: f.totalSugars ?? 0,
      addedSugars: f.addedSugars ?? 0,
      protein: f.protein ?? 0,
      vitaminD: f.vitaminD ?? 0,
      calcium: f.calcium ?? 0,
      iron: f.iron ?? 0,
      potassium: f.potassium ?? 0,
    },
  };
}

export async function searchFDAFoods(query: string): Promise<FDASearchResponse> {
  try {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await authenticatedFetch(
      `/api/foods/search?query=${encodeURIComponent(query)}`,
      { headers }
    );
    if (response.ok) {
      const data = await response.json();
      if (data.foods && data.foods.length > 0) {
        const foods = data.foods.map(mapFoodItemToFDASearchResult).filter((food) => hasMeaningfulNutrition(food.nutrients));
        return { foods, source: data.source || 'local' };
      }
      // Server returned no matches — if it didn't go to the live API, fall
      // through to the built-in fallback list below.
      if (data.source === 'fda') {
        return { foods: [], source: 'fda' };
      }
    }
  } catch {
    // Server unavailable (offline mode) - fall through to fallback
  }

  const fallbackFoods = searchFallbackFoodsAsResult(query).filter((food) => hasMeaningfulNutrition(food.nutrients));
  return { foods: fallbackFoods, source: 'fallback' };
}
