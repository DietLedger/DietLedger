import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Code parameter is required' }, { status: 400 });
  }

  try {
    const food = await db.foodItem.findFirst({
      where: { gtinUpc: code },
    });

    if (!food) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 });
    }

    return NextResponse.json({
      food: {
        fdcId: food.fdcId,
        description: food.description,
        dataType: food.dataType,
        brandOwner: food.brandOwner,
        gtinUpc: food.gtinUpc,
        servingSize: food.servingSize,
        servingSizeUnit: food.servingSizeUnit,
        nutrients: {
          calories: food.calories,
          totalFat: food.totalFat,
          saturatedFat: food.saturatedFat,
          transFat: food.transFat,
          cholesterol: food.cholesterol,
          sodium: food.sodium,
          totalCarbs: food.totalCarbs,
          dietaryFiber: food.dietaryFiber,
          totalSugars: food.totalSugars,
          addedSugars: food.addedSugars,
          protein: food.protein,
          vitaminD: food.vitaminD,
          calcium: food.calcium,
          iron: food.iron,
          potassium: food.potassium,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
