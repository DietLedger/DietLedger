import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import SettingsPage from '@/app/(app)/settings/page';
import AppNav from './app-nav';
import { queryKeys } from '@/lib/query-keys';

const mocks = vi.hoisted(() => ({
  admin: true, reset: vi.fn(), deleteMyData: vi.fn(), logout: vi.fn(),
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), reload: vi.fn(),
  recipes: vi.fn(), books: vi.fn(), secrets: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
  usePathname: () => '/recipes',
}));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({
  user: { id: 'owner', isAdmin: mocks.admin, email: 'owner@example.test' }, logout: mocks.logout,
}) }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({
  resetUserData: mocks.reset, deleteMyData: mocks.deleteMyData,
  getRecipes: mocks.recipes, getBooks: mocks.books, getSecrets: mocks.secrets,
}) }));
vi.mock('@/hooks/use-app-theme', () => ({ useAppTheme: () => ({ themes: [], themeId: 'default', mounted: false }) }));
vi.mock('@/hooks/use-instance', () => ({ useInstanceState: () => ({}), useSetRegistrationEnabled: () => ({}) }));
vi.mock('@/hooks/use-settings', () => ({ useAppSettings: () => ({}), useUpdateSingleSlotTime: () => ({}), useUpdateSettings: () => ({}) }));
vi.mock('@/components/food-database-panel', () => ({ default: () => null }));
vi.mock('@/components/categories-panel', () => ({ default: () => null }));
vi.mock('@/components/pantry-staples-panel', () => ({ default: () => null }));
vi.mock('@/components/custom-foods-panel', () => ({ default: () => null }));
vi.mock('@/components/location-panel', () => ({ default: () => null }));
vi.mock('@/components/nutrition/log-weight-dialog', () => ({ LogWeightDialog: () => null }));

const resetLabel = 'Reset all custom data';
const staleRecipe = { id: 'old-recipe', name: 'Old recipe', instructions: '', ingredients: [] };
const staleBook = { id: 'old-book', title: 'Old book' };
const inactiveKeys = [
  queryKeys.recipes.detail('old-recipe'), queryKeys.books.detail('old-book'),
  queryKeys.categories.list(), queryKeys.customFoods.lists(), queryKeys.templates.lists(),
  queryKeys.recipeImports.all, queryKeys.pantryStaples.list(), queryKeys.mealPlans.lists(),
  queryKeys.nutrition.profiles.all(), queryKeys.location.all, ['food-storage-defaults'],
];
let clients: QueryClient[];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin = true;
  mocks.reset.mockResolvedValue(undefined);
  mocks.deleteMyData.mockResolvedValue(undefined);
  mocks.recipes.mockResolvedValue({ data: [], totalPages: 1 });
  mocks.books.mockResolvedValue([]);
  mocks.secrets.mockResolvedValue([]);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
  // jsdom's Location is non-configurable. Intercept only the global window's location access.
  const realWindow = window;
  vi.stubGlobal('window', new Proxy(realWindow, {
    get(target, key) {
      return key === 'location' ? { reload: mocks.reload } : Reflect.get(target, key);
    },
  }));
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  clients = [];
});
afterEach(() => {
  cleanup();
  clients.forEach(client => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(Component: React.ComponentType = SettingsPage) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(queryKeys.recipes.lists(), [staleRecipe]);
  client.setQueryData(queryKeys.books.lists(), [staleBook]);
  inactiveKeys.forEach(key => client.setQueryData(key, ['stale custom data']));
  render(<QueryClientProvider client={client}><TooltipProvider><Component /></TooltipProvider></QueryClientProvider>);
  return client;
}

function expectScopeWarning(element: HTMLElement) {
  expect(element).toHaveTextContent(/across every user/i);
  for (const kind of ['recipes', 'books', 'custom foods', 'categories', 'templates', 'import history', 'staged imports']) {
    expect(element).toHaveTextContent(new RegExp(kind, 'i'));
  }
  expect(element).toHaveTextContent(/accounts, settings, and imported standard nutrition databases are preserved/i);
  expect(element).toHaveTextContent(/cannot be undone/i);
}

async function openAdminReset(viaData = false) {
  const client = mount();
  const user = userEvent.setup();
  if (viaData) {
    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    await user.click(screen.getByRole('button', { name: resetLabel }));
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));
  }
  await user.click(screen.getByRole('button', { name: resetLabel }));
  const dialog = screen.getByRole('alertdialog', { name: `${resetLabel}?` });
  return {
    client, user, dialog,
    password: within(dialog).getByLabelText('Admin password'),
    confirm: within(dialog).getByRole('button', { name: resetLabel }),
  };
}

