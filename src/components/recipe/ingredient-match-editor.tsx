'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiClient } from '@/lib/api-client';
import { mapFoodItemToFDASearchResult } from '@/lib/fda-client';
import { hasMeaningfulNutrition } from '@/lib/food-eligibility';
import { createZeroNutritionImportFood } from '@/lib/recipe-import';
import type { CustomFoodRecord } from '@/lib/types';
import type { FDAFood, Ingredient } from '@/hooks/use-recipes';

type IngredientMatchEditorProps = {
  ingredient: Ingredient;
  amount: number;
  unit: string;
  onRematch: (food: FDAFood, amount: number, unit: string) => Promise<void>;
};

function mapCustomFoodToFDAFood(food: CustomFoodRecord): FDAFood {
  return {
    fdcId: -2,
    customFoodId: food.id,
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
  };
}

export function IngredientMatchEditor({ ingredient, amount, unit, onRematch }: IngredientMatchEditorProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FDAFood[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isCustom = ingredient.sourceType === 'custom_food';
  const isNoNutrition = ingredient.zeroNutritionOverride || (ingredient.fdcId === -3 && ingredient.sourceType === 'manual');
  const fdcId = !isCustom && ingredient.fdcId > 0 ? ingredient.fdcId : 0;
  const { data: food, isLoading: loadingFood } = useQuery({
    queryKey: ['foods', 'fdc', fdcId],
    queryFn: () => getApiClient().getFoodByFdcId(fdcId),
    enabled: fdcId > 0,
  });
  const { data: customFoods, isLoading: loadingCustom } = useQuery({
    queryKey: ['custom-foods'],
    queryFn: () => getApiClient().getCustomFoods(),
    enabled: isCustom && !!ingredient.sourceKey,
  });
  const customName = customFoods?.find((item) => item.id === ingredient.sourceKey)?.name;
  const matchedName = isCustom ? customName : food?.description;
  const loading = isCustom ? loadingCustom : loadingFood;
  const matchLabel = isNoNutrition ? 'No nutrition selected' : matchedName || (loading ? 'Loading database item…' : isCustom || fdcId ? 'Database item unavailable' : 'Not matched to a database item');

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const response = await getApiClient().searchFoods(query.trim());
      const databaseFoods = response.data
        .map(mapFoodItemToFDASearchResult)
        .filter((candidate) => hasMeaningfulNutrition(candidate.nutrients));
      let customResults: FDAFood[] = [];
      try {
        customResults = (await getApiClient().getCustomFoods())
          .filter((candidate) => candidate.name.toLowerCase().includes(query.trim().toLowerCase()) && hasMeaningfulNutrition(candidate))
          .map(mapCustomFoodToFDAFood);
      } catch {
        // USDA/local results remain usable if custom-food lookup is unavailable.
      }
      setResults([...customResults, ...databaseFoods]);
    } catch {
      setResults([]);
      setError('Could not search the food database.');
    } finally {
      setSearching(false);
    }
  };

  const useNoNutrition = async () => {
    setSaving(true);
    setError('');
    try {
      await onRematch(createZeroNutritionImportFood(ingredient.name), amount, unit);
      setSearchOpen(false);
      setResults([]);
      setQuery('');
    } catch {
      setError('Could not change the database match.');
    } finally {
      setSaving(false);
    }
  };

  const select = async (candidate: FDAFood) => {
    setSaving(true);
    setError('');
    try {
      const api = getApiClient();
      let resolvedFood: FDAFood;
      if (candidate.customFoodId) {
        const savedCustomFood = (await api.getCustomFoods()).find((item) => item.id === candidate.customFoodId);
        if (!savedCustomFood || !hasMeaningfulNutrition(candidate.nutrients)) throw new Error('Custom food not available');
        // Match Add: retain the selected result's nutrient snapshot after
        // verifying its custom-food ID is still owned and available.
        resolvedFood = candidate;
      } else {
        const databaseFood = await api.getFoodByFdcId(candidate.fdcId);
        if (!databaseFood || !hasMeaningfulNutrition(candidate.nutrients)) throw new Error('Food not available in database');
        // Use the selected search snapshot, just like Add. The by-ID lookup
        // verifies that the FDC record still exists; its cached nutrition may
        // lag the search result and must not silently replace the selection.
        resolvedFood = candidate;
      }
      await onRematch(resolvedFood, amount, unit);
      setSearchOpen(false);
      setResults([]);
      setQuery('');
    } catch {
      setError('Could not change the database match.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-brand-200 pt-2 mt-1 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-stone-600">Matched database item</p>
          <p className="text-xs text-stone-700 break-words">{matchLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={saving} onClick={() => { setSearchOpen(!searchOpen); setError(''); }}>
            {searchOpen ? 'Cancel match change' : 'Change match'}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={saving} onClick={useNoNutrition}>
            Use no nutrition
          </Button>
        </div>
      </div>
      {error && !searchOpen && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {searchOpen && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input aria-label="Search database foods" placeholder="Search database foods…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } }} className="h-8 text-xs" />
            <Button type="button" size="sm" onClick={search} disabled={searching || saving || !query.trim()} className="h-8">{searching ? 'Searching…' : 'Search'}</Button>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="max-h-44 overflow-y-auto space-y-1">
            {results.map((candidate) => (
              <Button key={candidate.customFoodId ?? candidate.fdcId} type="button" variant="outline" size="sm" disabled={saving} className="w-full h-auto py-2 text-xs justify-start text-left whitespace-normal" onClick={() => select(candidate)}>
                {candidate.description}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
