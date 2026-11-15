import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipeQuarantine } from './recipe-quarantine';
import { useRecipeImport } from './recipe-import-workflow';
import { emptyNutrition } from '@/lib/recipe-types';
import type { QuarantinedRecipe } from '@/lib/api-client';

const api = vi.hoisted(() => ({ getQuarantinedRecipes: vi.fn(), resolveQuarantinedIngredient: vi.fn(), searchFoods: vi.fn(), getCustomFoods: vi.fn(), getFoodByFdcId: vi.fn(), getFoodStorageDefaults: vi.fn(), decideRecipeImport: vi.fn(), importRecipeBundle: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => api }));
const unresolved = (id: string, name: string) => ({ ...emptyNutrition(), id, recipeId: 'r', name, amount: 2, unit: 'tbsp', fdcId: 0, description: 'Imported original', groupId: 'g', linkedRecipeId: null, prepInstructions: ['chopped'], storageLocation: 'fridge', position: 3 });
const recipe = (id: string, name: string, bookTitles: string[] = []): QuarantinedRecipe => ({
  id, batchId: `batch-${id}`, recipe: { id: `r-${id}`, name, servings: 2, servingName: 'bowls', instructions: null, ingredientGroups: [{ id: 'g', title: 'Sauce' }], createdAt: '', updatedAt: '', ingredients: [unresolved('missing', 'Mystery food'), { ...unresolved('ready', 'Already linked'), sourceType: 'manual', fdcId: -3, zeroNutritionOverride: true }] },
  unresolvedIngredients: [{ ingredientId: 'missing', reason: 'Food not available' }], bookTitles,
});
let rows: QuarantinedRecipe[];
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const result = render(<QueryClientProvider client={client}><RecipeQuarantine /></QueryClientProvider>);
  return { ...result, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  rows = [recipe('old', 'Earlier soup', ['Weeknight']), recipe('new', 'New soup')];
  api.getQuarantinedRecipes.mockImplementation(async () => structuredClone(rows));
  api.getFoodStorageDefaults.mockResolvedValue([]);
  api.getCustomFoods.mockResolvedValue([]);
  api.searchFoods.mockResolvedValue({ data: [{ ...emptyNutrition(), fdcId: 123, description: 'Matched vegetable', calories: 100 }], total: 1 });
  api.getFoodByFdcId.mockResolvedValue({ fdcId: 123, description: 'Matched vegetable' });
});
afterEach(cleanup);

