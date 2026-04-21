import { NextRequest, NextResponse } from 'next/server';
import { searchFallbackFoods } from '@/lib/fallback-foods';

const FDA_API_KEY = process.env.FDA_API_KEY || 'DEMO_KEY';
const FDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      api_key: FDA_API_KEY,
      query: query,
      dataType: ['Foundation', 'SR Legacy', 'Branded'].join(','),
      pageSize: '25',
      pageNumber: '1',
      sortBy: 'dataType',
      sortOrder: 'asc',
    });
    const response = await fetch(
      `${FDA_BASE_URL}/foods/search?${params.toString()}`,
      { next: { revalidate: 3600 } }
    );

    if (!response.ok) {
      // Fallback to built-in food database when FDA API is unavailable
      console.log(`FDA API returned ${response.status}, using fallback database`);
      const fallbackFoods = searchFallbackFoods(query);
      return NextResponse.json({ foods: fallbackFoods, source: 'fallback' });
    }

    const data = await response.json();

    const foods = (data.foods || []).map((food: Record<string, unknown>) => {
      const nutrients = (food.foodNutrients || []) as Array<{
        nutrientId?: number;
        nutrientName?: string;
        value?: number;
        unitName?: string;
      }>;

      const getNutrient = (nutrientId: number) => {
        const n = nutrients.find((nt) => nt.nutrientId === nutrientId);
        return n ? (n.value || 0) : 0;
      };

      // For Branded foods, nutrients are per serving; normalize to per 100g
      // For Foundation/SR Legacy, nutrients are already per 100g
      const dataType = food.dataType as string;
      const servingSize = (food.servingSize as number) || 100;
      const servingSizeUnit = (food.servingSizeUnit as string) || 'g';

      let scale = 1;
      if (dataType === 'Branded' && servingSizeUnit === 'g' && servingSize > 0) {
        scale = 100 / servingSize; // Convert per-serving to per-100g
      }

      const scaleVal = (v: number) => Math.round(v * scale * 100) / 100;

      return {
        fdcId: food.fdcId,
        description: food.description,
        brandOwner: food.brandOwner || null,
        dataType: food.dataType,
        servingSize: food.servingSize || 100,
        servingSizeUnit: food.servingSizeUnit || 'g',
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
    });

    return NextResponse.json({ foods, source: 'fda' });
  } catch (error) {
    // Fallback to built-in food database on network errors
    console.error('FDA search error, using fallback:', error);
    const fallbackFoods = searchFallbackFoods(query);
    return NextResponse.json({ foods: fallbackFoods, source: 'fallback' });
  }
}
