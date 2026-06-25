'use client';

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNutritionProfiles, useFoodLogByRange, useWeights, useDeleteFoodLogEntry } from '@/hooks/use-nutrition';
import type { FoodLogEntryRecord } from '@/lib/types';
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
import { EnergySpikeChart } from '@/components/nutrition/energy-spike-chart';
import { BloodPressureChart } from '@/components/nutrition/blood-pressure-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Users, History, Heart, FileDown } from 'lucide-react';
import Link from 'next/link';
import { calculateGoalCalories, calculateFullBmr } from '@/lib/nutrition-calcs';
import { DietaryProfileList } from '@/components/dietary/dietary-profile-editor';
import { ThresholdAlerts } from '@/components/nutrition/threshold-alerts';
import { useDietaryProfiles } from '@/hooks/use-dietary';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { findGI, glCategory, type GLCategory } from '@/data/glycemic-index';
import { computeRecipeGL } from '@/lib/glycemic-load';
import { useAppSettings } from '@/hooks/use-settings';
import { DEFAULT_MEAL_SLOT_TIMES, type MealSlotTimes } from '@/lib/types';
import { useRecipes } from '@/hooks/use-recipes';
import { exportNutritionDashboard } from '@/lib/pdf-export';

export default function NutritionPage() {
  return (
    <Suspense>
      <NutritionDashboard />
    </Suspense>
  );
}

