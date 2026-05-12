import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const profileUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  sex: z.enum(['male', 'female']).optional(),
  birthDate: z.string().nullable().optional(),
  heightCm: z.number().positive().nullable().optional(),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'veryActive']).optional(),
  goalWeightKg: z.number().positive().nullable().optional(),
  goalDate: z.string().nullable().optional(),
});

function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error as Prisma.PrismaClientKnownRequestError).code === 'P2025';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profile = await db.personProfile.findUnique({ where: { id } });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const profile = await db.personProfile.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(profile);
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.personProfile.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    console.error('Error deleting profile:', error);
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 });
  }
}
