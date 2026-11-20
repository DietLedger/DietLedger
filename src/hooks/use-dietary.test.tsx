import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDietaryProfiles, useDietaryRecipeAssessments, useUpdateDietaryProfile, useRestoreDiabetesAwareProfile } from './use-dietary';
import { useDietarySelection } from '@/lib/dietary-selection';
import { AuthProvider, useAuth } from './use-auth';
import { retireSession, setAccessToken } from '@/lib/auth-session';
import { queryKeys } from '@/lib/query-keys';
import type { DietaryProfileRecord } from '@/lib/types';
import type { Recipe } from '@/lib/recipe-types';

const mocks = vi.hoisted(() => ({ profiles: vi.fn(), assess: vi.fn(), update: vi.fn(), restore: vi.fn(), login: vi.fn(), refreshToken: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({ getDietaryProfiles: mocks.profiles, getDietaryRecipeAssessments: mocks.assess, updateDietaryProfile: mocks.update, restoreDiabetesAwareProfile: mocks.restore, login: mocks.login, refreshToken: mocks.refreshToken, logout: mocks.logout }) }));
const userA = { id: 'owner-a', email: 'a@test', displayName: 'A' };
const userB = { id: 'owner-b', email: 'b@test', displayName: 'B' };
const starter: DietaryProfileRecord = { id: 'starter', name: 'Diabetes-aware', allergens: [], dietaryTags: ['diabetesAware'], nutrientThresholds: [{ nutrient: 'dietaryFiber', per1000KcalMin: 14, alertLevel: 'warning' }], isActive: false, createdAt: '', updatedAt: '' };
const recipe: Recipe = { id: 'one', name: 'Beans', servings: 2, servingName: 'serving', ingredients: [], instructionSteps: [], instructionGroups: [], ingredientGroups: [], createdAt: '', updatedAt: '' };
function setup(gcTime = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime } } });
  return { client, wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider> };
}
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined);
  localStorage.clear();
  retireSession();
  mocks.refreshToken.mockReset().mockResolvedValue({ user: userA, accessToken: 'test-session-a', expiresIn: 900, csrfToken: 'dietledger' });
  mocks.logout.mockReset().mockResolvedValue(undefined);
  mocks.restore.mockReset().mockResolvedValue(starter);
  mocks.login.mockReset().mockResolvedValue({ user: userB, accessToken: 'test-session-b', refreshToken: 'test-refresh-b' });
  useDietarySelection.setState({ activeProfileId: null });
  mocks.profiles.mockReset().mockResolvedValue([starter]);
  mocks.update.mockReset().mockResolvedValue(starter);
  mocks.assess.mockReset().mockResolvedValue([{ recipeId: 'one', status: 'match', reasons: [] }]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('default dietary profile selection', () => {
  it('makes the starter available without automatically activating it', async () => {
    const { wrapper } = setup();
    const view = renderHook(() => useDietaryProfiles(), { wrapper });
    await waitFor(() => expect(view.result.current.profiles).toEqual([starter]));
    expect(view.result.current.activeProfileId).toBeNull();
  });
  it('retains the ordinary first-profile fallback rather than switching to a new starter', async () => {
    const oldProfile = { ...starter, id: 'old', name: 'My profile', dietaryTags: [] };
    mocks.profiles.mockResolvedValue([starter, oldProfile]);
    const { wrapper } = setup();
    const view = renderHook(() => useDietaryProfiles(), { wrapper });
    await waitFor(() => expect(view.result.current.activeProfileId).toBe('old'));
    act(() => useDietarySelection.getState().setActiveProfileId('starter'));
    await waitFor(() => expect(view.result.current.activeProfileId).toBe('starter'));
  });
});

describe('starter restore session ownership', () => {
  it.each(['logout', 'account change', 'account change with same token', 'same-user new login', 'token change', 'unmount'] as const)(
    'does not cache, invalidate or select a late private response after %s', async transition => {
      let finish!: (profile: DietaryProfileRecord) => void;
      mocks.restore.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const { client, wrapper } = setup(Infinity);
      const view = renderHook(() => ({ restore: useRestoreDiabetesAwareProfile(), auth: useAuth() }), { wrapper });
      await waitFor(() => expect(view.result.current.auth.user?.id).toBe(userA.id));
      const selected = vi.fn();
      act(() => view.result.current.restore.mutate(undefined, { onSuccess: selected }));
      await waitFor(() => expect(mocks.restore).toHaveBeenCalledTimes(1));
      if (transition === 'logout') await act(async () => { await view.result.current.auth.logout(); });
      else if (transition === 'account change' || transition === 'account change with same token' || transition === 'same-user new login') {
        if (transition === 'account change with same token') mocks.login.mockResolvedValueOnce({ user: userB, accessToken: 'test-session-a', refreshToken: 'test-refresh-b' });
        if (transition === 'same-user new login') mocks.login.mockResolvedValueOnce({ user: userA, accessToken: 'test-session-a-new', refreshToken: 'test-refresh-new' });
        await act(async () => { await view.result.current.auth.login('user@test', 'test-password'); });
      } else if (transition === 'token change') {
        // The token changes before any auth-context re-render; completion must
        // check current storage too, not just its captured React auth value.
        retireSession(); setAccessToken('test-session-replaced');
        client.clear();
      } else { view.unmount(); client.clear(); }
      const otherProfiles = [{ ...starter, id: 'new-session-private', name: 'New session goals' }];
      client.setQueryData(queryKeys.dietary.lists(), otherProfiles);
      client.setQueryData(queryKeys.dietary.recipeAssessments(), ['new session assessment']);
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      await act(async () => { finish(starter); });
      await waitFor(() => expect(client.getQueryData(queryKeys.dietary.lists())).toEqual(otherProfiles));
      expect(client.getQueryState(queryKeys.dietary.recipeAssessments())?.isInvalidated).toBe(false);
      expect(invalidate).not.toHaveBeenCalled();
      expect(selected).not.toHaveBeenCalled();
      const cache = JSON.stringify({ queries: client.getQueryCache().getAll().map(q => q.queryKey), mutations: client.getMutationCache().getAll().map(m => m.state) });
      expect(cache).not.toContain('test-session-a');
      expect(cache).not.toContain('test-session-b');
    });
  it('does not report success when the account changes while its cache refresh is pending', async () => {
    const { client, wrapper } = setup(Infinity);
    const view = renderHook(() => ({ restore: useRestoreDiabetesAwareProfile(), auth: useAuth() }), { wrapper });
    await waitFor(() => expect(view.result.current.auth.user?.id).toBe(userA.id));
    let finishRefresh!: () => void;
    vi.spyOn(client, 'invalidateQueries').mockImplementationOnce(() => new Promise<void>(resolve => { finishRefresh = resolve; }));
    const selected = vi.fn();
    act(() => view.result.current.restore.mutate(undefined, { onSuccess: selected }));
    await waitFor(() => expect(client.getQueryData(queryKeys.dietary.lists())).toEqual([starter]));
    await act(async () => { await view.result.current.auth.login('b@test', 'test-password'); });
    const otherProfiles = [{ ...starter, id: 'b-only' }];
    client.setQueryData(queryKeys.dietary.lists(), otherProfiles);
    await act(async () => { finishRefresh(); });
    await waitFor(() => expect(view.result.current.restore.isError).toBe(true));
    expect(selected).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.dietary.lists())).toEqual(otherProfiles);
  });
  it('caches and refreshes an editable restore only for its still-mounted authenticated caller', async () => {
    const { client, wrapper } = setup(Infinity);
    const view = renderHook(() => ({ restore: useRestoreDiabetesAwareProfile(), auth: useAuth() }), { wrapper });
    await waitFor(() => expect(view.result.current.auth.user?.id).toBe(userA.id));
    const selected = vi.fn();
    act(() => view.result.current.restore.mutate(undefined, { onSuccess: selected }));
    await waitFor(() => expect(view.result.current.restore.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.dietary.lists())).toEqual([starter]);
    expect(selected).toHaveBeenCalledTimes(1);
    const state = JSON.stringify(client.getMutationCache().getAll().map(m => m.state));
    expect(state).not.toContain('test-session-a');
  });
});

