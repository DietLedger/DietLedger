'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useNutritionStore } from '@/lib/nutrition-store';
import {
  FoodLogEntryRecord,
  MealSlot,
  FoodSourceType,
  RecipeRecord,
  CustomFoodRecord,
} from '@/lib/storage';
import { getApiClient } from '@/lib/api-client';
import { searchFDAFoods, type FDASearchResult } from '@/lib/fda-client';
import { UNIT_TO_GRAMS } from '@/lib/recipe-store';
import { Search, Loader2, Store, Apple, PenLine, Salad } from 'lucide-react';

const MEAL_OPTIONS: { value: MealSlot; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'midMorning', label: 'Mid-Morning' },
  { value: 'noon', label: 'Lunch' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Dinner' },
  { value: 'night', label: 'Night' },
  { value: 'snack', label: 'Snack' },
];

const NUTRIENT_FIELDS = [
  { key: 'calories', label: 'Calories (kcal)' },
  { key: 'totalFat', label: 'Total Fat (g)' },
  { key: 'saturatedFat', label: 'Saturated Fat (g)' },
  { key: 'transFat', label: 'Trans Fat (g)' },
  { key: 'cholesterol', label: 'Cholesterol (mg)' },
  { key: 'sodium', label: 'Sodium (mg)' },
  { key: 'totalCarbs', label: 'Total Carbs (g)' },
  { key: 'dietaryFiber', label: 'Dietary Fiber (g)' },
  { key: 'totalSugars', label: 'Total Sugars (g)' },
  { key: 'addedSugars', label: 'Added Sugars (g)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'vitaminD', label: 'Vitamin D (mcg)' },
  { key: 'calcium', label: 'Calcium (mg)' },
  { key: 'iron', label: 'Iron (mg)' },
  { key: 'potassium', label: 'Potassium (mg)' },
] as const;

type NutrientKey = (typeof NUTRIENT_FIELDS)[number]['key'];

const SERVING_UNITS = [
  { value: 'g', label: 'g' },
  { value: 'oz', label: 'oz' },
  { value: 'cup', label: 'cup' },
  { value: 'tbsp', label: 'tbsp' },
  { value: 'tsp', label: 'tsp' },
  { value: 'ml', label: 'ml' },
] as const;

interface AddFoodLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  defaultMealSlot?: MealSlot;
  defaultDate?: string;
  editEntry?: FoodLogEntryRecord | null;
}

function emptyNutrients(): Record<NutrientKey, string> {
  const result: Record<string, string> = {};
  for (const f of NUTRIENT_FIELDS) result[f.key] = '0';
  return result as Record<NutrientKey, string>;
}

function nutrientsFromFDASearch(food: FDASearchResult): Record<NutrientKey, string> {
  return {
    calories: food.nutrients.calories?.toString() ?? '0',
    totalFat: food.nutrients.totalFat?.toString() ?? '0',
    saturatedFat: food.nutrients.saturatedFat?.toString() ?? '0',
    transFat: food.nutrients.transFat?.toString() ?? '0',
    cholesterol: food.nutrients.cholesterol?.toString() ?? '0',
    sodium: food.nutrients.sodium?.toString() ?? '0',
    totalCarbs: food.nutrients.totalCarbs?.toString() ?? '0',
    dietaryFiber: food.nutrients.dietaryFiber?.toString() ?? '0',
    totalSugars: food.nutrients.totalSugars?.toString() ?? '0',
    addedSugars: food.nutrients.addedSugars?.toString() ?? '0',
    protein: food.nutrients.protein?.toString() ?? '0',
    vitaminD: food.nutrients.vitaminD?.toString() ?? '0',
    calcium: food.nutrients.calcium?.toString() ?? '0',
    iron: food.nutrients.iron?.toString() ?? '0',
    potassium: food.nutrients.potassium?.toString() ?? '0',
  };
}

