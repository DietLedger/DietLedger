import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const books = await db.recipeBook.findMany({
      include: {
        chapters: {
          orderBy: { position: 'asc' },
          include: { _count: { select: { chapterRecipes: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(books);
  } catch (error) {
    console.error('Error fetching books:', error);
    return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, coverColor } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const book = await db.recipeBook.create({
      data: {
        title: title.trim(),
        description: (description || '').trim(),
        coverColor: coverColor || '#059669',
      },
      include: { chapters: true },
    });

    return NextResponse.json(book, { status: 201 });
  } catch (error) {
    console.error('Error creating book:', error);
    return NextResponse.json({ error: 'Failed to create book' }, { status: 500 });
  }
}
