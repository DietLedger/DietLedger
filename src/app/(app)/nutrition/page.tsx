'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNutritionStore } from '@/lib/nutrition-store';
import { getLatestWeight } from '@/lib/storage';
import { WeightEntryRecord, FoodLogEntryRecord } from '@/lib/storage';
import { PersonSelector } from '@/components/nutrition/person-selector';
import { PeriodSelector, Period, getPeriodDates, formatDateForDB } from '@/components/nutrition/period-selector';
import { BmiCalorieStats } from '@/components/nutrition/bmi-calorie-stats';
import { CalorieSummaryChart } from '@/components/nutrition/calorie-summary-chart';
import { MacroBreakdownChart } from '@/components/nutrition/macro-breakdown-chart';
import { NutrientTrendChart } from '@/components/nutrition/nutrient-trend-chart';
import { WeightTrendChart } from '@/components/nutrition/weight-trend-chart';
import { TodaysFoodList } from '@/components/nutrition/todays-food-list';
import { MostEatenList } from '@/components/nutrition/most-eaten-list';
import { AddFoodLogDialog } from '@/components/nutrition/add-food-log-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Users, History } from 'lucide-react';
import Link from 'next/link';
import { calculateTDEE, calculateBMR, calculateGoalCalories } from '@/lib/nutrition-calcs';

export default function NutritionDashboard() {
  const {
    profiles,
    activeProfileId,
    foodLog,
    weights,
    fetchProfiles,
    fetchFoodLog,
    fetchWeights,
    deleteFoodLogEntry,
    updateFoodLogEntry,
  } = useNutritionStore();

  const [period, setPeriod] = useState<Period>('today');
  const [latestWeight, setLatestWeight] = useState<WeightEntryRecord | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<FoodLogEntryRecord | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId),
    [profiles, activeProfileId]
  );

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    if (activeProfileId) {
      const { start, end } = getPeriodDates(period);
      fetchFoodLog(activeProfileId, formatDateForDB(start), formatDateForDB(end));
      fetchWeights(activeProfileId);
    }
  }, [activeProfileId, period, fetchFoodLog, fetchWeights]);

  useEffect(() => {
    if (activeProfileId) {
      getLatestWeight(activeProfileId).then(setLatestWeight);
    } else {
      setLatestWeight(undefined);
    }
  }, [activeProfileId, weights]);

  const todayEntries = useMemo(() => {
    const today = formatDateForDB(new Date());
    return foodLog.filter((e) => e.date === today);
  }, [foodLog]);

  const caloriesToday = useMemo(
    () => todayEntries.reduce((sum, e) => sum + e.calories, 0),
    [todayEntries]
  );

  const goalCalories = useMemo(() => {
    if (!activeProfile || !latestWeight) return null;
    const age = activeProfile.birthDate
      ? Math.floor((Date.now() - new Date(activeProfile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;
    const bmr = calculateBMR(latestWeight.weightKg, activeProfile.heightCm, age, activeProfile.sex);
    const tdee = calculateTDEE(bmr, activeProfile.activityLevel);
    return calculateGoalCalories(tdee, latestWeight.weightKg, activeProfile.goalWeightKg, activeProfile.goalDate) ?? tdee;
  }, [activeProfile, latestWeight]);

  const handleDeleteEntry = useCallback(async (id: string) => {
    await deleteFoodLogEntry(id);
  }, [deleteFoodLogEntry]);

  const handleEditEntry = useCallback((entry: FoodLogEntryRecord) => {
    setEditEntry(entry);
    setDialogOpen(true);
  }, []);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Nutrition</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/nutrition/log"><History className="h-4 w-4 mr-1" />Food Log</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/nutrition/profiles"><Users className="h-4 w-4 mr-1" />People</Link>
          </Button>
          <Button size="sm" onClick={() => { setEditEntry(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add Food
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <PersonSelector />
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="mb-6">
        <BmiCalorieStats
          profile={activeProfile}
          latestWeight={latestWeight}
          caloriesConsumedToday={caloriesToday}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Calorie Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <CalorieSummaryChart entries={foodLog} period={period} goalCalories={goalCalories} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Macro Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <MacroBreakdownChart entries={foodLog} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Nutrient Trends</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <NutrientTrendChart entries={foodLog} period={period} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Weight Trend</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <WeightTrendChart entries={weights} goalWeightKg={activeProfile?.goalWeightKg} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Today&apos;s Food</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <TodaysFoodList entries={todayEntries} onEdit={handleEditEntry} onDelete={handleDeleteEntry} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Most Eaten</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <MostEatenList entries={foodLog} limit={period === 'year' ? 20 : 10} />
          </CardContent>
        </Card>
      </div>

      <AddFoodLogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profileId={activeProfileId ?? ''}
        defaultDate={formatDateForDB(new Date())}
        editEntry={editEntry}
      />
    </main>
  );
}
