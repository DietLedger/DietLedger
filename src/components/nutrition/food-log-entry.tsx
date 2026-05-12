'use client';

import { FoodLogEntryRecord, MealSlot } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';

const MEAL_LABELS: Record<MealSlot, string> = {
  morning: 'Morning',
  midMorning: 'Mid-Morning',
  noon: 'Lunch',
  afternoon: 'Afternoon',
  evening: 'Dinner',
  snack: 'Snack',
};

const MEAL_COLORS: Record<MealSlot, string> = {
  morning: 'bg-amber-100 text-amber-800',
  midMorning: 'bg-orange-100 text-orange-800',
  noon: 'bg-green-100 text-green-800',
  afternoon: 'bg-blue-100 text-blue-800',
  evening: 'bg-purple-100 text-purple-800',
  snack: 'bg-pink-100 text-pink-800',
};

interface FoodLogEntryProps {
  entry: FoodLogEntryRecord;
  onEdit?: (entry: FoodLogEntryRecord) => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}

export function FoodLogEntry({ entry, onEdit, onDelete, compact }: FoodLogEntryProps) {
  return (
    <div className={`flex items-center justify-between gap-2 py-2 ${compact ? '' : 'px-3 rounded-lg border bg-card'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{entry.name}</span>
          <Badge variant="secondary" className={`text-xs ${MEAL_COLORS[entry.mealSlot]}`}>
            {MEAL_LABELS[entry.mealSlot]}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {entry.servings} serving{entry.servings !== 1 ? 's' : ''} &middot; {Math.round(entry.calories)} kcal
        </div>
      </div>
      <div className="flex items-center gap-1">
        {(onEdit || onDelete) && (
          <>
            {onEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(entry.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { MEAL_LABELS, MEAL_COLORS };
