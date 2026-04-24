import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string; pageId: string }> }
) {
  try {
    const { pageId } = await params;
    const body = await request.json();
    const { title, content, position } = body;

    const page = await db.chapterPage.update({
      where: { id: pageId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && { content }),
        ...(position !== undefined && { position }),
      },
    });

    return NextResponse.json(page);
  } catch (error) {
    console.error('Error updating chapter page:', error);
    return NextResponse.json({ error: 'Failed to update chapter page' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string; pageId: string }> }
) {
  try {
    const { pageId } = await params;
    await db.chapterPage.delete({ where: { id: pageId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chapter page:', error);
    return NextResponse.json({ error: 'Failed to delete chapter page' }, { status: 500 });
  }
}