function NutritionDashboard() {
  const { profiles, activeProfileId } = useNutritionProfiles();
  const [period, setPeriod] = useState<Period>('today');
  const [selectedDate, setSelectedDate] = useState(formatDateForDB(new Date()));
  const periodDates = useMemo(() => getPeriodDates(period, selectedDate), [period, selectedDate]);
  const { data: foodLog = [] } = useFoodLogByRange(
    activeProfileId ?? '',
    formatDateForDB(periodDates.start),
    formatDateForDB(periodDates.end),
  );
  const { weights } = useWeights(activeProfileId ?? '');
  const deleteFoodLogEntryMutation = useDeleteFoodLogEntry();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<FoodLogEntryRecord | null>(null);
  const [dietsDialogOpen, setDietsDialogOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  const { profiles: dietaryProfiles, activeProfileId: activeDietaryProfileId } = useDietaryProfiles();
  const { data: appSettings } = useAppSettings();
  const defaultMealSlotTimes = appSettings?.defaultMealSlotTimes ?? DEFAULT_MEAL_SLOT_TIMES;
  const { data: recipes = [] } = useRecipes();
  const activeDietaryProfile = useMemo(
    () => dietaryProfiles.find((p) => p.id === activeDietaryProfileId) ?? null,
    [dietaryProfiles, activeDietaryProfileId]
  );

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId),
    [profiles, activeProfileId]
  );

  useEffect(() => {
    if (searchParams.get('action') === 'addfood') {
      setEditEntry(null);
      setDialogOpen(true);
    }
  }, [searchParams]);

  const latestWeight = useMemo(() => {
    if (!weights.length) return undefined;
    return [...weights].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [weights]);

  const periodLabel = useMemo(() => {
    const labels: Record<string, string> = { today: "Today's", week: "This Week's", month: "This Month's", year: "This Year's", day: '' };
    if (period === 'day') {
      const d = new Date(selectedDate + 'T00:00:00');
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    return labels[period] ?? "Today's";
  }, [period, selectedDate]);

  const periodEntries = useMemo(() => {
    const { start, end } = getPeriodDates(period, selectedDate);
    const startStr = formatDateForDB(start);
    const endStr = formatDateForDB(end);
    return foodLog.filter((e) => e.date >= startStr && e.date <= endStr);
  }, [foodLog, period, selectedDate]);

  const todayEntries = useMemo(() => {
    const dateStr = period === 'today' || period === 'day'
      ? formatDateForDB(periodDates.start)
      : formatDateForDB(new Date());
    return foodLog.filter((e) => e.date === dateStr);
  }, [foodLog, period, periodDates]);

  const caloriesToday = useMemo(
    () => todayEntries.reduce((sum, e) => sum + e.calories, 0),
    [todayEntries]
  );

  const bmrResult = useMemo(() => {
    if (!activeProfile || !latestWeight) return null;
    const age = activeProfile.birthDate
      ? Math.floor((Date.now() - new Date(activeProfile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;
    return calculateFullBmr({
      weightKg: latestWeight.weightKg,
      heightCm: activeProfile.heightCm,
      age,
      sex: activeProfile.sex,
      activityLevel: activeProfile.activityLevel,
      equation: activeProfile.bmrEquation ?? 'auto',
      manualBmrValue: activeProfile.manualBmrValue ?? null,
    });
  }, [activeProfile, latestWeight]);

  const goalCalories = useMemo(() => {
    if (!bmrResult || !latestWeight || !activeProfile) return null;
    return calculateGoalCalories(bmrResult.tdee, latestWeight.weightKg, activeProfile.goalWeightKg, activeProfile.goalDate) ?? bmrResult.tdee;
  }, [bmrResult, latestWeight, activeProfile]);

  const effectiveCalorieTarget = useMemo(() => {
    return activeProfile?.calorieTarget ?? goalCalories ?? bmrResult?.tdee ?? null;
  }, [activeProfile, goalCalories, bmrResult]);

  const mealEnergyData = useMemo(() => {
    const slotTimes: MealSlotTimes = { ...DEFAULT_MEAL_SLOT_TIMES, ...defaultMealSlotTimes };
    const slotMinutes: Record<string, number> = {};
    for (const [slot, t] of Object.entries(slotTimes)) {
      const [h, m] = t.split(':').map(Number);
      slotMinutes[slot] = h * 60 + m;
    }

    const entryPoints: { time: number; gl: number; category: GLCategory; mealName: string }[] = [];

    for (const entry of todayEntries) {
      let entryGL: number | null = null;

      if (entry.sourceType === 'recipe' && entry.sourceId) {
        const recipe = recipes.find((r) => r.id === entry.sourceId);
        if (recipe) {
          const result = computeRecipeGL(recipe, entry.servings, recipes);
          entryGL = result.gl;
        }
      }

      if (entryGL === null) {
        const gi = findGI(entry.name);
        if (gi !== null) {
          const netCarbs = (entry.totalCarbs || 0) - (entry.dietaryFiber || 0);
          if (netCarbs > 0) {
            entryGL = (gi * netCarbs) / 100;
          }
        }
      }

      if (entryGL === null || entryGL <= 0) continue;

      let minutes: number;
      if (entry.time) {
        const [h, m] = entry.time.split(':').map(Number);
        minutes = h * 60 + m;
      } else {
        minutes = slotMinutes[entry.mealSlot] ?? 720;
      }

      entryPoints.push({
        time: minutes,
        gl: Math.round(entryGL * 10) / 10,
        category: glCategory(entryGL),
        mealName: entry.name,
      });
    }

    return entryPoints.sort((a, b) => a.time - b.time);
  }, [todayEntries, defaultMealSlotTimes, recipes]);

  const glucoseReadings = useMemo(() => {
    return weights
      .filter((w) => w.bloodSugar != null)
      .map((w) => {
        const created = new Date(w.createdAt);
        return { time: created.getHours() * 60 + created.getMinutes(), glucose: w.bloodSugar! };
      })
      .sort((a, b) => a.time - b.time);
  }, [weights]);

  const handleDeleteEntry = useCallback(async (id: string) => {
    if (!activeProfileId) return;
    await deleteFoodLogEntryMutation.mutateAsync({ id, profileId: activeProfileId, date: formatDateForDB(periodDates.start) });
  }, [deleteFoodLogEntryMutation, activeProfileId, periodDates]);

  const handleEditEntry = useCallback((entry: FoodLogEntryRecord) => {
    setEditEntry(entry);
    setDialogOpen(true);
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (!exportRef.current) return;
    const periodLabels: Record<Period, string> = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', day: '' };
    const { start, end } = getPeriodDates(period);
    const dateRange = period === 'today'
      ? start.toLocaleDateString()
      : `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    const blob = await exportNutritionDashboard(exportRef.current, {
      profileName: activeProfile?.name,
      periodLabel: periodLabels[period],
      dateRange,
      dietaryTags: activeDietaryProfile?.dietaryTags,
      allergens: activeDietaryProfile?.allergens,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition-${period}-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [period]);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Nutrition</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/nutrition/log"><History className="h-4 w-4 mr-1" />Food Log</Link>
          </Button>
          <Button size="sm" onClick={() => { setEditEntry(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add Food
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/nutrition/profiles"><Users className="h-4 w-4 mr-1" />People</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDietsDialogOpen(true)}>
            <Heart className="h-4 w-4 mr-1" />Diets
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <FileDown className="h-4 w-4 mr-1" />Export PDF
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <PersonSelector />
        <PeriodSelector value={period} onChange={setPeriod} selectedDate={selectedDate} onDateChange={setSelectedDate} />
      </div>

      <div ref={exportRef}>
        <ThresholdAlerts entries={todayEntries} dietaryProfile={activeDietaryProfile} />

        {activeDietaryProfile && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {activeDietaryProfile.allergens.length > 0 && (
              <span className="text-xs text-stone-500">Allergens: {activeDietaryProfile.allergens.join(', ')}</span>
            )}
            {activeDietaryProfile.dietaryTags.length > 0 && (
              <span className="text-xs text-stone-500">
                Diets: {activeDietaryProfile.dietaryTags.join(', ')}
              </span>
            )}
          </div>
        )}

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
              <CalorieSummaryChart
                entries={foodLog}
                period={period}
                bmr={bmrResult?.bmr ?? null}
                rmr={bmrResult?.rmr ?? null}
                tdee={bmrResult?.tdee ?? null}
                calorieTarget={effectiveCalorieTarget}
              />
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
              <NutrientTrendChart
                entries={foodLog}
                period={period}
                targets={{
                  calorieTarget: effectiveCalorieTarget,
                  proteinGoalG: activeProfile?.proteinGoalG,
                  fatGoalG: activeProfile?.fatGoalG,
                  carbsGoalG: activeProfile?.carbsGoalG,
                  sodiumMaxMg: activeProfile?.sodiumMaxMg,
                  fiberGoalG: activeProfile?.fiberGoalG,
                  sugarMaxG: activeProfile?.sugarMaxG,
                }}
              />
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

        <div className="mb-6">
          <EnergySpikeChart meals={mealEnergyData} glucoseReadings={glucoseReadings} />
        </div>

        <div className="mb-6">
          <BloodPressureChart entries={weights} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">{periodLabel} Food</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <TodaysFoodList entries={periodEntries} onEdit={handleEditEntry} onDelete={handleDeleteEntry} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Most Eaten</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <MostEatenList entries={periodEntries} limit={period === 'year' ? 20 : 10} />
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

      <Dialog open={dietsDialogOpen} onOpenChange={setDietsDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-brand-600" />Special Diets &amp; Allergens
            </DialogTitle>
          </DialogHeader>
          <DietaryProfileList />
        </DialogContent>
      </Dialog>
    </main>
  );
}
