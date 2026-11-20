import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { queryKeys } from '@/lib/query-keys';
import { retireSession, setAccessToken } from '@/lib/auth-session';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import RecipesPage from '@/app/(app)/recipes/page';
import { useDietarySelection } from '@/lib/dietary-selection';
import { emptyNutrition } from '@/lib/recipe-types';
import type { DietaryRecipeAssessment, RecipeRecord } from '@/lib/types';

const mocks = vi.hoisted(() => ({ assess: vi.fn(), list: vi.fn(), profiles: vi.fn(), restore: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'owner' }, isAuthenticated: true }) }));
const starter = { id: 'diabetes', name: 'Diabetes-aware', allergens: [], dietaryTags: ['diabetesAware'], nutrientThresholds: [{ nutrient: 'dietaryFiber', per1000KcalMin: 14, alertLevel: 'warning' }], isActive: false, createdAt: '', updatedAt: '' };
const recipes: RecipeRecord[] = ['Bean bowl', 'Plain rice', 'Unknown facts'].map((name, i) => ({ id: String(i), name, servings: 2, servingName: 'serving', instructions: null, ingredientGroups: [], ingredients: [{ ...emptyNutrition(), calories: 400, dietaryFiber: 6, id: `ingredient-${i}`, recipeId: String(i), name: 'beans', amount: 100, unit: 'g', fdcId: 123, description: '', groupId: null, linkedRecipeId: null, prepInstructions: [] }], createdAt: '', updatedAt: '' }));
vi.mock('@/lib/api-client', () => {
  const api = new Proxy({
    getRecipes: mocks.list,
    getRecipe: async (id: string) => recipes.find(r => r.id === id),
    getDietaryProfiles: mocks.profiles,
    restoreDiabetesAwareProfile: mocks.restore,
    getDietaryRecipeAssessments: mocks.assess,
  }, { get(target, key) { return key in target ? target[key as keyof typeof target] : async () => []; } });
  return { getApiClient: () => api };
});
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><TooltipProvider><RecipesPage /></TooltipProvider></QueryClientProvider>);
}
beforeEach(() => {
  retireSession(); setAccessToken('test-owner-session');
  useDietarySelection.setState({ activeProfileId: null });
  mocks.list.mockReset().mockResolvedValue({ data: recipes, totalPages: 1 });
  mocks.profiles.mockReset().mockResolvedValue([starter]);
  mocks.restore.mockReset().mockImplementation(async () => {
    mocks.profiles.mockResolvedValue([starter]);
    return starter;
  });
  mocks.assess.mockReset().mockResolvedValue([
    { recipeId: '0', status: 'match', reasons: [] },
    { recipeId: '1', status: 'noMatch', reasons: ['Fiber below configured minimum'] },
    { recipeId: '2', status: 'notAssessed', reasons: ['Fiber not reported'] },
  ]);
});
afterEach(() => { cleanup(); retireSession(); localStorage.clear(); });

