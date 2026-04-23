import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface CacheFoodRequest {
  foods: Array<{
    fdcId: number;
    description: string;
    dataType: string;
    brandOwner?: string | null;
    servingSize?: number;
    servingSizeUnit?: string;
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
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: CacheFoodRequest = await request.json();
    const { foods } = body;

    if (!foods || !Array.isArray(foods)) {
      return NextResponse.json({ error: 'Foods array is required' }, { status: 400 });
    }

    const BATCH_SIZE = 100;
    let cached = 0;

    for (let i = 0; i < foods.length; i += BATCH_SIZE) {
      const batch = foods.slice(i, i + BATCH_SIZE);
      const operations = batch.map((food) =>
        db.foodItem.upsert({
          where: { fdcId: food.fdcId },
          update: {
            description: food.description,
            dataType: food.dataType,
            brandOwner: food.brandOwner || null,
            servingSize: food.servingSize || 100,
            servingSizeUnit: food.servingSizeUnit || 'g',
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
            brandOwner: food.brandOwner || null,
            servingSize: food.servingSize || 100,
            servingSizeUnit: food.servingSizeUnit || 'g',
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
      cached += batch.length;
    }

    return NextResponse.json({ cached, message: `Cached ${cached} food items` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
