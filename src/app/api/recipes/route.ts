import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const recipes = await db.recipe.findMany({
      include: { ingredients: true },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(recipes);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    return NextResponse.json({ error: 'Failed to fetch recipes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, servings, instructions } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Recipe name is required' }, { status: 400 });
    }

    const recipe = await db.recipe.create({
      data: {
        name: name.trim(),
        servings: servings || 1,
        instructions: instructions || null,
      },
      include: { ingredients: true },
    });

    return NextResponse.json(recipe, { status: 201 });
  } catch (error) {
    console.error('Error creating recipe:', error);
    return NextResponse.json({ error: 'Failed to create recipe' }, { status: 500 });
  }
}
