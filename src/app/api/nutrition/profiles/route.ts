import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const profileSchema = z.object({
  name: z.string().min(1),
  sex: z.enum(['male', 'female']),
  birthDate: z.string().optional(),
  heightCm: z.number().positive().optional(),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'veryActive']).optional(),
  goalWeightKg: z.number().positive().optional(),
  goalDate: z.string().optional(),
});

export async function GET() {
  try {
    const profiles = await db.personProfile.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { foodLogEntries: true, weightEntries: true } } },
    });
    return NextResponse.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const profile = await db.personProfile.create({
      data: {
        name: parsed.data.name,
        sex: parsed.data.sex,
        birthDate: parsed.data.birthDate ?? null,
        heightCm: parsed.data.heightCm ?? null,
        activityLevel: parsed.data.activityLevel ?? 'sedentary',
        goalWeightKg: parsed.data.goalWeightKg ?? null,
        goalDate: parsed.data.goalDate ?? null,
      },
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    console.error('Error creating profile:', error);
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
  }
}
