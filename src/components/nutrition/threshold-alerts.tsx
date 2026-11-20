'use client';

import { useMemo, useState } from 'react';
import type { FoodLogEntryRecord, NutritionProfileRecord } from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { X, AlertTriangle } from 'lucide-react';

interface ThresholdAlertsProps {
  entries: FoodLogEntryRecord[];
  profile?: NutritionProfileRecord | null;
  dietaryProfile?: import('@/lib/types').DietaryProfileRecord | null;
}

interface NutrientAlert {
  nutrient: string;
  current: number;
  max: number;
  percent: number;
  level: 'warning' | 'danger';
  unit: string;
}

const NUTRIENT_FIELDS: Record<string, keyof FoodLogEntryRecord> = {
  sodium: 'sodium',
  sugar: 'totalSugars',
  totalSugars: 'totalSugars',
  addedSugars: 'addedSugars',
  dietaryFiber: 'dietaryFiber',
  saturatedFat: 'saturatedFat',
  cholesterol: 'cholesterol',
  calories: 'calories',
  totalFat: 'totalFat',
  totalCarbs: 'totalCarbs',
  protein: 'protein',
  fiber: 'dietaryFiber',
};

const UNITS: Record<string, string> = {
  sodium: 'mg',
  sugar: 'g',
  totalSugars: 'g',
  addedSugars: 'g',
  dietaryFiber: 'g',
  saturatedFat: 'g',
  cholesterol: 'mg',
  calories: '',
  totalFat: 'g',
  totalCarbs: 'g',
  protein: 'g',
  fiber: 'g',
};

export function ThresholdAlerts({ entries, profile, dietaryProfile }: ThresholdAlertsProps) {
  const [dismissed, setDismissed] = useState(false);

  const alerts = useMemo(() => {
    const result: NutrientAlert[] = [];
    if (!dietaryProfile || entries.length === 0) return result;

    const totals: Record<string, number> = {};
    for (const entry of entries) {
      for (const [nutrient, field] of Object.entries(NUTRIENT_FIELDS)) {
        totals[nutrient] = (totals[nutrient] ?? 0) + (entry[field] as number);
      }
    }

    for (const threshold of dietaryProfile.nutrientThresholds) {
      const current = totals[threshold.nutrient] ?? 0;
      const max = threshold.dailyMax ?? 0;
      if (max <= 0) continue;

      const percent = Math.round((current / max) * 100);
      if (percent >= 50) {
        result.push({
          nutrient: threshold.nutrient,
          current,
          max,
          percent,
          level: percent >= 80 ? 'danger' : 'warning',
          unit: UNITS[threshold.nutrient] ?? '',
        });
      }
    }

    return result.sort((a, b) => b.percent - a.percent);
  }, [entries, dietaryProfile]);

  if (dismissed || alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <Alert
          key={alert.nutrient}
          variant={alert.level === 'danger' ? 'destructive' : 'default'}
          className="relative"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm flex items-center justify-between">
            <span>
              {alert.current.toLocaleString()}{alert.unit} {alert.nutrient} — {alert.percent}% of daily max ({alert.max.toLocaleString()}{alert.unit})
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 absolute top-2 right-2"
              onClick={() => setDismissed(true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
