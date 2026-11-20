import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoApiClient } from './api-client-go';
import { getAccessToken, retireSession, sessionGeneration, setAccessToken } from './auth-session';

const user = { id: 'user-1', email: 'test@example.com', displayName: 'Test' };
const reply = (accessToken: string) => new Response(JSON.stringify({ accessToken, expiresIn: 900, user, csrfToken: 'dietledger' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('browser authentication transport', () => {
  beforeEach(() => {
    retireSession(); localStorage.clear(); vi.restoreAllMocks();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, run: () => Promise<unknown>) => await run() } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('does not adopt a shared-cookie principal change or retry A writes as B', async () => {
    const differentUser = { ...user, id: 'user-b', displayName: 'B' };
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply('access-a'))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'access-b', expiresIn: 900, user: differentUser, csrfToken: 'dietledger' }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { id: 'wrong-account' } }), { status: 200 }));
    const unauthorized = vi.fn();
    window.addEventListener('dietledger:unauthorized', unauthorized);
    try {
      const client = new GoApiClient('');
      await client.login('a@example.com', 'password');
      const generation = sessionGeneration();
      await expect(client.createRecipe('A private recipe')).rejects.toThrow(/Session changed|principal/i);
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(fetcher.mock.calls.map(([url]) => url)).not.toContain('/api/auth/logout');
      expect(getAccessToken()).toBeNull();
      expect(sessionGeneration()).toBeGreaterThan(generation);
      expect(unauthorized).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener('dietledger:unauthorized', unauthorized); }
  });

  it('does not revoke another account when a stale tab logs out', async () => {
    setAccessToken('access-a', user.id);
    const differentUser = { ...user, id: 'user-b' };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ accessToken: 'access-b', user: differentUser }), { status: 200 }));
    await expect(new GoApiClient('').logout()).rejects.toThrow(/principal|session changed/i);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/auth/refresh']);
    expect(getAccessToken()).toBeNull();
  });

  it('confirms the same principal then logs out without adopting proof credentials', async () => {
    setAccessToken('access-a', user.id);
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply('proof-only'))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    await new GoApiClient('').logout();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/auth/refresh', '/api/auth/logout']);
    expect(getAccessToken()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('does not continue logout after a held confirmation body crosses an account switch', async () => {
    setAccessToken('access-a', user.id);
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      finish = () => { controller.enqueue(new TextEncoder().encode(JSON.stringify({ accessToken: 'proof-only', user }))); controller.close(); };
    } });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }));
    const pending = new GoApiClient('').logout();
    const rejected = expect(pending).rejects.toThrow('Session changed');
    await Promise.resolve(); await Promise.resolve();
    retireSession(); setAccessToken('account-b', 'user-b');
    finish();
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('account-b');
  });

  it('changes local generation for an explicit API-client principal switch without a provider', async () => {
    const differentUser = { ...user, id: 'user-b', displayName: 'B' };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply('access-a'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'access-b', expiresIn: 900, user: differentUser, csrfToken: 'dietledger' }), { status: 200 }));
    const client = new GoApiClient('');
    await client.login('a@example.com', 'password');
    const generation = sessionGeneration();
    await client.login('b@example.com', 'password');
    expect(sessionGeneration()).toBeGreaterThan(generation);
  });

  it('allows a fresh reload with no established principal to adopt the current cookie user', async () => {
    const differentUser = { ...user, id: 'user-b', displayName: 'B' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ accessToken: 'access-b', expiresIn: 900, user: differentUser, csrfToken: 'dietledger' }), { status: 200 }));
    const result = await new GoApiClient('').refreshToken();
    expect(result.user.id).toBe('user-b');
    expect(getAccessToken()).toBe('access-b');
  });

  it('does not retry a rate-limited account A write under account B', async () => {
    vi.useFakeTimers();
    setAccessToken('account-a');
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { id: 'wrong-account' } }), { status: 200 }));
    const pending = new GoApiClient('').createRecipe('Account A private recipe');
    const rejected = expect(pending).rejects.toThrow('Session changed');
    await vi.advanceTimersByTimeAsync(1);
    retireSession(); setAccessToken('account-b');
    await vi.advanceTimersByTimeAsync(500);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a private response body completed after an account switch', async () => {
    setAccessToken('account-a');
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      finish = () => { controller.enqueue(new TextEncoder().encode('{"ok":true,"data":{"private":"A"}}')); controller.close(); };
    } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }));
    const pending = new GoApiClient('').getSettings();
    await Promise.resolve(); await Promise.resolve();
    retireSession(); setAccessToken('account-b');
    finish();
    await expect(pending).rejects.toThrow('Session changed');
  });

  it('refuses all cookie authentication when cross-tab Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply('unsafe-fallback'));
    const client = new GoApiClient('');
    for (const operation of [() => client.refreshToken(), () => client.login('a@example.com', 'password'), () => client.register('a@example.com', 'password', 'A'), () => client.logout()]) {
      await expect(operation()).rejects.toThrow('Web Locks');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('bootstraps through the cookie without storing credentials', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply('memory-only'));
    const client = new GoApiClient('');
    const result = await client.refreshToken();
    expect(result.user).toEqual(user);
    expect(fetcher).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({ method: 'POST', credentials: 'same-origin', headers: expect.objectContaining({ 'X-CSRF-Token': 'dietledger' }) }));
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('refreshToken');
  });

  it('refreshes an expired access token then retries a protected request', async () => {
    setAccessToken('expired');
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(reply('renewed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }));
    const client = new GoApiClient('');
    await expect(client.getFoodStorageDefaults()).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer renewed' }) }));
    expect(localStorage.length).toBe(0);
  });

  it('serializes simultaneous refreshes within a tab', async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((resolve) => { release = resolve; }));
    const client = new GoApiClient('');
    const first = client.refreshToken();
    const second = client.refreshToken();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(reply('access'));
    await Promise.all([first, second]);
  });
});
