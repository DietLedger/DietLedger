'use client';

import { useState, useCallback, useMemo } from 'react';
import { useNutritionProfiles, useFoodLogByDate, useDeleteFoodLogEntry } from '@/hooks/use-nutrition';
import { PersonSelector } from '@/components/nutrition/person-selector';
import { FoodLogEntry, MEAL_LABELS } from '@/components/nutrition/food-log-entry';
import { AddFoodLogDialog } from '@/components/nutrition/add-food-log-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import type { MealSlot, FoodLogEntryRecord } from '@/lib/types';
import Link from 'next/link';

const MEAL_SLOTS: MealSlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night', 'snack'];

export default function FoodLogPage() {
  const { profiles, activeProfileId } = useNutritionProfiles();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: foodLog = [] } = useFoodLogByDate(activeProfileId ?? '', date);
  const deleteMutation = useDeleteFoodLogEntry();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMealSlot, setDialogMealSlot] = useState<MealSlot>('noon');
  const [editEntry, setEditEntry] = useState<FoodLogEntryRecord | null>(null);

  const entriesBySlot = useMemo(() => {
    const map: Record<MealSlot, FoodLogEntryRecord[]> = {
      morning: [],
      midMorning: [],
      noon: [],
      afternoon: [],
      evening: [],
      night: [],
      snack: [],
    };
    for (const entry of foodLog) {
      if (map[entry.mealSlot]) {
        map[entry.mealSlot].push(entry);
      }
    }
    return map;
  }, [foodLog]);

  const dailyTotals = useMemo(() => {
    const totals = { calories: 0, totalFat: 0, totalCarbs: 0, protein: 0, sodium: 0 };
    for (const entry of foodLog) {
      totals.calories += entry.calories;
      totals.totalFat += entry.totalFat;
      totals.totalCarbs += entry.totalCarbs;
      totals.protein += entry.protein;
      totals.sodium += entry.sodium;
    }
    return totals;
  }, [foodLog]);

  const openAddDialog = useCallback((slot: MealSlot) => {
    setEditEntry(null);
    setDialogMealSlot(slot);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((entry: FoodLogEntryRecord) => {
    setEditEntry(entry);
    setDialogMealSlot(entry.mealSlot);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!activeProfileId) return;
    await deleteMutation.mutateAsync({ id, profileId: activeProfileId, date });
  }, [deleteMutation, activeProfileId, date]);

  if (!activeProfileId && profiles.length === 0) {
    return (
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No profiles yet</p>
          <p className="text-sm mb-4">Create a profile to start logging food.</p>
          <Button asChild><Link href="/nutrition/profiles">Create Profile</Link></Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Food Log</h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/nutrition">Dashboard</Link>
        </Button>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <PersonSelector />
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40 h-9"
        />
      </div>

      <div className="space-y-3">
        {MEAL_SLOTS.map((slot) => {
          const entries = entriesBySlot[slot];
          return (
            <Card key={slot}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{MEAL_LABELS[slot]}</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => openAddDialog(slot)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {entries.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No food logged for this meal</p>
                ) : (
                  <div className="space-y-1">
                    {entries.map((entry) => (
                      <FoodLogEntry
                        key={entry.id}
                        entry={entry}
                        compact
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {foodLog.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-2">Daily Totals</h3>
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div><span className="text-muted-foreground">Calories</span><br /><span className="font-medium">{Math.round(dailyTotals.calories)} kcal</span></div>
              <div><span className="text-muted-foreground">Fat</span><br /><span className="font-medium">{dailyTotals.totalFat.toFixed(1)}g</span></div>
              <div><span className="text-muted-foreground">Carbs</span><br /><span className="font-medium">{dailyTotals.totalCarbs.toFixed(1)}g</span></div>
              <div><span className="text-muted-foreground">Protein</span><br /><span className="font-medium">{dailyTotals.protein.toFixed(1)}g</span></div>
              <div><span className="text-muted-foreground">Sodium</span><br /><span className="font-medium">{Math.round(dailyTotals.sodium)}mg</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      <AddFoodLogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profileId={activeProfileId ?? ''}
        defaultMealSlot={dialogMealSlot}
        defaultDate={date}
        editEntry={editEntry}
      />
    </main>
  );
}