export function AddFoodLogDialog({
  open,
  onOpenChange,
  profileId,
  defaultMealSlot,
  defaultDate,
  editEntry,
}: AddFoodLogDialogProps) {
  const { addFoodLogEntry, updateFoodLogEntry } = useNutritionStore();
  const [tab, setTab] = useState('recipes');
  const [mealSlot, setMealSlot] = useState<MealSlot>(defaultMealSlot ?? 'noon');
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
  const [servings, setServings] = useState('1');
  const [name, setName] = useState('');
  const [nutrients, setNutrients] = useState(emptyNutrients());
  const [searchQuery, setSearchQuery] = useState('');

  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [customFoods, setCustomFoods] = useState<CustomFoodRecord[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; type: FoodSourceType; nutrition: Record<string, number> } | null>(null);

  const [fdaResults, setFdaResults] = useState<FDASearchResult[]>([]);
  const [fdaSearching, setFdaSearching] = useState(false);
  const [saveAsCustom, setSaveAsCustom] = useState(false);
  const [servingAmount, setServingAmount] = useState('100');
  const [servingUnit, setServingUnit] = useState('g');
  const [baseNutrients, setBaseNutrients] = useState<Record<NutrientKey, string> | null>(null);

  useEffect(() => {
    if (open) {
      setSaveAsCustom(false);
      if (editEntry) {
        setName(editEntry.name);
        setMealSlot(editEntry.mealSlot);
        setDate(editEntry.date);
        setTime(editEntry.time ?? (() => { const n = new Date(); return `${n.getHours().toString().padStart(2, '0')}:${n.getMinutes().toString().padStart(2, '0')}`; })());
        setServings(editEntry.servings.toString());
        const n: Record<string, string> = {};
        for (const f of NUTRIENT_FIELDS) n[f.key] = (editEntry as Record<string, unknown>)[f.key]?.toString() ?? '0';
        setNutrients(n as Record<NutrientKey, string>);
        if (editEntry.sourceType === 'recipe') setTab('recipes');
        else if (editEntry.sourceType === 'customFood') setTab('custom');
        else setTab('manual');
      } else {
        resetForm();
      }
      loadItems();
    }
  }, [open, editEntry, defaultMealSlot, defaultDate]);

  useEffect(() => {
    if (!searchQuery || tab !== 'food') {
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
  }, [searchQuery, tab]);

  const resetForm = useCallback(() => {
    setName('');
    setMealSlot(defaultMealSlot ?? 'noon');
    setDate(defaultDate ?? new Date().toISOString().split('T')[0]);
    const now = new Date();
    setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    setServings('1');
    setNutrients(emptyNutrients());
    setSaveAsCustom(false);
    setTab('recipes');
    setSelectedItem(null);
    setSearchQuery('');
    setFdaResults([]);
    setServingAmount('100');
    setServingUnit('g');
    setBaseNutrients(null);
  }, [defaultMealSlot, defaultDate]);

  const loadItems = useCallback(async () => {
    const client = getApiClient();
    const [recipePage, c] = await Promise.all([client.getRecipes(1, 200), client.getCustomFoods()]);
    setRecipes(recipePage.data);
    setCustomFoods(c);
  }, []);

  const recipeNutrition = useCallback((recipe: RecipeRecord): Record<string, number> => {
    const totals: Record<string, number> = {};
    for (const f of NUTRIENT_FIELDS) totals[f.key] = 0;
    for (const ing of recipe.ingredients) {
      for (const f of NUTRIENT_FIELDS) {
        totals[f.key] += (ing as Record<string, number>)[f.key] ?? 0;
      }
    }
    if (recipe.servings > 0) {
      for (const f of NUTRIENT_FIELDS) totals[f.key] /= recipe.servings;
    }
    return totals;
  }, []);

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

  const selectRecipe = useCallback((recipe: RecipeRecord) => {
    const perServing = recipeNutrition(recipe);
    setSelectedItem({ id: recipe.id, name: recipe.name, type: 'recipe', nutrition: perServing });
    setName(recipe.name);
    const n: Record<string, string> = {};
    for (const f of NUTRIENT_FIELDS) n[f.key] = perServing[f.key]?.toFixed(2) ?? '0';
    setNutrients(n as Record<NutrientKey, string>);
  }, [recipeNutrition]);

  const selectCustomFood = useCallback((food: CustomFoodRecord) => {
    const nutrition: Record<string, number> = {};
    for (const f of NUTRIENT_FIELDS) nutrition[f.key] = (food as Record<string, number>)[f.key] ?? 0;
    setSelectedItem({ id: food.id, name: food.name, type: 'customFood', nutrition });
    setName(food.name);
    const n: Record<string, string> = {};
    for (const f of NUTRIENT_FIELDS) n[f.key] = nutrition[f.key]?.toString() ?? '0';
    setBaseNutrients(n as Record<NutrientKey, string>);
    setServingAmount('100');
    setServingUnit('g');
    setNutrients(n as Record<NutrientKey, string>);
  }, []);

  const selectFDAFood = useCallback((food: FDASearchResult) => {
    const foodName = food.description + (food.brandOwner ? ` (${food.brandOwner})` : '');
    const nutrition: Record<string, number> = {};
    for (const f of NUTRIENT_FIELDS) nutrition[f.key] = food.nutrients[f.key as keyof typeof food.nutrients] ?? 0;
    setSelectedItem({ id: `fdc-${food.fdcId}`, name: foodName, type: 'customFood', nutrition });
    setName(foodName);
    const base = nutrientsFromFDASearch(food);
    setBaseNutrients(base);
    const amt = food.servingSize?.toString() || '100';
    const unit = food.servingSizeUnit || 'g';
    setServingAmount(amt);
    setServingUnit(unit);
    const grams = (parseFloat(amt) || 100) * (UNIT_TO_GRAMS[unit] || 1);
    const ratio = grams / 100;
    const display: Record<string, string> = {};
    for (const f of NUTRIENT_FIELDS) {
      display[f.key] = ((parseFloat(base[f.key]) || 0) * ratio).toFixed(2);
    }
    setNutrients(display as Record<NutrientKey, string>);
  }, []);

  const handleNutrientChange = useCallback((key: NutrientKey, value: string) => {
    setNutrients((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleTabChange = useCallback((v: string) => {
    setTab(v);
    setSearchQuery('');
    setFdaResults([]);
    setBaseNutrients(null);
    setSelectedItem(null);
    setNutrients(emptyNutrients());
    setServingAmount('100');
    setServingUnit('g');
  }, []);

  const recalcFromServing = useCallback((amount: string, unit: string) => {
    if (!baseNutrients) return;
    const grams = (parseFloat(amount) || 0) * (UNIT_TO_GRAMS[unit] || 1);
    const ratio = grams / 100;
    const updated: Record<string, string> = {};
    for (const f of NUTRIENT_FIELDS) {
      updated[f.key] = ((parseFloat(baseNutrients[f.key]) || 0) * ratio).toFixed(2);
    }
    setNutrients(updated as Record<NutrientKey, string>);
  }, [baseNutrients]);

  const handleServingAmountChange = useCallback((value: string) => {
    setServingAmount(value);
    recalcFromServing(value, servingUnit);
  }, [servingUnit, recalcFromServing]);

  const handleServingUnitChange = useCallback((newUnit: string) => {
    const currentGrams = (parseFloat(servingAmount) || 0) * (UNIT_TO_GRAMS[servingUnit] || 1);
    const newUnitGrams = UNIT_TO_GRAMS[newUnit] || 1;
    const newAmount = Math.round((currentGrams / newUnitGrams) * 100) / 100;
    setServingAmount(newAmount.toString());
    setServingUnit(newUnit);
    recalcFromServing(newAmount.toString(), newUnit);
  }, [servingAmount, servingUnit, recalcFromServing]);

  const buildCustomFoodData = useCallback(() => ({
    name: name.trim(),
    calories: parseFloat(nutrients.calories) || 0,
    totalFat: parseFloat(nutrients.totalFat) || 0,
    saturatedFat: parseFloat(nutrients.saturatedFat) || 0,
    transFat: parseFloat(nutrients.transFat) || 0,
    cholesterol: parseFloat(nutrients.cholesterol) || 0,
    sodium: parseFloat(nutrients.sodium) || 0,
    totalCarbs: parseFloat(nutrients.totalCarbs) || 0,
    dietaryFiber: parseFloat(nutrients.dietaryFiber) || 0,
    totalSugars: parseFloat(nutrients.totalSugars) || 0,
    addedSugars: parseFloat(nutrients.addedSugars) || 0,
    protein: parseFloat(nutrients.protein) || 0,
    vitaminD: parseFloat(nutrients.vitaminD) || 0,
    calcium: parseFloat(nutrients.calcium) || 0,
    iron: parseFloat(nutrients.iron) || 0,
    potassium: parseFloat(nutrients.potassium) || 0,
  }), [name, nutrients]);

  const handleSubmit = useCallback(async () => {
    const servingsNum = parseFloat(servings) || 1;
    const nutritionData: Record<string, number> = {};
    for (const f of NUTRIENT_FIELDS) {
      const base = parseFloat(nutrients[f.key]) || 0;
      nutritionData[f.key] = Math.round(base * servingsNum * 100) / 100;
    }

    if (editEntry) {
      await updateFoodLogEntry(editEntry.id, {
        name,
        mealSlot,
        date,
        time,
        servings: servingsNum,
        ...nutritionData,
      });
      if (saveAsCustom) {
        await getApiClient().createCustomFood(buildCustomFoodData());
      }
    } else {
      if (tab === 'manual') {
        await getApiClient().createCustomFood(buildCustomFoodData());
      }
      await addFoodLogEntry({
        profileId,
        name,
        mealSlot,
        date,
        time,
        servings: servingsNum,
        sourceType: tab === 'recipes' ? 'recipe' : tab === 'food' ? 'customFood' : tab === 'custom' ? 'customFood' : 'manual',
        sourceId: selectedItem?.id ?? null,
        lastSyncedAt: null,
        servingAmount: baseNutrients ? parseFloat(servingAmount) || undefined : undefined,
        servingUnit: baseNutrients ? servingUnit : undefined,
        ...nutritionData,
      });
    }
    onOpenChange(false);
  }, [name, mealSlot, date, time, servings, nutrients, profileId, tab, selectedItem, editEntry, saveAsCustom, baseNutrients, servingAmount, servingUnit, addFoodLogEntry, updateFoodLogEntry, buildCustomFoodData, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{editEntry ? 'Edit Food Entry' : 'Add Food'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <Label className="text-xs">Meal</Label>
            <Select value={mealSlot} onValueChange={(v) => setMealSlot(v as MealSlot)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEAL_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>

        {!editEntry && (
          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="recipes" className="flex-1 text-xs gap-1"><Salad className="w-3 h-3" />Recipes</TabsTrigger>
              <TabsTrigger value="food" className="flex-1 text-xs gap-1"><Store className="w-3 h-3" />Food DB</TabsTrigger>
              <TabsTrigger value="custom" className="flex-1 text-xs gap-1"><Apple className="w-3 h-3" />Custom</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 text-xs gap-1"><PenLine className="w-3 h-3" />Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="recipes" className="mt-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search recipes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-[200px]">
                {filteredRecipes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No recipes found</p>
                ) : (
                  <div className="space-y-1">
                    {filteredRecipes.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => selectRecipe(r)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors ${selectedItem?.id === r.id ? 'bg-accent font-medium' : ''}`}
                      >
                        {r.name}
                        <span className="text-xs text-muted-foreground ml-2">({r.servings} servings)</span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="food" className="mt-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search foods, brands, UPC (e.g. &quot;Pizza Hut pepperoni&quot;)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-[200px]">
                {fdaSearching && (
                  <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                  </div>
                )}
                {!fdaSearching && fdaResults.length === 0 && !searchQuery && (
                  <p className="text-sm text-muted-foreground text-center py-4">Search for restaurant items, branded foods, UPC codes, or ingredients</p>
                )}
                {!fdaSearching && fdaResults.length === 0 && searchQuery && (
                  <p className="text-sm text-muted-foreground text-center py-4">No foods found</p>
                )}
                <div className="space-y-1">
                  {fdaResults.map((food) => (
                    <button
                      key={food.fdcId}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors ${selectedItem?.id === `fdc-${food.fdcId}` ? 'bg-accent font-medium' : ''}`}
                      onClick={() => selectFDAFood(food)}
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
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search custom foods..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-[200px]">
                {filteredCustomFoods.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No custom foods found</p>
                ) : (
                  <div className="space-y-1">
                    {filteredCustomFoods.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => selectCustomFood(f)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors ${selectedItem?.id === f.id ? 'bg-accent font-medium' : ''}`}
                      >
                        {f.name}
                        <span className="text-xs text-muted-foreground ml-2">({Math.round(f.calories)} kcal)</span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="manual" className="mt-3">
              <div className="mb-3">
                <Label className="text-xs">Food Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken breast" className="h-8 text-sm" />
              </div>
              <p className="text-xs text-muted-foreground mb-2">Nutrition per serving:</p>
              <p className="text-xs text-brand-600 mb-2">This food will be saved to your custom foods list.</p>
              <ScrollArea className="h-[180px]">
                <div className="grid grid-cols-2 gap-2">
                  {NUTRIENT_FIELDS.map((f) => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        type="number"
                        step="any"
                        value={nutrients[f.key]}
                        onChange={(e) => handleNutrientChange(f.key, e.target.value)}
                        className="h-7 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        {!editEntry && baseNutrients && (
          <div className="flex items-end gap-2 mt-2">
            <div>
              <Label className="text-xs">Serving</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={servingAmount}
                onChange={(e) => handleServingAmountChange(e.target.value)}
                className="h-8 w-24 text-sm"
              />
            </div>
            <Select value={servingUnit} onValueChange={handleServingUnitChange}>
              <SelectTrigger className="h-8 w-[90px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVING_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground pb-1 whitespace-nowrap">
              ≈ {Math.round((parseFloat(servingAmount) || 0) * (UNIT_TO_GRAMS[servingUnit] || 1))}g
            </span>
          </div>
        )}

        {editEntry && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Food Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
            </div>
            <ScrollArea className="h-[180px]">
              <div className="grid grid-cols-2 gap-2">
                {NUTRIENT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      type="number"
                      step="any"
                      value={nutrients[f.key]}
                      onChange={(e) => handleNutrientChange(f.key, e.target.value)}
                      className="h-7 text-sm"
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex items-center gap-2">
              <Checkbox id="saveAsCustom" checked={saveAsCustom} onCheckedChange={(v) => setSaveAsCustom(v === true)} />
              <Label htmlFor="saveAsCustom" className="text-xs cursor-pointer">Save as new custom food</Label>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-2">
          <div className="flex-1">
            <Label className="text-xs">Servings</Label>
            <Input type="number" step="0.5" min="0.25" value={servings} onChange={(e) => setServings(e.target.value)} className="h-8 w-20 text-sm" />
          </div>
          <div className="text-right text-sm text-muted-foreground pt-4">
            Total: {Math.round((parseFloat(nutrients.calories) || 0) * (parseFloat(servings) || 1))} kcal
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            {editEntry ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
