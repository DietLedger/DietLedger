'use client';

import { useRef, useCallback } from 'react';
import { NutritionProfileRecord, WeightEntryRecord } from '@/lib/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { calculateBMI, calculateFullBmr, getBmiCategoryLabel, getBmiCategoryColor, isObeseClass2Plus } from '@/lib/nutrition-calcs';
import { displayWeight, displayHeight } from '@/hooks/use-unit-system';
import { useUnitSystem } from '@/hooks/use-unit-system';
import { Pencil, Trash2, Weight, AlertTriangle } from 'lucide-react';

const ACCURACY_WARNING = 'Calculations are not accurate at this level. Please consult with your doctor about indirect calorimetry and override these values with your test results.';

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'Sedentary',
  light: 'Lightly Active',
  moderate: 'Moderately Active',
  active: 'Active',
  veryActive: 'Very Active',
};

const COLORS = ['bg-brand-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

interface ProfileCardProps {
  profile: NutritionProfileRecord;
  latestWeight: WeightEntryRecord | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onLogWeight: () => void;
  index: number;
}

export function ProfileCard({ profile, latestWeight, onEdit, onDelete, onLogWeight, index }: ProfileCardProps) {
  const { system } = useUnitSystem();
  const warningRef = useRef<HTMLDivElement>(null);
  const bmi = latestWeight ? calculateBMI(latestWeight.weightKg, profile.heightCm) : null;
  const colorClass = COLORS[index % COLORS.length];

  const scrollToWarning = useCallback(() => {
    warningRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const age = profile.birthDate
    ? Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const bmrResult = calculateFullBmr({
    weightKg: latestWeight?.weightKg ?? null,
    heightCm: profile.heightCm,
    age,
    sex: profile.sex,
    activityLevel: profile.activityLevel,
    equation: profile.bmrEquation ?? 'auto',
    manualBmrValue: profile.manualBmrValue ?? null,
  });

  const showWarning = bmrResult.isObeseClass2Plus;

  return (
    <Card className={showWarning ? 'border-red-300 dark:border-red-800' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className={`${colorClass} text-white text-sm font-medium`}>
              {getInitials(profile.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-medium truncate">{profile.name}</h3>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onLogWeight} title="Log weight">
                  <Weight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Weight</span>
                <span className="font-medium text-foreground">
                  {latestWeight ? displayWeight(latestWeight.weightKg, system) : 'Not logged'}
                </span>
              </div>
              {profile.heightCm && (
                <div className="flex justify-between">
                  <span>Height</span>
                  <span className="font-medium text-foreground">{displayHeight(profile.heightCm, system)}</span>
                </div>
              )}
              {bmi !== null && (
                <div className="flex justify-between">
                  <span>BMI</span>
                  <span className={`font-medium ${getBmiCategoryColor(bmrResult.bmiCategory)}`}>
                    {bmi} — {getBmiCategoryLabel(bmrResult.bmiCategory)}
                  </span>
                </div>
              )}
              {bmrResult.effectiveMmr !== null && (
                <div className={`flex justify-between items-center ${showWarning ? 'text-red-600 dark:text-red-400' : ''}`}>
                  <span>{bmrResult.label}</span>
                  <span className="font-medium text-foreground flex items-center gap-1">
                    {bmrResult.effectiveMmr} kcal
                    {showWarning && (
                      <button type="button" title={ACCURACY_WARNING} onClick={scrollToWarning} className="shrink-0">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                      </button>
                    )}
                  </span>
                </div>
              )}
              {bmrResult.tdee !== null && (
                <div className={`flex justify-between items-center ${showWarning ? 'text-red-600 dark:text-red-400' : ''}`}>
                  <span>TDEE</span>
                  <span className="font-medium text-foreground flex items-center gap-1">
                    {bmrResult.tdee} kcal
                    {showWarning && (
                      <button type="button" title={ACCURACY_WARNING} onClick={scrollToWarning} className="shrink-0">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                      </button>
                    )}
                  </span>
                </div>
              )}
              {profile.calorieTarget && (
                <div className="flex justify-between">
                  <span>Calorie Target</span>
                  <span className="font-medium text-foreground">{profile.calorieTarget} kcal</span>
                </div>
              )}
              {profile.goalWeightKg && (
                <div className="flex justify-between">
                  <span>Goal</span>
                  <span className="font-medium text-foreground">{displayWeight(profile.goalWeightKg, system)}</span>
                </div>
              )}
              {profile.activityLevel && (
                <div className="flex justify-between">
                  <span>Activity</span>
                  <span>{ACTIVITY_LABELS[profile.activityLevel] || profile.activityLevel}</span>
                </div>
              )}
            </div>
            {showWarning && (
              <div ref={warningRef} className="mt-3 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                <span>{ACCURACY_WARNING}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
