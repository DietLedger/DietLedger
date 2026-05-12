import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const weightSchema = z.object({
  profileId: z.string().min(1),
  date: z.string().min(1),
  weightKg: z.number().positive(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');

    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
    }

    const entries = await db.weightEntry.findMany({
      where: { profileId },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching weight entries:', error);
    return NextResponse.json({ error: 'Failed to fetch weight entries' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = weightSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const existing = await db.weightEntry.findUnique({
      where: { profileId_date: { profileId: parsed.data.profileId, date: parsed.data.date } },
    });

    if (existing) {
      const updated = await db.weightEntry.update({
        where: { id: existing.id },
        data: {
          weightKg: parsed.data.weightKg,
          notes: parsed.data.notes ?? null,
        },
      });
      return NextResponse.json(updated);
    }

    const entry = await db.weightEntry.create({ data: parsed.data });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Error creating weight entry:', error);
    return NextResponse.json({ error: 'Failed to create weight entry' }, { status: 500 });
  }
}
