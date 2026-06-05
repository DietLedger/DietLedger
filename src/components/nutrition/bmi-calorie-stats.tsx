'use client';

import { useRef, useCallback } from 'react';
import type { NutritionProfileRecord, WeightEntryRecord } from '@/lib/types';
import { calculateBMI, calculateFullBmr, getBmiCategoryLabel, getBmiCategoryColor, isObeseClass2Plus, calculateGoalCalories, getGoalCalorieWarning } from '@/lib/nutrition-calcs';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle } from 'lucide-react';

const ACCURACY_WARNING = 'Calculations are not accurate at this level. Please consult with your doctor about indirect calorimetry and override these values with your test results.';

interface BmiCalorieStatsProps {
  profile: NutritionProfileRecord | undefined;
  latestWeight: WeightEntryRecord | undefined;
  caloriesConsumedToday: number;
}

export function BmiCalorieStats({ profile, latestWeight, caloriesConsumedToday }: BmiCalorieStatsProps) {
  const warningRef = useRef<HTMLDivElement>(null);

  const scrollToWarning = useCallback(() => {
    warningRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  if (!profile) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
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

  const bmrResult = calculateFullBmr({
    weightKg: weightKg ?? null,
    heightCm: profile.heightCm,
    age,
    sex: profile.sex,
    activityLevel: profile.activityLevel,
    equation: profile.bmrEquation ?? 'auto',
    manualBmrValue: profile.manualBmrValue ?? null,
  });

  const goalCal = calculateGoalCalories(
    bmrResult.tdee,
    weightKg ?? null,
    profile.goalWeightKg,
    profile.goalDate
  );
  const effectiveCalorieTarget = profile.calorieTarget ?? goalCal ?? bmrResult.tdee;
  const warning = getGoalCalorieWarning(effectiveCalorieTarget, profile.sex);
  const calorieProgress = effectiveCalorieTarget
    ? Math.min(100, (caloriesConsumedToday / effectiveCalorieTarget) * 100)
    : 0;

  const bmiColor = getBmiCategoryColor(bmrResult.bmiCategory);
  const showAccuracyWarning = bmrResult.isObeseClass2Plus;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Current BMI</div>
            <div className={`text-xl font-semibold mt-1 ${bmiColor}`}>{bmrResult.bmi ?? '—'}</div>
            {bmrResult.bmiCategory && (
              <div className={`text-xs mt-0.5 ${bmiColor}`}>
                {getBmiCategoryLabel(bmrResult.bmiCategory)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">{bmrResult.label}</div>
            <div className={`flex items-center gap-1 text-xl font-semibold mt-1 ${showAccuracyWarning ? 'text-red-500' : ''}`}>
              {bmrResult.effectiveMmr ?? '—'}
              {showAccuracyWarning && (
                <button type="button" title={ACCURACY_WARNING} onClick={scrollToWarning} className="shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                </button>
              )}
            </div>
            {bmrResult.effectiveMmr && <div className="text-xs text-muted-foreground mt-0.5">kcal/day</div>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">TDEE</div>
            <div className={`flex items-center gap-1 text-xl font-semibold mt-1 ${showAccuracyWarning ? 'text-red-500' : ''}`}>
              {bmrResult.tdee ?? '—'}
              {showAccuracyWarning && (
                <button type="button" title={ACCURACY_WARNING} onClick={scrollToWarning} className="shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                </button>
              )}
            </div>
            {bmrResult.tdee && <div className="text-xs text-muted-foreground mt-0.5">kcal/day</div>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Calorie Target</div>
            <div className="flex items-center gap-1 text-xl font-semibold mt-1">
              {effectiveCalorieTarget ?? '—'}
              {warning && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
            </div>
            {warning && (
              <div className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                <span className="truncate">Below minimum</span>
              </div>
            )}
            {effectiveCalorieTarget && !warning && (
              <div className="text-xs text-muted-foreground mt-0.5">kcal/day</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Consumed Today</div>
            <div className="text-xl font-semibold mt-1">{Math.round(caloriesConsumedToday)}</div>
            {effectiveCalorieTarget ? (
              <>
                <Progress value={calorieProgress} className="h-1.5 mt-2" />
                <div className="text-xs text-muted-foreground mt-0.5">{Math.round(calorieProgress)}% of target</div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground mt-0.5">kcal</div>
            )}
          </CardContent>
        </Card>
      </div>

      {showAccuracyWarning && (
        <div ref={warningRef} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
          <span>{ACCURACY_WARNING}</span>
        </div>
      )}
    </div>
  );
}
