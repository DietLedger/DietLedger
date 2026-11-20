'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { getApiClient, type QuarantinedRecipe } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { emptyNutrition, recipeNutrition, toPublicRecipe, type Ingredient } from '@/lib/recipe-types';
import { buildIngredientRematchUpdate, defaultLocationForFood, useFoodStorageDefaults, useFoodStorageDefaultLookup } from '@/hooks/use-recipes';
import { CustomNutritionNotice } from './custom-nutrition-editor';
import { IngredientMatchEditor } from './ingredient-match-editor';
import { refreshRecipeImportQueries, useRecipeImport } from './recipe-import-workflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmt } from '@/lib/format';

export function RecipeQuarantine() {
  const { resumeDecision, decisionDialog } = useRecipeImport();
  const [decisionError, setDecisionError] = useState('');
  const queue = useQuery({ queryKey: queryKeys.recipeImports.all, queryFn: () => getApiClient().getQuarantinedRecipes() });
  const [nameFilter, setNameFilter] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState('');
  const [bookFilter, setBookFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ stagedId: string; ingredient: Ingredient; isNew: boolean } | null>(null);
  const rows = queue.data ?? [];
  const books = [...new Set(rows.flatMap(row => row.bookTitles))].sort();
  const pendingBatchIds = [...new Set(rows.filter(row => row.requiresDecision).map(row => row.batchId))];
  const visible = rows.filter(row => {
    const missing = new Set(row.unresolvedIngredients.map(item => item.ingredientId));
    return row.recipe.name.toLowerCase().includes(nameFilter.toLowerCase())
      && (!ingredientFilter || (row.recipe.ingredients ?? []).some(ingredient => missing.has(ingredient.id) && ingredient.name.toLowerCase().includes(ingredientFilter.toLowerCase())))
      && (!bookFilter || (bookFilter === '__standalone' ? row.bookTitles.length === 0 : row.bookTitles.includes(bookFilter)));
  });
  const openNewIngredient = (row: QuarantinedRecipe) => {
    const ingredient: Ingredient = { ...emptyNutrition(), id: 'new', fdcId: 0, name: '', amount: 100, unit: 'g', description: '', groupId: null, linkedRecipeId: null, prepInstructions: [], storageLocation: '' };
    setEditing({ stagedId: row.id, ingredient, isNew: true });
  };

  return <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 space-y-4">
    {decisionDialog}
    <Link href="/recipes" className="text-sm underline">Back to Recipes</Link>
    <h1 className="text-xl font-semibold">Recipe quarantine</h1>
    <p className="text-sm text-stone-600">Imported recipes waiting for nutrition links. Unresolved imports stay here across visits and later imports. Complete recipes return to their original library locations automatically.</p>
    {pendingBatchIds.map(batchId => <div key={batchId} className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2">
      <p className="text-sm">This incoming batch is waiting for your choice: {rows.filter(row => row.batchId === batchId).map(row => row.recipe.name).join(', ')}. Nothing from it is published yet.</p>
      <Button variant="outline" onClick={() => {
        setDecisionError('');
        void resumeDecision(batchId, rows.filter(row => row.batchId === batchId && row.unresolvedIngredients.length > 0).length)
          .catch(error => setDecisionError(error instanceof Error ? error.message : 'Import preserved; please retry.'));
      }}>Resume import decision</Button>
    </div>)}
    {decisionError && <p role="alert" className="text-sm text-destructive">{decisionError}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <Input aria-label="Filter recipes" placeholder="Recipe name" value={nameFilter} onChange={event => setNameFilter(event.target.value)} />
      <Input aria-label="Filter missing ingredients" placeholder="Missing ingredient" value={ingredientFilter} onChange={event => setIngredientFilter(event.target.value)} />
      <select aria-label="Filter by book" className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={bookFilter} onChange={event => setBookFilter(event.target.value)}>
        <option className="bg-background text-foreground" value="">All books</option><option className="bg-background text-foreground" value="__standalone">Standalone / no book</option>
        {books.map(title => <option className="bg-background text-foreground" key={title} value={title}>{title}</option>)}
      </select>
    </div>
    {queue.isPending && <p role="status">Loading quarantine…</p>}
    {queue.isError && <div role="alert">Could not load quarantine. <Button variant="outline" onClick={() => queue.refetch()}>Retry</Button></div>}
    {!queue.isPending && !queue.isError && <p role="status">{rows.length === 0 ? 'No recipes! good job!' : `${visible.length} of ${rows.length} quarantined recipes`}</p>}
    {visible.map(row => {
      const recipe = toPublicRecipe(row.recipe);
      const totals = recipeNutrition(recipe);
      const open = expanded.has(row.id);
      return <section key={row.id} className="rounded-lg border bg-white">
        <h2><button className="w-full p-4 text-left" aria-expanded={open} aria-controls={`staged-${row.id}`} onClick={() => setExpanded(previous => {
          const next = new Set(previous); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next;
        })}>
          <span className="font-semibold">{recipe.name}</span>
          <span className="block text-sm text-stone-600">{row.unresolvedIngredients.length} unresolved · {row.bookTitles.join(', ') || 'Standalone / no book'}</span>
        </button></h2>
        {open && <div id={`staged-${row.id}`} className="border-t p-4 space-y-3">
          {recipe.description && <p className="whitespace-pre-wrap">{recipe.description}</p>}
          <CustomNutritionNotice nutrition={recipe.customNutrition} />
          <p className="text-xs text-stone-500">{recipe.customNutrition ? 'Custom recipe total' : 'Current ingredient total'}: {fmt(totals.calories)} kcal {recipe.customNutrition ? '(published facts; ingredients are descriptive)' : '(unconfirmed until linked)'}</p>
          {row.requiresDecision ? <p className="text-sm">Resume the import decision above and choose Relink later before editing this batch.</p> : recipe.ingredients.length === 0 ? <div className="space-y-2">
            <p>This recipe has no ingredients. Add its first ingredient to link nutrition and make it available.</p>
            <Button onClick={() => openNewIngredient(row)}>Add first ingredient</Button>
          </div> : row.unresolvedIngredients.map(blocker => {
            const ingredient = recipe.ingredients.find(item => item.id === blocker.ingredientId);
            return <div key={blocker.ingredientId} className="flex flex-wrap justify-between items-center gap-2 rounded border p-3">
              <div><p className="font-medium">{ingredient?.name || 'Unresolved ingredient'}</p>
                {ingredient && <p className="text-sm">{fmt(ingredient.amount)} {ingredient.unit}</p>}
                <p className="text-sm text-stone-600">{blocker.reason}</p>
                {ingredient?.sourceType === 'recipe' && <p className="text-sm">Repair the child recipe in quarantine, or replace this ingredient with a food match below.</p>}
              </div>
              {ingredient && <Button variant="outline" onClick={() => setEditing({ stagedId: row.id, ingredient, isNew: false })}>Link nutrition</Button>}
            </div>;
          })}
        </div>}
      </section>;
    })}
    {rows.length > 0 && visible.length === 0 && <p>No recipes match these filters.</p>}
    {editing && <QuarantineIngredientPopup key={`${editing.stagedId}-${editing.ingredient.id}`} {...editing} onClose={() => setEditing(null)} />}
  </main>;
}

function QuarantineIngredientPopup({ stagedId, ingredient, isNew, onClose }: { stagedId: string; ingredient: Ingredient; isNew: boolean; onClose: () => void }) {
  const client = useQueryClient();
  useFoodStorageDefaults();
  const lookupDefaults = useFoodStorageDefaultLookup();
  const [name, setName] = useState(ingredient.name);
  const [amount, setAmount] = useState(ingredient.amount);
  const [unit, setUnit] = useState(ingredient.unit);
  const save = useMutation({
    mutationFn: async (data: Parameters<ReturnType<typeof getApiClient>['resolveQuarantinedIngredient']>[2]) => getApiClient().resolveQuarantinedIngredient(stagedId, ingredient.id, data),
  });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={event => { if (save.isPending) event.preventDefault(); }} onPointerDownOutside={event => { if (save.isPending) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>Link nutrition: {ingredient.name || 'first ingredient'}</DialogTitle>
        <DialogDescription>Choose an existing food or explicitly use no nutrition. Saving a link also keeps this incoming batch. Other unresolved recipes stay quarantined. The row stays unresolved until the server confirms the save.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-sm">Name<Input aria-label="Ingredient name" value={name} disabled={!isNew || save.isPending} onChange={event => setName(event.target.value)} /></label>
        <label className="text-sm">Amount<Input aria-label="Ingredient amount" type="number" min="0" value={amount} disabled={save.isPending} onChange={event => setAmount(Number(event.target.value))} /></label>
        <label className="text-sm">Unit<Input aria-label="Ingredient unit" value={unit} disabled={save.isPending} onChange={event => setUnit(event.target.value)} /></label>
      </div>
      {ingredient.sourceType === 'recipe' && <p className="text-sm">When replacing a linked recipe, enter the food amount and unit (for example, grams).</p>}
      <IngredientMatchEditor initiallySearchOpen ingredient={{ ...ingredient, name }} amount={amount} unit={unit} onRematch={async (food, nextAmount, nextUnit) => {
        if (!name.trim() || !unit.trim() || !Number.isFinite(amount) || amount < 0) throw new Error('Enter a name, valid amount and unit.');
        const defaults = await lookupDefaults();
        const updates = buildIngredientRematchUpdate({ ...ingredient, name: name.trim() }, food, defaultLocationForFood(food, defaults), nextAmount, nextUnit);
        await save.mutateAsync({ ...updates, position: ingredient.position });
        await refreshRecipeImportQueries(client);
        onClose();
      }} />
      <Button variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>
    </DialogContent>
  </Dialog>;
}