function expectNoNavigation() {
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.reload).not.toHaveBeenCalled();
}

describe('administrator complete custom-data reset', () => {
  it('routes the admin cog to Settings without exposing a duplicate popup action', async () => {
    mount(AppNav);
    await userEvent.setup().click(screen.getByTitle('Settings'));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/settings');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.deleteMyData).not.toHaveBeenCalled();
  });

  it('replaces the personal Data shortcut with navigation to the existing global control and identical warnings', async () => {
    mount();
    const user = userEvent.setup();
    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.queryByText('Delete my data')).not.toBeInTheDocument();
    const shortcut = screen.getByRole('button', { name: resetLabel });
    const description = screen.getByText(/Permanently deletes all custom data across every user/i);
    expectScopeWarning(description);
    const warning = description.textContent;
    await user.click(shortcut);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: resetLabel })).toHaveLength(1);
    expect(screen.getByText(warning!)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: resetLabel }));
    const dialog = screen.getByRole('alertdialog', { name: `${resetLabel}?` });
    expectScopeWarning(dialog);
    expect(within(dialog).getByText(warning!)).toBeInTheDocument();
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.deleteMyData).not.toHaveBeenCalled();
  });

  it('requires a password and cancels without deleting or changing cached data', async () => {
    const { client, user, dialog, password, confirm } = await openAdminReset();
    expect(confirm).toBeDisabled();
    fireEvent.keyDown(password, { key: 'Enter' });
    expect(within(dialog).getByText('Enter your password.')).toBeInTheDocument();
    await user.type(password, 'cancelled-password');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(client.getQueryData(queryKeys.recipes.lists())).toEqual([staleRecipe]);
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.deleteMyData).not.toHaveBeenCalled();
    expectNoNavigation();
  });

  it.each(['Incorrect password', 'Reset failed; transaction rolled back'])('retains the dialog and all cached data on %s', async message => {
    mocks.reset.mockRejectedValue(new Error(message));
    const { client, user, dialog, password, confirm } = await openAdminReset(true);
    await user.type(password, 'wrong-password');
    await user.click(confirm);
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(mocks.reset).toHaveBeenCalledExactlyOnceWith('wrong-password');
    expect(mocks.deleteMyData).not.toHaveBeenCalled();
    expect(password).toHaveValue('wrong-password');
    expect(password).toBeEnabled();
    expect(confirm).toBeEnabled();
    expect(client.getQueryData(queryKeys.recipes.lists())).toEqual([staleRecipe]);
    expect(client.getQueryData(queryKeys.books.lists())).toEqual([staleBook]);
    inactiveKeys.forEach(key => expect(client.getQueryData(key)).toEqual(['stale custom data']));
    expect(mocks.recipes).not.toHaveBeenCalled();
    expect(mocks.books).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expectNoNavigation();
  });

  it('waits for successful reset, discards inactive custom data and refetches active library queries without signing out', async () => {
    let resolve!: () => void;
    mocks.reset.mockReturnValue(new Promise<void>(done => { resolve = done; }));
    const { client, user, password, confirm } = await openAdminReset(true);
    await user.type(password, 'admin-secret');
    await user.click(confirm);
    expect(mocks.reset).toHaveBeenCalledExactlyOnceWith('admin-secret');
    expect(confirm).toBeDisabled();
    expect(password).toBeDisabled();
    expect(client.getQueryData(queryKeys.recipes.lists())).toEqual([staleRecipe]);
    expect(mocks.recipes).not.toHaveBeenCalled();
    await act(async () => { resolve(); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mocks.recipes).toHaveBeenCalled();
    expect(mocks.books).toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.recipes.lists())).toEqual([]);
    expect(client.getQueryData(queryKeys.books.lists())).toEqual([]);
    inactiveKeys.forEach(key => expect(client.getQueryData(key)).toBeUndefined());
    expect(screen.getByRole('status')).toHaveTextContent(/all custom data across every user has been reset/i);
    expect(mocks.deleteMyData).not.toHaveBeenCalled();
    expectNoNavigation();
    await user.click(screen.getByRole('button', { name: resetLabel }));
    expect(screen.getByLabelText('Admin password')).toHaveValue('');
  });

  it('clears the locally loaded developer key inventory after success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ data: [{
      id: 'deleted-key', name: 'Old developer key', keyPrefix: 'dl-old', permissions: {}, createdAt: '2026-01-01',
    }] }) } as Response);
    mount();
    const user = userEvent.setup();
    fireEvent.click(screen.getByRole('button', { name: 'API Keys' }));
    expect(await screen.findByText('Old developer key')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));
    await user.click(screen.getByRole('button', { name: resetLabel }));
    const dialog = screen.getByRole('alertdialog');
    await user.type(within(dialog).getByLabelText('Admin password'), 'admin-secret');
    await user.click(within(dialog).getByRole('button', { name: resetLabel }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'API Keys' }));
    expect(screen.queryByText('Old developer key')).not.toBeInTheDocument();
    expect(screen.getByText('Existing keys cannot authenticate; revoke them below. New key issuance is disabled until scoped authentication is supported.')).toBeInTheDocument();
  });
});

