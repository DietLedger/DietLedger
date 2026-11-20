import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import RecipesPage from '@/app/(app)/recipes/page';
import { emptyNutrition } from '@/lib/recipe-types';
import type { RecipeRecord } from '@/lib/types';
const mocks = vi.hoisted(() => ({ recipes: [] as RecipeRecord[], update: vi.fn(), create: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/lib/api-client', () => {
  const api = new Proxy({
    getRecipes: async () => ({ data: mocks.recipes, totalPages: 1 }),
    getRecipe: async (id: string) => mocks.recipes.find(r => r.id === id),
    createRecipe: mocks.create,
    updateRecipe: mocks.update,
  }, { get(target, key) { return key in target ? target[key as keyof typeof target] : async () => []; } });
  return { getApiClient: () => api };
});
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'owner' }, isAuthenticated: true }) }));
beforeEach(() => {
  mocks.recipes = []; mocks.update.mockReset(); mocks.create.mockReset();
  mocks.create.mockImplementation(async (name: string) => {
    const recipe: RecipeRecord = { id: `recipe-${mocks.recipes.length}`, name, servings: 4, servingName: '3 chicken strips, ¼ cup sauce', instructions: null, ingredientGroups: [], ingredients: [], createdAt: '', updatedAt: '' };
    mocks.recipes.push(recipe); return recipe;
  });
  mocks.update.mockImplementation(async (id: string, data: Partial<RecipeRecord>) => {
    const index = mocks.recipes.findIndex(r => r.id === id);
    mocks.recipes[index] = { ...mocks.recipes[index], ...data }; return mocks.recipes[index];
  });
});
afterEach(cleanup);
function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><TooltipProvider><RecipesPage /></TooltipProvider></QueryClientProvider>);
}
const facts = { basis: 'recipeTotal' as const, nutrients: { ...emptyNutrition(), calories: 992, protein: 80 }, source: 'NHLBI', sourceLabel: 'Official 248 calories per serving', missingNutrients: ['vitaminD'] };

describe('normal recipe authoring with published facts', () => {
  it('creates a normal recipe and saves custom whole totals/description without adding a surrogate food', async () => {
    const user = userEvent.setup(); mount();
    const name = screen.getByPlaceholderText('New recipe name...');
    await user.type(name, 'Chicken{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Edit description and nutrition' }));
    await user.type(screen.getByLabelText('Recipe description'), 'Chef notes');
    await user.click(screen.getByLabelText('Use custom recipe nutrition'));
    await user.type(screen.getByLabelText('Nutrition source'), 'NHLBI');
    await user.type(screen.getByLabelText('Calories (kcal), whole recipe'), '992');
    await user.click(screen.getByRole('button', { name: 'Save description and nutrition' }));
    await waitFor(() => expect(mocks.recipes[0].customNutrition?.nutrients.calories).toBe(992));
    expect(mocks.recipes[0].ingredients).toEqual([]);
    expect(await screen.findByText('248')).toBeInTheDocument();
    expect(screen.getByText(/0 ingredients · 4 servings · 992 cal total/)).toBeInTheDocument();
    expect(screen.getByText('Vitamin D').closest('div')).toHaveTextContent('Not reported');
  });

  it('scales full official totals, not just ingredient amounts, while preserving metadata and explicit intent', async () => {
    const user = userEvent.setup();
    mocks.recipes.push({ id: 'published', name: 'Published chicken', description: 'Chef notes', servings: 4, servingName: '3 chicken strips, ¼ cup sauce', customNutrition: facts, instructions: null, ingredientGroups: [], createdAt: '', updatedAt: '', ingredients: [{ ...emptyNutrition(), id: 'descriptive', recipeId: 'published', fdcId: 0, name: 'Chicken breast', amount: 1, unit: 'lb', description: '', groupId: null, linkedRecipeId: null, prepInstructions: [], position: 0, zeroNutritionOverride: false }] });
    mount();
    await user.click(await screen.findByText('Published chicken'));
    await user.click(screen.getByText('Scale full recipe'));
    await user.click(screen.getByRole('button', { name: 'Multiplier' }));
    await user.click(screen.getByRole('button', { name: '2x' }));
    await user.click(screen.getByRole('button', { name: 'Apply Scale' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('published', expect.objectContaining({ servings: 8, customNutrition: { ...facts, nutrients: { ...emptyNutrition(), calories: 1984, protein: 160 } }, ingredients: [expect.objectContaining({ amount: 2, zeroNutritionOverride: false })] })));
    expect(mocks.recipes[0].description).toBe('Chef notes');
    expect(await screen.findByText('248')).toBeInTheDocument();
  });

  it('shows linked-child missing nutrients after a fresh parent API read without needing the child in cache', async () => {
    const user = userEvent.setup();
    mocks.recipes.push({ id: 'parent', name: 'Parent recipe', servings: 2, servingName: 'serving', instructions: null, ingredientGroups: [], createdAt: '', updatedAt: '', ingredients: [{ ...emptyNutrition(), calories: 496, id: 'linked', recipeId: 'parent', fdcId: -1, name: 'Published chicken', amount: 0.5, unit: '× recipe', description: '', groupId: null, linkedRecipeId: 'child-not-in-cache', prepInstructions: [], missingNutrients: ['vitaminD'] }] });
    mount();
    await user.click(await screen.findByText('Parent recipe'));
    expect(await screen.findByText('248')).toBeInTheDocument();
    const vitaminD = screen.getByText('Vitamin D').closest('div')!;
    expect(vitaminD).toHaveTextContent('Not reported');
    expect(vitaminD).not.toHaveTextContent('0mcg');
    expect(vitaminD).not.toHaveTextContent('0%');
  });

  it('resets an open editor when selecting a different recipe', async () => {
    const user = userEvent.setup();
    await mocks.create('One'); await mocks.create('Two'); mount();
    await user.click(await screen.findByText('One'));
    await user.click(screen.getByRole('button', { name: 'Edit description and nutrition' }));
    fireEvent.change(screen.getByLabelText('Recipe description'), { target: { value: 'Do not leak this draft' } });
    await user.click(screen.getByText('Two'));
    expect(screen.queryByLabelText('Recipe description')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit description and nutrition' }));
    expect(screen.getByLabelText('Recipe description')).toHaveValue('');
  });
});
