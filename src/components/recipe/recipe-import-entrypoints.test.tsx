import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BreadcrumbProvider } from '@/components/breadcrumb-context';
import RecipesPage from '@/app/(app)/recipes/page';
import BooksPage from '@/app/(app)/books/page';
import SettingsPage from '@/app/(app)/settings/page';
import AppNav from '@/components/app-nav';
import CommunityPage from '@/app/(app)/community/page';
import SharePage from '@/app/(app)/share/[shareId]/page';

const mocks = vi.hoisted(() => ({ importBundle: vi.fn(), decision: vi.fn(), create: vi.fn(), update: vi.fn(), add: vi.fn(), navigate: vi.fn(), admin: false }));
const shared = { id: 'share-id', title: 'Shared soup', recipeData: JSON.stringify({ name: 'Shared soup', servings: 2, ingredients: [{ id: 'missing', name: 'Unknown food', amount: 1, unit: 'g', calories: 5 }], instructionSteps: [{ id: 'step', text: 'Stir' }] }), authorName: 'Cook', categories: [] };
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useParams: () => ({ shareId: 'share-id' }), useRouter: () => ({ push: mocks.navigate, replace: mocks.navigate }), usePathname: () => '/recipes' }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'owner', email: 'owner@test', isAdmin: mocks.admin }, isAuthenticated: true, logout: vi.fn() }) }));
vi.mock('@/lib/api-client', () => {
  const api = new Proxy({
    importRecipeBundle: mocks.importBundle, decideRecipeImport: mocks.decision,
    createRecipe: mocks.create, updateRecipe: mocks.update, addIngredient: mocks.add,
    getRecipes: async () => ({ data: [], totalPages: 1 }),
    getSharedRecipe: async () => shared, searchCommunity: async () => [shared],
  }, { get(target, key) { return key in target ? target[key as keyof typeof target] : async () => []; } });
  return { getApiClient: () => api };
});
vi.mock('@/hooks/use-secrets', () => ({ useFDAKey: () => ({ data: 'DEMO_KEY' }), useSetFDAKey: () => ({}), useSecrets: () => ({ data: [] }), useCreateSecret: () => ({}), useDeleteSecret: () => ({}) }));
vi.mock('@/hooks/use-app-theme', () => ({ useAppTheme: () => ({ themes: [], themeId: 'default', mounted: false }) }));
vi.mock('@/hooks/use-instance', () => ({ useInstanceState: () => ({}), useSetRegistrationEnabled: () => ({}) }));
vi.mock('@/hooks/use-settings', () => ({ useAppSettings: () => ({}), useUpdateSingleSlotTime: () => ({}), useUpdateSettings: () => ({}) }));
vi.mock('@/components/food-database-panel', () => ({ default: () => null }));
vi.mock('@/components/categories-panel', () => ({ default: () => null }));
vi.mock('@/components/pantry-staples-panel', () => ({ default: () => null }));
vi.mock('@/components/custom-foods-panel', () => ({ default: () => null }));
vi.mock('@/components/location-panel', () => ({ default: () => null }));
vi.mock('@/components/nutrition/log-weight-dialog', () => ({ LogWeightDialog: () => null }));
const summary = { created: { recipes: 1 }, updated: {}, reused: {}, skipped: {}, conflicts: [], quarantined: 2, promotedRecipeIds: ['main'] };
const entries = { Recipes: RecipesPage, Books: BooksPage, Settings: SettingsPage, AppNav };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.importBundle.mockResolvedValue({ ...summary, requiresDecision: true, pendingImportId: 'incoming' });
  mocks.decision.mockResolvedValue(summary);
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);
function mount(Component: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TooltipProvider><BreadcrumbProvider><Component /></BreadcrumbProvider></TooltipProvider></QueryClientProvider>);
}
function inputFile(input: HTMLInputElement, name: string, text: string) {
  const file = new File([text], name, { type: name.endsWith('.md') ? 'text/markdown' : 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => text });
  fireEvent.change(input, { target: { files: [file] } });
}
describe('actual native file import controls', () => {
  it.each(Object.keys(entries) as Array<keyof typeof entries>)('%s waits for shared decision and reports mixed batch quarantine count/link', async entry => {
    const user = userEvent.setup();
    mocks.admin = entry === 'Settings';
    const { container } = mount(entries[entry]);
    if (entry === 'AppNav') { await user.click(screen.getByTitle('Settings')); await user.click(screen.getByRole('tab', { name: 'Data' })); }
    if (entry === 'Settings') fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    const input = (container.querySelector('input[type="file"][accept*="json"]') ?? document.querySelector('input[type="file"][accept*="json"]')) as HTMLInputElement;
    expect(input).toBeTruthy();
    inputFile(input, 'recipes.json', JSON.stringify({ format: 'dietledger.recipe-bundle', version: 2, recipes: [] }));
    expect(await screen.findByRole('dialog', { name: 'Missing food records' })).toBeInTheDocument();
    expect(mocks.decision).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Relink later' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Missing food records' })).not.toBeInTheDocument());
    expect(await screen.findByText(/2 quarantined/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /quarantine/i }).some(link => link.getAttribute('href') === '/recipes/quarantine')).toBe(true);
  });
});

