'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  addDays,
  format,
  parseISO,
  isValid,
} from 'date-fns';
import { ChevronLeft, ChevronRight, ShoppingBasket, Plus, X, GripVertical, Minus, Trash2, ChefHat, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMealPlanStore } from '@/lib/meal-plan-store';
import { useRecipeStore } from '@/lib/recipe-store';
import type { DaySlot } from '@/lib/types';
import type { DayPlanEntryRecord, MealGroupRecord } from '@/lib/storage';
import {
  getSeasonalFoods,
  getAllPantryStaples,
  getUserLocation,
  seedSeasonalFoodsIfNeeded,
  seedPantryStaplesIfNeeded,
} from '@/lib/storage';
import NutritionLabel, { type NutritionData } from '@/components/nutrition-label';
import FoodSynergiesPanel from '@/components/meal-plan/food-synergies-panel';
import InSeasonRecipeDialog from '@/components/meal-plan/in-season-recipe-dialog';

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
};

const SLOT_ORDER: DaySlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening'];

export default function WeeklyPlanPage() {
  const params = useParams();
  const router = useRouter();
  const weekStart = params.weekStart as string;

  const weekDate = useMemo(() => {
    const d = parseISO(weekStart);
    return isValid(d) ? d : new Date();
  }, [weekStart]);

  const {
    activeMealPlan,
    dayEntries,
    mealGroups,
    fetchWeekPlan,
    ensureMealPlan,
    addRecipeToSlot,
    removeEntry,
    moveEntry,
    updateServings,
    createMealGroup,
    removeFromGroup,
    deleteMealGroupAndUngroup,
    reorderEntries,
    toggleLeftover,
    isLoading,
  } = useMealPlanStore();

  const { recipes, fetchRecipes } = useRecipeStore();
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [addDialogSlot, setAddDialogSlot] = useState<{ date: string; slot: DaySlot } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  useEffect(() => {
    if (weekStart) {
      fetchWeekPlan(weekStart);
    }
  }, [weekStart, fetchWeekPlan]);

  useEffect(() => {
    setCompletedRecipeMap(getCompletedRecipes());
    const onFocus = () => setCompletedRecipeMap(getCompletedRecipes());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSynergyData() {
      await seedPantryStaplesIfNeeded();
      const staples = await getAllPantryStaples();
      if (!cancelled) setPantryStaples(new Set(staples.map(s => s.toLowerCase())));

      const location = await getUserLocation();
      const country = location?.country || 'United States';
      const region = location?.region || 'Northeast';
      await seedSeasonalFoodsIfNeeded(country, region);
      const foods = await getSeasonalFoods(country, region, new Date().getMonth() + 1);
      if (!cancelled) setSeasonalFoods(foods);
    }
    loadSynergyData();
    return () => { cancelled = true; };
  }, []);

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

  const handleEnsurePlan = useCallback(async () => {
    await ensureMealPlan(weekStart);
  }, [ensureMealPlan, weekStart]);

  const handleAddRecipe = useCallback(async (recipeId: string) => {
    if (!addDialogSlot) return;
    if (!activeMealPlan) await handleEnsurePlan();
    await addRecipeToSlot(addDialogSlot.date, addDialogSlot.slot, recipeId);
    setAddDialogSlot(null);
    setSearchQuery('');
  }, [addDialogSlot, activeMealPlan, handleEnsurePlan, addRecipeToSlot]);

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
          reorderEntries(
            activeEntry.slot,
            activeEntry.date,
            reordered.map((e) => e.id)
          );
        }
      } else {
        moveEntry(active.id as string, overEntry.slot, overEntry.position);
      }
    }
  }, [dayEntries, moveEntry, reorderEntries]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(event.active.id as string);
  }, []);

  const handleCreateGroup = useCallback(async () => {
    if (!groupName.trim() || selectedForGroup.length < 2) return;
    const firstEntry = dayEntries.find((e) => e.id === selectedForGroup[0]);
    if (!firstEntry) return;
    await createMealGroup(firstEntry.date, firstEntry.slot, groupName, selectedForGroup);
    setGroupDialogOpen(false);
    setGroupName('');
    setSelectedForGroup([]);
    setGroupingMode(false);
  }, [groupName, selectedForGroup, dayEntries, createMealGroup]);

  const handleSynergyAddToSlot = useCallback(async (recipeId: string, slot: DaySlot) => {
    if (!editingDay) return;
    if (!activeMealPlan) await ensureMealPlan(weekStart);
    await addRecipeToSlot(editingDay, slot, recipeId);
  }, [editingDay, activeMealPlan, ensureMealPlan, weekStart, addRecipeToSlot]);

  const filteredRecipes = useMemo(() => {
    if (!searchQuery) return recipes;
    const q = searchQuery.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, searchQuery]);

  const prevWeek = format(addDays(weekDate, -7), 'yyyy-MM-dd');
  const nextWeek = format(addDays(weekDate, 7), 'yyyy-MM-dd');
  const weekEnd = format(addDays(weekDate, 6), 'MMMM d, yyyy');

  const selectedEntry = dayEntries.find((e) => e.id === selectedEntryId);
  const selectedGroup = selectedGroupId
    ? mealGroups.find((g) => g.id === selectedGroupId)
    : null;
  const groupEntries = selectedGroupId
    ? dayEntries.filter((e) => e.groupId === selectedGroupId)
    : [];

  function getNutritionForEntry(entry: DayPlanEntryRecord): NutritionData | null {
    const recipe = recipes.find((r) => r.id === entry.recipeId);
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
                    {groupingMode ? 'Cancel Grouping' : 'Group Entries'}
                  </Button>
                  {groupingMode && selectedForGroup.length >= 2 && (
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setGroupDialogOpen(true)}
                    >
                      Create Group
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
                      <span className="text-sm font-medium text-stone-600">
                        {SLOT_LABELS[slot]}
                      </span>
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 text-stone-400 hover:text-red-500"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteMealGroupAndUngroup(group.id);
                                    if (selectedGroupId === group.id) setSelectedGroupId(null);
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
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
                                      recipeName={recipe?.name || 'Unknown Recipe'}
                                      isDragOverlay={false}
                                      onToggleLeftover={() => toggleLeftover(entry.id)}
                                      isCompleted={completedRecipeMap[entry.recipeId] === entry.date}
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
                            recipeName={
                              recipes.find((r) => r.id === entry.recipeId)?.name ||
                              'Unknown Recipe'
                            }
                            isSelected={selectedEntryId === entry.id}
                            groupingMode={groupingMode}
                            selectedForGroup={selectedForGroup}
                            isCompleted={completedRecipeMap[entry.recipeId] === entry.date}
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
                            onRemove={() => removeEntry(entry.id)}
                            onRemoveFromGroup={() => removeFromGroup(entry.id)}
                            onToggleLeftover={() => toggleLeftover(entry.id)}
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
                          {recipes.find((r) => r.id === dayEntries.find((e) => e.id === dragActiveId)?.recipeId)?.name || 'Dragging...'}
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
                    const recipe = recipes.find((r) => r.id === selectedEntry.recipeId);
                    return nutrition && recipe ? (
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 min-w-0 space-y-3">
                          <p className="text-sm font-medium text-stone-800">{recipe.name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-500">Servings:</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                updateServings(selectedEntry.id, Math.max(1, selectedEntry.servings - 1))
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
                                updateServings(selectedEntry.id, selectedEntry.servings + 1)
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
                      <p className="text-xs text-stone-400">Recipe not found</p>
                    );
                  })()}
                  {selectedGroup && (() => {
                    const nutrition = getCombinedNutrition(groupEntries);
                    return nutrition ? (
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 min-w-0 space-y-3">
                          <p className="text-sm font-medium text-stone-800">{selectedGroup.name}</p>
                          {groupEntries.map((entry) => {
                            const recipe = recipes.find((r) => r.id === entry.recipeId);
                            return (
                              <div key={entry.id} className="flex items-center gap-2">
                                {entry.isLeftover && <UtensilsCrossed className="w-3 h-3 text-amber-500 shrink-0" />}
                                <span className="text-xs text-stone-600 flex-1 truncate">
                                  {recipe?.name || 'Unknown'}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-5 w-5 p-0"
                                  onClick={() =>
                                    updateServings(entry.id, Math.max(1, entry.servings - 1))
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
                                  onClick={() => updateServings(entry.id, entry.servings + 1)}
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
          if (!open) setAddDialogSlot(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add Recipe – {addDialogSlot ? SLOT_LABELS[addDialogSlot.slot] : ''}
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredRecipes.map((recipe) => (
              <button
                key={recipe.id}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-emerald-50 transition-colors"
                onClick={() => handleAddRecipe(recipe.id)}
              >
                {recipe.name}
              </button>
            ))}
            {filteredRecipes.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-4">No recipes found</p>
            )}
          </div>
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
