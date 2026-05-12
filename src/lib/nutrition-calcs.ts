import type { ActivityLevel } from '@/lib/storage';

type Sex = 'male' | 'female';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

export function calculateBMI(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function calculateBMR(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
  age: number | null | undefined,
  sex: Sex | null | undefined
): number | null {
  if (!weightKg || !heightCm || !sex) return null;
  const effectiveAge = age ?? 30;
  if (sex === 'male') {
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * effectiveAge + 5);
  }
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * effectiveAge - 161);
}

export function calculateTDEE(bmr: number | null | undefined, activityLevel: ActivityLevel | null | undefined): number | null {
  if (!bmr || !activityLevel) return null;
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  if (!multiplier) return null;
  return Math.round(bmr * multiplier);
}

export function calculateGoalCalories(
  tdee: number | null | undefined,
  currentWeightKg: number | null | undefined,
  goalWeightKg: number | null | undefined,
  goalDate: string | null | undefined
): number | null {
  if (!tdee || !currentWeightKg || !goalWeightKg || !goalDate) return null;
  if (currentWeightKg === goalWeightKg) return tdee;

  const now = new Date();
  const target = new Date(goalDate);
  const daysDiff = Math.max(1, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const weightDiffKg = goalWeightKg - currentWeightKg;
  const kcalPerKg = 7700;
  const dailyDeficit = Math.round((weightDiffKg * kcalPerKg) / daysDiff);

  return Math.round(tdee + dailyDeficit);
}

export function getGoalCalorieWarning(goalCalories: number | null | undefined, sex: Sex | null | undefined): string | null {
  if (!goalCalories || !sex) return null;
  const minimum = sex === 'female' ? 1200 : 1500;
  if (goalCalories < minimum) {
    return `Warning: ${goalCalories} kcal is below the recommended minimum of ${minimum} kcal/day for ${sex === 'female' ? 'women' : 'men'}. Consider adjusting your goal date or target weight.`;
  }
  return null;
}
