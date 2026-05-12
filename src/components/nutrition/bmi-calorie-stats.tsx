'use client';

import { NutritionProfileRecord, WeightEntryRecord } from '@/lib/storage';
import { calculateBMI, calculateTDEE, calculateBMR, calculateGoalCalories, getGoalCalorieWarning } from '@/lib/nutrition-calcs';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle } from 'lucide-react';

interface BmiCalorieStatsProps {
  profile: NutritionProfileRecord | undefined;
  latestWeight: WeightEntryRecord | undefined;
  caloriesConsumedToday: number;
}

export function BmiCalorieStats({ profile, latestWeight, caloriesConsumedToday }: BmiCalorieStatsProps) {
  if (!profile) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-3 text-center text-muted-foreground text-sm">Select a profile</CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const weightKg = latestWeight?.weightKg;
  const age = profile.birthDate
    ? Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const bmi = calculateBMI(weightKg ?? null, profile.heightCm);
  const bmr = calculateBMR(weightKg ?? null, profile.heightCm, age, profile.sex);
  const tdee = calculateTDEE(bmr, profile.activityLevel);
  const goalCal = calculateGoalCalories(tdee, weightKg ?? null, profile.goalWeightKg, profile.goalDate);
  const warning = getGoalCalorieWarning(goalCal, profile.sex);
  const calorieProgress = goalCal ? Math.min(100, (caloriesConsumedToday / goalCal) * 100) : tdee ? Math.min(100, (caloriesConsumedToday / tdee) * 100) : 0;
  const calorieTarget = goalCal ?? tdee;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Current BMI</div>
          <div className="text-xl font-semibold mt-1">{bmi ?? '—'}</div>
          {bmi !== null && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Maintenance</div>
          <div className="text-xl font-semibold mt-1">{tdee ? `${tdee}` : '—'}</div>
          {tdee && <div className="text-xs text-muted-foreground mt-0.5">kcal/day</div>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Goal Calories</div>
          <div className="text-xl font-semibold mt-1">{goalCal ?? '—'}</div>
          {warning && (
            <div className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
              <AlertTriangle className="h-3 w-3" />
              <span className="truncate">Below minimum</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Consumed Today</div>
          <div className="text-xl font-semibold mt-1">{Math.round(caloriesConsumedToday)}</div>
          {calorieTarget ? (
            <>
              <Progress value={calorieProgress} className="h-1.5 mt-2" />
              <div className="text-xs text-muted-foreground mt-0.5">{Math.round(calorieProgress)}% of goal</div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground mt-0.5">kcal</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
