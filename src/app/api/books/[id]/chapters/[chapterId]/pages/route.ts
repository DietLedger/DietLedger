import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  try {
    const { chapterId } = await params;
    const body = await request.json();
    const { title, content, position } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Page title is required' }, { status: 400 });
    }

    const page = await db.chapterPage.create({
      data: {
        chapterId,
        title: title.trim(),
        content: content || '',
        position: position ?? 0,
      },
    });

    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    console.error('Error creating chapter page:', error);
    return NextResponse.json({ error: 'Failed to create chapter page' }, { status: 500 });
  }
}
