'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  addDays,
  format,
  parseISO,
  isValid,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, ShoppingBasket, Plus, X, GripVertical, Minus, Trash2, ChefHat, UtensilsCrossed, Search, Loader2, Store, Apple, PenLine, Salad, Clock, FileDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWeekPlan, useEnsureMealPlan, useAddRecipeToSlot, useAddFoodToSlot, useRemoveEntry, useMoveEntry, useUpdateServings, useCreateMealGroup, useAddToGroup, useRemoveFromGroup, useDeleteMealGroupAndUngroup, useToggleLeftover, useUpdateSlotTimes, useReorderEntries } from '@/hooks/use-meal-plans';
import { useRecipes, type Recipe } from '@/hooks/use-recipes';
import { toPublicRecipe } from '@/lib/recipe-types';
import { useAppSettings } from '@/hooks/use-settings';
import { searchFDAFoods, type FDASearchResult } from '@/lib/fda-client';
import { getApiClient } from '@/lib/api-client';
import type { CustomFoodRecord } from '@/lib/types';
import type { DaySlot } from '@/lib/types';
import { DEFAULT_MEAL_SLOT_TIMES, type MealSlotTimes } from '@/lib/types';
import type { DayPlanEntryRecord, MealGroupRecord } from '@/lib/types';
import NutritionLabel, { type NutritionData } from '@/components/nutrition-label';
import { computeEntryGL, computeRecipeGL, sumGL, type GLResult } from '@/lib/glycemic-load';
import { GL_HOVER_KEY } from '@/data/glycemic-index';
import FoodSynergiesPanel from '@/components/meal-plan/food-synergies-panel';
import InSeasonRecipeDialog from '@/components/meal-plan/in-season-recipe-dialog';
import { exportMealPlanPdf, type MealPlanDayData } from '@/lib/pdf-export';

const COMPLETED_KEY = 'kitchen-helper-completed';
function getCompletedRecipes(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(COMPLETED_KEY) || '{}'); } catch { return {}; }
}
function isRecipeCompletedOnDate(recipeId: string, date: string): boolean {
  return getCompletedRecipes()[recipeId] === date;
}
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SLOT_LABELS: Record<DaySlot, string> = {
  morning: 'Morning',
  midMorning: 'Mid-Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const SLOT_ORDER: DaySlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night'];

