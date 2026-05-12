import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractNutrients } from '@/lib/nutrient-map';
import { searchFallbackFoods } from '@/lib/fallback-foods';

const FDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const FDA_API_KEY = process.env.FDA_API_KEY || 'DEMO_KEY';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  const limit = parseInt(searchParams.get('limit') || '200');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }

  try {
    try {
      const escapedQuery = query
        .replace(/"/g, '""')
        .split(/\s+/)
        .filter(Boolean)
        .map((term) => `"${term}"*`)
        .join(' ');

      const ftsResults = await db.$queryRaw<Array<{ rowid: number }>>`
        SELECT rowid FROM food_item_fts WHERE description MATCH ${escapedQuery} LIMIT ${limit}
      `;

      if (ftsResults.length > 0) {
        const ids = ftsResults.map((r) => r.rowid);
        const foods = await db.foodItem.findMany({
          where: { id: { in: ids } },
          take: limit,
        });

        return NextResponse.json({
          foods: foods.map(formatFoodItem),
          source: 'local',
          totalHits: foods.length,
        });
      }
    } catch {
      // FTS table missing or query failed — fall through to LIKE fallback
    }

    try {
      const foods = await db.foodItem.findMany({
        where: {
          description: {
            contains: query,
          },
        },
        take: limit,
        orderBy: { dataType: 'asc' },
      });

      if (foods.length > 0) {
        return NextResponse.json({
          foods: foods.map(formatFoodItem),
          source: 'local',
          totalHits: foods.length,
        });
      }
    } catch {
      // Direct query failed — fall through to FDA API
    }

    try {
      const params = new URLSearchParams({
        api_key: FDA_API_KEY,
        query: query,
        dataType: ['Foundation', 'SR Legacy', 'Branded'].join(','),
        pageSize: String(limit),
        pageNumber: '1',
        sortBy: 'dataType',
        sortOrder: 'asc',
      });

      const response = await fetch(`${FDA_BASE_URL}/foods/search?${params.toString()}`, {
        next: { revalidate: 3600 },
      });

      if (response.ok) {
        const data = await response.json();
        const foods = (data.foods || []).map(
          (food: Record<string, unknown>) => normalizeAPIFood(food)
        );

        await cacheResults(foods);

        return NextResponse.json({
          foods,
          source: 'fda',
          totalHits: foods.length,
        });
      }
    } catch {
      // FDA API unavailable, fall through to fallback
    }

    const fallbackFoods = searchFallbackFoods(query);
    return NextResponse.json({
      foods: fallbackFoods,
      source: 'fallback',
      totalHits: fallbackFoods.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function formatFoodItem(item: {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner: string | null;
  servingSize: number;
  servingSizeUnit: string;
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
}) {
  return {
    fdcId: item.fdcId,
    description: item.description,
    dataType: item.dataType,
    brandOwner: item.brandOwner,
    servingSize: item.servingSize,
    servingSizeUnit: item.servingSizeUnit,
    nutrients: {
      calories: item.calories,
      totalFat: item.totalFat,
      saturatedFat: item.saturatedFat,
      transFat: item.transFat,
      cholesterol: item.cholesterol,
      sodium: item.sodium,
      totalCarbs: item.totalCarbs,
      dietaryFiber: item.dietaryFiber,
      totalSugars: item.totalSugars,
      addedSugars: item.addedSugars,
      protein: item.protein,
      vitaminD: item.vitaminD,
      calcium: item.calcium,
      iron: item.iron,
      potassium: item.potassium,
    },
  };
}

function normalizeAPIFood(food: Record<string, unknown>) {
  const nutrients = (food.foodNutrients || []) as Array<{
    nutrientId?: number;
    value?: number;
  }>;
  const dataType = food.dataType as string;
  const servingSize = (food.servingSize as number) || 100;
  const servingSizeUnit = (food.servingSizeUnit as string) || 'g';

  const extracted = extractNutrients(nutrients, dataType, servingSize, servingSizeUnit);

  return {
    fdcId: food.fdcId as number,
    description: food.description as string,
    dataType,
    brandOwner: (food.brandOwner as string) || null,
    servingSize,
    servingSizeUnit,
    nutrients: extracted,
  };
}

async function cacheResults(foods: ReturnType<typeof normalizeAPIFood>[]) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < foods.length; i += BATCH_SIZE) {
    const batch = foods.slice(i, i + BATCH_SIZE);
    const operations = batch.map((food) =>
      db.foodItem.upsert({
        where: { fdcId: food.fdcId },
        update: {
          description: food.description,
          dataType: food.dataType,
          brandOwner: food.brandOwner,
          servingSize: food.servingSize,
          servingSizeUnit: food.servingSizeUnit,
          calories: food.nutrients.calories,
          totalFat: food.nutrients.totalFat,
          saturatedFat: food.nutrients.saturatedFat,
          transFat: food.nutrients.transFat,
          cholesterol: food.nutrients.cholesterol,
          sodium: food.nutrients.sodium,
          totalCarbs: food.nutrients.totalCarbs,
          dietaryFiber: food.nutrients.dietaryFiber,
          totalSugars: food.nutrients.totalSugars,
          addedSugars: food.nutrients.addedSugars,
          protein: food.nutrients.protein,
          vitaminD: food.nutrients.vitaminD,
          calcium: food.nutrients.calcium,
          iron: food.nutrients.iron,
          potassium: food.nutrients.potassium,
          source: 'fda_api',
        },
        create: {
          fdcId: food.fdcId,
          description: food.description,
          dataType: food.dataType,
          brandOwner: food.brandOwner,
          servingSize: food.servingSize,
          servingSizeUnit: food.servingSizeUnit,
          calories: food.nutrients.calories,
          totalFat: food.nutrients.totalFat,
          saturatedFat: food.nutrients.saturatedFat,
          transFat: food.nutrients.transFat,
          cholesterol: food.nutrients.cholesterol,
          sodium: food.nutrients.sodium,
          totalCarbs: food.nutrients.totalCarbs,
          dietaryFiber: food.nutrients.dietaryFiber,
          totalSugars: food.nutrients.totalSugars,
          addedSugars: food.nutrients.addedSugars,
          protein: food.nutrients.protein,
          vitaminD: food.nutrients.vitaminD,
          calcium: food.nutrients.calcium,
          iron: food.nutrients.iron,
          potassium: food.nutrients.potassium,
          source: 'fda_api',
        },
      })
    );
    await db.$transaction(operations);
  }
}
