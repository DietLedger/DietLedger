'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { format, parseISO, isValid, addDays } from 'date-fns';
import { ShoppingBasket, Check, ArrowLeft, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRecipes, type Recipe } from '@/hooks/use-recipes';
import { toPublicRecipe } from '@/lib/recipe-types';
import { getApiClient } from '@/lib/api-client';
import type { GroceryChecklistRecord, DayPlanEntryRecord } from '@/lib/types';

import {
  aggregateIngredients,
  getUnitSystem,
  setUnitSystem,
  type UnitSystem,
  type AggregatedIngredient,
  gramsToUnit,
  formatGramsAs,
  defaultDisplayUnit,
  ALL_CONVERTIBLE_UNITS,
  WEIGHT_UNITS,
  VOLUME_UNITS,
  COUNT_UNITS_LIST,
} from '@/lib/unit-conversion';
import { STORAGE_LOCATION_META, type StorageLocation } from '@/data/storage-locations';
import { useIsMobile } from '@/hooks/use-mobile';
import Link from 'next/link';
import { exportGroceryListPdf, type GroceryItemData } from '@/lib/pdf-export';

export default function GroceryListPage() {
  const params = useParams();
  const weekStart = params.weekStart as string;
  const isMobile = useIsMobile();

  const weekDate = useMemo(() => {
    const d = parseISO(weekStart);
    return isValid(d) ? d : new Date();
  }, [weekStart]);

  const { data: recipes = [] } = useRecipes();
  const [entries, setEntries] = useState<DayPlanEntryRecord[]>([]);
  const [checklist, setChecklist] = useState<GroceryChecklistRecord | null>(null);
  const [highlightedRecipe, setHighlightedRecipe] = useState<string | null>(null);
  const [highlightedIngredient, setHighlightedIngredient] = useState<string | null>(null);
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>('imperial');
  const [fullRecipeCache, setFullRecipeCache] = useState<Map<string, Recipe>>(new Map());
  const [unitOverrides, setUnitOverrides] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    setUnitSystemState(getUnitSystem());
  }, []);

  useEffect(() => {
    async function loadData() {
      const client = getApiClient();
      const plan = await client.getMealPlanByWeekStart(weekStart);
      if (plan) {
        const ents = await client.getDayEntriesByMealPlanId(plan.id);
        setEntries(ents as DayPlanEntryRecord[]);
      }
      let cl = await client.getGroceryChecklist(weekStart);
      if (!cl) {
        cl = await client.upsertGroceryChecklist({ weekStart, checkedItems: [] });
      }
      setChecklist(cl);
    }
    loadData();
  }, [weekStart]);

  useEffect(() => {
    let cancelled = false;
    async function enrichRecipes() {
      const api = getApiClient();
      const needed = new Set<string>();
      for (const entry of entries) {
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
  }, [entries, recipes, fullRecipeCache]);

  const enrichedRecipes = useMemo(() => {
    const map = new Map(recipes.map(r => [r.id, r]));
    for (const [id, r] of fullRecipeCache) map.set(id, r);
    return Array.from(map.values());
  }, [recipes, fullRecipeCache]);

  const nonLeftoverEntries = useMemo(() => entries.filter((e) => !e.isLeftover), [entries]);

  const recipeList = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const entry of nonLeftoverEntries) {
      const recipe = enrichedRecipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      const existing = map.get(recipe.id);
      if (existing) {
        existing.count++;
      } else {
        map.set(recipe.id, { id: recipe.id, name: recipe.name, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [nonLeftoverEntries, enrichedRecipes]);

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
          const linkedRecipe = enrichedRecipes.find((r) => r.id === ing.linkedRecipeId);
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
      if (entry.sourceType === 'recipe') {
        const recipe = enrichedRecipes.find((r) => r.id === entry.recipeId);
        if (!recipe) continue;
        const recipeServings = recipe.servings || 1;
        const entryMultiplier = entry.servings / recipeServings;
        expandIngredients(entry.servings, recipe, recipe.id, 0, entryMultiplier);
      } else if (entry.foodName) {
        allIngredients.push({
          name: entry.foodName,
          amount: entry.servings,
          unit: 'serving',
          recipeId: `food-${entry.id}`,
        });
      }
    }
    return aggregateIngredients(allIngredients);
  }, [nonLeftoverEntries, enrichedRecipes, unitSystem]);

  const getIngredientDisplay = useCallback((ing: AggregatedIngredient): string => {
    const key = ing.name.toLowerCase().trim();
    if (ing.totalGrams > 0) {
      const unit = unitOverrides.get(key) || defaultDisplayUnit(ing.totalGrams, unitSystem);
      return formatGramsAs(ing.totalGrams, unit);
    }
    return ing.displayAmount;
  }, [unitOverrides, unitSystem]);

  const getIngredientUnit = useCallback((ing: AggregatedIngredient): string => {
    const key = ing.name.toLowerCase().trim();
    if (ing.totalGrams > 0) {
      return unitOverrides.get(key) || defaultDisplayUnit(ing.totalGrams, unitSystem);
    }
    return '';
  }, [unitOverrides, unitSystem]);

  const handleUnitOverride = useCallback((ingredientKey: string, newUnit: string) => {
    setUnitOverrides(prev => {
      const next = new Map(prev);
      next.set(ingredientKey, newUnit);
      return next;
    });
  }, []);

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
          const linkedRecipe = enrichedRecipes.find((r) => r.id === ing.linkedRecipeId);
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
      if (entry.sourceType === 'recipe') {
        const recipe = enrichedRecipes.find((r) => r.id === entry.recipeId);
        if (!recipe) continue;
        addIngredientEntries(recipe, recipe.id, 0);
      } else if (entry.foodName) {
        const key = entry.foodName.toLowerCase().trim();
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(`food-${entry.id}`);
      }
    }
    return map;
  }, [nonLeftoverEntries, enrichedRecipes]);

  const ingredientRecipeMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    function addRecipeEntries(
      recipe: { id: string; ingredients: Array<{ name: string; linkedRecipeId: string | null }> },
      parentRecipeId: string,
      depth: number,
    ) {
      if (depth > 2) return;
      for (const ing of recipe.ingredients) {
        if (ing.linkedRecipeId) {
          const linkedRecipe = enrichedRecipes.find((r) => r.id === ing.linkedRecipeId);
          if (linkedRecipe) {
            addRecipeEntries(linkedRecipe, parentRecipeId, depth + 1);
          }
        } else {
          if (!map.has(parentRecipeId)) map.set(parentRecipeId, new Set());
          map.get(parentRecipeId)!.add(ing.name.toLowerCase().trim());
        }
      }
    }
    for (const entry of nonLeftoverEntries) {
      if (entry.sourceType === 'recipe') {
        const recipe = enrichedRecipes.find((r) => r.id === entry.recipeId);
        if (!recipe) continue;
        addRecipeEntries(recipe, recipe.id, 0);
      } else if (entry.foodName) {
        const foodKey = `food-${entry.id}`;
        if (!map.has(foodKey)) map.set(foodKey, new Set());
        map.get(foodKey)!.add(entry.foodName.toLowerCase().trim());
      }
    }
    return map;
  }, [nonLeftoverEntries, enrichedRecipes]);

  const ingredientStorageMap = useMemo(() => {
    const map = new Map<string, string>();
    function collectStorageLocations(
      recipe: { id: string; ingredients: Array<{ name: string; linkedRecipeId: string | null; storageLocation?: string }> },
      depth: number,
    ) {
      if (depth > 2) return;
      for (const ing of recipe.ingredients) {
        if (ing.linkedRecipeId) {
          const linkedRecipe = enrichedRecipes.find((r) => r.id === ing.linkedRecipeId);
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
      const recipe = enrichedRecipes.find((r) => r.id === entry.recipeId);
      if (!recipe) continue;
      collectStorageLocations(recipe as any, 0);
    }
    return map;
  }, [nonLeftoverEntries, enrichedRecipes]);

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
      await getApiClient().upsertGroceryChecklist(updated);
    },
    [checklist]
  );

  const handleUnitToggle = useCallback(() => {
    const newSystem = unitSystem === 'imperial' ? 'metric' : 'imperial';
    setUnitSystem(newSystem);
    setUnitSystemState(newSystem);
    setUnitOverrides(new Map());
  }, [unitSystem]);

  const handleExportPdf = useCallback(async () => {
    const items: GroceryItemData[] = aggregatedIngredients.map(ing => ({
      name: ing.name,
      displayAmount: getIngredientDisplay(ing),
      recipeNames: Array.from(recipeIngredientMap.get(ing.name.toLowerCase().trim()) || []).map(id => {
        const r = enrichedRecipes.find(r => r.id === id);
        return r?.name;
      }).filter(Boolean) as string[],
    }));
    const dateRange = `${format(weekDate, 'MMM d')} – ${format(addDays(weekDate, 6), 'MMM d, yyyy')}`;
    const blob = await exportGroceryListPdf(dateRange, items);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grocery-list-${weekStart}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [aggregatedIngredients, getIngredientDisplay, recipeIngredientMap, enrichedRecipes, weekDate, weekStart]);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleExportPdf}>
            <FileDown className="w-3.5 h-3.5" />Export PDF
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleUnitToggle}>
            {unitSystem === 'imperial' ? 'Switch to Metric' : 'Switch to Imperial'}
          </Button>
        </div>
      </div>

      {isMobile ? (
        <MobileChecklist
          aggregatedIngredients={aggregatedIngredients}
          checklist={checklist}
          onToggle={handleToggleCheck}
          getIngredientDisplay={getIngredientDisplay}
          getIngredientUnit={getIngredientUnit}
          onUnitChange={handleUnitOverride}
          unitSystem={unitSystem}
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
                  const display = getIngredientDisplay(ing);
                  const currentUnit = getIngredientUnit(ing);
                  const hasConvertible = ing.totalGrams > 0;
                  return (
                    <div
                      key={`${key}-${idx}`}
                      className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm transition-colors ${
                        isHighlighted ? 'bg-amber-100' : 'hover:bg-stone-50'
                      }`}
                      onClick={() => {
                        setHighlightedIngredient(highlightedIngredient === key ? null : key);
                        setHighlightedRecipe(null);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{ing.name}</span>
                        {(() => {
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
                      </div>
                      {hasConvertible ? (
                        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                          <span className="text-stone-500 text-xs">{display.replace(/\s+\S+$/, '')}</span>
                          <Select
                            value={currentUnit}
                            onValueChange={(u) => handleUnitOverride(key, u)}
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-6 min-w-[52px] px-1.5 py-0 text-xs border-0 shadow-none bg-stone-100 hover:bg-stone-200 rounded"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <span className="px-2 py-1 text-[10px] text-stone-400 uppercase tracking-wider">Weight</span>
                              {WEIGHT_UNITS.map(u => (
                                <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                              ))}
                              <Separator className="my-1" />
                              <span className="px-2 py-1 text-[10px] text-stone-400 uppercase tracking-wider">Volume</span>
                              {VOLUME_UNITS.map(u => (
                                <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <span className="text-stone-400 text-xs shrink-0">{display}</span>
                      )}
                    </div>
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
                  const display = getIngredientDisplay(ing);
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
                      <span className="text-xs text-stone-400">{display}</span>
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
  getIngredientDisplay,
  getIngredientUnit,
  onUnitChange,
  unitSystem,
}: {
  aggregatedIngredients: AggregatedIngredient[];
  checklist: GroceryChecklistRecord | null;
  onToggle: (name: string) => void;
  getIngredientDisplay: (ing: AggregatedIngredient) => string;
  getIngredientUnit: (ing: AggregatedIngredient) => string;
  onUnitChange: (key: string, unit: string) => void;
  unitSystem: UnitSystem;
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
            const display = getIngredientDisplay(ing);
            const currentUnit = getIngredientUnit(ing);
            const hasConvertible = ing.totalGrams > 0;
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
                {hasConvertible ? (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <span className="text-xs text-stone-400">{display.replace(/\s+\S+$/, '')}</span>
                    <Select
                      value={currentUnit}
                      onValueChange={(u) => onUnitChange(key, u)}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-6 min-w-[52px] px-1.5 py-0 text-xs border-0 shadow-none bg-stone-100 hover:bg-stone-200 rounded"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <span className="px-2 py-1 text-[10px] text-stone-400 uppercase tracking-wider">Weight</span>
                        {WEIGHT_UNITS.map(u => (
                          <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                        ))}
                        <Separator className="my-1" />
                        <span className="px-2 py-1 text-[10px] text-stone-400 uppercase tracking-wider">Volume</span>
                        {VOLUME_UNITS.map(u => (
                          <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <span className="text-xs text-stone-400">{display}</span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
