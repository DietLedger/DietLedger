import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Chapter title is required' }, { status: 400 });
    }

    const existingChapters = await db.chapter.count({
      where: { bookId: id },
    });

    const chapter = await db.chapter.create({
      data: {
        bookId: id,
        title: title.trim(),
        position: existingChapters,
      },
    });

    return NextResponse.json(chapter, { status: 201 });
  } catch (error) {
    console.error('Error creating chapter:', error);
    return NextResponse.json({ error: 'Failed to create chapter' }, { status: 500 });
  }
}
