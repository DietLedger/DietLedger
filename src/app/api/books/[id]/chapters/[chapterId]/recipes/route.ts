import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { chapterId } = await params;
    const body = await request.json();
    const { recipeId } = body;

    if (!recipeId) {
      return NextResponse.json({ error: 'recipeId is required' }, { status: 400 });
    }

    const existing = await db.chapterRecipe.count({
      where: { chapterId, recipeId },
    });
    if (existing > 0) {
      return NextResponse.json({ error: 'Recipe already in chapter' }, { status: 409 });
    }

    const maxPosition = await db.chapterRecipe.aggregate({
      where: { chapterId },
      _max: { position: true },
    });

    const record = await db.chapterRecipe.create({
      data: {
        chapterId,
        recipeId,
        position: (maxPosition._max.position ?? -1) + 1,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Error adding recipe to chapter:', error);
    return NextResponse.json({ error: 'Failed to add recipe to chapter' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { chapterId } = await params;
    const { searchParams } = new URL(request.url);
    const recipeId = searchParams.get('recipeId');

    if (!recipeId) {
      return NextResponse.json({ error: 'recipeId query parameter is required' }, { status: 400 });
    }

    await db.chapterRecipe.deleteMany({
      where: { chapterId, recipeId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing recipe from chapter:', error);
    return NextResponse.json({ error: 'Failed to remove recipe from chapter' }, { status: 500 });
  }
}
