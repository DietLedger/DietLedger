import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { chapterId } = await params;
    const body = await request.json();
    const { title, position } = body;

    const chapter = await db.chapter.update({
      where: { id: chapterId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(position !== undefined && { position }),
      },
    });

    return NextResponse.json(chapter);
  } catch (error) {
    console.error('Error updating chapter:', error);
    return NextResponse.json({ error: 'Failed to update chapter' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { chapterId } = await params;
    await db.chapterRecipe.deleteMany({ where: { chapterId } });
    await db.chapter.delete({ where: { id: chapterId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chapter:', error);
    return NextResponse.json({ error: 'Failed to delete chapter' }, { status: 500 });
  }
}