export default function WeeklyPlanPage() {
  const params = useParams();
  const router = useRouter();
  const weekStart = params.weekStart as string;

  const weekDate = useMemo(() => {
    const d = parseISO(weekStart);
    return isValid(d) ? d : new Date();
  }, [weekStart]);

  const { data: weekData, isLoading } = useWeekPlan(weekStart);
  const activeMealPlan = weekData?.plan ?? null;
  const dayEntries = weekData?.entries ?? [];
  const mealGroups = weekData?.groups ?? [];
  const ensureMealPlanMutation = useEnsureMealPlan();
  const addRecipeToSlotMutation = useAddRecipeToSlot();
  const addFoodToSlotMutation = useAddFoodToSlot();
  const removeEntryMutation = useRemoveEntry();
  const moveEntryMutation = useMoveEntry();
  const updateServingsMutation = useUpdateServings();
  const createMealGroupMutation = useCreateMealGroup();
  const removeFromGroupMutation = useRemoveFromGroup();
  const deleteMealGroupAndUngroupMutation = useDeleteMealGroupAndUngroup();
  const reorderEntriesMutation = useReorderEntries();
  const toggleLeftoverMutation = useToggleLeftover();
  const updateSlotTimesMutation = useUpdateSlotTimes();

  const { data: recipes = [] } = useRecipes();
  const { data: appSettings } = useAppSettings();
  const defaultMealSlotTimes = appSettings?.defaultMealSlotTimes ?? DEFAULT_MEAL_SLOT_TIMES;
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [addDialogSlot, setAddDialogSlot] = useState<{ date: string; slot: DaySlot } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [addTab, setAddTab] = useState('recipes');
  const [fdaResults, setFdaResults] = useState<FDASearchResult[]>([]);
  const [fdaSearching, setFdaSearching] = useState(false);
  const [customFoods, setCustomFoods] = useState<CustomFoodRecord[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupingMode, setGroupingMode] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [completedRecipeMap, setCompletedRecipeMap] = useState<Record<string, string>>({});
  const [pantryStaples, setPantryStaples] = useState<Set<string>>(new Set());
  const [seasonalFoods, setSeasonalFoods] = useState<string[]>([]);
  const [selectedSeasonalFood, setSelectedSeasonalFood] = useState<string | null>(null);
  const [currentMonth] = useState(() => new Date().getMonth() + 1);
  const [fullRecipeCache, setFullRecipeCache] = useState<Map<string, Recipe>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    getApiClient().getCustomFoods().then(setCustomFoods);
  }, []);

  useEffect(() => {
    if (!searchQuery || !addDialogSlot || addTab !== 'food') {
      setFdaResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setFdaSearching(true);
      try {
        const result = await searchFDAFoods(searchQuery);
        setFdaResults(result.foods.slice(0, 50));
      } catch {
        setFdaResults([]);
      } finally {
        setFdaSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, addDialogSlot, addTab]);

  useEffect(() => {
    setCompletedRecipeMap(getCompletedRecipes());
    const onFocus = () => setCompletedRecipeMap(getCompletedRecipes());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSynergyData() {
      const api = getApiClient();
      const staples = await api.getPantryStaples();
      if (!cancelled) setPantryStaples(new Set(staples.map(s => s.toLowerCase())));

      const location = await api.getLocation();
      const country = location?.country || 'United States';
      const region = location?.region || 'Northeast';
      const foods = await api.getSeasonalFoods(country, region, new Date().getMonth() + 1);
      if (!cancelled) setSeasonalFoods(foods);
    }
    loadSynergyData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function enrichRecipes() {
      const api = getApiClient();
      const needed = new Set<string>();
      for (const entry of dayEntries) {
        if (!entry.recipeId || entry.sourceType !== 'recipe') continue;
        if (fullRecipeCache.has(entry.recipeId)) continue;
        const fromStore = recipes.find(r => r.id === entry.recipeId);
        if (fromStore && fromStore.ingredients.length > 0) continue;
        needed.add(entry.recipeId);
      }
      if (needed.size === 0) return;
      const newCache = new Map(fullRecipeCache);
      for (const id of needed) {
        try {
          const full = await api.getRecipe(id);
          if (full && !cancelled) {
            newCache.set(id, toPublicRecipe(full));
          }
        } catch {}
      }
      if (!cancelled && newCache.size !== fullRecipeCache.size) {
        setFullRecipeCache(newCache);
      }
    }
    enrichRecipes();
    return () => { cancelled = true; };
  }, [dayEntries, recipes, fullRecipeCache]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekDate, i);
      return {
        date: format(date, 'yyyy-MM-dd'),
        label: format(date, 'EEE'),
        fullLabel: format(date, 'EEEE, MMM d'),
      };
    });
  }, [weekDate]);

  const effectiveSlotTimes: MealSlotTimes = useMemo(() => ({
    ...DEFAULT_MEAL_SLOT_TIMES,
    ...defaultMealSlotTimes,
    ...(activeMealPlan?.slotTimes || {}),
  }), [defaultMealSlotTimes, activeMealPlan?.slotTimes]);

  const handleSlotTimeChange = useCallback((slot: DaySlot, time: string) => {
    const updated = { ...effectiveSlotTimes, [slot]: time };
    updateSlotTimesMutation.mutate({ planId: activeMealPlan!.id, slotTimes: updated, weekStart });
  }, [effectiveSlotTimes, updateSlotTimesMutation, weekStart, activeMealPlan]);

  const handleEnsurePlan = useCallback(async () => {
    await ensureMealPlanMutation.mutateAsync(weekStart);
  }, [ensureMealPlanMutation, weekStart]);

  const handleAddRecipe = useCallback(async (recipeId: string) => {
    if (!addDialogSlot) return;
    if (!activeMealPlan) await handleEnsurePlan();
    await addRecipeToSlotMutation.mutateAsync({ planId: activeMealPlan?.id!, date: addDialogSlot.date, slot: addDialogSlot.slot, recipeId, weekStart });
    setAddDialogSlot(null);
    setSearchQuery('');
    setAddTab('recipes');
    setFdaResults([]);
    setManualName('');
    setManualCalories('');
    setManualProtein('');
    setManualFat('');
    setManualCarbs('');
  }, [addDialogSlot, activeMealPlan, handleEnsurePlan, addRecipeToSlotMutation, weekStart]);

  const handleAddFood = useCallback(async (food: {
    name: string;
    sourceType: 'food' | 'customFood' | 'manual';
    calories?: number;
    totalFat?: number;
    saturatedFat?: number;
    transFat?: number;
    cholesterol?: number;
    sodium?: number;
    totalCarbs?: number;
    dietaryFiber?: number;
    totalSugars?: number;
    addedSugars?: number;
    protein?: number;
    vitaminD?: number;
    calcium?: number;
    iron?: number;
    potassium?: number;
  }) => {
    if (!addDialogSlot) return;
    if (!activeMealPlan) await handleEnsurePlan();
    await addFoodToSlotMutation.mutateAsync({ planId: activeMealPlan?.id!, date: addDialogSlot.date, slot: addDialogSlot.slot, food, weekStart });
    setAddDialogSlot(null);
    setSearchQuery('');
    setAddTab('recipes');
    setFdaResults([]);
    setManualName('');
    setManualCalories('');
    setManualProtein('');
    setManualFat('');
    setManualCarbs('');
  }, [addDialogSlot, activeMealPlan, handleEnsurePlan, addFoodToSlotMutation, weekStart]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDragActiveId(null);
    if (!over || active.id === over.id) return;

    const activeEntry = dayEntries.find((e) => e.id === active.id);
    if (!activeEntry) return;

    const overId = over.id as string;
    const overEntry = dayEntries.find((e) => e.id === overId);

    if (overEntry) {
      if (activeEntry.slot === overEntry.slot && activeEntry.date === overEntry.date) {
        const slotEntries = dayEntries
          .filter((e) => e.date === activeEntry.date && e.slot === activeEntry.slot)
          .sort((a, b) => a.position - b.position);
        const oldIdx = slotEntries.findIndex((e) => e.id === active.id);
        const newIdx = slotEntries.findIndex((e) => e.id === overId);
        if (oldIdx !== -1 && newIdx !== -1) {
          const reordered = arrayMove(slotEntries, oldIdx, newIdx);
          reorderEntriesMutation.mutate({
            slot: activeEntry.slot,
            date: activeEntry.date,
            entryIds: reordered.map((e) => e.id),
            planId: activeMealPlan!.id,
            weekStart,
          });
        }
      } else {
        moveEntryMutation.mutate({ entryId: active.id as string, toSlot: overEntry.slot, toPosition: overEntry.position, weekStart });
      }
    }
  }, [dayEntries, moveEntryMutation, reorderEntriesMutation, activeMealPlan, weekStart]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(event.active.id as string);
  }, []);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || selectedForGroup.length < 2) return;
    const firstEntry = dayEntries.find((e) => e.id === selectedForGroup[0]);
    if (!firstEntry) return;
    await createMealGroupMutation.mutateAsync({ planId: activeMealPlan!.id, date: firstEntry.date, slot: firstEntry.slot, name: `Meal - ${groupName}`, entryIds: selectedForGroup, weekStart });
    setGroupDialogOpen(false);
    setGroupName('');
    setSelectedForGroup([]);
    setGroupingMode(false);
  }, [groupName, selectedForGroup, dayEntries, createMealGroupMutation, activeMealPlan, weekStart]);

  const handleSynergyAddToSlot = useCallback(async (recipeId: string, slot: DaySlot) => {
    if (!editingDay) return;
    if (!activeMealPlan) await ensureMealPlanMutation.mutateAsync(weekStart);
    await addRecipeToSlotMutation.mutateAsync({ planId: activeMealPlan?.id!, date: editingDay, slot, recipeId, weekStart });
  }, [editingDay, activeMealPlan, ensureMealPlanMutation, weekStart, addRecipeToSlotMutation]);

  const filteredRecipes = useMemo(() => {
    if (!searchQuery) return recipes;
    const q = searchQuery.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, searchQuery]);

  const filteredCustomFoods = useMemo(() => {
    if (!searchQuery) return customFoods;
    const q = searchQuery.toLowerCase();
    return customFoods.filter((f) => f.name.toLowerCase().includes(q));
  }, [customFoods, searchQuery]);

  const prevWeek = format(addDays(weekDate, -7), 'yyyy-MM-dd');
  const nextWeek = format(addDays(weekDate, 7), 'yyyy-MM-dd');
  const weekEnd = format(addDays(weekDate, 6), 'MMMM d, yyyy');
  const dateRange = `${format(weekDate, 'MMM d')} – ${weekEnd}`;

  const handleExportPdf = useCallback(async () => {
    const mealPlanDays: MealPlanDayData[] = days.map(day => {
      const dayEntriesForDate = dayEntries.filter(e => e.date === day.date);
      return {
        date: day.date,
        dayLabel: day.fullLabel,
        slots: SLOT_ORDER.map(slot => {
          const slotEntries = dayEntriesForDate
            .filter(e => e.slot === slot)
            .sort((a, b) => a.position - b.position);
          return {
            slot,
            label: SLOT_LABELS[slot],
            entries: slotEntries.map(e => ({
              name: getEntryName(e),
              servings: e.servings,
              isLeftover: !!e.isLeftover,
            })),
          };
        }),
        nutrition: getCombinedNutrition(dayEntriesForDate),
      };
    });

    const blob = await exportMealPlanPdf(dateRange, mealPlanDays);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meal-plan-${weekStart}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [days, dayEntries, dateRange, weekStart]);

  const selectedEntry = dayEntries.find((e) => e.id === selectedEntryId);
  const selectedGroup = selectedGroupId
    ? mealGroups.find((g) => g.id === selectedGroupId)
    : null;
  const groupEntries = selectedGroupId
    ? dayEntries.filter((e) => e.groupId === selectedGroupId)
    : [];

  function getEntryName(entry: DayPlanEntryRecord): string {
    if (entry.foodName) return entry.foodName;
    const recipe = recipes.find((r) => r.id === entry.recipeId);
    return recipe?.name || 'Unknown';
  }

  function getNutritionForEntry(entry: DayPlanEntryRecord): NutritionData | null {
    if (entry.sourceType !== 'recipe' && entry.calories !== undefined) {
      const mult = entry.servings;
      return {
        servings: entry.servings,
        calories: Math.round((entry.calories ?? 0) * mult * 10) / 10,
        totalFat: Math.round((entry.totalFat ?? 0) * mult * 10) / 10,
        saturatedFat: Math.round((entry.saturatedFat ?? 0) * mult * 10) / 10,
        transFat: Math.round((entry.transFat ?? 0) * mult * 10) / 10,
        cholesterol: Math.round((entry.cholesterol ?? 0) * mult * 10) / 10,
        sodium: Math.round((entry.sodium ?? 0) * mult * 10) / 10,
        totalCarbs: Math.round((entry.totalCarbs ?? 0) * mult * 10) / 10,
        dietaryFiber: Math.round((entry.dietaryFiber ?? 0) * mult * 10) / 10,
        totalSugars: Math.round((entry.totalSugars ?? 0) * mult * 10) / 10,
        addedSugars: Math.round((entry.addedSugars ?? 0) * mult * 10) / 10,
        protein: Math.round((entry.protein ?? 0) * mult * 10) / 10,
        vitaminD: Math.round((entry.vitaminD ?? 0) * mult * 10) / 10,
        calcium: Math.round((entry.calcium ?? 0) * mult * 10) / 10,
        iron: Math.round((entry.iron ?? 0) * mult * 10) / 10,
        potassium: Math.round((entry.potassium ?? 0) * mult * 10) / 10,
      };
    }
    const recipe = fullRecipeCache.get(entry.recipeId!) || recipes.find((r) => r.id === entry.recipeId);
    if (!recipe) return null;
    const recipeServings = recipe.servings || 1;
    const perServing = 1 / recipeServings;
    const multiplier = perServing * entry.servings;
    return {
      servings: entry.servings,
      calories: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.calories * multiplier, 0) * 10) / 10,
      totalFat: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.totalFat * multiplier, 0) * 10) / 10,
      saturatedFat: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.saturatedFat * multiplier, 0) * 10) / 10,
      transFat: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.transFat * multiplier, 0) * 10) / 10,
      cholesterol: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.cholesterol * multiplier, 0) * 10) / 10,
      sodium: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.sodium * multiplier, 0) * 10) / 10,
      totalCarbs: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.totalCarbs * multiplier, 0) * 10) / 10,
      dietaryFiber: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.dietaryFiber * multiplier, 0) * 10) / 10,
      totalSugars: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.totalSugars * multiplier, 0) * 10) / 10,
      addedSugars: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.addedSugars * multiplier, 0) * 10) / 10,
      protein: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.protein * multiplier, 0) * 10) / 10,
      vitaminD: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.vitaminD * multiplier, 0) * 10) / 10,
      calcium: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.calcium * multiplier, 0) * 10) / 10,
      iron: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.iron * multiplier, 0) * 10) / 10,
      potassium: Math.round((recipe.ingredients || []).reduce((s, i) => s + i.potassium * multiplier, 0) * 10) / 10,
    };
  }

  function getCombinedNutrition(entries: DayPlanEntryRecord[]): NutritionData | null {
    const results = entries.map((e) => getNutritionForEntry(e)).filter(Boolean) as NutritionData[];
    if (results.length === 0) return null;
    const keys: (keyof NutritionData)[] = [
      'calories', 'totalFat', 'saturatedFat', 'transFat', 'cholesterol',
      'sodium', 'totalCarbs', 'dietaryFiber', 'totalSugars', 'addedSugars',
      'protein', 'vitaminD', 'calcium', 'iron', 'potassium',
    ];
    const combined: NutritionData = {
      servings: 1,
      calories: 0, totalFat: 0, saturatedFat: 0, transFat: 0,
      cholesterol: 0, sodium: 0, totalCarbs: 0, dietaryFiber: 0,
      totalSugars: 0, addedSugars: 0, protein: 0, vitaminD: 0,
      calcium: 0, iron: 0, potassium: 0,
    };
    for (const r of results) {
      for (const k of keys) {
        combined[k] += r[k];
      }
    }
    for (const k of keys) {
      combined[k] = Math.round(combined[k] * 10) / 10;
    }
    return combined;
  }

  const enrichedRecipes = useMemo(() => {
    const map = new Map(recipes.map(r => [r.id, r]));
    for (const [id, r] of fullRecipeCache) map.set(id, r);
    return Array.from(map.values());
  }, [recipes, fullRecipeCache]);

  function getEntryGL(entry: DayPlanEntryRecord): GLResult | null {
    return computeEntryGL(entry, enrichedRecipes);
  }

  function getSlotGL(entries: DayPlanEntryRecord[]): GLResult | null {
    return sumGL(entries.map(getEntryGL));
  }

  const editingDayEntries = editingDay
    ? dayEntries.filter((e) => e.date === editingDay)
    : [];

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            {format(weekDate, 'MMM d')} – {weekEnd}
          </h1>
          <p className="text-xs text-stone-500">Plan meals for each day</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => router.push(`/meal-plans/grocery-list/${weekStart}`)}
          >
            <ShoppingBasket className="w-3.5 h-3.5" />Grocery List
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={handleExportPdf}
          >
            <FileDown className="w-3.5 h-3.5" />Export PDF
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => router.push(`/meal-plans/${prevWeek}`)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => router.push(`/meal-plans/${nextWeek}`)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-6">
        {days.map((day) => {
          const dayEntriesCount = dayEntries.filter((e) => e.date === day.date).length;
          const isEditing = editingDay === day.date;
          return (
            <Card
              key={day.date}
              className={`cursor-pointer transition-colors ${
                isEditing ? 'border-emerald-400 ring-1 ring-emerald-200' : 'hover:border-emerald-200'
              }`}
              onClick={() => {
                setEditingDay(isEditing ? null : day.date);
                setSelectedEntryId(null);
                setSelectedGroupId(null);
              }}
            >
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span>{day.label}</span>
                  <span className="text-xs text-stone-400">{format(parseISO(day.date), 'd')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <p className="text-xs text-stone-400">
                  {dayEntriesCount > 0
                    ? `${dayEntriesCount} item${dayEntriesCount > 1 ? 's' : ''}`
                    : 'No meals'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editingDay && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] xl:grid-cols-[280px_2fr_1fr] gap-6">
            <div className="hidden xl:block">
              <div className="sticky top-4">
                <FoodSynergiesPanel
                  editingDay={editingDay}
                  dayEntries={dayEntries}
                  allRecipes={recipes}
                  pantryStaples={pantryStaples}
                  seasonalFoods={seasonalFoods}
                  currentMonth={currentMonth}
                  onSeasonalFoodClick={(foodName) => setSelectedSeasonalFood(foodName)}
                  onAddToSlot={handleSynergyAddToSlot}
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-stone-800">
                  {days.find((d) => d.date === editingDay)?.fullLabel}
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant={groupingMode ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setGroupingMode(!groupingMode);
                      setSelectedForGroup([]);
                    }}
                  >
                    {groupingMode ? 'Cancel' : 'Create Meal'}
                  </Button>
                  {groupingMode && selectedForGroup.length >= 2 && (
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setGroupDialogOpen(true)}
                    >
                      Create Meal
                    </Button>
                  )}
                </div>
              </div>

              {SLOT_ORDER.map((slot) => {
                const slotEntries = editingDayEntries
                  .filter((e) => e.slot === slot)
                  .sort((a, b) => a.position - b.position);
                const slotGroups = mealGroups.filter(
                  (g) => g.date === editingDay && g.slot === slot
                );

                const ungroupedEntries = slotEntries.filter((e) => !e.groupId);
                const groupedEntries = slotEntries.filter((e) => e.groupId);

                return (
                  <div key={slot} className="border rounded-lg p-3 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-600">
                          {SLOT_LABELS[slot]}
                        </span>
                        <div className="flex items-center gap-1 text-stone-400">
                          <Clock className="w-3 h-3" />
                          <input
                            type="time"
                            value={effectiveSlotTimes[slot]}
                            onChange={(e) => handleSlotTimeChange(slot, e.target.value)}
                            className="text-[10px] h-5 w-[72px] px-1 border border-stone-200 rounded bg-transparent focus:outline-none focus:border-emerald-400"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => { const slotGL = getSlotGL(slotEntries); return slotGL ? (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${slotGL.colorClass}`} title={`The Estimated Glycemic Load for this day segment is ${slotGL.category} (${slotGL.gl})${GL_HOVER_KEY}`}>EGL: {slotGL.category}</span>
                        ) : null; })()}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-emerald-600 hover:text-emerald-700"
                          onClick={async () => {
                            if (!activeMealPlan) await handleEnsurePlan();
                            setAddDialogSlot({ date: editingDay, slot });
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />Add
                        </Button>
                      </div>
                    </div>

                    <SortableContext
                      items={slotEntries.map((e) => e.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {slotGroups.map((group) => {
                          const groupEnts = groupedEntries.filter(
                            (e) => e.groupId === group.id
                          );
                          const isSelected = selectedGroupId === group.id;
                          return (
                            <div
                              key={group.id}
                              onClick={() => {
                                setSelectedGroupId(isSelected ? null : group.id);
                                setSelectedEntryId(null);
                              }}
                              className={`border rounded-md p-2 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'border-emerald-400 bg-emerald-50'
                                  : 'border-stone-200 hover:border-emerald-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <GripVertical className="w-3 h-3 text-stone-300" />
                                  <span className="text-sm font-medium text-stone-700">
                                    {group.name}
                                  </span>
                                  <Badge variant="secondary" className="text-xs h-4">
                                    {groupEnts.length}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(() => { const groupGL = getSlotGL(groupEnts); return groupGL ? (
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${groupGL.colorClass}`} title={`The Estimated Glycemic Load for this meal is ${groupGL.category} (${groupGL.gl})${GL_HOVER_KEY}`}>EGL: {groupGL.category}</span>
                                  ) : null; })()}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 p-0 text-stone-400 hover:text-red-500"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteMealGroupAndUngroupMutation.mutate({ groupId: group.id, planId: activeMealPlan!.id, weekStart });
                                      if (selectedGroupId === group.id) setSelectedGroupId(null);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="ml-5 mt-1 space-y-1">
                                {groupEnts.map((entry) => {
                                  const recipe = recipes.find(
                                    (r) => r.id === entry.recipeId
                                  );
                                  return (
                                    <EntryRow
                                      key={entry.id}
                                      entry={entry}
                                      recipeName={getEntryName(entry)}
                                      isDragOverlay={false}
                                      onToggleLeftover={() => toggleLeftoverMutation.mutate({ entryId: entry.id, isLeftover: !entry.isLeftover, weekStart })}
                                      isCompleted={completedRecipeMap[entry.recipeId ?? ''] === entry.date}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {ungroupedEntries.map((entry) => (
                          <SortableEntryRow
                            key={entry.id}
                            entry={entry}
                            recipeName={getEntryName(entry)}
                            isSelected={selectedEntryId === entry.id}
                            groupingMode={groupingMode}
                            selectedForGroup={selectedForGroup}
                            isCompleted={completedRecipeMap[entry.recipeId ?? ''] === entry.date}
                            onSelect={() => {
                              if (groupingMode) {
                                setSelectedForGroup((prev) =>
                                  prev.includes(entry.id)
                                    ? prev.filter((id) => id !== entry.id)
                                    : [...prev, entry.id]
                                );
                              } else {
                                setSelectedEntryId(entry.id);
                                setSelectedGroupId(null);
                              }
                            }}
onRemove={() => removeEntryMutation.mutate({ entryId: entry.id, weekStart })}
                    onRemoveFromGroup={() => removeFromGroupMutation.mutate({ entryId: entry.id, weekStart })}
                            onToggleLeftover={() => toggleLeftoverMutation.mutate({ entryId: entry.id, isLeftover: !entry.isLeftover, weekStart })}
                            egl={getEntryGL(entry)}
                          />
                        ))}

                        {slotEntries.length === 0 && (
                          <p className="text-xs text-stone-300 text-center py-2">
                            No meals planned
                          </p>
                        )}
                      </div>
                    </SortableContext>

                    <DragOverlay>
                      {dragActiveId ? (
                        <div className="bg-white border rounded p-2 shadow-lg text-sm">
                          {(() => { const de = dayEntries.find((e) => e.id === dragActiveId); return de ? getEntryName(de) : 'Dragging...'; })()}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </div>
                );
              })}
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-4">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium text-stone-700">
                    Nutrition
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {selectedEntry && (() => {
                    const nutrition = getNutritionForEntry(selectedEntry);
                    return nutrition ? (
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 min-w-0 space-y-3">
                          <p className="text-sm font-medium text-stone-800">{getEntryName(selectedEntry)}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-500">Servings:</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                updateServingsMutation.mutate({ entryId: selectedEntry.id, servings: Math.max(1, selectedEntry.servings - 1), weekStart })
                              }
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="text-sm font-medium w-6 text-center">
                              {selectedEntry.servings}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                updateServingsMutation.mutate({ entryId: selectedEntry.id, servings: selectedEntry.servings + 1, weekStart })
                              }
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <NutritionLabel data={nutrition} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400">No nutrition data</p>
                    );
                  })()}
                  {selectedGroup && (() => {
                    const nutrition = getCombinedNutrition(groupEntries);
                    return nutrition ? (
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 min-w-0 space-y-3">
                          <p className="text-sm font-medium text-stone-800">{selectedGroup.name}</p>
                          {groupEntries.map((entry) => {
                            return (
                              <div key={entry.id} className="flex items-center gap-2">
                                {entry.isLeftover && <UtensilsCrossed className="w-3 h-3 text-amber-500 shrink-0" />}
                                <span className="text-xs text-stone-600 flex-1 truncate">
                                  {getEntryName(entry)}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() =>
                                    updateServingsMutation.mutate({ entryId: entry.id, servings: Math.max(1, entry.servings - 1), weekStart })
                                  }
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </Button>
                                <span className="text-xs font-medium w-4 text-center">
                                  {entry.servings}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() => updateServingsMutation.mutate({ entryId: entry.id, servings: entry.servings + 1, weekStart })}
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                        <div className="shrink-0">
                          <NutritionLabel data={nutrition} />
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {!selectedEntry && !selectedGroup && (
                    <p className="text-xs text-stone-400 text-center py-4">
                      Select a meal or entry to view nutrition
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </DndContext>
      )}

      <Dialog
        open={addDialogSlot !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddDialogSlot(null);
            setSearchQuery('');
            setFdaResults([]);
            setManualName('');
            setManualCalories('');
            setManualProtein('');
            setManualFat('');
            setManualCarbs('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Add to {addDialogSlot ? SLOT_LABELS[addDialogSlot.slot] : ''} – {addDialogSlot ? format(parseISO(addDialogSlot.date), 'EEE, MMM d') : ''}
            </DialogTitle>
          </DialogHeader>
          <Tabs value={addTab} onValueChange={(v) => { setAddTab(v); setSearchQuery(''); setFdaResults([]); }}>
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="recipes" className="text-xs gap-1"><Salad className="w-3 h-3" />Recipes</TabsTrigger>
              <TabsTrigger value="food" className="text-xs gap-1"><Store className="w-3 h-3" />Food DB</TabsTrigger>
              <TabsTrigger value="custom" className="text-xs gap-1"><Apple className="w-3 h-3" />Custom</TabsTrigger>
              <TabsTrigger value="manual" className="text-xs gap-1"><PenLine className="w-3 h-3" />Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="recipes" className="mt-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                <Input
                  placeholder="Search your recipes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-64">
                <div className="space-y-1">
                  {filteredRecipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-emerald-50 transition-colors"
                      onClick={() => handleAddRecipe(recipe.id)}
                    >
                      {recipe.name}
                      <span className="text-xs text-stone-400 ml-2">({recipe.servings} servings)</span>
                    </button>
                  ))}
                  {filteredRecipes.length === 0 && (
                    <p className="text-xs text-stone-400 text-center py-4">No recipes found</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="food" className="mt-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                <Input
                  placeholder="Search foods, brands, UPC (e.g. &quot;Pizza Hut pepperoni&quot;)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-64">
                {fdaSearching && (
                  <div className="flex items-center justify-center py-6 gap-2 text-sm text-stone-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                  </div>
                )}
                {!fdaSearching && fdaResults.length === 0 && searchQuery && (
                  <p className="text-xs text-stone-400 text-center py-4">Type to search the food database</p>
                )}
                {!fdaSearching && fdaResults.length === 0 && !searchQuery && (
                  <p className="text-xs text-stone-400 text-center py-4">Search for restaurant items, branded foods, UPC codes, or ingredients</p>
                )}
                <div className="space-y-1">
                  {fdaResults.map((food) => (
                    <button
                      key={food.fdcId}
                      className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-emerald-50 transition-colors"
                      onClick={() => handleAddFood({
                        name: food.description + (food.brandOwner ? ` (${food.brandOwner})` : ''),
                        sourceType: 'food',
                        calories: food.nutrients.calories,
                        totalFat: food.nutrients.totalFat,
                        saturatedFat: food.nutrients.saturatedFat,
                        transFat: food.nutrients.transFat,
                        cholesterol: food.nutrients.cholesterol,
                        sodium: food.nutrients.sodium,
                        totalCarbs: food.nutrients.totalCarbs,
                        dietaryFiber: food.nutrients.dietaryFiber,
                        totalSugars: food.nutrients.totalSugars,
                        addedSugars: food.nutrients.addedSugars,
                        protein: food.nutrients.protein,
                        vitaminD: food.nutrients.vitaminD,
                        calcium: food.nutrients.calcium,
                        iron: food.nutrients.iron,
                        potassium: food.nutrients.potassium,
                      })}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-stone-800">{food.description}</span>
                          {food.brandOwner && (
                            <span className="text-xs text-stone-400 ml-1">– {food.brandOwner}</span>
                          )}
                        </div>
                        <span className="text-xs text-stone-400 shrink-0">{Math.round(food.nutrients.calories)} kcal</span>
                      </div>
                      <div className="flex gap-2 mt-0.5">
                        {food.dataType && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">{food.dataType}</span>
                        )}
                        {food.servingSize > 0 && (
                          <span className="text-[10px] text-stone-400">{food.servingSize}{food.servingSizeUnit}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="custom" className="mt-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                <Input
                  placeholder="Search custom foods..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-64">
                <div className="space-y-1">
                  {filteredCustomFoods.map((food) => (
                    <button
                      key={food.id}
                      className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-emerald-50 transition-colors"
                      onClick={() => handleAddFood({
                        name: food.name,
                        sourceType: 'customFood',
                        calories: food.calories,
                        totalFat: food.totalFat,
                        saturatedFat: food.saturatedFat,
                        transFat: food.transFat,
                        cholesterol: food.cholesterol,
                        sodium: food.sodium,
                        totalCarbs: food.totalCarbs,
                        dietaryFiber: food.dietaryFiber,
                        totalSugars: food.totalSugars,
                        addedSugars: food.addedSugars,
                        protein: food.protein,
                        vitaminD: food.vitaminD,
                        calcium: food.calcium,
                        iron: food.iron,
                        potassium: food.potassium,
                      })}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-stone-800">{food.name}</span>
                        <span className="text-xs text-stone-400">{Math.round(food.calories)} kcal/100g</span>
                      </div>
                    </button>
                  ))}
                  {filteredCustomFoods.length === 0 && (
                    <p className="text-xs text-stone-400 text-center py-4">No custom foods found</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="manual" className="mt-3">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-stone-500">Food Name</label>
                  <Input
                    placeholder="e.g. Pizza Hut Pepperoni Pizza (1 slice)"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-stone-500">Calories (kcal)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={manualCalories}
                      onChange={(e) => setManualCalories(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500">Protein (g)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={manualProtein}
                      onChange={(e) => setManualProtein(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500">Total Fat (g)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={manualFat}
                      onChange={(e) => setManualFat(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-stone-500">Total Carbs (g)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={manualCarbs}
                      onChange={(e) => setManualCarbs(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={!manualName.trim()}
                  onClick={() => handleAddFood({
                    name: manualName,
                    sourceType: 'manual',
                    calories: parseFloat(manualCalories) || 0,
                    protein: parseFloat(manualProtein) || 0,
                    totalFat: parseFloat(manualFat) || 0,
                    totalCarbs: parseFloat(manualCarbs) || 0,
                  })}
                >
                  Add Manual Entry
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Name This Meal</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g., Sunday Dinner"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
          />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleCreateGroup}
              disabled={!groupName.trim()}
            >
              Create Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <InSeasonRecipeDialog
        foodName={selectedSeasonalFood}
        editingDay={editingDay}
        dayEntries={dayEntries}
        allRecipes={recipes}
        onClose={() => setSelectedSeasonalFood(null)}
        onAddToSlot={handleSynergyAddToSlot}
      />
    </main>
  );
}

function SortableEntryRow({
  entry,
  recipeName,
  isSelected,
  groupingMode,
  selectedForGroup,
  onSelect,
  onRemove,
  onRemoveFromGroup,
  onToggleLeftover,
  isCompleted,
  egl,
}: {
  entry: DayPlanEntryRecord;
  recipeName: string;
  isSelected: boolean;
  groupingMode: boolean;
  selectedForGroup: string[];
  onSelect: () => void;
  onRemove: () => void;
  onRemoveFromGroup?: () => void;
  onToggleLeftover?: () => void;
  isCompleted?: boolean;
  egl?: GLResult | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: entry.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isInGroupSelection = selectedForGroup.includes(entry.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
        groupingMode && isInGroupSelection
          ? 'bg-emerald-100 border border-emerald-300'
          : isSelected
          ? 'bg-emerald-50 border border-emerald-200'
          : 'hover:bg-stone-50 border border-transparent'
      }`}
      onClick={onSelect}
    >
      {!groupingMode && <div {...attributes} {...listeners}><GripVertical className="w-3 h-3 text-stone-300" /></div>}
      <span className={`text-sm flex-1 truncate ${isCompleted ? 'text-emerald-600 line-through' : 'text-stone-700'}`}>{recipeName}</span>
      {entry.sourceType !== 'recipe' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 shrink-0">{entry.sourceType === 'food' ? 'DB' : entry.sourceType === 'customFood' ? 'Custom' : 'Manual'}</span>
      )}
      {isCompleted && (
        <span className="text-[10px] text-emerald-500">done</span>
      )}
      {entry.servings > 1 && (
        <Badge variant="secondary" className="text-xs h-4">×{entry.servings}</Badge>
      )}
      {entry.groupId && onRemoveFromGroup && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-stone-400 hover:text-amber-500"
          onClick={(e) => { e.stopPropagation(); onRemoveFromGroup(); }}
        >
          <Minus className="w-3 h-3" />
        </Button>
      )}
      {!groupingMode && (
        <>
          {egl && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${egl.colorClass} shrink-0`} title={`The Estimated Glycemic Load for this recipe is ${egl.category} (${egl.gl})${GL_HOVER_KEY}`}>EGL: {egl.category}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={`h-5 w-5 p-0 ${entry.isLeftover ? 'text-amber-500' : 'text-stone-300 hover:text-amber-400'}`}
            onClick={(e) => { e.stopPropagation(); onToggleLeftover?.(); }}
            title={entry.isLeftover ? 'Leftovers (click to unset)' : 'Mark as leftovers'}
          >
            <UtensilsCrossed className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-stone-400 hover:text-red-500"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <X className="w-3 h-3" />
          </Button>
        </>
      )}
    </div>
  );
}

function EntryRow({ entry, recipeName, isDragOverlay, onToggleLeftover, isCompleted }: { entry: DayPlanEntryRecord; recipeName: string; isDragOverlay: boolean; onToggleLeftover?: () => void; isCompleted?: boolean }) {
  if (isDragOverlay) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-stone-600">
        {entry.isLeftover && <UtensilsCrossed className="w-3 h-3 text-amber-500 shrink-0" />}
        <span className={`flex-1 truncate ${isCompleted ? 'line-through text-emerald-600' : ''}`}>{recipeName}</span>
        {entry.servings > 1 && (
          <Badge variant="secondary" className="text-xs h-4">×{entry.servings}</Badge>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-sm text-stone-600">
      {entry.isLeftover && <UtensilsCrossed className="w-3 h-3 text-amber-500 shrink-0" />}
      <span className={`flex-1 truncate ${isCompleted ? 'line-through text-emerald-600' : ''}`}>{recipeName}</span>
      {entry.sourceType !== 'recipe' && entry.sourceType !== undefined && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 shrink-0">{entry.sourceType === 'food' ? 'DB' : entry.sourceType === 'customFood' ? 'Custom' : 'Manual'}</span>
      )}
      {isCompleted && (
        <span className="text-[10px] text-emerald-500">done</span>
      )}
      {entry.servings > 1 && (
        <Badge variant="secondary" className="text-xs h-4">×{entry.servings}</Badge>
      )}
      <Button
        variant="ghost"
        size="sm"
        className={`h-5 w-5 p-0 ${entry.isLeftover ? 'text-amber-500' : 'text-stone-300 hover:text-amber-400'}`}
        onClick={(e) => { e.stopPropagation(); onToggleLeftover?.(); }}
        title={entry.isLeftover ? 'Leftovers (click to unset)' : 'Mark as leftovers'}
      >
        <UtensilsCrossed className="w-3 h-3" />
      </Button>
    </div>
  );
}