it('actual Markdown entrypoint sends all unmatched rows atomically through staging, not create/update/add', async () => {
  const user = userEvent.setup();
  const { container } = mount(RecipesPage);
  inputFile(container.querySelector('input[accept*=".md"]')!, 'soup.md', '# Soup\n## Ingredients\n- 100 g Mystery vegetable\n- 50 g Water\n## Directions\n1. Stir.');
  await user.click(await screen.findByRole('button', { name: 'Save all changes' }));
  await waitFor(() => expect(mocks.importBundle).toHaveBeenCalled());
  const bundle = mocks.importBundle.mock.calls[0][0];
  expect(bundle.recipes[0].ingredients).toHaveLength(2);
  expect(bundle.recipes[0].instructions).toContain('Stir.');
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.add).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'Relink later' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save all changes' })).not.toBeInTheDocument());
  expect(screen.getByText(/2 quarantined/)).toBeInTheDocument();
});

it('shows failed Markdown staging inside the open draft and retries the same complete bundle', async () => {
  mocks.importBundle.mockRejectedValueOnce(new Error('Staging unavailable'));
  const user = userEvent.setup();
  const { container } = mount(RecipesPage);
  inputFile(container.querySelector('input[accept*=".md"]')!, 'retry.md', '# Retry soup\n## Ingredients\n- 1 g Mystery');
  await user.click(await screen.findByRole('button', { name: 'Save all changes' }));
  const dialog = screen.getByRole('dialog', { name: /Import recipe/ });
  await waitFor(() => expect(dialog.querySelector('[role="alert"]')).toHaveTextContent('Staging unavailable'));
  const firstBundle = mocks.importBundle.mock.calls[0][0];
  await user.click(screen.getByRole('button', { name: 'Save all changes' }));
  await screen.findByRole('dialog', { name: 'Missing food records' });
  expect(mocks.importBundle.mock.calls[1][0].recipes).toEqual(firstBundle.recipes);
  expect(mocks.create).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Stop and undo' }));
  await waitFor(() => expect(mocks.decision).toHaveBeenCalledWith('incoming', 'cancel'));
});

it.each([['Community', CommunityPage], ['Share', SharePage]] as const)('%s imports the complete shared snapshot through staging, never a title-only/main-table write', async (_entry, Component) => {
  const user = userEvent.setup();
  mount(Component);
  const button = await screen.findByRole('button', { name: /^Import(?: to My Recipes)?$/i });
  await user.click(button);
  await waitFor(() => expect(mocks.importBundle).toHaveBeenCalled());
  expect(mocks.importBundle.mock.calls[0][0].recipes[0].ingredients).toHaveLength(1);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(await screen.findByRole('dialog', { name: 'Missing food records' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Relink later' }));
  await waitFor(() => expect(mocks.decision).toHaveBeenCalledWith('incoming', 'keep'));
});
