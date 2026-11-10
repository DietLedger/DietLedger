'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Search, SkipForward, Save, X } from 'lucide-react';
import { getApiClient } from '@/lib/api-client';
import { searchFDAFoods } from '@/lib/fda-client';
import { generateUUID } from '@/lib/utils';
import { fmt } from '@/lib/format';
import type { FDAFood, InstructionStep, NutrientKeys } from '@/lib/recipe-types';
import type { ImportRecipeDraft, ImportIngredientDraft } from '@/lib/recipe-import';
import { createManualImportFood, createZeroNutritionImportFood, isImportDraftReady } from '@/lib/recipe-import';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

type ManualNutritionForm = Record<NutrientKeys, string>;

const MANUAL_NUTRIENT_FIELDS: Array<{ key: NutrientKeys; label: string; unit: string }> = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'totalFat', label: 'Total fat', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g' },
  { key: 'transFat', label: 'Trans fat', unit: 'g' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'totalCarbs', label: 'Carbs', unit: 'g' },
  { key: 'dietaryFiber', label: 'Fiber', unit: 'g' },
  { key: 'totalSugars', label: 'Sugars', unit: 'g' },
  { key: 'addedSugars', label: 'Added sugars', unit: 'g' },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg' },
  { key: 'calcium', label: 'Calcium', unit: 'mg' },
  { key: 'iron', label: 'Iron', unit: 'mg' },
  { key: 'potassium', label: 'Potassium', unit: 'mg' },
];

function emptyManualNutrition(): ManualNutritionForm {
  return Object.fromEntries(MANUAL_NUTRIENT_FIELDS.map(({ key }) => [key, ''])) as ManualNutritionForm;
}

interface RecipeImportDialogProps {
  open: boolean;
  drafts: ImportRecipeDraft[];
  currentIndex: number;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (index: number, draft: ImportRecipeDraft) => void;
  onUndoCurrent: () => void;
  onSaveCurrent: () => void;
  onSkipCurrent: () => void;
}

