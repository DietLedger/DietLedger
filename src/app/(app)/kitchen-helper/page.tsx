'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChefHat, Flame, Utensils, Check, ChevronRight, Play, ChevronLeft, X, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRecipeStore, type Recipe } from '@/lib/recipe-store';
import { useMealPlanStore } from '@/lib/meal-plan-store';
import { getAllMealPlans, getDayEntriesByMealPlanId, getMealGroupsByMealPlanId, type MealGroupRecord, type DayPlanEntryRecord } from '@/lib/storage';
import { format, startOfWeek, parseISO } from 'date-fns';
import type { DaySlot } from '@/lib/types';

const SLOT_ORDER: DaySlot[] = ['morning', 'midMorning', 'noon', 'afternoon', 'evening', 'night'];
const SLOT_LABELS: Record<DaySlot, string> = {
  morning: 'Morning',
  midMorning: 'Mid-Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const COMPLETED_KEY = 'kitchen-helper-completed';

function getCompletedRecipes(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(COMPLETED_KEY) || '{}');
  } catch {
    return {};
  }
}

function markRecipeCompleted(recipeId: string, date: string) {
  const data = getCompletedRecipes();
  data[recipeId] = date;
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(data));
}

function isRecipeCompletedOnDate(recipeId: string, date: string): boolean {
  const data = getCompletedRecipes();
  return data[recipeId] === date;
}

function saveCompletedRecipes(
  mode: 'recipe' | 'meal' | 'today',
  selectedRecipeId: string | null,
  selectedGroupId: string | null,
  mealEntries: DayPlanEntryRecord[],
  mealGroups: MealGroupRecord[]
) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  if (mode === 'recipe') {
    return;
  }
  if (mode === 'meal' && selectedGroupId) {
    const group = mealGroups.find((g) => g.id === selectedGroupId);
    const groupEnts = mealEntries.filter((e) => e.groupId === selectedGroupId);
    const date = group?.date || todayStr;
    const seen = new Set<string>();
    for (const e of groupEnts) {
      if (e.recipeId && !seen.has(e.recipeId)) {
        seen.add(e.recipeId);
        markRecipeCompleted(e.recipeId, date);
      }
    }
  } else if (mode === 'today' && selectedRecipeId) {
    markRecipeCompleted(selectedRecipeId, todayStr);
  }
}

function getRecipeDependencyOrder(recipeId: string, recipes: Recipe[]): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) return;
    for (const ing of recipe.ingredients) {
      if (ing.linkedRecipeId) visit(ing.linkedRecipeId);
    }
    order.push(id);
  }
  visit(recipeId);
  return order;
}

interface PrepStep {
  id: string;
  ingredientName: string;
  text: string;
  recipeName: string;
  groupName: string | null;
}

interface CookStep {
  id: string;
  text: string;
  stepNumber: number;
  recipeName: string;
  groupName: string | null;
}

