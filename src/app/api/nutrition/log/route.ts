import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const foodLogSchema = z.object({
  profileId: z.string().min(1),
  date: z.string().min(1),
  mealSlot: z.enum(['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night', 'snack']),
  sourceType: z.enum(['recipe', 'customFood', 'manual']),
  sourceId: z.string().nullable().optional(),
  name: z.string().min(1),
  servings: z.number().positive().default(1),
  calories: z.number().default(0),
  totalFat: z.number().default(0),
  saturatedFat: z.number().default(0),
  transFat: z.number().default(0),
  cholesterol: z.number().default(0),
  sodium: z.number().default(0),
  totalCarbs: z.number().default(0),
  dietaryFiber: z.number().default(0),
  totalSugars: z.number().default(0),
  addedSugars: z.number().default(0),
  protein: z.number().default(0),
  vitaminD: z.number().default(0),
  calcium: z.number().default(0),
  iron: z.number().default(0),
  potassium: z.number().default(0),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required' }, { status: 400 });
    }

    const where: Record<string, unknown> = { profileId };
    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate };
    } else if (startDate) {
      where.date = { gte: startDate };
    } else if (endDate) {
      where.date = { lte: endDate };
    }

    const entries = await db.foodLogEntry.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching food log:', error);
    return NextResponse.json({ error: 'Failed to fetch food log' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = foodLogSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const entry = await db.foodLogEntry.create({ data: parsed.data });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Error creating food log entry:', error);
    return NextResponse.json({ error: 'Failed to create food log entry' }, { status: 500 });
  }
}