describe('non-administrator personal reset boundary', () => {
  beforeEach(() => { mocks.admin = false; });

  it('redirects direct Settings access without rendering global reset controls', async () => {
    mount();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'));
    expect(screen.getByText('Administrator access required.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  async function openPersonalReset() {
    const client = mount(AppNav);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('Settings'));
    await user.click(screen.getByRole('tab', { name: 'Data' }));
    expect(screen.queryByRole('button', { name: resetLabel })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete data' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete all your data?' });
    expect(dialog).toHaveTextContent(/your account and settings remain/i);
    return { client, user, dialog, password: within(dialog).getByPlaceholderText('Your password'), confirm: within(dialog).getByRole('button', { name: 'Delete data' }) };
  }

  it('keeps personal deletion password-gated and retains state on failure, never calling the instance API', async () => {
    mocks.deleteMyData.mockRejectedValue(new Error('Personal deletion failed'));
    const { client, user, dialog, password, confirm } = await openPersonalReset();
    expect(confirm).toBeDisabled();
    fireEvent.keyDown(password, { key: 'Enter' });
    expect(within(dialog).getByText('Enter your password.')).toBeInTheDocument();
    expect(mocks.deleteMyData).not.toHaveBeenCalled();
    await user.type(password, 'personal-password');
    await user.click(confirm);
    expect(await within(dialog).findByText('Personal deletion failed')).toBeInTheDocument();
    expect(mocks.deleteMyData).toHaveBeenCalledExactlyOnceWith('personal-password');
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.recipes.lists())).toEqual([staleRecipe]);
    expect(password).toHaveValue('personal-password');
    expect(confirm).toBeEnabled();
    expectNoNavigation();
  });

  it('retains the existing caller-scoped success path and reloads only after personal deletion succeeds', async () => {
    const { user, password, confirm } = await openPersonalReset();
    await user.type(password, 'personal-password');
    await user.click(confirm);
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expect(mocks.deleteMyData).toHaveBeenCalledExactlyOnceWith('personal-password');
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
