// Client-side FDA FoodData Central API search
// Direct browser-to-FDA API calls - no server needed
// Falls back to built-in food database on failure

import { searchFallbackFoods } from '@/lib/fallback-foods';
import { getStoredApiKey } from '@/lib/storage';

const FDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

export interface FDASearchResult {
  fdcId: number;
  description: string;
  brandOwner: string | null;
  dataType: string;
  servingSize: number;
  servingSizeUnit: string;
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
  source: 'fda' | 'fallback';
}

export async function searchFDAFoods(query: string): Promise<FDASearchResponse> {
  const apiKey = getStoredApiKey();

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      query: query,
      dataType: ['Foundation', 'SR Legacy', 'Branded'].join(','),
      pageSize: '25',
      pageNumber: '1',
      sortBy: 'dataType',
      sortOrder: 'asc',
    });

    const response = await fetch(
      `${FDA_BASE_URL}/foods/search?${params.toString()}`
    );

    if (!response.ok) {
      console.log(
        `FDA API returned ${response.status}, using fallback database`
      );
      const fallbackFoods = searchFallbackFoods(query);
      return { foods: fallbackFoods, source: 'fallback' };
    }

    const data = await response.json();

    const foods: FDASearchResult[] = (data.foods || []).map(
      (food: Record<string, unknown>) => {
        const nutrients = (food.foodNutrients || []) as Array<{
          nutrientId?: number;
          nutrientName?: string;
          value?: number;
          unitName?: string;
        }>;

        const getNutrient = (nutrientId: number) => {
          const n = nutrients.find((nt) => nt.nutrientId === nutrientId);
          return n ? n.value || 0 : 0;
        };

        // For Branded foods, nutrients are per serving; normalize to per 100g
        // For Foundation/SR Legacy, nutrients are already per 100g
        const dataType = food.dataType as string;
        const servingSize = (food.servingSize as number) || 100;
        const servingSizeUnit = (food.servingSizeUnit as string) || 'g';

        let scale = 1;
        if (
          dataType === 'Branded' &&
          servingSizeUnit === 'g' &&
          servingSize > 0
        ) {
          scale = 100 / servingSize; // Convert per-serving to per-100g
        }

        const scaleVal = (v: number) => Math.round(v * scale * 100) / 100;

        return {
          fdcId: food.fdcId as number,
          description: food.description as string,
          brandOwner: (food.brandOwner as string) || null,
          dataType: food.dataType as string,
          servingSize: (food.servingSize as number) || 100,
          servingSizeUnit: (food.servingSizeUnit as string) || 'g',
          nutrients: {
            calories: scaleVal(getNutrient(1008)),
            totalFat: scaleVal(getNutrient(1004)),
            saturatedFat: scaleVal(getNutrient(1258)),
            transFat: scaleVal(getNutrient(1257)),
            cholesterol: scaleVal(getNutrient(1253)),
            sodium: scaleVal(getNutrient(1093)),
            totalCarbs: scaleVal(getNutrient(1005)),
            dietaryFiber: scaleVal(getNutrient(1079)),
            totalSugars: scaleVal(getNutrient(2000)),
            addedSugars: scaleVal(getNutrient(1235)),
            protein: scaleVal(getNutrient(1003)),
            vitaminD: scaleVal(getNutrient(1114)),
            calcium: scaleVal(getNutrient(1087)),
            iron: scaleVal(getNutrient(1089)),
            potassium: scaleVal(getNutrient(1092)),
          },
        };
      }
    );

    return { foods, source: 'fda' };
  } catch (error) {
    console.error('FDA search error, using fallback:', error);
    const fallbackFoods = searchFallbackFoods(query);
    return { foods: fallbackFoods, source: 'fallback' };
  }
}
