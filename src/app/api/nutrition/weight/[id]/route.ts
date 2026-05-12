import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const weightUpdateSchema = z.object({
  weightKg: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
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
    const parsed = weightUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const entry = await db.weightEntry.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(entry);
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: 'Weight entry not found' }, { status: 404 });
    }
    console.error('Error updating weight entry:', error);
    return NextResponse.json({ error: 'Failed to update weight entry' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.weightEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: 'Weight entry not found' }, { status: 404 });
    }
    console.error('Error deleting weight entry:', error);
    return NextResponse.json({ error: 'Failed to delete weight entry' }, { status: 500 });
  }
}
