import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppSettings, useUpdateSettings } from './use-settings';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({ getSettings: mocks.get, updateSettings: mocks.update }) }));
afterEach(cleanup);

it('does not finish onboarding settings mutation before active settings have refreshed', async () => {
  let finish!: (value: Record<string, unknown>) => void;
  mocks.get.mockReset().mockResolvedValueOnce({ onboardingComplete: false }).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  mocks.update.mockReset().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => ({ read: useAppSettings(), write: useUpdateSettings() }), { wrapper });
  await waitFor(() => expect(view.result.current.read.data?.onboardingComplete).toBe(false));
  let completed = false;
  let pending!: Promise<unknown>;
  act(() => { pending = view.result.current.write.mutateAsync({ onboardingComplete: true }).then(() => { completed = true; }); });
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  try {
    expect(completed).toBe(false);
    expect(view.result.current.write.isPending).toBe(true);
  } finally {
    await act(async () => { finish({ onboardingComplete: true }); await pending; });
  }
  await waitFor(() => expect(view.result.current.read.data?.onboardingComplete).toBe(true));
  expect(completed).toBe(true);
});

it('refreshes inactive onboarding settings before returning to the guarded app layout', async () => {
  let finish!: (value: Record<string, unknown>) => void;
  mocks.get.mockReset().mockResolvedValue({ onboardingComplete: true })
    .mockResolvedValueOnce({ onboardingComplete: false })
    .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  mocks.update.mockReset().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const appLayout = renderHook(useAppSettings, { wrapper });
  await waitFor(() => expect(appLayout.result.current.data?.onboardingComplete).toBe(false));
  appLayout.unmount(); // /welcome is outside the app layout: its query is inactive.
  const welcome = renderHook(useUpdateSettings, { wrapper });
  let completed = false;
  let pending!: Promise<unknown>;
  act(() => { pending = welcome.result.current.mutateAsync({ onboardingComplete: true }).then(() => { completed = true; }); });
  try {
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(completed).toBe(false);
  } finally {
    await act(async () => { finish({ onboardingComplete: true }); await pending; });
  }
  const returningLayout = renderHook(useAppSettings, { wrapper });
  await waitFor(() => expect(returningLayout.result.current.data?.onboardingComplete).toBe(true));
});
