'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { format, parseISO, isValid, addDays } from 'date-fns';
import { ShoppingBasket, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useMealPlanStore } from '@/lib/meal-plan-store';
import { useRecipeStore } from '@/lib/recipe-store';
import {
  getMealPlanByWeekStart,
  getDayEntriesByMealPlanId,
  getGroceryChecklistByWeekStart,
  createGroceryChecklist,
  putGroceryChecklist,
  type GroceryChecklistRecord,
  type DayPlanEntryRecord,
} from '@/lib/storage';
import { aggregateIngredients, getUnitSystem, setUnitSystem, type UnitSystem } from '@/lib/unit-conversion';
import { STORAGE_LOCATION_META, type StorageLocation } from '@/data/storage-locations';
import { useIsMobile } from '@/hooks/use-mobile';
import Link from 'next/link';

export default function GroceryListPage() {
  const params = useParams();
  const weekStart = params.weekStart as string;
  const isMobile = useIsMobile();

  const weekDate = useMemo(() => {
    const d = parseISO(weekStart);
    return isValid(d) ? d : new Date();
  }, [weekStart]);

  const { recipes, fetchRecipes } = useRecipeStore();
  const [entries, setEntries] = useState<DayPlanEntryRecord[]>([]);
  const [checklist, setChecklist] = useState<GroceryChecklistRecord | null>(null);
  const [highlightedRecipe, setHighlightedRecipe] = useState<string | null>(null);
  const [highlightedIngredient, setHighlightedIngredient] = useState<string | null>(null);
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>('imperial');

  useEffect(() => {
    fetchRecipes();
    setUnitSystemState(getUnitSystem());
  }, [fetchRecipes]);

  useEffect(() => {
    async function loadData() {
      const plan = await getMealPlanByWeekStart(weekStart);
      if (plan) {
        const ents = await getDayEntriesByMealPlanId(plan.id);
        setEntries(ents);
      }
      let cl = await getGroceryChecklistByWeekStart(weekStart);
      if (!cl) {
        cl = await createGroceryChecklist(weekStart);
      }
      setChecklist(cl);
    }
    loadData();
  }, [weekStart]);

  const nonLeftoverEntries = useMemo(() => entries.filter((e) => !e.isLeftover), [entries]);

  const recipeList = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const entry of nonLeftoverEntries) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      const existing = map.get(entry.recipeId);
      if (existing) {
        existing.count++;
      } else {
        map.set(entry.recipeId, { id: recipe.id, name: recipe.name, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [nonLeftoverEntries, recipes]);

  const aggregatedIngredients = useMemo(() => {
    const allIngredients: Array<{ name: string; amount: number; unit: string; recipeId: string }> = [];

    function expandIngredients(
      entryServings: number,
      recipe: { id: string; ingredients: Array<{ name: string; amount: number; unit: string; linkedRecipeId: string | null }> },
      parentRecipeId: string,
      depth: number,
      multiplier: number,
    ) {
      if (depth > 2) return;
      for (const ing of recipe.ingredients) {
        if (ing.linkedRecipeId) {
          const linkedRecipe = recipes.find((r) => r.id === ing.linkedRecipeId);
          if (linkedRecipe) {
            const linkedServings = linkedRecipe.servings || 1;
            const subMultiplier = (multiplier * ing.amount) / linkedServings;
            expandIngredients(entryServings, linkedRecipe, parentRecipeId, depth + 1, subMultiplier);
          }
        } else {
          allIngredients.push({
            name: ing.name,
            amount: ing.amount * multiplier,
            unit: ing.unit,
            recipeId: parentRecipeId,
          });
        }
      }
    }

    for (const entry of nonLeftoverEntries) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      const recipeServings = recipe.servings || 1;
      const entryMultiplier = entry.servings / recipeServings;
      expandIngredients(entry.servings, recipe, recipe.id, 0, entryMultiplier);
    }
    return aggregateIngredients(allIngredients);
  }, [nonLeftoverEntries, recipes, unitSystem]);

  const recipeIngredientMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    function addIngredientEntries(
      recipe: { id: string; ingredients: Array<{ name: string; linkedRecipeId: string | null }> },
      parentRecipeId: string,
      depth: number,
    ) {
      if (depth > 2) return;
      for (const ing of recipe.ingredients) {
        if (ing.linkedRecipeId) {
          const linkedRecipe = recipes.find((r) => r.id === ing.linkedRecipeId);
          if (linkedRecipe) {
            addIngredientEntries(linkedRecipe, parentRecipeId, depth + 1);
          }
        } else {
          const key = ing.name.toLowerCase().trim();
          if (!map.has(key)) map.set(key, new Set());
          map.get(key)!.add(parentRecipeId);
        }
      }
    }
    for (const entry of nonLeftoverEntries) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      addIngredientEntries(recipe, recipe.id, 0);
    }
    return map;
  }, [nonLeftoverEntries, recipes]);

  const ingredientRecipeMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    function addRecipeEntries(
      recipe: { id: string; ingredients: Array<{ name: string; linkedRecipeId: string | null }> },
      depth: number,
    ) {
      if (depth > 2) return;
      for (const ing of recipe.ingredients) {
        if (ing.linkedRecipeId) {
          const linkedRecipe = recipes.find((r) => r.id === ing.linkedRecipeId);
          if (linkedRecipe) {
            addRecipeEntries(linkedRecipe, depth + 1);
          }
        } else {
          if (!map.has(recipe.id)) map.set(recipe.id, new Set());
          map.get(recipe.id)!.add(ing.name.toLowerCase().trim());
        }
      }
    }
    for (const entry of nonLeftoverEntries) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      addRecipeEntries(recipe, 0);
    }
    return map;
  }, [nonLeftoverEntries, recipes]);

  const ingredientStorageMap = useMemo(() => {
    const map = new Map<string, string>();
    function collectStorageLocations(
      recipe: { id: string; ingredients: Array<{ name: string; linkedRecipeId: string | null; storageLocation?: string }> },
      depth: number,
    ) {
      if (depth > 2) return;
      for (const ing of recipe.ingredients) {
        if (ing.linkedRecipeId) {
          const linkedRecipe = recipes.find((r) => r.id === ing.linkedRecipeId);
          if (linkedRecipe) {
            collectStorageLocations(linkedRecipe, depth + 1);
          }
        } else {
          const key = ing.name.toLowerCase().trim();
          if ((ing as any).storageLocation && !map.has(key)) {
            map.set(key, (ing as any).storageLocation);
          }
        }
      }
    }
    for (const entry of nonLeftoverEntries) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      collectStorageLocations(recipe as any, 0);
    }
    return map;
  }, [nonLeftoverEntries, recipes]);

  const handleToggleCheck = useCallback(
    async (ingredientName: string) => {
      if (!checklist) return;
      const key = ingredientName.toLowerCase().trim();
      const checked = checklist.checkedItems.includes(key);
      const newChecked = checked
        ? checklist.checkedItems.filter((i) => i !== key)
        : [...checklist.checkedItems, key];
      const updated = { ...checklist, checkedItems: newChecked };
      setChecklist(updated);
      await putGroceryChecklist(updated);
    },
    [checklist]
  );

  const handleUnitToggle = useCallback(() => {
    const newSystem = unitSystem === 'imperial' ? 'metric' : 'imperial';
    setUnitSystem(newSystem);
    setUnitSystemState(newSystem);
  }, [unitSystem]);

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href={`/meal-plans/${weekStart}`}>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              <ShoppingBasket className="w-5 h-5 text-emerald-600" />
              Grocery List
            </h1>
            <p className="text-xs text-stone-500">
              {format(weekDate, 'MMM d')} – {format(addDays(weekDate, 6), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="text-xs" onClick={handleUnitToggle}>
          {unitSystem === 'imperial' ? 'Switch to Metric' : 'Switch to Imperial'}
        </Button>
      </div>

      {isMobile ? (
        <MobileChecklist
          aggregatedIngredients={aggregatedIngredients}
          checklist={checklist}
          onToggle={handleToggleCheck}
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-stone-700">Recipes</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-1 max-h-[70vh] overflow-y-auto">
                {recipeList.map((recipe) => {
                  const isRecipeHighlighted =
                    highlightedRecipe === recipe.id ||
                    (highlightedIngredient && (recipeIngredientMap.get(highlightedIngredient) || new Set()).has(recipe.id));
                  return (
                    <button
                      key={recipe.id}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        isRecipeHighlighted
                          ? 'bg-amber-100 text-amber-800'
                          : 'hover:bg-stone-50'
                      }`}
                      onClick={() => {
                        setHighlightedRecipe(highlightedRecipe === recipe.id ? null : recipe.id);
                        setHighlightedIngredient(null);
                      }}
                    >
                      <span className="font-medium">{recipe.name}</span>
                      {recipe.count > 1 && (
                        <Badge variant="secondary" className="ml-2 text-xs h-4">
                          ×{recipe.count}
                        </Badge>
                      )}
                    </button>
                  );
                })}
                {recipeList.length === 0 && (
                  <p className="text-xs text-stone-400 text-center py-4">No recipes in this week&apos;s plan</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-stone-700">Ingredients</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-1 max-h-[70vh] overflow-y-auto">
                {aggregatedIngredients.map((ing, idx) => {
                  const key = ing.name.toLowerCase().trim();
                  const isHighlighted =
                    highlightedIngredient === key ||
                    (highlightedRecipe && (ingredientRecipeMap.get(highlightedRecipe) || new Set()).has(key));
                  return (
                    <button
                      key={`${key}-${idx}`}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        isHighlighted ? 'bg-amber-100' : 'hover:bg-stone-50'
                      }`}
                      onClick={() => {
                        setHighlightedIngredient(highlightedIngredient === key ? null : key);
                        setHighlightedRecipe(null);
                      }}
                    >
                      <span className="font-medium">{ing.name}</span>
                       <span className="text-stone-400 ml-2">{ing.displayAmount}</span>
                       {(() => {
                         const key = ing.name.toLowerCase().trim();
                         const loc = ingredientStorageMap.get(key);
                         if (!loc || !STORAGE_LOCATION_META[loc as StorageLocation]) return null;
                         const meta = STORAGE_LOCATION_META[loc as StorageLocation];
                         return (
                           <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${
                             meta.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                             meta.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                             meta.color === 'cyan' ? 'bg-cyan-100 text-cyan-700' :
                             'bg-green-100 text-green-700'
                           }`}>
                             {meta.icon} {loc}
                           </span>
                         );
                       })()}
                    </button>
                  );
                })}
                {aggregatedIngredients.length === 0 && (
                  <p className="text-xs text-stone-400 text-center py-4">No ingredients</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-stone-700">Checklist</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                  {aggregatedIngredients.map((ing, idx) => {
                  const key = ing.name.toLowerCase().trim();
                  const isChecked = checklist?.checkedItems.includes(key) ?? false;
                  const loc = ingredientStorageMap.get(key);
                  return (
                    <div key={`${key}-check-${idx}`} className="flex items-center gap-2">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggleCheck(key)}
                      />
                      <span
                        className={`text-sm flex-1 ${
                          isChecked ? 'line-through text-stone-400' : 'text-stone-700'
                        }`}
                      >
                        {ing.name}
                      </span>
                      {loc && STORAGE_LOCATION_META[loc as StorageLocation] && (() => {
                        const meta = STORAGE_LOCATION_META[loc as StorageLocation];
                        return (
                          <span className={`text-[9px] px-1 py-0.5 rounded ${
                            meta.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                            meta.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                            meta.color === 'cyan' ? 'bg-cyan-100 text-cyan-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {meta.icon}
                          </span>
                        );
                      })()}
                      <span className="text-xs text-stone-400">{ing.displayAmount}</span>
                    </div>
                  );
                })}
                {aggregatedIngredients.length === 0 && (
                  <p className="text-xs text-stone-400 text-center py-4">No items to check</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

function MobileChecklist({
  aggregatedIngredients,
  checklist,
  onToggle,
}: {
  aggregatedIngredients: Array<{ name: string; displayAmount: string }>;
  checklist: GroceryChecklistRecord | null;
  onToggle: (name: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium text-stone-700">Shopping Checklist</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="space-y-2">
          {aggregatedIngredients.map((ing, idx) => {
            const key = ing.name.toLowerCase().trim();
            const isChecked = checklist?.checkedItems.includes(key) ?? false;
            return (
              <div key={`${key}-m-${idx}`} className="flex items-center gap-2">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => onToggle(key)}
                />
                <span
                  className={`text-sm flex-1 ${
                    isChecked ? 'line-through text-stone-400' : 'text-stone-700'
                  }`}
                >
                  {ing.name}
                </span>
                <span className="text-xs text-stone-400">{ing.displayAmount}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
