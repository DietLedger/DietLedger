import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recipeId } = await params;
    const body = await request.json();
    const {
      fdcId,
      name,
      amount,
      unit,
      calories,
      totalFat,
      saturatedFat,
      transFat,
      cholesterol,
      sodium,
      totalCarbs,
      dietaryFiber,
      totalSugars,
      addedSugars,
      protein,
      vitaminD,
      calcium,
      iron,
      potassium,
    } = body;

    if (!fdcId || !name || amount === undefined || !unit) {
      return NextResponse.json(
        { error: 'fdcId, name, amount, and unit are required' },
        { status: 400 }
      );
    }

    // Scale nutrients based on amount (FDA data is per 100g)
    // If unit is 'g', scale = amount / 100
    // For other units, we treat amount as grams for simplicity
    const scaleFactor = unit.toLowerCase() === 'g' ? amount / 100 : amount / 100;

    const scaleVal = (val: number) => {
      const v = parseFloat(String(val)) || 0;
      return Math.round(v * scaleFactor * 100) / 100;
    };

    const ingredient = await db.ingredient.create({
      data: {
        recipeId,
        fdcId,
        name,
        amount: parseFloat(amount),
        unit,
        calories: scaleVal(calories),
        totalFat: scaleVal(totalFat),
        saturatedFat: scaleVal(saturatedFat),
        transFat: scaleVal(transFat),
        cholesterol: scaleVal(cholesterol),
        sodium: scaleVal(sodium),
        totalCarbs: scaleVal(totalCarbs),
        dietaryFiber: scaleVal(dietaryFiber),
        totalSugars: scaleVal(totalSugars),
        addedSugars: scaleVal(addedSugars),
        protein: scaleVal(protein),
        vitaminD: scaleVal(vitaminD),
        calcium: scaleVal(calcium),
        iron: scaleVal(iron),
        potassium: scaleVal(potassium),
      },
    });

    return NextResponse.json(ingredient, { status: 201 });
  } catch (error) {
    console.error('Error adding ingredient:', error);
    return NextResponse.json({ error: 'Failed to add ingredient' }, { status: 500 });
  }
}