export function RecipeImportDialog({
  open,
  drafts,
  currentIndex,
  isSaving,
  onOpenChange,
  onDraftChange,
  onUndoCurrent,
  onSaveCurrent,
  onSkipCurrent,
}: RecipeImportDialogProps) {
  const draft = drafts[currentIndex] ?? null;
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FDAFood[]>([]);
  const [searchSource, setSearchSource] = useState<'fda' | 'fallback' | 'local' | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [manualNutritionOpen, setManualNutritionOpen] = useState(false);
  const [manualNutrition, setManualNutrition] = useState<ManualNutritionForm>(() => emptyManualNutrition());

  const selectedIngredient = useMemo(
    () => draft?.ingredients.find((ingredient) => ingredient.id === selectedIngredientId) ?? draft?.ingredients[0] ?? null,
    [draft, selectedIngredientId]
  );

  useEffect(() => {
    if (!draft) {
      setSelectedIngredientId(null);
      return;
    }
    const currentStillExists = selectedIngredientId && draft.ingredients.some((ingredient) => ingredient.id === selectedIngredientId);
    if (!currentStillExists) {
      setSelectedIngredientId(draft.ingredients.find((ingredient) => !ingredient.matchedFood)?.id ?? draft.ingredients[0]?.id ?? null);
    }
  }, [draft, selectedIngredientId]);

  useEffect(() => {
    if (selectedIngredient) {
      setSearchQuery(selectedIngredient.name);
      setSearchResults([]);
      setSearchSource(null);
      if (selectedIngredient.matchedFood?.dataType === 'Manual') {
        setManualNutrition(Object.fromEntries(
          MANUAL_NUTRIENT_FIELDS.map(({ key }) => [key, String(selectedIngredient.matchedFood?.nutrients[key] || '')])
        ) as ManualNutritionForm);
        setManualNutritionOpen(true);
      } else {
        setManualNutrition(emptyManualNutrition());
        setManualNutritionOpen(false);
      }
    }
  }, [selectedIngredient?.id]);

  const matchedCount = draft?.ingredients.filter((ingredient) => ingredient.matchedFood).length ?? 0;
  const canSave = !!draft && isImportDraftReady(draft) && !isSaving;

  const updateDraft = (patch: Partial<ImportRecipeDraft>) => {
    if (!draft) return;
    onDraftChange(currentIndex, { ...draft, ...patch });
  };

  const updateIngredient = (ingredientId: string, patch: Partial<ImportIngredientDraft>) => {
    if (!draft) return;
    onDraftChange(currentIndex, {
      ...draft,
      ingredients: draft.ingredients.map((ingredient) => (
        ingredient.id === ingredientId ? { ...ingredient, ...patch } : ingredient
      )),
    });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSearchSource(null);
    try {
      const result = await searchFDAFoods(searchQuery.trim());
      let customFoods: FDAFood[] = [];
      try {
        const allCustom = await getApiClient().getCustomFoods();
        const q = searchQuery.trim().toLowerCase();
        customFoods = allCustom
          .filter((food) => food.name.toLowerCase().includes(q))
          .map((food, idx) => ({
            fdcId: -(Date.now() + idx + 1),
            description: food.name,
            brandOwner: null,
            dataType: 'Custom',
            servingSize: 100,
            servingSizeUnit: 'g',
            nutrients: {
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
            },
          }));
      } catch {}
      setSearchResults([...customFoods, ...result.foods]);
      setSearchSource(customFoods.length > 0 && result.foods.length === 0 ? 'local' : result.source);
    } finally {
      setIsSearching(false);
    }
  };

  const handleApplyManualNutrition = () => {
    if (!selectedIngredient) return;
    const nutrition = Object.fromEntries(
      MANUAL_NUTRIENT_FIELDS.map(({ key }) => [key, parseFloat(manualNutrition[key]) || 0])
    ) as Record<NutrientKeys, number>;
    updateIngredient(selectedIngredient.id, {
      matchedFood: createManualImportFood(selectedIngredient.name, nutrition),
    });
  };

  const handleApplyZeroNutrition = () => {
    if (!selectedIngredient) return;
    updateIngredient(selectedIngredient.id, {
      matchedFood: createZeroNutritionImportFood(selectedIngredient.name),
    });
    setManualNutrition(emptyManualNutrition());
    setManualNutritionOpen(false);
  };

  const handleDirectionsChange = (value: string) => {
    if (!draft) return;
    const previous = draft.instructionSteps;
    const steps: InstructionStep[] = value
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
      .map((text, index) => ({ id: previous[index]?.id ?? generateUUID(), text, groupId: previous[index]?.groupId ?? null }));
    updateDraft({ instructionSteps: steps });
  };

  if (!draft) return null;

  const groupedIngredients = draft.ingredientGroups.length > 0
    ? draft.ingredientGroups.map((group) => ({ group, ingredients: draft.ingredients.filter((ingredient) => ingredient.groupId === group.id) }))
    : [];
  const ungroupedIngredients = draft.ingredients.filter((ingredient) => !ingredient.groupId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1180px] h-[92vh] max-h-[92vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b bg-stone-50">
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-stone-900">
              <Search className="w-4 h-4 text-brand-600" />
              Import recipe {currentIndex + 1} of {drafts.length}
            </span>
            <span className="text-xs font-normal text-stone-500 truncate max-w-[40%]">{draft.sourceFileName}</span>
          </DialogTitle>
          <p className="text-xs text-stone-500">
            Review the parsed recipe and match every ingredient to a food database entry before saving.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="lg:col-span-5 h-full min-h-0 border-r bg-white">
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-stone-600">Recipe name</label>
                <Input value={draft.title} onChange={(e) => updateDraft({ title: e.target.value })} className="font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-stone-600 mb-1 block">Servings</label>
                  <Input type="number" min="1" value={draft.servings} onChange={(e) => updateDraft({ servings: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600 mb-1 block">Serving name</label>
                  <Input value={draft.servingName} onChange={(e) => updateDraft({ servingName: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600 mb-1 block">Prep time</label>
                  <Input placeholder="Optional" value={draft.prepTime} onChange={(e) => updateDraft({ prepTime: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-stone-600 mb-1 block">Cook time</label>
                  <Input placeholder="Optional" value={draft.cookTime} onChange={(e) => updateDraft({ cookTime: e.target.value })} />
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-stone-700">Ingredients</h3>
                  <Badge variant={matchedCount === draft.ingredients.length ? 'default' : 'outline'} className={matchedCount === draft.ingredients.length ? 'bg-brand-600' : ''}>
                    {matchedCount}/{draft.ingredients.length} matched
                  </Badge>
                </div>
                <div className="space-y-3">
                  {ungroupedIngredients.length > 0 && (
                    <IngredientDraftList
                      ingredients={ungroupedIngredients}
                      selectedIngredientId={selectedIngredient?.id ?? null}
                      onSelect={setSelectedIngredientId}
                      onUpdate={updateIngredient}
                    />
                  )}
                  {groupedIngredients.map(({ group, ingredients }) => (
                    <div key={group.id} className="border border-brand-100 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-brand-50 text-xs font-semibold text-brand-800">{group.title}</div>
                      <div className="p-2">
                        <IngredientDraftList
                          ingredients={ingredients}
                          selectedIngredientId={selectedIngredient?.id ?? null}
                          onSelect={setSelectedIngredientId}
                          onUpdate={updateIngredient}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <label className="text-sm font-semibold text-stone-700 mb-2 block">Directions</label>
                <Textarea
                  value={draft.instructionSteps.map((step, index) => `${index + 1}. ${step.text}`).join('\n')}
                  onChange={(e) => handleDirectionsChange(e.target.value)}
                  className="min-h-44 text-sm"
                />
              </div>
            </div>
          </ScrollArea>

          <div className="lg:col-span-7 flex flex-col min-h-0 overflow-hidden bg-stone-50/50">
            <div className="p-5 border-b bg-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-stone-800">Match selected ingredient</h3>
                  {selectedIngredient ? (
                    <p className="text-xs text-stone-500 mt-1">
                      Imported as <span className="font-medium text-stone-700">{selectedIngredient.originalText}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-stone-500 mt-1">No ingredient selected.</p>
                  )}
                </div>
                {selectedIngredient?.matchedFood ? (
                  <Badge className="bg-green-600 gap-1"><CheckCircle2 className="w-3 h-3" />Matched</Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 gap-1"><AlertTriangle className="w-3 h-3" />Needs match</Badge>
                )}
              </div>
              {selectedIngredient && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_6rem] gap-2 mt-4">
                    <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Search food database..." />
                    <Input type="number" min="0" step="0.1" value={selectedIngredient.amount} onChange={(e) => updateIngredient(selectedIngredient.id, { amount: parseFloat(e.target.value) || 0 })} aria-label="Ingredient amount" />
                    <select value={selectedIngredient.unit} onChange={(e) => updateIngredient(selectedIngredient.id, { unit: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="g">grams</option><option value="kg">kg</option><option value="oz">oz</option><option value="lb">lb</option>
                      <option value="cup">cup</option><option value="tbsp">tbsp</option><option value="tsp">tsp</option><option value="ml">ml</option><option value="l">l</option><option value="whole">whole</option>
                    </select>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs font-medium text-stone-600 mb-1 block">Ingredient prep instructions</label>
                    <Textarea
                      value={selectedIngredient.prepInstructions.join('\n')}
                      onChange={(e) => updateIngredient(selectedIngredient.id, { prepInstructions: e.target.value.split('\n').map((line) => line.trim()).filter(Boolean) })}
                      placeholder="e.g., diced, drained, cut into slices"
                      className="min-h-16 text-xs bg-white"
                    />
                  </div>
                </>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim() || !selectedIngredient} className="bg-brand-600 hover:bg-brand-700">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Search database
                </Button>
                <Button type="button" variant="outline" disabled={!selectedIngredient} onClick={handleApplyZeroNutrition}>
                  Use no nutrition
                </Button>
                <Button type="button" variant="outline" disabled={!selectedIngredient} onClick={() => setManualNutritionOpen((open) => !open)}>
                  Insert nutrition facts
                </Button>
                {selectedIngredient?.matchedFood && (
                  <Button variant="outline" onClick={() => updateIngredient(selectedIngredient.id, { matchedFood: null })}>
                    <X className="w-4 h-4" />Clear match
                  </Button>
                )}
              </div>
              {selectedIngredient && manualNutritionOpen && (
                <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-semibold text-stone-700">Manual nutrition facts</p>
                      <p className="text-[11px] text-stone-500">Enter values per 100g. Unfilled nutrients save as zero.</p>
                    </div>
                    <Button type="button" size="sm" className="bg-brand-600 hover:bg-brand-700 h-8" onClick={handleApplyManualNutrition}>
                      Use manual facts
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
                    {MANUAL_NUTRIENT_FIELDS.map(({ key, label, unit }) => (
                      <label key={key} className="text-[11px] text-stone-500">
                        {label} <span className="text-stone-400">({unit})</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={manualNutrition[key]}
                          onChange={(e) => setManualNutrition((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="h-7 text-xs bg-white mt-0.5"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-5 space-y-2">
                {searchSource && (
                  <Badge variant="outline" className={`mb-2 ${searchSource === 'local' ? 'bg-brand-100 text-brand-700 border-brand-200' : searchSource === 'fda' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                    {searchSource === 'local' ? 'Local DB' : searchSource === 'fda' ? 'Network' : 'Fallback'} results
                  </Badge>
                )}
                {searchResults.length === 0 && !isSearching && (
                  <div className="text-center py-14 border-2 border-dashed border-stone-200 rounded-lg bg-white">
                    <Search className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                    <p className="text-sm text-stone-500">Search for a matching food entry.</p>
                    <p className="text-xs text-stone-400 mt-1">For water or trace spices, use the no-nutrition match to tie the ingredient to an explicit zero-nutrition source.</p>
                  </div>
                )}
                {searchResults.map((food) => (
                  <button
                    key={`${food.fdcId}-${food.description}`}
                    type="button"
                    className={`w-full text-left p-3 rounded-lg border transition-colors bg-white ${selectedIngredient?.matchedFood?.fdcId === food.fdcId ? 'border-brand-400 bg-brand-50' : 'border-stone-200 hover:border-brand-200 hover:bg-stone-50'}`}
                    onClick={() => selectedIngredient && updateIngredient(selectedIngredient.id, { matchedFood: food })}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-stone-900 flex-1">{food.description}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{food.dataType}</Badge>
                    </div>
                    <div className="text-xs text-stone-500 mt-1 flex flex-wrap gap-2">
                      {food.brandOwner && <span>{food.brandOwner}</span>}
                      <span>{fmt(food.nutrients.calories)} cal</span>
                      <span>{fmt(food.nutrients.protein)}g protein</span>
                      <span>{fmt(food.nutrients.totalFat)}g fat</span>
                      <span>{fmt(food.nutrients.totalCarbs)}g carbs per 100{food.servingSizeUnit || 'g'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="px-5 py-3 border-t bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            {matchedCount === draft.ingredients.length
              ? 'All ingredients are matched. This recipe is ready to import.'
              : `${draft.ingredients.length - matchedCount} ingredient${draft.ingredients.length - matchedCount === 1 ? '' : 's'} still need a database match.`}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onUndoCurrent} disabled={isSaving}>
              <RotateCcw className="w-4 h-4" />Undo all changes
            </Button>
            <Button variant="outline" onClick={onSkipCurrent} disabled={isSaving}>
              <SkipForward className="w-4 h-4" />Skip recipe
            </Button>
            <Button onClick={onSaveCurrent} disabled={!canSave} className="bg-brand-600 hover:bg-brand-700">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save all changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IngredientDraftList({
  ingredients,
  selectedIngredientId,
  onSelect,
  onUpdate,
}: {
  ingredients: ImportIngredientDraft[];
  selectedIngredientId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ImportIngredientDraft>) => void;
}) {
  return (
    <div className="space-y-1.5">
      {ingredients.map((ingredient) => (
        <div
          key={ingredient.id}
          className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${selectedIngredientId === ingredient.id ? 'border-brand-400 bg-brand-50' : 'border-stone-200 hover:border-brand-200'}`}
          onClick={() => onSelect(ingredient.id)}
        >
          <div className="flex items-center gap-2">
            {ingredient.matchedFood ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
            <Input
              value={ingredient.name}
              onChange={(e) => onUpdate(ingredient.id, { name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="h-8 text-sm font-medium bg-white"
              aria-label="Ingredient name"
            />
          </div>
          <div className="grid grid-cols-[5rem_5rem_1fr] gap-2 mt-2">
            <Input
              type="number"
              min="0"
              step="0.1"
              value={ingredient.amount}
              onChange={(e) => onUpdate(ingredient.id, { amount: parseFloat(e.target.value) || 0 })}
              onClick={(e) => e.stopPropagation()}
              className="h-8 text-xs"
              aria-label="Ingredient amount"
            />
            <Input
              value={ingredient.unit}
              onChange={(e) => onUpdate(ingredient.id, { unit: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="h-8 text-xs"
              aria-label="Ingredient unit"
            />
            <p className="text-[11px] text-stone-400 self-center truncate" title={ingredient.matchedFood?.description ?? ingredient.originalText}>
              {ingredient.matchedFood ? `Matched: ${ingredient.matchedFood.description}` : ingredient.originalText}
            </p>
          </div>
          {ingredient.prepInstructions.length > 0 && (
            <p className="text-[11px] text-stone-500 mt-1 truncate" title={ingredient.prepInstructions.join('; ')}>
              Prep: {ingredient.prepInstructions.join('; ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