export default function KitchenHelperPage() {
  return (
    <Suspense fallback={<main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8"><p className="text-stone-400">Loading...</p></main>}>
      <KitchenHelperContent />
    </Suspense>
  );
}

function KitchenHelperContent() {
  const searchParams = useSearchParams();
  const initialRecipeId = searchParams.get('recipeId');
  const { recipes, fetchRecipes } = useRecipeStore();
  const { mealPlans, fetchMealPlans } = useMealPlanStore();
  const [mode, setMode] = useState<'recipe' | 'meal' | 'today'>('recipe');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [mealGroups, setMealGroups] = useState<MealGroupRecord[]>([]);
  const [mealEntries, setMealEntries] = useState<DayPlanEntryRecord[]>([]);
  const [playMode, setPlayMode] = useState(false);
  const [playStepIndex, setPlayStepIndex] = useState(0);
  const [completedRecipeMap, setCompletedRecipeMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchRecipes();
    fetchMealPlans();
    setCompletedRecipeMap(getCompletedRecipes());
  }, [fetchRecipes, fetchMealPlans]);

  useEffect(() => {
    if (initialRecipeId && recipes.length > 0) {
      const exists = recipes.find((r) => r.id === initialRecipeId);
      if (exists) {
        setSelectedRecipeId(initialRecipeId);
        setMode('recipe');
      }
    }
  }, [initialRecipeId, recipes]);

  useEffect(() => {
    async function loadMealData() {
      const allGroups: MealGroupRecord[] = [];
      const allEntries: DayPlanEntryRecord[] = [];
      for (const plan of mealPlans) {
        const groups = await getMealGroupsByMealPlanId(plan.id);
        const entries = await getDayEntriesByMealPlanId(plan.id);
        allGroups.push(...groups);
        allEntries.push(...entries);
      }
      setMealGroups(allGroups);
      setMealEntries(allEntries);
    }
    if (mealPlans.length > 0) {
      loadMealData();
    }
  }, [mealPlans]);

  const filteredRecipes = useMemo(() => {
    if (!searchQuery) return recipes;
    const q = searchQuery.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, searchQuery]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const filteredMealGroups = useMemo(() => {
    let groups = mealGroups.filter((g) => g.date >= todayStr);
    groups = [...groups].sort((a, b) => a.date.localeCompare(b.date));
    if (!searchQuery) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [mealGroups, searchQuery, todayStr]);

  const todayWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const todayEntries = useMemo(() => {
    return mealEntries.filter((e) => e.date === format(new Date(), 'yyyy-MM-dd'));
  }, [mealEntries]);

  const weekEntriesByDay = useMemo(() => {
    const weekStart = todayWeekStart;
    const map = new Map<string, DayPlanEntryRecord[]>();
    for (const e of mealEntries) {
      const entryWeekStart = format(startOfWeek(parseISO(e.date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      if (entryWeekStart !== weekStart) continue;
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => ({
        date,
        label: format(parseISO(date), 'EEEE, MMM d'),
        entries: entries.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.position - b.position),
      }));
  }, [mealEntries, todayWeekStart]);

  const weekGroups = useMemo(() => {
    const weekStart = todayWeekStart;
    return mealGroups.filter((g) => {
      const entryWeekStart = format(startOfWeek(parseISO(g.date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      return entryWeekStart === weekStart;
    });
  }, [mealGroups, todayWeekStart]);

  const steps = useMemo(() => {
    const prepSteps: PrepStep[] = [];
    const cookSteps: CookStep[] = [];

    if (mode === 'recipe' && selectedRecipeId) {
      const recipe = recipes.find((r) => r.id === selectedRecipeId);
      if (!recipe) return { prepSteps, cookSteps };

      const depOrder = getRecipeDependencyOrder(recipe.id, recipes);

      for (const rid of depOrder) {
        const r = rid === recipe.id ? recipe : recipes.find((rr) => rr.id === rid);
        if (!r) continue;
        const isMain = rid === recipe.id;
        for (const ing of r.ingredients) {
          const instructions = ing.prepInstructions || [];
          for (const text of instructions) {
            if (text.trim()) {
              prepSteps.push({
                id: `prep-${r.id}-${ing.id}-${prepSteps.length}`,
                ingredientName: ing.name,
                text,
                recipeName: isMain ? recipe.name : r.name,
                groupName: ing.groupId
                  ? r.ingredientGroups.find((g) => g.id === ing.groupId)?.title || null
                  : null,
              });
            }
          }
        }
      }

      for (const rid of depOrder) {
        const r = rid === recipe.id ? recipe : recipes.find((rr) => rr.id === rid);
        if (!r) continue;
        const isMain = rid === recipe.id;
        for (const step of r.instructionSteps) {
          cookSteps.push({
            id: `cook-${r.id}-${step.id}`,
            text: step.text,
            stepNumber: cookSteps.length + 1,
            recipeName: isMain ? recipe.name : r.name,
            groupName: step.groupId
              ? r.instructionGroups.find((g) => g.id === step.groupId)?.title || null
              : null,
          });
        }
      }
    }

    if (mode === 'meal' && selectedGroupId) {
      const group = mealGroups.find((g) => g.id === selectedGroupId);
      if (!group) return { prepSteps, cookSteps };
      const groupEntries = mealEntries.filter((e) => e.groupId === selectedGroupId);
      const seenRecipeIds = new Set<string>();

      const allDepRecipeIds: string[] = [];
      for (const entry of groupEntries) {
        if (!entry.recipeId || seenRecipeIds.has(entry.recipeId)) continue;
        seenRecipeIds.add(entry.recipeId);
        const deps = getRecipeDependencyOrder(entry.recipeId, recipes);
        allDepRecipeIds.push(...deps.filter((id) => !allDepRecipeIds.includes(id)));
      }

      for (const rid of allDepRecipeIds) {
        const r = recipes.find((rr) => rr.id === rid);
        if (!r) continue;
        for (const ing of r.ingredients) {
          const instructions = ing.prepInstructions || [];
          for (const text of instructions) {
            if (text.trim()) {
              prepSteps.push({
                id: `prep-${r.id}-${ing.id}-${prepSteps.length}`,
                ingredientName: ing.name,
                text,
                recipeName: r.name,
                groupName: ing.groupId
                  ? r.ingredientGroups.find((g) => g.id === ing.groupId)?.title || null
                  : null,
              });
            }
          }
        }
      }

      for (const rid of allDepRecipeIds) {
        const r = recipes.find((rr) => rr.id === rid);
        if (!r) continue;
        for (const step of r.instructionSteps) {
          cookSteps.push({
            id: `cook-${r.id}-${step.id}`,
            text: step.text,
            stepNumber: cookSteps.length + 1,
            recipeName: r.name,
            groupName: step.groupId
              ? r.instructionGroups.find((g) => g.id === step.groupId)?.title || null
              : null,
          });
        }
      }
    }

    if (mode === 'today' && selectedRecipeId) {
      const recipe = recipes.find((r) => r.id === selectedRecipeId);
      if (!recipe) return { prepSteps, cookSteps };

      const depOrder = getRecipeDependencyOrder(recipe.id, recipes);

      for (const rid of depOrder) {
        const r = rid === recipe.id ? recipe : recipes.find((rr) => rr.id === rid);
        if (!r) continue;
        const isMain = rid === recipe.id;
        for (const ing of r.ingredients) {
          const instructions = ing.prepInstructions || [];
          for (const text of instructions) {
            if (text.trim()) {
              prepSteps.push({
                id: `prep-${r.id}-${ing.id}-${prepSteps.length}`,
                ingredientName: ing.name,
                text,
                recipeName: isMain ? recipe.name : r.name,
                groupName: ing.groupId
                  ? r.ingredientGroups.find((g) => g.id === ing.groupId)?.title || null
                  : null,
              });
            }
          }
        }
      }

      for (const rid of depOrder) {
        const r = rid === recipe.id ? recipe : recipes.find((rr) => rr.id === rid);
        if (!r) continue;
        const isMain = rid === recipe.id;
        for (const step of r.instructionSteps) {
          cookSteps.push({
            id: `cook-${r.id}-${step.id}`,
            text: step.text,
            stepNumber: cookSteps.length + 1,
            recipeName: isMain ? recipe.name : r.name,
            groupName: step.groupId
              ? r.instructionGroups.find((g) => g.id === step.groupId)?.title || null
              : null,
          });
        }
      }
    }

    return { prepSteps, cookSteps };
  }, [mode, selectedRecipeId, selectedGroupId, recipes, mealGroups, mealEntries]);

  const ingredients = useMemo(() => {
    const items: Array<{
      name: string;
      amount: number;
      unit: string;
      prepInstructions: string[];
      groupName: string | null;
      recipeName: string;
    }> = [];

    if (mode === 'recipe' && selectedRecipeId) {
      const recipe = recipes.find((r) => r.id === selectedRecipeId);
      if (!recipe) return items;
      for (const ing of recipe.ingredients) {
        items.push({
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          prepInstructions: ing.prepInstructions || [],
          groupName: ing.groupId
            ? recipe.ingredientGroups.find((g) => g.id === ing.groupId)?.title || null
            : null,
          recipeName: recipe.name,
        });
      }
    }

    if (mode === 'meal' && selectedGroupId) {
      const group = mealGroups.find((g) => g.id === selectedGroupId);
      if (!group) return items;
      const groupEntries = mealEntries.filter((e) => e.groupId === selectedGroupId);
      const seenRecipeIds = new Set<string>();
      for (const entry of groupEntries) {
        if (!entry.recipeId || seenRecipeIds.has(entry.recipeId)) continue;
        seenRecipeIds.add(entry.recipeId);
        const recipe = recipes.find((r) => r.id === entry.recipeId);
        if (!recipe) continue;
        for (const ing of recipe.ingredients) {
          items.push({
            name: ing.name,
            amount: ing.amount * entry.servings,
            unit: ing.unit,
            prepInstructions: ing.prepInstructions || [],
            groupName: ing.groupId
              ? recipe.ingredientGroups.find((g) => g.id === ing.groupId)?.title || null
              : null,
            recipeName: recipe.name,
          });
        }
      }
    }

    if (mode === 'today' && selectedRecipeId) {
      const recipe = recipes.find((r) => r.id === selectedRecipeId);
      if (!recipe) return items;
      const entry = todayEntries.find((e) => e.recipeId === selectedRecipeId);
      const servings = entry?.servings || 1;
      for (const ing of recipe.ingredients) {
        items.push({
          name: ing.name,
          amount: ing.amount * servings,
          unit: ing.unit,
          prepInstructions: ing.prepInstructions || [],
          groupName: ing.groupId
            ? recipe.ingredientGroups.find((g) => g.id === ing.groupId)?.title || null
            : null,
          recipeName: recipe.name,
        });
      }
    }

    return items;
  }, [mode, selectedRecipeId, selectedGroupId, recipes, mealGroups, mealEntries, todayEntries]);

  const allSteps = [
    ...steps.prepSteps.map((s) => ({ ...s, type: 'prep' as const })),
    ...steps.cookSteps.map((s) => ({ ...s, type: 'cook' as const })),
  ];

  const completedCount = allSteps.filter((s) => completedSteps.has(s.id)).length;
  const totalCount = allSteps.length;

  function toggleStep(id: string) {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const firstIncompleteIndex = allSteps.findIndex((s) => !completedSteps.has(s.id));
  const currentPlayStep = playMode && allSteps[playStepIndex] ? allSteps[playStepIndex] : null;

  const hasSelection = (mode === 'recipe' && selectedRecipeId) || (mode === 'meal' && selectedGroupId) || (mode === 'today' && selectedRecipeId);

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center">
          <img src="/logo.svg" alt="DietLedger" className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Kitchen Helper</h1>
          <p className="text-xs text-stone-500">Step-by-step prep and cooking instructions</p>
        </div>
      </div>

      {!hasSelection ? (
        <div>
          <Tabs value={mode} onValueChange={(v) => { setMode(v as 'recipe' | 'meal' | 'today'); setSearchQuery(''); }}>
            <TabsList className="mb-4">
              <TabsTrigger value="recipe" className="text-xs gap-1">
                <ChefHat className="w-3 h-3" />Select Recipe
              </TabsTrigger>
              <TabsTrigger value="meal" className="text-xs gap-1">
                <Utensils className="w-3 h-3" />Select Meal
              </TabsTrigger>
              <TabsTrigger value="today" className="text-xs gap-1">
                <CalendarDays className="w-3 h-3" />Today
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'today' ? (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto">
              {weekEntriesByDay.length === 0 && (
                <p className="text-sm text-stone-400 text-center py-8">
                  No meals planned for this week. Create a meal plan first.
                </p>
              )}
              {weekEntriesByDay.map(({ date, label, entries }) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-stone-600 mb-2">{label}</h3>
                  {entries.length === 0 ? (
                    <p className="text-xs text-stone-400 pl-2">No meals</p>
                  ) : (
                    <div className="space-y-1">
                      {entries.map((entry) => {
                        const recipe = recipes.find((r) => r.id === entry.recipeId);
                        const group = entry.groupId ? weekGroups.find((g) => g.id === entry.groupId) : null;
                        const isDone = entry.recipeId ? completedRecipeMap[entry.recipeId] === entry.date : false;
                        return (
                          <button
                            key={entry.id}
                            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                              isDone
                                ? 'border-brand-200 bg-brand-50'
                                : 'border-stone-200 hover:border-brand-300 hover:bg-brand-50'
                            }`}
                            onClick={() => {
                              setSelectedRecipeId(entry.recipeId);
                              setCompletedSteps(new Set());
                            }}
                          >
                            <div>
                              <span className={`text-sm font-medium ${isDone ? 'text-brand-700 line-through' : 'text-stone-800'}`}>
                                {recipe?.name || 'Unknown Recipe'}
                              </span>
                              {isDone && (
                                <span className="text-xs text-brand-500 ml-2">done</span>
                              )}
                              {group && (
                                <span className="text-xs text-stone-400 ml-2">({group.name})</span>
                              )}
                              <span className="text-xs text-stone-400 ml-2">{SLOT_LABELS[entry.slot]}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-stone-400" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <Input
                placeholder={mode === 'recipe' ? 'Search recipes...' : 'Search meals...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-4"
              />

              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {mode === 'recipe' &&
                  filteredRecipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
                      onClick={() => {
                        setSelectedRecipeId(recipe.id);
                        setCompletedSteps(new Set());
                        setSearchQuery('');
                      }}
                    >
                      <span className="text-sm font-medium text-stone-800">{recipe.name}</span>
                      <ChevronRight className="w-4 h-4 text-stone-400" />
                    </button>
                  ))}
                {mode === 'meal' &&
                  filteredMealGroups.map((group) => {
                    const entryCount = mealEntries.filter((e) => e.groupId === group.id).length;
                    return (
                      <button
                        key={group.id}
                        className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
                        onClick={() => {
                          setSelectedGroupId(group.id);
                          setCompletedSteps(new Set());
                          setSearchQuery('');
                        }}
                      >
                        <div>
                          <span className="text-sm font-medium text-stone-800">{group.name}</span>
                          <span className="text-xs text-stone-400 ml-2">
                            {format(parseISO(group.date), 'MMM d')}
                          </span>
                          <span className="text-xs text-stone-400 ml-2">
                            {entryCount} recipe{entryCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-stone-400" />
                      </button>
                    );
                  })}
                {mode === 'recipe' && filteredRecipes.length === 0 && (
                  <p className="text-sm text-stone-400 text-center py-8">
                    {recipes.length === 0 ? 'No recipes yet. Create one first!' : 'No matching recipes'}
                  </p>
                )}
                {mode === 'meal' && filteredMealGroups.length === 0 && (
                  <p className="text-sm text-stone-400 text-center py-8">
                    No meal groups found. Create meal groups in your weekly plans first.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSelectedRecipeId(null);
                  setSelectedGroupId(null);
                  setCompletedSteps(new Set());
                  setPlayMode(false);
                  setPlayStepIndex(0);
                }}
              >
                Back to Selection
              </Button>
              {totalCount > 0 && !playMode && (
                <Button
                  size="sm"
                  className="text-xs gap-1 bg-brand-600 hover:bg-brand-700"
                  onClick={() => {
                    setPlayMode(true);
                    setPlayStepIndex(firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0);
                  }}
                >
                  <Play className="w-3 h-3" />Play
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {totalCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {completedCount}/{totalCount} complete
                </Badge>
              )}
              {playMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setPlayMode(false);
                  }}
                >
                  <X className="w-3 h-3 mr-1" />Exit Play
                </Button>
              )}
            </div>
          </div>

          {mode === 'recipe' && selectedRecipeId && (
            <h2 className="text-lg font-semibold text-stone-800 mb-4">
              {recipes.find((r) => r.id === selectedRecipeId)?.name}
            </h2>
          )}
          {(mode === 'meal' && selectedGroupId) && (
            <h2 className="text-lg font-semibold text-stone-800 mb-4">
              {mealGroups.find((g) => g.id === selectedGroupId)?.name}
            </h2>
          )}
          {mode === 'today' && selectedRecipeId && (
            <h2 className="text-lg font-semibold text-stone-800 mb-4">
              {recipes.find((r) => r.id === selectedRecipeId)?.name}
            </h2>
          )}

          {allSteps.length === 0 && ingredients.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-stone-400">No instructions found for this selection.</p>
                <p className="text-xs text-stone-400 mt-1">
                  Add prep instructions to ingredients and cooking steps to your recipes.
                </p>
              </CardContent>
            </Card>
          )}

          {!playMode && (
            <>
              {ingredients.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <ChefHat className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wider">
                      Ingredients
                    </h3>
                  </div>
                  <Card>
                    <CardContent className="p-4">
                      {(() => {
                        const grouped = new Map<string | null, typeof ingredients>();
                        for (const item of ingredients) {
                          const key = item.groupName;
                          if (!grouped.has(key)) grouped.set(key, []);
                          grouped.get(key)!.push(item);
                        }
                        const groups = Array.from(grouped.entries());
                        return groups.map(([groupName, items]) => (
                          <div key={groupName ?? '__ungrouped'} className={groups.length > 1 ? 'mb-4 last:mb-0' : ''}>
                            {groupName && (
                              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                                {groupName}
                              </p>
                            )}
                            <div className="space-y-2">
                              {items.map((item, idx) => (
                                <div key={`${item.name}-${idx}`}>
                                  <p className="text-sm text-stone-800 font-bold italic">
                                    {item.name}
                                  </p>
                                  <p className="text-sm text-stone-500">
                                    {item.amount} {item.unit}
                                  </p>
                                  {item.prepInstructions.length > 0 && (
                                    <p className="text-xs text-stone-400 mt-0.5">
                                      {item.prepInstructions.join(' · ')}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </CardContent>
                  </Card>
                </div>
              )}

              {steps.prepSteps.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Utensils className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">
                      Prep Steps
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {steps.prepSteps.map((step) => {
                      const isDone = completedSteps.has(step.id);
                      return (
                        <button
                          key={step.id}
                          className={`w-full text-left p-4 rounded-lg border transition-colors ${
                            isDone
                              ? 'bg-amber-50 border-amber-200 opacity-60'
                              : 'bg-white border-amber-200 hover:border-amber-300'
                          }`}
                          onClick={() => toggleStep(step.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                isDone ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-600'
                              }`}
                            >
                              {isDone ? <Check className="w-3.5 h-3.5" /> : <Utensils className="w-3 h-3" />}
                            </div>
                            <div className="flex-1">
                              <p className={`text-base ${isDone ? 'line-through text-stone-400' : 'text-stone-700'}`}>
                                {step.text}
                              </p>
                              {mode !== 'recipe' && (
                                <p className="text-xs text-amber-500 mt-1">{step.recipeName}</p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {steps.cookSteps.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Flame className="w-4 h-4 text-red-500" />
                    <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wider">
                      Cooking Steps
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {steps.cookSteps.map((step) => {
                      const isDone = completedSteps.has(step.id);
                      const showHeader =
                        step.stepNumber === 1 ||
                        steps.cookSteps[steps.cookSteps.indexOf(step) - 1]?.recipeName !== step.recipeName;
                      return (
                        <div key={step.id}>
                          {mode !== 'recipe' && showHeader && (
                            <div className="flex items-center gap-2 mt-4 mb-2">
                              <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                                {step.recipeName}
                              </Badge>
                            </div>
                          )}
                          <button
                            className={`w-full text-left p-4 rounded-lg border transition-colors ${
                              isDone
                                ? 'bg-red-50 border-red-200 opacity-60'
                                : 'bg-white border-red-200 hover:border-red-300'
                            }`}
                            onClick={() => toggleStep(step.id)}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold ${
                                  isDone ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600'
                                }`}
                              >
                                {isDone ? <Check className="w-4 h-4" /> : step.stepNumber}
                              </div>
                              <p className={`text-base flex-1 ${isDone ? 'line-through text-stone-400' : 'text-stone-700'}`}>
                                {step.text}
                              </p>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {playMode && currentPlayStep && (
            <div className="flex flex-col items-center">
              <div className="w-full max-w-2xl">
                <div className="text-center mb-6">
                  <p className="text-lg font-semibold text-stone-600">
                    {completedCount}/{totalCount} complete
                  </p>
                  <div className="w-full bg-stone-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-brand-500 rounded-full h-2 transition-all"
                      style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <Card className={`border-2 ${currentPlayStep.type === 'prep' ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50'}`}>
                  <CardContent className="p-8 text-center">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
                      currentPlayStep.type === 'prep' ? 'bg-amber-200 text-amber-700' : 'bg-red-200 text-red-700'
                    }`}>
                      <span className="text-2xl font-bold">{playStepIndex + 1}</span>
                    </div>
                    {currentPlayStep.groupName && (
                      <p className="text-sm italic text-stone-500 mb-2">{currentPlayStep.groupName}</p>
                    )}
                    {mode !== 'recipe' && (
                      <p className="text-sm text-stone-400 mb-2">{currentPlayStep.recipeName}</p>
                    )}
                    <p className="text-xl text-stone-800 leading-relaxed whitespace-pre-line">
                      {currentPlayStep.text}
                    </p>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between mt-6">
                  <Button
                    variant="outline"
                    size="lg"
                    className="text-sm gap-1"
                    disabled={playStepIndex === 0}
                    onClick={() => {
                      setCompletedSteps((prev) => {
                        const next = new Set(prev);
                        next.delete(currentPlayStep.id);
                        if (playStepIndex > 0) {
                          const prevStep = allSteps[playStepIndex - 1];
                          if (prevStep) next.delete(prevStep.id);
                        }
                        return next;
                      });
                      setPlayStepIndex(Math.max(0, playStepIndex - 1));
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />Previous
                  </Button>
                  <Button
                    size="lg"
                    className={`text-sm gap-1 ${
                      playStepIndex === allSteps.length - 1
                        ? 'bg-brand-600 hover:bg-brand-700'
                        : currentPlayStep.type === 'prep'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                    onClick={() => {
                      if (playStepIndex === allSteps.length - 1) {
                        const allIds = new Set(allSteps.map((s) => s.id));
                        setCompletedSteps(allIds);
                        saveCompletedRecipes(mode, selectedRecipeId, selectedGroupId, mealEntries, mealGroups);
                        setCompletedRecipeMap(getCompletedRecipes());
                        setPlayMode(false);
                        setPlayStepIndex(0);
                      } else {
                        setCompletedSteps((prev) => {
                          const next = new Set(prev);
                          next.add(currentPlayStep.id);
                          return next;
                        });
                        setPlayStepIndex(playStepIndex + 1);
                      }
                    }}
                  >
                    <Check className="w-4 h-4" />
                    {playStepIndex === allSteps.length - 1 ? 'Finish Recipe' : 'Mark Complete & Next'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {playMode && !currentPlayStep && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8" />
              </div>
              <p className="text-xl font-semibold text-stone-800">All done!</p>
              <p className="text-stone-500 mt-1">All steps completed.</p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setPlayStepIndex(allSteps.length - 1)}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />Back to Steps
                </Button>
                <Button
                  className="bg-brand-600 hover:bg-brand-700"
                  onClick={() => setPlayMode(false)}
                >
                  Exit Play Mode
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
