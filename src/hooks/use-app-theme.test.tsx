import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppTheme } from './use-app-theme';
import { THEMES, THEME_STORAGE_KEY } from '@/lib/themes';
import { getAccessToken, setAccessToken, retireSession } from '@/lib/auth-session';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(), updateSettings: vi.fn(), dispatched: vi.fn(), resolvedTheme: 'light',
  auth: { isAuthenticated: true, user: { id: 'account-a' } as { id: string } | null },
}));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({
  getSettings: mocks.getSettings,
  updateSettings: (patch: Record<string, unknown>) => {
    mocks.dispatched(getAccessToken(), patch);
    return mocks.updateSettings(patch);
  },
}) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: mocks.resolvedTheme }) }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return { client, wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}

beforeEach(() => {
  localStorage.clear();
  retireSession(); setAccessToken('token-a');
  mocks.auth = { isAuthenticated: true, user: { id: 'account-a' } };
  mocks.dispatched.mockReset();
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-app-theme');
  document.documentElement.removeAttribute('data-app-appearance');
  document.documentElement.classList.remove('dark');
  mocks.resolvedTheme = 'light';
  mocks.getSettings.mockReset().mockResolvedValue({ unitSystem: 'metric' });
  mocks.updateSettings.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('application theme preferences', () => {
  it.each([undefined, 'unknown-palette'])('defaults to dark Luxury without treating %s as a palette choice', async (theme) => {
    mocks.getSettings.mockResolvedValue({ theme });
    const view = renderHook(useAppTheme, setup());
    await waitFor(() => expect(mocks.getSettings).toHaveBeenCalled());
    await waitFor(() => expect(view.result.current.mounted).toBe(true));
    expect(view.result.current.themeId).toBe('dark-luxury');
    expect(document.documentElement.style.getPropertyValue('--background')).toBe(THEMES.find(t => t.id === 'dark-luxury')!.dark['--background']);
    expect(document.documentElement.dataset.appAppearance).toBe('dark');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it.each(['light', 'dark'] as const)('honors a saved legacy %s appearance without treating it as a palette', async (theme) => {
    mocks.getSettings.mockResolvedValue({ theme });
    const view = renderHook(useAppTheme, setup());
    await waitFor(() => expect(view.result.current.appearance).toBe(theme));
    expect(view.result.current.themeId).toBe('dark-luxury');
    expect(view.result.current.isDark).toBe(theme === 'dark');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it.each(['vintage-teal', 'warm-library', 'dusty-rose', 'olive-botanical', 'slate-ink'])('preserves the existing local %s choice without writing settings on mount', async (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const view = renderHook(useAppTheme, setup());
    await waitFor(() => expect(view.result.current.mounted).toBe(true));
    expect(view.result.current.themeId).toBe(theme);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('treats an ambiguous old server-only Vintage Teal default as no palette choice', async () => {
    let resolve!: (settings: Record<string, unknown>) => void;
    mocks.getSettings.mockReturnValue(new Promise(res => { resolve = res; }));
    const { client, wrapper } = setup();
    const view = renderHook(useAppTheme, { wrapper });
    await waitFor(() => expect(mocks.getSettings).toHaveBeenCalled());
    await act(async () => resolve({ theme: 'vintage-teal' }));
    await waitFor(() => expect(client.getQueryData(['settings'])).toMatchObject({ theme: 'vintage-teal' }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(view.result.current.themeId).toBe('dark-luxury');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('uses a valid server choice when local storage contains an obsolete palette', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'retired-theme');
    mocks.getSettings.mockResolvedValue({ theme: 'slate-ink' });
    const view = renderHook(useAppTheme, setup());
    await waitFor(() => expect(view.result.current.themeId).toBe('slate-ink'));
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('persists even an explicit default choice and synchronizes both mounted selectors', async () => {
    const { wrapper } = setup();
    const view = renderHook(() => ({ nav: useAppTheme(), settings: useAppTheme() }), { wrapper });
    await waitFor(() => expect(view.result.current.nav.mounted).toBe(true));
    act(() => view.result.current.settings.setTheme('olive-botanical'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('olive-botanical');
    expect(view.result.current.nav.themeId).toBe('olive-botanical');
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledWith({ theme: 'olive-botanical' }));
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
    act(() => view.result.current.settings.setTheme('dark-luxury'));
    expect(view.result.current.nav.themeId).toBe('dark-luxury');
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledWith({ theme: 'dark-luxury' }));
  });

  it('does not replace a choice made while the server preference is loading', async () => {
    let resolve!: (settings: Record<string, unknown>) => void;
    mocks.getSettings.mockReturnValue(new Promise(res => { resolve = res; }));
    const view = renderHook(useAppTheme, setup());
    act(() => view.result.current.setTheme('dark-luxury'));
    await act(async () => resolve({ theme: 'vintage-teal' }));
    expect(view.result.current.themeId).toBe('dark-luxury');
  });

  it('switches Luxury between light and dark and restores the selected appearance', async () => {
    const { wrapper } = setup();
    const view = renderHook(useAppTheme, { wrapper });
    await waitFor(() => expect(view.result.current.mounted).toBe(true));
    const luxury = THEMES.find(t => t.id === 'dark-luxury')!;
    expect(luxury.name).toBe('Luxury');
    act(() => view.result.current.setAppearance('light'));
    expect(view.result.current.isDark).toBe(false);
    expect(document.documentElement.dataset.appAppearance).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--background')).toBe(luxury.light['--background']);
    view.unmount();
    const restored = renderHook(useAppTheme, { wrapper });
    await waitFor(() => expect(restored.result.current.isDark).toBe(false));
    act(() => restored.result.current.setAppearance('dark'));
    expect(document.documentElement.style.getPropertyValue('--background')).toBe(luxury.dark['--background']);
  });

  it('switches palette variants using the explicit appearance preference', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'olive-botanical');
    const view = renderHook(useAppTheme, setup());
    await waitFor(() => expect(view.result.current.mounted).toBe(true));
    act(() => view.result.current.setAppearance('dark'));
    expect(document.documentElement.style.getPropertyValue('--background')).toBe(THEMES.find(t => t.id === 'olive-botanical')!.dark['--background']);
    expect(document.documentElement.dataset.appAppearance).toBe('dark');
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledWith({ appearanceMode: 'dark' }));
  });

  it('persists appearance independently from palette and reports effective dark mode', async () => {
    const { wrapper } = setup();
    const view = renderHook(useAppTheme, { wrapper });
    await waitFor(() => expect(view.result.current.mounted).toBe(true));
    expect(view.result.current.appearance).toBe('dark');
    expect(view.result.current.isDark).toBe(true);
    act(() => view.result.current.setTheme('olive-botanical'));
    act(() => view.result.current.setAppearance('light'));
    expect(view.result.current.isDark).toBe(false);
    act(() => view.result.current.setAppearance('dark'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('olive-botanical');
    expect(localStorage.getItem('dietledger-appearance-mode')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.appAppearance).toBe('dark');
    expect(view.result.current.appearance).toBe('dark');
    expect(view.result.current.isDark).toBe(true);
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledWith({ appearanceMode: 'dark' }));
    expect(mocks.updateSettings).not.toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('honors a saved light appearance for Luxury', async () => {
    localStorage.setItem('dietledger-appearance-mode', 'light');
    const view = renderHook(useAppTheme, setup());
    await waitFor(() => expect(view.result.current.mounted).toBe(true));
    act(() => view.result.current.setTheme('dark-luxury'));
    expect(view.result.current.appearance).toBe('light');
    expect(view.result.current.isDark).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.appAppearance).toBe('light');
    expect(localStorage.getItem('dietledger-appearance-mode')).toBe('light');
  });

  it('reads explicit appearanceMode before the legacy onboarding theme mode', async () => {
    mocks.getSettings.mockResolvedValue({ theme: 'light', appearanceMode: 'dark' });
    const view = renderHook(useAppTheme, setup());
    await waitFor(() => expect(view.result.current.mounted).toBe(true));
    await waitFor(() => expect(view.result.current.appearance).toBe('dark'));
    expect(document.documentElement.dataset.appAppearance).toBe('dark');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('serializes rapid palette and mode selections across mounted instances', async () => {
    const pending: Array<{ patch: Record<string, unknown>; resolve: () => void }> = [];
    const saved: Record<string, unknown> = { unitSystem: 'metric' };
    mocks.updateSettings.mockImplementation((patch: Record<string, unknown>) => new Promise<void>(resolve => {
      pending.push({ patch, resolve: () => { Object.assign(saved, patch); resolve(); } });
    }));
    const { wrapper } = setup();
    const view = renderHook(() => ({ nav: useAppTheme(), settings: useAppTheme() }), { wrapper });
    await waitFor(() => expect(view.result.current.nav.mounted).toBe(true));
    act(() => {
      view.result.current.nav.setTheme('olive-botanical');
      view.result.current.settings.setAppearance('dark');
      view.result.current.settings.setTheme('slate-ink');
      view.result.current.nav.setTheme('slate-ink');
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0].patch).toEqual({ theme: 'olive-botanical' });
    await act(async () => pending[0].resolve());
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].patch).toEqual({ appearanceMode: 'dark' });
    await act(async () => pending[1].resolve());
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[2].patch).toEqual({ theme: 'slate-ink' });
    await act(async () => pending[2].resolve());
    expect(saved).toEqual({ unitSystem: 'metric', theme: 'slate-ink', appearanceMode: 'dark' });
    expect(mocks.updateSettings).toHaveBeenCalledTimes(3);
  });

  it('continues after failure and allows retrying the same selection', async () => {
    let reject!: (error: Error) => void;
    mocks.updateSettings.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    const { wrapper } = setup();
    const view = renderHook(() => ({ nav: useAppTheme(), settings: useAppTheme() }), { wrapper });
    act(() => view.result.current.nav.setTheme('warm-library'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
    act(() => view.result.current.settings.setAppearance('dark'));
    expect(mocks.updateSettings).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('offline')));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(2));
    expect(mocks.updateSettings).toHaveBeenLastCalledWith({ appearanceMode: 'dark' });
    act(() => view.result.current.settings.setTheme('warm-library'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(3));
    expect(mocks.updateSettings).toHaveBeenLastCalledWith({ theme: 'warm-library' });
  });

  // P1 session-queue contract: never dispatch an obsolete choice under another
  // login, dedupe only live-session choices, and never refresh a new user's cache.
  it.each(['resolve', 'reject'] as const)('isolates B from a stalled A write and skips queued A choices after A %s', async (settlement) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    mocks.updateSettings.mockImplementationOnce(() => new Promise<void>((done, fail) => { resolve = done; reject = fail; }));
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(useAppTheme, { wrapper });
    act(() => view.result.current.setTheme('warm-library'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
    act(() => {
      view.result.current.setTheme('slate-ink');
      view.result.current.setAppearance('dark');
    });

    mocks.auth = { isAuthenticated: true, user: { id: 'account-b' } };
    retireSession(); setAccessToken('token-b');
    view.rerender();
    act(() => view.result.current.setTheme('slate-ink'));
    // B must neither wait for A nor be deduplicated by A's pending value.
    await waitFor(() => expect(mocks.dispatched).toHaveBeenCalledWith('token-b', { theme: 'slate-ink' }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    await act(async () => settlement === 'resolve' ? resolve() : reject(new Error('retired request failed')));
    expect(mocks.dispatched.mock.calls).toEqual([
      ['token-a', { theme: 'warm-library' }],
      ['token-b', { theme: 'slate-ink' }],
    ]);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['account-a', 'token-new'],
    ['account-b', 'token-a'],
  ])('starts a fresh queue when identity becomes %s / %s', async (id, token) => {
    let resolve!: () => void;
    mocks.updateSettings.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const view = renderHook(useAppTheme, setup());
    act(() => view.result.current.setTheme('warm-library'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
    act(() => view.result.current.setAppearance('dark'));
    mocks.auth = { isAuthenticated: true, user: { id } };
    retireSession(); setAccessToken(token);
    view.rerender();
    act(() => view.result.current.setAppearance('dark'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(2));
    await act(async () => resolve());
    expect(mocks.updateSettings).toHaveBeenCalledTimes(2);
  });

  it('rejects obsolete work before dispatch even before auth rerenders', async () => {
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(useAppTheme, { wrapper });
    act(() => {
      view.result.current.setTheme('warm-library');
      retireSession(); setAccessToken('token-b');
    });
    await act(async () => {});
    expect(mocks.dispatched).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('retires an unmounted session so remount writes proceed without stale invalidation', async () => {
    let resolve!: () => void;
    mocks.updateSettings.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(useAppTheme, { wrapper });
    act(() => view.result.current.setTheme('warm-library'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
    act(() => view.result.current.setAppearance('dark'));
    view.unmount();
    const remount = renderHook(useAppTheme, { wrapper });
    act(() => remount.result.current.setAppearance('dark'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(2));
    expect(mocks.updateSettings).toHaveBeenLastCalledWith({ appearanceMode: 'dark' });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    await act(async () => resolve());
    expect(mocks.updateSettings).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('skips unmounted selector work but keeps the other selector ordered and deduplicated', async () => {
    let resolve!: () => void;
    mocks.updateSettings.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const nav = renderHook(useAppTheme, { wrapper });
    const settings = renderHook(useAppTheme, { wrapper });
    act(() => nav.result.current.setTheme('warm-library'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
    act(() => {
      nav.result.current.setTheme('slate-ink');
      nav.result.current.setAppearance('dark');
      settings.result.current.setAppearance('dark');
    });
    const staleSetter = nav.result.current.setTheme;
    nav.unmount();
    act(() => staleSetter('dusty-rose'));
    await act(async () => resolve());
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(2));
    expect(mocks.updateSettings).toHaveBeenLastCalledWith({ appearanceMode: 'dark' });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('keeps logged-out choices local and never replays them on login', async () => {
    mocks.auth = { isAuthenticated: false, user: null };
    retireSession();
    const view = renderHook(useAppTheme, setup());
    act(() => {
      view.result.current.setTheme('slate-ink');
      view.result.current.setAppearance('dark');
    });
    await act(async () => {});
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('slate-ink');
    mocks.auth = { isAuthenticated: true, user: { id: 'account-b' } };
    retireSession(); setAccessToken('token-b');
    view.rerender();
    await act(async () => {});
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    act(() => view.result.current.setTheme('slate-ink'));
    await waitFor(() => expect(mocks.dispatched).toHaveBeenCalledWith('token-b', { theme: 'slate-ink' }));
  });

  it('ignores unknown selections rather than erasing a preference', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'warm-library');
    const view = renderHook(useAppTheme, setup());
    await waitFor(() => expect(view.result.current.themeId).toBe('warm-library'));
    act(() => view.result.current.setTheme('unknown'));
    expect(view.result.current.themeId).toBe('warm-library');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('warm-library');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});
