'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNutritionStore } from '@/lib/nutrition-store';
import { PersonSelector } from '@/components/nutrition/person-selector';
import { FoodLogEntry, MEAL_LABELS } from '@/components/nutrition/food-log-entry';
import { AddFoodLogDialog } from '@/components/nutrition/add-food-log-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FoodLogEntryRecord, MealSlot } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

export default function HistoryPage() {
  const {
    profiles,
    activeProfileId,
    foodLog,
    fetchProfiles,
    fetchFoodLog,
    deleteFoodLogEntry,
  } = useNutritionStore();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<FoodLogEntryRecord | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    if (activeProfileId && startDate && endDate) {
      fetchFoodLog(activeProfileId, startDate, endDate);
    }
  }, [activeProfileId, startDate, endDate, fetchFoodLog]);

  const grouped = useMemo(() => {
    const byDate: Record<string, Record<MealSlot, FoodLogEntryRecord[]>> = {};
    const slots: MealSlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night', 'snack'];

    for (const entry of foodLog) {
      if (!byDate[entry.date]) {
        const slotMap = {} as Record<MealSlot, FoodLogEntryRecord[]>;
        for (const s of slots) slotMap[s] = [];
        byDate[entry.date] = slotMap;
      }
      byDate[entry.date][entry.mealSlot].push(entry);
    }

    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, slots]) => ({ date, slots }));
  }, [foodLog]);

  const rangeTotals = useMemo(() => {
    const t = { calories: 0, protein: 0, totalFat: 0, totalCarbs: 0 };
    for (const e of foodLog) {
      t.calories += e.calories;
      t.protein += e.protein;
      t.totalFat += e.totalFat;
      t.totalCarbs += e.totalCarbs;
    }
    return t;
  }, [foodLog]);

  const handleEdit = useCallback((entry: FoodLogEntryRecord) => {
    setEditEntry(entry);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteFoodLogEntry(id);
  }, [deleteFoodLogEntry]);

  if (!activeProfileId && profiles.length === 0) {
    return (
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No profiles yet</p>
          <p className="text-sm mb-4">Create a profile to view history.</p>
          <Button asChild><Link href="/nutrition/profiles">Create Profile</Link></Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">History</h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/nutrition">Dashboard</Link>
        </Button>
      </div>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <PersonSelector />
        <div className="flex items-center gap-2">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36 h-9" />
          <span className="text-muted-foreground">to</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36 h-9" />
        </div>
      </div>

      {foodLog.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-2">Range Totals</h3>
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div><span className="text-muted-foreground">Calories</span><br /><span className="font-medium">{Math.round(rangeTotals.calories)} kcal</span></div>
              <div><span className="text-muted-foreground">Fat</span><br /><span className="font-medium">{rangeTotals.totalFat.toFixed(1)}g</span></div>
              <div><span className="text-muted-foreground">Carbs</span><br /><span className="font-medium">{rangeTotals.totalCarbs.toFixed(1)}g</span></div>
              <div><span className="text-muted-foreground">Protein</span><br /><span className="font-medium">{rangeTotals.protein.toFixed(1)}g</span></div>
              <div><span className="text-muted-foreground">Entries</span><br /><span className="font-medium">{foodLog.length}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {grouped.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No entries found for the selected date range.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ date, slots }) => (
            <Card key={date}>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">
                  {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {(Object.entries(slots) as [MealSlot, FoodLogEntryRecord[]][]).map(([slot, entries]) => {
                  if (entries.length === 0) return null;
                  return (
                    <div key={slot} className="mb-2">
                      <div className="text-xs text-muted-foreground mb-1">{MEAL_LABELS[slot]}</div>
                      <div className="space-y-1">
                        {entries.map((entry) => (
                          <FoodLogEntry
                            key={entry.id}
                            entry={entry}
                            compact
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddFoodLogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profileId={activeProfileId ?? ''}
        editEntry={editEntry}
      />
    </main>
  );
}