describe('Diabetes-aware recipe library filter', () => {
  it('keeps Diabetic visible after reset and restores only on click, then assesses the editable starter', async () => {
    mocks.profiles.mockResolvedValue([]);
    const user = userEvent.setup(); mount();
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    const button = screen.getByRole('button', { name: 'Diabetic' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(mocks.restore).not.toHaveBeenCalled();
    await user.click(button);
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalledWith('diabetes'));
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByText('Plain rice')).not.toBeInTheDocument();
    expect(screen.getByText('Bean bowl')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(button);
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });
  it('deduplicates pending clicks and keeps restore failures visible outside collapsed controls, with retry', async () => {
    mocks.profiles.mockResolvedValue([]);
    let reject!: (error: Error) => void;
    mocks.restore.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const user = userEvent.setup(); mount();
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    const button = screen.getByRole('button', { name: 'Diabetic' });
    await user.dblClick(button);
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument();
    const filters = screen.getByRole('button', { name: /Dietary Filters/ }).parentElement!.parentElement!;
    expect(within(filters).queryByRole('status')).not.toBeInTheDocument();
    await act(async () => reject(new Error('Restore unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to restore/i);
    expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument();
    expect(screen.queryByText('Plain rice')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeVisible();
    expect(within(filters).queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Dietary Filters/ }));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(mocks.assess).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Dietary Filters/ }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalledWith('diabetes'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('keeps failed restore intent active until Clear, and ignores a late retry after Clear', async () => {
    mocks.profiles.mockResolvedValue([]);
    mocks.restore.mockRejectedValueOnce(new Error('Restore unavailable'));
    const user = userEvent.setup(); mount();
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to restore/i);
    expect(screen.queryByText('Plain rice')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Plain rice')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    let finish!: (profile: typeof starter) => void;
    mocks.restore.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Plain rice')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    mocks.profiles.mockResolvedValue([starter]);
    await act(async () => finish(starter));
    expect(screen.getByText('Plain rice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diabetic' })).toHaveAttribute('aria-pressed', 'false');
    expect(mocks.assess).not.toHaveBeenCalled();
  });
  it('does not select a restored profile after Clear cancels a pending filter request', async () => {
    mocks.profiles.mockResolvedValue([]);
    let finish!: (profile: typeof starter) => void;
    mocks.restore.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup(); mount();
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    mocks.profiles.mockResolvedValue([starter]);
    await act(async () => finish(starter));
    expect(screen.getByText('Plain rice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diabetic' })).toHaveAttribute('aria-pressed', 'false');
    expect(mocks.assess).not.toHaveBeenCalled();
  });
  it('does not enable filtering after a pending restore finishes following navigation', async () => {
    mocks.profiles.mockResolvedValue([]);
    let finish!: (profile: typeof starter) => void;
    mocks.restore.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    const view = mount(client);
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(1));
    view.unmount();
    mocks.profiles.mockResolvedValue([starter]);
    await act(async () => finish(starter));
    mount(client);
    expect(await screen.findByText('Plain rice')).toBeInTheDocument();
    expect(mocks.assess).not.toHaveBeenCalled();
    expect(mocks.restore).toHaveBeenCalledTimes(1);
  });
  it('fails closed when the profile refresh after a successful restore fails', async () => {
    mocks.profiles.mockResolvedValue([]);
    mocks.restore.mockImplementationOnce(async () => {
      mocks.profiles.mockRejectedValue(new Error('Profile refresh failed'));
      return starter;
    });
    const user = userEvent.setup(); mount();
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    expect(await screen.findByText(/Dietary profiles unavailable/)).toBeVisible();
    await waitFor(() => expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument());
    expect(screen.getByText(/Nutrition assessment unavailable/)).toBeVisible();
    const filters = screen.getByRole('button', { name: /Dietary Filters/ }).parentElement!.parentElement!;
    expect(within(filters).queryByRole('alert')).not.toBeInTheDocument();
  });
  it('reuses a renamed customized profile without restoring or submitting new thresholds', async () => {
    mocks.profiles.mockResolvedValue([{ ...starter, id: 'edited', name: 'My goals', nutrientThresholds: [{ nutrient: 'dietaryFiber', per1000KcalMin: 20, alertLevel: 'warning' }] }]);
    const user = userEvent.setup(); mount();
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalledWith('edited'));
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(screen.queryByText('My goals')).not.toBeInTheDocument();
  });
  it('is off by default, shows server-confirmed matches only, and clears back to the whole library', async () => {
    const user = userEvent.setup(); mount();
    await screen.findByText('Bean bowl');
    expect(screen.getByText('Plain rice')).toBeInTheDocument();
    expect(mocks.assess).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalledWith('diabetes'));
    await waitFor(() => expect(screen.queryByText('Plain rice')).not.toBeInTheDocument());
    expect(screen.getByText('Bean bowl')).toBeInTheDocument();
    expect(screen.queryByText('Unknown facts')).not.toBeInTheDocument();
    const filters = screen.getByRole('button', { name: /Dietary Filters/ }).parentElement!.parentElement!;
    expect(within(filters).queryByText(/not assessed|guidance and sources|certification/i)).not.toBeInTheDocument();
    expect(screen.getByText(/1 recipe.*not assessed/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Dietary Filters/ }));
    expect(screen.getByText(/1 recipe.*not assessed/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Plain rice')).toBeInTheDocument();
    expect(screen.getByText('Unknown facts')).toBeInTheDocument();
  });
  it.each(['recipes', 'profiles'] as const)('keeps cached matches hidden after a %s refetch fails', async source => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup(); mount(client);
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalled());
    expect(await screen.findByText('Bean bowl')).toBeInTheDocument();
    mocks[source === 'recipes' ? 'list' : 'profiles'].mockRejectedValue(new Error('Refresh failed after edit'));
    await act(async () => { await client.invalidateQueries({ queryKey: source === 'recipes' ? queryKeys.recipes.lists() : queryKeys.dietary.lists() }); });
    await waitFor(() => expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument());
    expect(screen.getByText(/Nutrition assessment unavailable/)).toBeInTheDocument();
  });
  it('keeps matches hidden if a selected profile disappears after a refresh', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup(); mount(client);
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalled());
    mocks.profiles.mockResolvedValue([]);
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.dietary.lists() }); });
    await waitFor(() => expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument());
    expect(screen.getByText(/Nutrition assessment unavailable/)).toBeInTheDocument();
    expect(mocks.restore).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Bean bowl')).toBeInTheDocument();
  });
  it('surfaces an initial invalid profile response even before any filter is selected', async () => {
    mocks.profiles.mockRejectedValue(new Error('Invalid dietary profile data from server'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Dietary profiles unavailable');
    expect(mocks.assess).not.toHaveBeenCalled();
  });
  it('hides matches while a changed profile is still loading, even if assessment returns first', async () => {
    mocks.list.mockResolvedValue({ data: recipes.map((recipe, i) => i === 0 ? { ...recipe, ingredients: [{ ...recipe.ingredients[0], name: 'peanut butter' }] } : recipe), totalPages: 1 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup(); mount(client);
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalled());
    expect(await screen.findByText('Bean bowl')).toBeInTheDocument();
    let finish!: (profiles: unknown[]) => void;
    mocks.profiles.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    act(() => { void client.invalidateQueries({ queryKey: queryKeys.dietary.lists() }); });
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.dietary.recipeAssessments() }); });
    await waitFor(() => expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument());
    await act(async () => { finish([{ ...starter, allergens: ['peanuts'] }]); });
    await waitFor(() => expect(screen.queryByText('Checking configured nutrition targets...')).not.toBeInTheDocument());
    expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument();
  });
  it('does not show matches while pending or after assessment failure', async () => {
    let reject!: (error: Error) => void;
    mocks.assess.mockImplementation(() => new Promise<DietaryRecipeAssessment[]>((_, rejectPromise) => { reject = rejectPromise; }));
    const user = userEvent.setup(); mount();
    await screen.findByText('Bean bowl');
    await user.click(screen.getByRole('button', { name: 'Dietary Filters' }));
    await user.click(screen.getByRole('button', { name: 'Diabetic' }));
    await waitFor(() => expect(mocks.assess).toHaveBeenCalled());
    expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument();
    const filters = screen.getByRole('button', { name: /Dietary Filters/ }).parentElement!.parentElement!;
    expect(within(filters).queryByText(/assessing nutrition/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Dietary Filters/ }));
    expect(screen.getByText(/Checking configured nutrition targets/)).toBeVisible();
    reject(new Error('Assessment unavailable'));
    expect(await screen.findByText(/assessment.*unavailable|unable to assess/i)).toBeVisible();
    expect(screen.queryByText('Bean bowl')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Bean bowl')).toBeInTheDocument();
  });
});
