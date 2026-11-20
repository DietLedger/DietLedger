import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import AppNav from './app-nav';
import SettingsPage from '@/app/(app)/settings/page';
import type { RecipeBundle } from '@/lib/api-client';
import { THEMES } from '@/lib/themes';

const mocks = vi.hoisted(() => ({
  backup: vi.fn(), selectedExport: vi.fn(), deleteAccount: vi.fn(), logout: vi.fn(), replace: vi.fn(),
  listUsers: vi.fn(), admin: false, themeId: 'olive-botanical', themeMounted: false, isDark: false, appearance: 'light', setAppearance: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: vi.fn() }), usePathname: () => '/recipes' }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'owner', isAdmin: mocks.admin, email: 'owner@example.test' }, logout: mocks.logout }) }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({
  exportOwnerRecipeBookBackup: mocks.backup, exportRecipeBundle: mocks.selectedExport,
  deleteMyAccount: mocks.deleteAccount, listUsers: mocks.listUsers,
}) }));
// Deliberately empty discovery caches: neither deletion entry point may use these as backup selections.
vi.mock('@/hooks/use-recipes', () => ({ useRecipes: () => ({ data: [] }) }));
vi.mock('@/hooks/use-books', () => ({ useBooks: () => ({ data: [] }) }));
vi.mock('@/hooks/use-secrets', () => ({
  useFDAKey: () => ({ data: 'DEMO_KEY' }), useSetFDAKey: () => ({}), useSecrets: () => ({ data: [] }),
  useCreateSecret: () => ({}), useDeleteSecret: () => ({}),
}));
vi.mock('@/hooks/use-app-theme', () => ({ useAppTheme: () => ({ themes: THEMES, themeId: mocks.themeId, mounted: mocks.themeMounted, isDark: mocks.isDark, appearance: mocks.appearance, setAppearance: mocks.setAppearance }) }));
vi.mock('@/hooks/use-instance', () => ({ useInstanceState: () => ({}), useSetRegistrationEnabled: () => ({}) }));
vi.mock('@/hooks/use-settings', () => ({ useAppSettings: () => ({}), useUpdateSingleSlotTime: () => ({}), useUpdateSettings: () => ({}) }));
vi.mock('@/components/food-database-panel', () => ({ default: () => null }));
vi.mock('@/components/categories-panel', () => ({ default: () => null }));
vi.mock('@/components/pantry-staples-panel', () => ({ default: () => null }));
vi.mock('@/components/custom-foods-panel', () => ({ default: () => null }));
vi.mock('@/components/location-panel', () => ({ default: () => null }));
vi.mock('@/components/nutrition/log-weight-dialog', () => ({ LogWeightDialog: () => null }));

