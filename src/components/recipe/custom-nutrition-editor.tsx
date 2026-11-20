'use client';

import { useState, useId } from 'react';
import type { CustomRecipeNutrition } from '@/lib/types';
import { emptyNutrition, NUTRIENT_KEYS, type NutrientKeys } from '@/lib/recipe-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const LABELS: Record<NutrientKeys, string> = {
  calories: 'Calories (kcal)', totalFat: 'Total Fat (g)', saturatedFat: 'Saturated Fat (g)', transFat: 'Trans Fat (g)',
  cholesterol: 'Cholesterol (mg)', sodium: 'Sodium (mg)', totalCarbs: 'Total Carbs (g)', dietaryFiber: 'Dietary Fiber (g)',
  totalSugars: 'Total Sugars (g)', addedSugars: 'Added Sugars (g)', protein: 'Protein (g)', vitaminD: 'Vitamin D (mcg)',
  calcium: 'Calcium (mg)', iron: 'Iron (mg)', potassium: 'Potassium (mg)',
};

export function CustomNutritionNotice({ nutrition }: { nutrition?: CustomRecipeNutrition | null }) {
  if (!nutrition) return null;
  return <div className="text-xs space-y-1 break-words">
    <p>Custom recipe nutrition — source: {nutrition.source}. Replaces ingredient nutrition.</p>
    {nutrition.missingNutrients?.length ? <p>Not reported: {nutrition.missingNutrients.join(', ')}. These are unknown, not measured zeros.</p> : null}
    {nutrition.sourceLabel && <p className="whitespace-pre-wrap">{nutrition.sourceLabel}</p>}
  </div>;
}

export function CustomNutritionEditor({ recipe, onSave }: {
  recipe: { description?: string; customNutrition?: CustomRecipeNutrition | null };
  onSave: (data: { description: string; customNutrition: CustomRecipeNutrition | null }) => Promise<unknown>;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [source, setSource] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [values, setValues] = useState<Partial<Record<NutrientKeys, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startEditing() {
    setDescription(recipe.description ?? ''); setEnabled(!!recipe.customNutrition);
    setSource(recipe.customNutrition?.source ?? ''); setSourceLabel(recipe.customNutrition?.sourceLabel ?? '');
    setValues(Object.fromEntries(NUTRIENT_KEYS.map(key => [key, recipe.customNutrition && !recipe.customNutrition.missingNutrients?.includes(key) ? String(recipe.customNutrition.nutrients[key]) : ''])));
    setError(''); setEditing(true);
  }
  async function save() {
    const nutrients = emptyNutrition(); const missingNutrients: string[] = [];
    for (const key of enabled ? NUTRIENT_KEYS : []) {
      const raw = values[key]?.trim() ?? '';
      if (!raw) missingNutrients.push(key);
      else if (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 1e6) { setError('Nutrients must be finite, nonnegative numbers up to 1,000,000.'); return; }
      else nutrients[key] = Number(raw);
    }
    if (enabled && !source.trim()) { setError('A nutrition source is required.'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ description, customNutrition: enabled ? { basis: 'recipeTotal', nutrients, source: source.trim(), sourceLabel, missingNutrients } : null });
      setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save recipe nutrition.'); }
    finally { setSaving(false); }
  }
  return <section className="space-y-2">
    {recipe.description && <p className="text-sm whitespace-pre-wrap">{recipe.description}</p>}
    <CustomNutritionNotice nutrition={recipe.customNutrition} />
    {!editing ? <Button type="button" variant="outline" size="sm" onClick={startEditing}>Edit description and nutrition</Button> : <div className="space-y-3 rounded border p-3">
      <label className="block text-sm" htmlFor={`${id}-description`}>Recipe description</label>
      <Textarea id={`${id}-description`} value={description} onChange={e => setDescription(e.target.value)} />
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Use custom recipe nutrition</label>
      <p className="text-xs">Whole recipe totals, not per serving or per 100g. Changing yield divides these fixed totals; scaling the full recipe multiplies them. Ingredients remain descriptive. Blank values mean not reported; enter 0 only for a known zero.</p>
      {enabled && <>
        <label className="block text-sm" htmlFor={`${id}-source`}>Nutrition source</label>
        <Input id={`${id}-source`} value={source} onChange={e => setSource(e.target.value)} />
        <label className="block text-sm" htmlFor={`${id}-label`}>Original nutrition label</label>
        <Textarea id={`${id}-label`} value={sourceLabel} onChange={e => setSourceLabel(e.target.value)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{NUTRIENT_KEYS.map(key => <label key={key} className="text-xs">{LABELS[key]}, whole recipe
          <Input type="number" min={0} max={1e6} step="any" value={values[key] ?? ''} onChange={e => setValues(previous => ({ ...previous, [key]: e.target.value }))} />
        </label>)}</div>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={saving} onClick={save}>Save description and nutrition</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button></div>
    </div>}
  </section>;
}
