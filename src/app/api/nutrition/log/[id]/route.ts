import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const foodLogUpdateSchema = z.object({
  date: z.string().min(1).optional(),
  mealSlot: z.enum(['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'snack']).optional(),
  name: z.string().min(1).optional(),
  servings: z.number().positive().optional(),
  calories: z.number().optional(),
  totalFat: z.number().optional(),
  saturatedFat: z.number().optional(),
  transFat: z.number().optional(),
  cholesterol: z.number().optional(),
  sodium: z.number().optional(),
  totalCarbs: z.number().optional(),
  dietaryFiber: z.number().optional(),
  totalSugars: z.number().optional(),
  addedSugars: z.number().optional(),
  protein: z.number().optional(),
  vitaminD: z.number().optional(),
  calcium: z.number().optional(),
  iron: z.number().optional(),
  potassium: z.number().optional(),
  lastSyncedAt: z.string().nullable().optional(),
});

function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error as Prisma.PrismaClientKnownRequestError).code === 'P2025';
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = foodLogUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const entry = await db.foodLogEntry.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(entry);
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: 'Food log entry not found' }, { status: 404 });
    }
    console.error('Error updating food log entry:', error);
    return NextResponse.json({ error: 'Failed to update food log entry' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.foodLogEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: 'Food log entry not found' }, { status: 404 });
    }
    console.error('Error deleting food log entry:', error);
    return NextResponse.json({ error: 'Failed to delete food log entry' }, { status: 500 });
  }
}
