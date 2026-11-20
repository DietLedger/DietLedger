import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { retireLegacyBrowserCache } from './legacy-browser-cleanup';

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
afterEach(() => {
  if (originalServiceWorker) Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup(registrations: unknown[], controller: unknown = null) {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: async () => registrations, controller } });
  vi.stubGlobal('MessageChannel', MessageChannel);
  const remove = vi.fn(async () => true);
  vi.stubGlobal('caches', { delete: remove });
  return remove;
}
function worker(retired = false) {
  return { scriptURL: `${location.origin}/sw.js`, state: 'activated', ...(retired ? {
    postMessage: vi.fn((_message: unknown, ports: MessagePort[]) => ports[0].postMessage({ type: 'DIETLEDGER_RETIRED' })),
  } : {}) };
}

describe('legacy worker retirement', () => {
  it('upgrades only the root legacy worker, requires acknowledgement and deletes only its cache', async () => {
    const registration = { scope: `${location.origin}/`, active: worker(), update: vi.fn(async () => { registration.active = worker(true); }), unregister: vi.fn() };
    const unrelated = { scope: `${location.origin}/other/`, active: { scriptURL: `${location.origin}/other/sw.js` }, update: vi.fn(), unregister: vi.fn() };
    const remove = setup([registration, unrelated]);
    await expect(retireLegacyBrowserCache()).resolves.toEqual({ reloadRequired: false });
    expect(registration.update).toHaveBeenCalledOnce();
    expect(registration.unregister).not.toHaveBeenCalled();
    expect(unrelated.update).not.toHaveBeenCalled();
    expect(unrelated.unregister).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledExactlyOnceWith('dietledger-v1');
  });
  it('reports reload-required instead of unregistering a still-caching offline controller', async () => {
    const old = worker();
    const registration = { scope: `${location.origin}/`, active: old, update: vi.fn(async () => { throw new Error('offline'); }), unregister: vi.fn() };
    const remove = setup([registration], old);
    await expect(retireLegacyBrowserCache()).resolves.toEqual({ reloadRequired: true });
    expect(registration.unregister).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('dietledger-v1');
  });
  it('bounds an unresponsive worker update rather than hanging logout indefinitely', async () => {
    vi.useFakeTimers();
    setup([{ scope: `${location.origin}/`, active: worker(), update: () => new Promise(() => {}) }]);
    let result: unknown;
    void retireLegacyBrowserCache().then(value => { result = value; });
    await vi.advanceTimersByTimeAsync(6000);
    expect(result).toEqual({ reloadRequired: true });
  });
  it('reports an unregistered legacy controller but accepts a tombstone controlling the tab', async () => {
    setup([], worker());
    await expect(retireLegacyBrowserCache()).resolves.toEqual({ reloadRequired: true });
    setup([], worker(true));
    await expect(retireLegacyBrowserCache()).resolves.toEqual({ reloadRequired: false });
  });
  it('does not adopt a root registration being changed to an unrelated worker', async () => {
    const update = vi.fn();
    setup([{ scope: `${location.origin}/`, active: worker(), waiting: { scriptURL: `${location.origin}/replacement.js` }, update }]);
    await expect(retireLegacyBrowserCache()).resolves.toEqual({ reloadRequired: true });
    expect(update).not.toHaveBeenCalled();
  });
  it('still removes the legacy cache and reports uncertainty when worker enumeration fails', async () => {
    const remove = setup([]);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations: async () => { throw new Error('unavailable'); } } });
    await expect(retireLegacyBrowserCache()).resolves.toEqual({ reloadRequired: true });
    expect(remove).toHaveBeenCalledWith('dietledger-v1');
  });
  it('is harmless on fresh installations without any worker registration', async () => {
    setup([]);
    await expect(retireLegacyBrowserCache()).resolves.toEqual({ reloadRequired: false });
  });
});