describe('AppNav theme icon', () => {
  afterEach(cleanup);

  it('uses the original icon for light appearances and a subdued icon for dark appearances', () => {
    mocks.themeId = 'dark-luxury';
    mocks.themeMounted = false;
    mocks.isDark = true;
    const queryClient = new QueryClient();
    const nav = () => <QueryClientProvider client={queryClient}><TooltipProvider><AppNav /></TooltipProvider></QueryClientProvider>;
    const { rerender } = render(nav());
    expect(screen.getByRole('img', { name: 'DietLedger' })).toHaveAttribute('src', '/logo.svg');
    mocks.themeMounted = true;
    rerender(nav());
    expect(screen.getByRole('img', { name: 'DietLedger' })).toHaveAttribute('src', '/logo-dark-luxury.svg');
    for (const theme of ['olive-botanical', 'vintage-teal']) {
      mocks.themeId = theme;
      mocks.isDark = true;
      rerender(nav());
      expect(screen.getByRole('img', { name: 'DietLedger' })).toHaveAttribute('src', '/logo-dark-luxury.svg');
      mocks.isDark = false;
      rerender(nav());
      expect(screen.getByRole('img', { name: 'DietLedger' })).toHaveAttribute('src', '/logo.svg');
    }
  });

  it('lets non-admin users select the dark appearance in the settings popup', async () => {
    mocks.admin = false;
    mocks.themeId = 'olive-botanical';
    mocks.themeMounted = true;
    mocks.isDark = false;
    mocks.appearance = 'light';
    mocks.setAppearance.mockClear();
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
    const queryClient = new QueryClient();
    render(<QueryClientProvider client={queryClient}><TooltipProvider><AppNav /></TooltipProvider></QueryClientProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('Settings'));
    await user.click(screen.getByRole('combobox', { name: 'Color appearance' }));
    await user.click(screen.getByRole('option', { name: 'Dark' }));
    expect(mocks.setAppearance).toHaveBeenCalledWith('dark');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// These tests render both real deletion entry points, real confirmation dialogs and the real
// JSON/Blob/download builder. Only network/auth/navigation and browser download effects are mocked.
describe.each(['Settings', 'AppNav'] as const)('%s owner-backup deletion safeguard', (entry) => {
  let clickDownload: ReturnType<typeof vi.spyOn>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  const bundle = {
    format: 'dietledger.recipe-bundle', version: 2,
    recipes: [{ id: 'not-in-discovery', name: 'Unresolved draft' }], books: [{ id: 'owned-book' }],
  } as unknown as RecipeBundle;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin = entry === 'Settings';
    mocks.backup.mockReset().mockResolvedValue(bundle);
    mocks.selectedExport.mockReset().mockResolvedValue({ recipes: [], books: [] });
    mocks.deleteAccount.mockReset().mockResolvedValue(undefined);
    mocks.listUsers.mockResolvedValue([
      { id: 'owner', isAdmin: true }, { id: 'other-admin', isAdmin: true },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    createObjectURL = vi.fn().mockReturnValue('blob:owner-backup');
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL: vi.fn() }));
    clickDownload = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function openDelete() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><TooltipProvider>
      {entry === 'Settings' ? <SettingsPage /> : <AppNav />}
    </TooltipProvider></QueryClientProvider>);
    const user = userEvent.setup();
    if (entry === 'AppNav') {
      await user.click(screen.getByTitle('Settings'));
      await user.click(screen.getByRole('tab', { name: 'Data' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    }
    await user.click(screen.getByRole('button', { name: /Delete account/ }));
    const dialog = screen.getByRole(entry === 'Settings' ? 'dialog' : 'alertdialog');
    if (entry === 'Settings') await waitFor(() => expect(mocks.listUsers).toHaveBeenCalled());
    const password = dialog.querySelector<HTMLInputElement>('input[type="password"]')!;
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' });
    return { user, dialog, password, confirm };
  }

  it('awaits server backup, constructs/initiates a native download, then deletes, signs out and navigates', async () => {
    const backup = deferred<RecipeBundle>();
    const deletion = deferred<void>();
    mocks.backup.mockReturnValue(backup.promise);
    mocks.deleteAccount.mockReturnValue(deletion.promise);
    const { user, password, confirm } = await openDelete();
    await user.type(password, 'secret');
    await user.click(confirm);
    await waitFor(() => expect(mocks.backup).toHaveBeenCalledExactlyOnceWith());
    expect(confirm).toBeDisabled();
    expect(password).toBeDisabled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
    expect(mocks.logout).not.toHaveBeenCalled();
    await act(async () => { backup.resolve(bundle); });
    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledWith(...(entry === 'Settings' ? ['secret', undefined] : ['secret'])));
    expect(mocks.selectedExport).not.toHaveBeenCalled();
    expect(confirm).toBeDisabled();
    expect(password).toBeDisabled();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const downloadedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(downloadedBlob.type).toBe('application/json');
    const downloadedJson = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(downloadedBlob);
    });
    expect(JSON.parse(downloadedJson)).toEqual(bundle);
    expect(clickDownload).toHaveBeenCalledOnce();
    const anchor = clickDownload.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^dietledger-recipes-\d{4}-\d{2}-\d{2}\.dietledger-bundle\.json$/);
    expect(clickDownload.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteAccount.mock.invocationCallOrder[0]);
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => { deletion.resolve(); });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'));
    expect(mocks.deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(mocks.logout.mock.invocationCallOrder[0]);
    expect(mocks.logout.mock.invocationCallOrder[0]).toBeLessThan(mocks.replace.mock.invocationCallOrder[0]);
  });

  it.each(['backup', 'JSON serialization', 'Blob construction', 'object URL construction', 'download initiation', 'deletion'] as const)(
    'stops on %s failure, retains password and reports the error with busy state cleared', async (stage) => {
      const failure = new Error(`${stage} failed`);
      if (stage === 'backup') mocks.backup.mockRejectedValue(failure);
      if (stage === 'JSON serialization') mocks.backup.mockResolvedValue({ ...bundle, toJSON: () => { throw failure; } });
      if (stage === 'Blob construction') vi.stubGlobal('Blob', class { constructor() { throw failure; } });
      if (stage === 'object URL construction') createObjectURL.mockImplementation(() => { throw failure; });
      if (stage === 'download initiation') clickDownload.mockImplementation(() => { throw failure; });
      if (stage === 'deletion') mocks.deleteAccount.mockRejectedValue(failure);
      const { user, dialog, password, confirm } = await openDelete();
      await user.type(password, 'secret');
      await user.click(confirm);
      expect(await within(dialog).findByText(failure.message)).toBeInTheDocument();
      expect(password).toHaveValue('secret');
      expect(password).toBeEnabled();
      expect(confirm).toBeEnabled();
      expect(mocks.backup).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.selectedExport).not.toHaveBeenCalled();
      if (stage !== 'deletion') expect(mocks.deleteAccount).not.toHaveBeenCalled();
      expect(mocks.logout).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    },
  );

  it('reports missing-password validation without requesting backup, deletion or sign-out', async () => {
    const { confirm, user, dialog, password } = await openDelete();
    if (entry === 'AppNav') expect(confirm).toBeDisabled();
    await user.click(confirm);
    fireEvent.keyDown(password, { key: 'Enter' });
    expect(await within(dialog).findByText('Enter your password.')).toBeInTheDocument();
    expect(password).toBeEnabled();
    expect(mocks.backup).not.toHaveBeenCalled();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('describes a recipe/book JSON backup, not full-account coverage or a guaranteed disk save', async () => {
    const { dialog } = await openDelete();
    expect(dialog).toHaveTextContent(/recipe\/book.*JSON/i);
    expect(dialog).toHaveTextContent(/not a full.account backup/i);
    expect(dialog).toHaveTextContent(/browser cannot confirm.*saved to disk/i);
    expect(dialog).not.toHaveTextContent(/backup zip/i);
  });

  if (entry === 'Settings') {
    it('requires and forwards a successor when the owner is the only administrator', async () => {
      mocks.listUsers.mockResolvedValue([{ id: 'owner', isAdmin: true }, { id: 'successor', isAdmin: false, displayName: 'Next admin' }]);
      const { dialog, user, password, confirm } = await openDelete();
      await user.type(password, 'secret');
      await user.click(confirm);
      expect(await within(dialog).findByText(/choose a successor/i)).toBeInTheDocument();
      expect(mocks.backup).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'Next admin' }));
      await user.click(confirm);
      await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledWith('secret', 'successor'));
      expect(mocks.backup).toHaveBeenCalledExactlyOnceWith();
    });
  }
});