describe('actual quarantine UI', () => {
  it.each(['keep', 'cancel'] as const)('resumes an abandoned mixed batch after refresh with explicit %s and leaves earlier imports untouched', async action => {
    rows = [recipe('prior', 'Prior unresolved import')];
    api.importRecipeBundle.mockImplementation(async () => {
      const missing = { ...recipe('incoming-missing', 'Incoming unresolved'), batchId: 'incoming', requiresDecision: true };
      const complete = { ...recipe('incoming-complete', 'Incoming complete'), batchId: 'incoming', requiresDecision: true, unresolvedIngredients: [] };
      rows.push(missing, complete);
      return { pendingImportId: 'incoming', requiresDecision: true, quarantined: 1 };
    });
    api.decideRecipeImport.mockImplementation(async () => {
      rows = rows.filter(row => row.batchId !== 'incoming' || (action === 'keep' && row.id === 'incoming-missing'));
      rows.forEach(row => { row.requiresDecision = false; });
      return { quarantined: rows.length, promotedRecipeIds: action === 'keep' ? ['main-complete'] : [] };
    });
    function FileControl() {
      const { importFile, decisionDialog } = useRecipeImport();
      return <>{decisionDialog}<button onClick={() => {
        void importFile({ name: 'mixed.json', text: async () => JSON.stringify({ format: 'dietledger.recipe-bundle', version: 2 }) } as File).catch(() => {});
      }}>Import mixed file</button></>;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = render(<QueryClientProvider client={client}><FileControl /></QueryClientProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Import mixed file' }));
    await screen.findByRole('dialog', { name: 'Missing food records' });
    first.unmount();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Resume import decision' }));
    expect(screen.getByRole('dialog', { name: 'Missing food records' })).toBeInTheDocument();
    expect(api.decideRecipeImport).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: action === 'keep' ? 'Relink later' : 'Stop and undo' }));
    await waitFor(() => expect(api.decideRecipeImport).toHaveBeenCalledWith('incoming', action));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Incoming complete/ })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Prior unresolved import/ })).toBeInTheDocument();
    if (action === 'keep') expect(screen.getByRole('button', { name: /Incoming unresolved/ })).toBeInTheDocument();
    else expect(screen.queryByRole('button', { name: /Incoming unresolved/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume import decision' })).not.toBeInTheDocument();
    expect(api.importRecipeBundle).toHaveBeenCalledOnce();
  });

  it('keeps an unaccepted import decision-only until the whole-batch choice is made', async () => {
    rows = [{ ...recipe('pending-only', 'Pending import context'), requiresDecision: true }];
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Pending import context/ }));
    expect(screen.getByRole('button', { name: 'Resume import decision' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link nutrition' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add first ingredient' })).not.toBeInTheDocument();
    expect(api.resolveQuarantinedIngredient).not.toHaveBeenCalled();
  });

  it('handles the real empty staging wire payload with ingredients omitted, including ingredient filtering', async () => {
    rows = [recipe('empty-wire', 'Empty wire draft')];
    delete (rows[0].recipe as Partial<typeof rows[0]['recipe']>).ingredients;
    rows[0].unresolvedIngredients = [{ ingredientId: '', reason: 'No ingredients' }];
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Empty wire draft/ }));
    expect(screen.getByRole('button', { name: 'Add first ingredient' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Filter missing ingredients'), 'salt');
    expect(screen.getByText('No recipes match these filters.')).toBeInTheDocument();
  });

  it('retains the popup and rows after failed or empty searches and allows cancel without a write', async () => {
    api.searchFoods.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ data: [] });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Earlier soup/ }));
    await user.click(screen.getByRole('button', { name: 'Link nutrition' }));
    expect(screen.getByLabelText('Search database foods')).toBeVisible();
    await user.type(screen.getByLabelText('Search database foods'), 'salt');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not search');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matching foods found.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.getByText('Mystery food')).toBeInTheDocument();
    expect(api.resolveQuarantinedIngredient).not.toHaveBeenCalled();
  });

  it('fetches only staging, independently expands cards and filters recipe, unresolved ingredient and book', async () => {
    rows[1].recipe.ingredients[0].name = 'Unknown spice';
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Earlier soup/ }));
    await user.click(screen.getByRole('button', { name: /New soup/ }));
    expect(screen.getByText('Mystery food')).toBeInTheDocument();
    expect(screen.getByText('Unknown spice')).toBeInTheDocument();
    expect(screen.queryByText('Already linked')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Filter recipes'), 'Earlier');
    expect(screen.queryByRole('button', { name: /New soup/ })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Filter recipes'));
    await user.type(screen.getByLabelText('Filter missing ingredients'), 'spice');
    expect(screen.queryByRole('button', { name: /Earlier soup/ })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Filter missing ingredients'));
    await user.selectOptions(screen.getByLabelText('Filter by book'), 'Weeknight');
    expect(screen.getByRole('button', { name: /Earlier soup/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New soup/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by book'), '__standalone');
    expect(screen.getByRole('button', { name: /New soup/ })).toBeInTheDocument();
  });

  it('reuses real search, keeps failures/rows, preserves metadata and waits for confirmed promotion before hiding the card', async () => {
    const user = userEvent.setup();
    const { client } = mount();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await user.click(await screen.findByRole('button', { name: /Earlier soup/ }));
    await user.click(screen.getByRole('button', { name: 'Link nutrition' }));
    const dialog = screen.getByRole('dialog', { name: /Link nutrition/ });
    await user.type(within(dialog).getByLabelText('Search database foods'), 'vegetable');
    await user.click(within(dialog).getByRole('button', { name: 'Search' }));
    api.resolveQuarantinedIngredient.mockRejectedValueOnce(new Error('Link failed'));
    await user.click(await screen.findByRole('button', { name: 'Matched vegetable' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not/);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    let resolve!: (summary: object) => void;
    api.resolveQuarantinedIngredient.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await user.click(screen.getByRole('button', { name: 'Matched vegetable' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Mystery food');
    expect(api.resolveQuarantinedIngredient).toHaveBeenLastCalledWith('old', 'missing', expect.objectContaining({
      name: 'Mystery food', amount: 2, unit: 'tbsp', description: 'Imported original', groupId: 'g', prepInstructions: ['chopped'], storageLocation: 'fridge', sourceType: 'usda', sourceKey: '123', linkedRecipeId: null, calories: 30, position: 3,
    }));
    await act(async () => { rows = rows.filter(row => row.id !== 'old'); resolve({ quarantined: 1, promotedRecipeIds: ['main-old'] }); });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Earlier soup/ })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /New soup/ })).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['recipes'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['books'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['recipe-bundle-export-candidates'] });
  });

  it('only removes confirmed resolved rows and keeps other unresolved ingredients across navigation and later imports', async () => {
    rows[0].recipe.ingredients.push(unresolved('other', 'Other missing'));
    rows[0].unresolvedIngredients.push({ ingredientId: 'other', reason: 'Missing record' });
    api.resolveQuarantinedIngredient.mockImplementation(async () => {
      rows[0].unresolvedIngredients = rows[0].unresolvedIngredients.filter(row => row.ingredientId !== 'missing');
      rows[0].recipe.ingredients[0].calories = 45;
      return { quarantined: 2, promotedRecipeIds: [] };
    });
    const user = userEvent.setup();
    const first = mount();
    await user.click(await screen.findByRole('button', { name: /Earlier soup/ }));
    await user.click(screen.getAllByRole('button', { name: 'Link nutrition' })[0]);
    await user.click(screen.getByRole('button', { name: 'Use no nutrition' }));
    await waitFor(() => expect(screen.queryByText('Mystery food')).not.toBeInTheDocument());
    expect(screen.getByText('Other missing')).toBeInTheDocument();
    expect(screen.getByText(/Current ingredient total: 45 kcal/)).toBeInTheDocument();
    first.unmount();
    rows.push(recipe('third', 'Third import'));
    mount();
    expect(await screen.findByRole('button', { name: /Earlier soup/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New soup/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Third import/ })).toBeInTheDocument();
  });

  it('explains empty recipes and adds first ingredient through the same popup using reserved new ID', async () => {
    rows = [recipe('empty', 'Empty draft')];
    rows[0].recipe.ingredients = [];
    rows[0].unresolvedIngredients = [{ ingredientId: '', reason: 'Recipe has no ingredients' }];
    api.resolveQuarantinedIngredient.mockImplementation(async () => { rows = []; return { promotedRecipeIds: ['main'], quarantined: 0 }; });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Empty draft/ }));
    expect(screen.getByText(/no ingredients/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add first ingredient' }));
    await user.type(screen.getByLabelText('Ingredient name'), 'Water');
    await user.click(screen.getByRole('button', { name: 'Use no nutrition' }));
    await waitFor(() => expect(api.resolveQuarantinedIngredient).toHaveBeenCalledWith('empty', 'new', expect.objectContaining({ name: 'Water', zeroNutritionOverride: true })));
    expect(await screen.findByText('No quarantined recipes.')).toBeInTheDocument();
  });

  it('keeps missing/cyclic child dependencies actionable via the same replacement popup', async () => {
    rows = [recipe('cycle', 'Cyclic parent')];
    rows[0].recipe.ingredients[0] = { ...unresolved('missing', 'Child recipe'), sourceType: 'recipe', linkedRecipeId: 'foreign', amount: 1, unit: '× recipe' };
    rows[0].unresolvedIngredients[0].reason = 'Linked recipe is cyclic or unavailable';
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: /Cyclic parent/ }));
    expect(screen.getByText(/cyclic or unavailable/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Link nutrition' }));
    expect(screen.getByLabelText('Ingredient unit')).toBeEnabled();
    expect(screen.getByLabelText('Search database foods')).toBeEnabled();
  });
});
