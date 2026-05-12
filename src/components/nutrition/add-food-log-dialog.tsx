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
import { useNutritionStore } from '@/lib/nutrition-store';
import {
  FoodLogEntryRecord,
  MealSlot,
  FoodSourceType,
  RecipeRecord,
  CustomFoodRecord,
} from '@/lib/storage';
import { getAllRecipes, getAllCustomFoods } from '@/lib/storage';
import { Search } from 'lucide-react';

const MEAL_OPTIONS: { value: MealSlot; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'midMorning', label: 'Mid-Morning' },
  { value: 'noon', label: 'Lunch' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Dinner' },
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
  const [servings, setServings] = useState('1');
  const [name, setName] = useState('');
  const [nutrients, setNutrients] = useState(emptyNutrients());
  const [searchQuery, setSearchQuery] = useState('');

  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [customFoods, setCustomFoods] = useState<CustomFoodRecord[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; type: FoodSourceType; nutrition: Record<string, number> } | null>(null);

  useEffect(() => {
    if (open) {
      if (editEntry) {
        setName(editEntry.name);
        setMealSlot(editEntry.mealSlot);
        setDate(editEntry.date);
        setServings(editEntry.servings.toString());
        const n: Record<string, string> = {};
        for (const f of NUTRIENT_FIELDS) n[f.key] = (editEntry as Record<string, unknown>)[f.key]?.toString() ?? '0';
        setNutrients(n as Record<NutrientKey, string>);
        if (editEntry.sourceType === 'recipe') setTab('recipes');
        else if (editEntry.sourceType === 'customFood') setTab('custom');
        else setTab('manual');
      } else {
        setName('');
        setMealSlot(defaultMealSlot ?? 'noon');
        setDate(defaultDate ?? new Date().toISOString().split('T')[0]);
        setServings('1');
        setNutrients(emptyNutrients());
        setTab('recipes');
        setSelectedItem(null);
        setSearchQuery('');
      }
      loadItems();
    }
  }, [open, editEntry, defaultMealSlot, defaultDate]);

  const loadItems = useCallback(async () => {
    const [r, c] = await Promise.all([getAllRecipes(), getAllCustomFoods()]);
    setRecipes(r);
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
    setNutrients(n as Record<NutrientKey, string>);
  }, []);

  const handleNutrientChange = useCallback((key: NutrientKey, value: string) => {
    setNutrients((prev) => ({ ...prev, [key]: value }));
  }, []);

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
        servings: servingsNum,
        ...nutritionData,
      });
    } else {
      await addFoodLogEntry({
        profileId,
        name,
        mealSlot,
        date,
        servings: servingsNum,
        sourceType: tab === 'recipes' ? 'recipe' : tab === 'custom' ? 'customFood' : 'manual',
        sourceId: selectedItem?.id ?? null,
        lastSyncedAt: null,
        ...nutritionData,
      });
    }
    onOpenChange(false);
  }, [name, mealSlot, date, servings, nutrients, profileId, tab, selectedItem, editEntry, addFoodLogEntry, updateFoodLogEntry, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{editEntry ? 'Edit Food Entry' : 'Add Food'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mb-3">
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
        </div>

        {!editEntry && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="recipes" className="flex-1 text-xs">My Recipes</TabsTrigger>
              <TabsTrigger value="custom" className="flex-1 text-xs">Custom Foods</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1 text-xs">Manual</TabsTrigger>
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
