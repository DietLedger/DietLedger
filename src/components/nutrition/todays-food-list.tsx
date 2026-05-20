'use client';

import { useMemo } from 'react';
import { FoodLogEntryRecord, MealSlot } from '@/lib/storage';
import { FoodLogEntry, MEAL_LABELS } from '@/components/nutrition/food-log-entry';

const MEAL_ORDER: MealSlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night', 'snack'];

interface TodaysFoodListProps {
  entries: FoodLogEntryRecord[];
  onEdit?: (entry: FoodLogEntryRecord) => void;
  onDelete?: (id: string) => void;
}

export function TodaysFoodList({ entries, onEdit, onDelete }: TodaysFoodListProps) {
  const grouped = useMemo(() => {
    const map: Record<MealSlot, FoodLogEntryRecord[]> = {
      morning: [], midMorning: [], noon: [], afternoon: [], evening: [], night: [], snack: [],
    };
    for (const e of entries) {
      if (map[e.mealSlot]) map[e.mealSlot].push(e);
    }
    return map;
  }, [entries]);

  const totals = useMemo(() => {
    const t = { calories: 0, protein: 0, totalFat: 0, totalCarbs: 0 };
    for (const e of entries) {
      t.calories += e.calories;
      t.protein += e.protein;
      t.totalFat += e.totalFat;
      t.totalCarbs += e.totalCarbs;
    }
    return t;
  }, [entries]);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No food logged today</p>;
  }

  return (
    <div>
      {MEAL_ORDER.map((slot) => {
        const items = grouped[slot];
        if (items.length === 0) return null;
        return (
          <div key={slot} className="mb-3">
            <h4 className="text-xs font-medium text-muted-foreground mb-1">{MEAL_LABELS[slot]}</h4>
            <div className="space-y-1">
              {items.map((entry) => (
                <FoodLogEntry key={entry.id} entry={entry} compact onEdit={onEdit} onDelete={onDelete} />
              ))}
            </div>
          </div>
        );
      })}
      <div className="border-t pt-2 mt-2 text-xs text-muted-foreground grid grid-cols-4 gap-2">
        <div>Total: {Math.round(totals.calories)} kcal</div>
        <div>Fat: {totals.totalFat.toFixed(1)}g</div>
        <div>Carbs: {totals.totalCarbs.toFixed(1)}g</div>
        <div>Protein: {totals.protein.toFixed(1)}g</div>
      </div>
    </div>
  );
}
