import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './use-auth';

const mocks = vi.hoisted(() => ({ cleanup: vi.fn(), login: vi.fn(), refresh: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/legacy-browser-cleanup', () => ({ retireLegacyBrowserCache: mocks.cleanup }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({ login: mocks.login, refreshToken: mocks.refresh, logout: mocks.logout }) }));
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient()}><AuthProvider>{children}</AuthProvider></QueryClientProvider>;

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined);
  mocks.cleanup.mockReset().mockResolvedValue({ reloadRequired: true });
  mocks.refresh.mockReset().mockRejectedValue(new Error('Anonymous'));
  mocks.login.mockReset().mockResolvedValue({ user: { id: 'b', displayName: 'B' }, accessToken: 'synthetic-memory-access' });
  mocks.logout.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('does not clear its own successful login when notifying other BroadcastChannel listeners', async () => {
  class Channel {
    static channels = new Set<Channel>();
    onmessage: ((event: { data: unknown }) => void) | null = null;
    constructor(public name: string) { Channel.channels.add(this); }
    postMessage(data: unknown) {
      for (const channel of Channel.channels) if (channel !== this && channel.name === this.name) {
        queueMicrotask(() => { if (Channel.channels.has(channel)) channel.onmessage?.({ data }); });
      }
    }
    close() { Channel.channels.delete(this); }
  }
  vi.stubGlobal('BroadcastChannel', Channel);
  mocks.cleanup.mockResolvedValue({ reloadRequired: false });
  const view = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  const otherTab = new Channel('dietledger-auth-events');
  const notified = vi.fn(); otherTab.onmessage = notified;
  await act(async () => { await view.result.current.login('b@example.com', 'password'); });
  expect(view.result.current.isAuthenticated).toBe(true);
  expect(view.result.current.user?.id).toBe('b');
  expect(notified).toHaveBeenCalledTimes(1);
  otherTab.close();
});

it('blocks account login with a visible reload warning when legacy worker retirement is unproven', async () => {
  const view = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  await act(async () => { await expect(view.result.current.login('b@example.com', 'password')).rejects.toThrow(/reload/i); });
  expect(mocks.login).not.toHaveBeenCalled();
  expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/reload/i));
});

it('retains the displayed account identity when retiring local state before logout', async () => {
  mocks.cleanup.mockResolvedValue({ reloadRequired: false });
  const view = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  await act(async () => { await view.result.current.login('b@example.com', 'password'); });
  await act(async () => { await view.result.current.logout(); });
  expect(mocks.logout).toHaveBeenCalledWith('b');
  expect(view.result.current.isAuthenticated).toBe(false);
});

it('warns visibly after logout if a legacy controller still requires a reload', async () => {
  const view = renderHook(useAuth, { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  await act(async () => { await view.result.current.logout(); });
  expect(mocks.logout).toHaveBeenCalledTimes(1);
  expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/reload/i));
  expect(view.result.current.isAuthenticated).toBe(false);
});
