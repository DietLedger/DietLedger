'use client';

import { useMemo } from 'react';
import type { FoodLogEntryRecord, NutritionProfileRecord } from '@/lib/types';
import { ProgressRingsGrid } from '@/components/nutrition/progress-rings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface NutrientDashboardProps {
  entries: FoodLogEntryRecord[];
  profile?: NutritionProfileRecord | null;
}

export function NutrientDashboard({ entries, profile }: NutrientDashboardProps) {
  const [macrosOpen, setMacrosOpen] = useState(true);

  const goals = useMemo(() => {
    if (!profile) return null;
    return {
      proteinGoalG: profile.proteinGoalG,
      carbsGoalG: profile.carbsGoalG,
      fatGoalG: profile.fatGoalG,
      fiberGoalG: profile.fiberGoalG,
      sodiumMaxMg: profile.sodiumMaxMg,
      sugarMaxG: profile.sugarMaxG,
      vitaminDGoalUg: profile.vitaminDGoalUg,
      calciumGoalMg: profile.calciumGoalMg,
      ironGoalMg: profile.ironGoalMg,
      potassiumGoalMg: profile.potassiumGoalMg,
    };
  }, [profile]);

  const hasGoals = goals && Object.values(goals).some((v) => v !== undefined && v > 0);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Nutrient Goals</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {hasGoals ? (
          <ProgressRingsGrid entries={entries} goals={goals} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Set nutrient goals in your profile to track daily progress.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
