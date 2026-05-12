import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const syncSchema = z.object({
  profiles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    sex: z.enum(['male', 'female']),
    birthDate: z.string().nullable().optional(),
    heightCm: z.number().positive().nullable().optional(),
    activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'veryActive']).optional(),
    goalWeightKg: z.number().positive().nullable().optional(),
    goalDate: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })).optional(),
  foodLogEntries: z.array(z.object({
    id: z.string(),
    profileId: z.string(),
    date: z.string(),
    mealSlot: z.enum(['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'snack']),
    sourceType: z.enum(['recipe', 'customFood', 'manual']),
    sourceId: z.string().nullable().optional(),
    name: z.string(),
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
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })).optional(),
  weightEntries: z.array(z.object({
    id: z.string(),
    profileId: z.string(),
    date: z.string(),
    weightKg: z.number().positive(),
    notes: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const results = { profiles: 0, foodLogEntries: 0, weightEntries: 0 };

    await db.$transaction(async (tx) => {
      if (parsed.data.profiles) {
        for (const profile of parsed.data.profiles) {
          await tx.personProfile.upsert({
            where: { id: profile.id },
            update: {
              name: profile.name,
              sex: profile.sex,
              birthDate: profile.birthDate ?? null,
              heightCm: profile.heightCm ?? null,
              activityLevel: profile.activityLevel ?? 'moderate',
              goalWeightKg: profile.goalWeightKg ?? null,
              goalDate: profile.goalDate ?? null,
            },
            create: {
              id: profile.id,
              name: profile.name,
              sex: profile.sex,
              birthDate: profile.birthDate ?? null,
              heightCm: profile.heightCm ?? null,
              activityLevel: profile.activityLevel ?? 'moderate',
              goalWeightKg: profile.goalWeightKg ?? null,
              goalDate: profile.goalDate ?? null,
            },
          });
          results.profiles++;
        }
      }

      if (parsed.data.foodLogEntries) {
        for (const entry of parsed.data.foodLogEntries) {
          await tx.foodLogEntry.upsert({
            where: { id: entry.id },
            update: {
              profileId: entry.profileId,
              date: entry.date,
              mealSlot: entry.mealSlot,
              sourceType: entry.sourceType,
              sourceId: entry.sourceId ?? null,
              name: entry.name,
              servings: entry.servings ?? 1,
              calories: entry.calories ?? 0,
              totalFat: entry.totalFat ?? 0,
              saturatedFat: entry.saturatedFat ?? 0,
              transFat: entry.transFat ?? 0,
              cholesterol: entry.cholesterol ?? 0,
              sodium: entry.sodium ?? 0,
              totalCarbs: entry.totalCarbs ?? 0,
              dietaryFiber: entry.dietaryFiber ?? 0,
              totalSugars: entry.totalSugars ?? 0,
              addedSugars: entry.addedSugars ?? 0,
              protein: entry.protein ?? 0,
              vitaminD: entry.vitaminD ?? 0,
              calcium: entry.calcium ?? 0,
              iron: entry.iron ?? 0,
              potassium: entry.potassium ?? 0,
            },
            create: {
              id: entry.id,
              profileId: entry.profileId,
              date: entry.date,
              mealSlot: entry.mealSlot,
              sourceType: entry.sourceType,
              sourceId: entry.sourceId ?? null,
              name: entry.name,
              servings: entry.servings ?? 1,
              calories: entry.calories ?? 0,
              totalFat: entry.totalFat ?? 0,
              saturatedFat: entry.saturatedFat ?? 0,
              transFat: entry.transFat ?? 0,
              cholesterol: entry.cholesterol ?? 0,
              sodium: entry.sodium ?? 0,
              totalCarbs: entry.totalCarbs ?? 0,
              dietaryFiber: entry.dietaryFiber ?? 0,
              totalSugars: entry.totalSugars ?? 0,
              addedSugars: entry.addedSugars ?? 0,
              protein: entry.protein ?? 0,
              vitaminD: entry.vitaminD ?? 0,
              calcium: entry.calcium ?? 0,
              iron: entry.iron ?? 0,
              potassium: entry.potassium ?? 0,
            },
          });
          results.foodLogEntries++;
        }
      }

      if (parsed.data.weightEntries) {
        for (const entry of parsed.data.weightEntries) {
          await tx.weightEntry.upsert({
            where: { id: entry.id },
            update: {
              weightKg: entry.weightKg,
              notes: entry.notes ?? null,
            },
            create: {
              id: entry.id,
              profileId: entry.profileId,
              date: entry.date,
              weightKg: entry.weightKg,
              notes: entry.notes ?? null,
            },
          });
          results.weightEntries++;
        }
      }
    });

    return NextResponse.json({ success: true, synced: results });
  } catch (error) {
    console.error('Error syncing nutrition data:', error);
    return NextResponse.json({ error: 'Failed to sync nutrition data' }, { status: 500 });
  }
}
