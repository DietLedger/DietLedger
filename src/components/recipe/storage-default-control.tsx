'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { STORAGE_LOCATIONS, STORAGE_LOCATION_META } from '@/data/storage-locations';
import { useUpdateFoodStorageDefault } from '@/hooks/use-recipes';
import type { FoodStorageDefault } from '@/lib/api-client';

export function StorageDefaultControl({ identity, location, onLocationChange, onSaveIngredientLocation }: {
  identity: Pick<FoodStorageDefault, 'sourceType' | 'sourceKey'> | null;
  location: string;
  onLocationChange: (value: string) => void;
  onSaveIngredientLocation: (value: string) => Promise<void>;
}) {
  const mutation = useUpdateFoodStorageDefault();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [savingIngredient, setSavingIngredient] = useState(false);
  const updateDefault = async () => {
    if (!identity || !STORAGE_LOCATIONS.some(loc => loc === location)) return;
    setStatus('');
    setError('');
    setSavingIngredient(true);
    let ingredientSaved = false;
    try {
      await onSaveIngredientLocation(location);
      ingredientSaved = true;
      await mutation.mutateAsync({ ...identity, location });
      setStatus('Storage location saved for this ingredient and as the default for future additions.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Please try again.';
      setError(ingredientSaved
        ? `Ingredient location saved, but default update failed: ${message}`
        : `Ingredient location save failed: ${message}`);
    } finally {
      setSavingIngredient(false);
    }
  };
  return (
    <div className="border-t border-brand-200 pt-2 mt-1">
      <label htmlFor="ingredient-storage-location" className="text-xs font-medium text-stone-600 mb-1 block">Store in</label>
      <div className="flex items-center gap-2">
        <select
          id="ingredient-storage-location"
          value={location}
          onChange={(event) => { onLocationChange(event.target.value); setStatus(''); setError(''); }}
          className="flex-1 min-w-0 h-7 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Not set</option>
          {STORAGE_LOCATIONS.map((loc) => (
            <option key={loc} value={loc}>{STORAGE_LOCATION_META[loc].icon} {loc}</option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" disabled={!identity || !STORAGE_LOCATIONS.some(loc => loc === location) || mutation.isPending || savingIngredient} onClick={updateDefault}>
          {mutation.isPending || savingIngredient ? 'Saving…' : 'Update default'}
        </Button>
      </div>
      <p className="text-xs text-stone-500 mt-1">Saves this ingredient’s location and sets the default for future additions of this food.</p>
      {status && <p role="status" className="text-xs text-brand-700">{status}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