describe('server nutrition assessments', () => {
  it('does not request assessments until the filter is selected', async () => {
    const { wrapper } = setup();
    renderHook(() => useDietaryRecipeAssessments(null, [recipe]), { wrapper });
    expect(mocks.assess).not.toHaveBeenCalled();
  });
  it('refreshes for profile edits, yield changes, and nutrient snapshot edits', async () => {
    const { wrapper } = setup();
    const view = renderHook(({ profile, recipes }) => useDietaryRecipeAssessments(profile, recipes), { wrapper, initialProps: { profile: starter, recipes: [recipe] } });
    await waitFor(() => expect(view.result.current.data).toHaveLength(1));
    expect(mocks.assess).toHaveBeenCalledWith('starter');
    view.rerender({ profile: { ...starter, nutrientThresholds: [{ nutrient: 'totalCarbs', perMealMax: 40, alertLevel: 'warning' }] }, recipes: [recipe] });
    await waitFor(() => expect(mocks.assess).toHaveBeenCalledTimes(2));
    view.rerender({ profile: starter, recipes: [{ ...recipe, servings: 4 }] });
    await waitFor(() => expect(mocks.assess).toHaveBeenCalledTimes(3));
    view.rerender({ profile: starter, recipes: [{ ...recipe, customNutrition: { basis: 'recipeTotal', nutrients: { calories: 100 } as never, source: 'label', sourceLabel: '', missingNutrients: [] } }] });
    await waitFor(() => expect(mocks.assess).toHaveBeenCalledTimes(4));
  });
  it('invalidates assessments with recipe-list mutations even when old list inputs are retained', async () => {
    const { client, wrapper } = setup();
    const view = renderHook(() => useDietaryRecipeAssessments(starter, [recipe]), { wrapper });
    await waitFor(() => expect(view.result.current.data?.[0].status).toBe('match'));
    mocks.assess.mockResolvedValue([{ recipeId: 'one', status: 'noMatch', reasons: ['Changed recipe'] }]);
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.recipes.lists() }); });
    await waitFor(() => expect(view.result.current.data?.[0].status).toBe('noMatch'));
  });
  it('refetches after a dietary-profile save and surfaces server failure', async () => {
    const { wrapper } = setup();
    const view = renderHook(() => useDietaryRecipeAssessments(starter, [recipe]), { wrapper });
    const mutation = renderHook(() => useUpdateDietaryProfile(), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    mocks.assess.mockRejectedValue(new Error('Assessment unavailable'));
    await act(async () => { await mutation.result.current.mutateAsync({ id: starter.id, data: { name: 'Changed profile' } }); });
    await waitFor(() => expect(view.result.current.isError).toBe(true));
  });
});
