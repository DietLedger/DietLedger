import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type WorkerEvent = { waitUntil: (promise: Promise<unknown>) => void; data?: { type: string }; ports?: Array<{ postMessage: (message: unknown) => void }> };
function loadWorker(claim: () => Promise<void> = async () => {}) {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const effects: string[] = [];
  const remove = vi.fn(async (name: string) => { effects.push(name); return true; });
  const unregister = vi.fn(async () => { effects.push('unregister'); return true; });
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { addEventListener: (type: string, handler: (event: WorkerEvent) => void) => listeners.set(type, handler), skipWaiting: async () => undefined, clients: { claim: async () => { effects.push('claim'); await claim(); } }, registration: { unregister } },
    caches: { delete: remove },
  });
  async function dispatch(type: string, fields: Partial<WorkerEvent> = {}) {
    let operation: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ waitUntil: promise => { operation = promise; }, ...fields });
    await operation;
  }
  return { listeners, effects, remove, unregister, dispatch };
}

describe('legacy worker retirement script', () => {
  it('has no fetch interception, claims old tabs before deletion and unregisters', async () => {
    const worker = loadWorker();
    expect(worker.listeners.has('fetch')).toBe(false);
    await worker.dispatch('activate');
    expect(worker.effects).toEqual(['claim', 'dietledger-v1', 'unregister']);
    expect(worker.remove).toHaveBeenCalledExactlyOnceWith('dietledger-v1');
  });
  it('does not acknowledge retirement before activation has replaced existing controllers', async () => {
    let release!: () => void;
    const worker = loadWorker(() => new Promise<void>(resolve => { release = resolve; }));
    const activation = worker.dispatch('activate');
    const reply = vi.fn();
    const message = worker.dispatch('message', { data: { type: 'DIETLEDGER_RETIRE' }, ports: [{ postMessage: reply }] });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(reply).not.toHaveBeenCalled();
    release();
    await Promise.all([activation, message]);
    expect(reply).toHaveBeenCalledOnce();
  });
  it('acknowledges only the retirement protocol after scoped cache cleanup', async () => {
    const worker = loadWorker();
    const reply = vi.fn(() => { worker.effects.push('acknowledge'); });
    await worker.dispatch('message', { data: { type: 'OTHER' }, ports: [{ postMessage: reply }] });
    expect(reply).not.toHaveBeenCalled();
    await worker.dispatch('message', { data: { type: 'DIETLEDGER_RETIRE' }, ports: [{ postMessage: reply }] });
    expect(worker.effects).toEqual(['dietledger-v1', 'acknowledge']);
    expect(reply).toHaveBeenCalledWith({ type: 'DIETLEDGER_RETIRED' });
    expect(worker.unregister).not.toHaveBeenCalled();
  });
});
