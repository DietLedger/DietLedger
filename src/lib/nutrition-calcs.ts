import type { ActivityLevel } from '@/lib/types';

type Sex = 'male' | 'female';

export type BmrEquation = 'auto' | 'mifflin' | 'harrisBenedict' | 'owen' | 'indirectCalorimetry';

export type BmiCategory = 'underweight' | 'healthy' | 'overweight' | 'obese1' | 'obese2' | 'obese3';

export const EQUATION_OPTIONS: { value: BmrEquation; label: string }[] = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'mifflin', label: 'Mifflin-St Jeor (RMR)' },
  { value: 'harrisBenedict', label: 'Harris-Benedict (BMR)' },
  { value: 'owen', label: 'Owen (RMR)' },
  { value: 'indirectCalorimetry', label: 'Indirect Calorimetry' },
];

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

export function getBmiCategory(bmi: number | null | undefined): BmiCategory | null {
  if (bmi === null || bmi === undefined) return null;
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'healthy';
  if (bmi < 30) return 'overweight';
  if (bmi < 35) return 'obese1';
  if (bmi < 40) return 'obese2';
  return 'obese3';
}

export function getBmiCategoryLabel(cat: BmiCategory | null | undefined): string {
  if (!cat) return '';
  const map: Record<BmiCategory, string> = {
    underweight: 'Underweight',
    healthy: 'Healthy Weight',
    overweight: 'Overweight',
    obese1: 'Class 1 Obesity',
    obese2: 'Class 2 Obesity',
    obese3: 'Class 3 (Severe) Obesity',
  };
  return map[cat];
}

export function getBmiCategoryColor(cat: BmiCategory | null | undefined): string {
  if (!cat) return '';
  const map: Record<BmiCategory, string> = {
    underweight: 'text-blue-500',
    healthy: 'text-green-600',
    overweight: 'text-amber-500',
    obese1: 'text-orange-500',
    obese2: 'text-red-500',
    obese3: 'text-red-600',
  };
  return map[cat];
}

export function isObeseClass2Plus(cat: BmiCategory | null | undefined): boolean {
  return cat === 'obese2' || cat === 'obese3';
}

export function getDefaultEquation(bmiCategory: BmiCategory | null): BmrEquation {
  if (!bmiCategory) return 'mifflin';
  return 'mifflin';
}

export function resolveEquation(equation: BmrEquation, bmiCategory: BmiCategory | null): BmrEquation {
  if (equation === 'indirectCalorimetry') return 'indirectCalorimetry';
  if (equation === 'auto') {
    if (isObeseClass2Plus(bmiCategory)) return 'mifflin';
    return 'mifflin';
  }
  if (isObeseClass2Plus(bmiCategory) && equation !== 'mifflin') return 'mifflin';
  return equation;
}

export function calculateMifflinStJeor(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex
): number {
  if (sex === 'male') {
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + 5);
  }
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age - 161);
}

export function calculateHarrisBenedict(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex
): number {
  if (sex === 'male') {
    return Math.round(88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age);
  }
  return Math.round(447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age);
}

export function calculateOwen(
  weightKg: number,
  sex: Sex
): number {
  if (sex === 'male') {
    return Math.round(879 + 10.2 * weightKg);
  }
  return Math.round(795 + 7.18 * weightKg);
}

export interface BmrResult {
  label: string;
  equation: BmrEquation;
  bmr: number | null;
  rmr: number | null;
  bmi: number | null;
  bmiCategory: BmiCategory | null;
  tdee: number | null;
  effectiveMmr: number | null;
  isObeseClass2Plus: boolean;
  effectiveEquation: BmrEquation;
}

export function calculateFullBmr(params: {
  weightKg: number | null | undefined;
  heightCm: number | null | undefined;
  age: number | null | undefined;
  sex: Sex | null | undefined;
  activityLevel: ActivityLevel | null | undefined;
  equation: BmrEquation;
  manualBmrValue: number | null | undefined;
}): BmrResult {
  const { weightKg, heightCm, age, sex, activityLevel, equation, manualBmrValue } = params;

  const empty: BmrResult = {
    label: '—',
    equation,
    bmr: null,
    rmr: null,
    bmi: null,
    bmiCategory: null,
    tdee: null,
    effectiveMmr: null,
    isObeseClass2Plus: false,
    effectiveEquation: equation,
  };

  if (!weightKg || !heightCm || !sex) return empty;

  const effectiveAge = age ?? 30;
  const bmi = calculateBMI(weightKg, heightCm);
  const bmiCategory = getBmiCategory(bmi);
  const obese = isObeseClass2Plus(bmiCategory);
  const effectiveEquation = resolveEquation(equation, bmiCategory);

  const bmrHarris = calculateHarrisBenedict(weightKg, heightCm, effectiveAge, sex);
  const rmrMifflin = calculateMifflinStJeor(weightKg, heightCm, effectiveAge, sex);
  const rmrOwen = calculateOwen(weightKg, sex);

  let selectedValue: number | null = null;
  let label = '';

  switch (effectiveEquation) {
    case 'mifflin':
      selectedValue = rmrMifflin;
      label = 'Mifflin-St Jeor (RMR)';
      break;
    case 'harrisBenedict':
      selectedValue = bmrHarris;
      label = 'Harris-Benedict (BMR)';
      break;
    case 'owen':
      selectedValue = rmrOwen;
      label = 'Owen (RMR)';
      break;
    case 'indirectCalorimetry':
      selectedValue = manualBmrValue ?? null;
      label = 'Indirect Calorimetry';
      break;
    default:
      selectedValue = rmrMifflin;
      label = 'Mifflin-St Jeor (RMR)';
  }

  const tdee = selectedValue && activityLevel
    ? Math.round(selectedValue * (ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2))
    : null;

  return {
    label,
    equation,
    bmr: bmrHarris,
    rmr: rmrMifflin,
    bmi,
    bmiCategory,
    tdee,
    effectiveMmr: selectedValue,
    isObeseClass2Plus: obese,
    effectiveEquation,
  };
}

export function calculateBMR(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
  age: number | null | undefined,
  sex: Sex | null | undefined
): number | null {
  if (!weightKg || !heightCm || !sex) return null;
  const effectiveAge = age ?? 30;
  return calculateMifflinStJeor(weightKg, heightCm, effectiveAge, sex);
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
