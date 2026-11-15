import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoApiClient } from './api-client-go';

describe('owner recipe/book backup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests a server-enumerated native backup without selection IDs or a body', async () => {
    const bundle = { format: 'dietledger.recipe-bundle', version: 2, recipes: [], books: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: bundle }),
    }));
    const result = await new GoApiClient('').exportOwnerRecipeBookBackup();
    expect(result).toEqual(bundle);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/recipe-bundles/owner-backup', expect.objectContaining({
      method: 'POST', body: undefined,
    }));
  });

  it('preserves versioned staged content in owner backups and rejects unsupported staging formats', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const api = new GoApiClient('');
    const bundle = { format: 'dietledger.recipe-bundle', version: 3, pendingImports: { version: 1, batches: [{ retained: ['payload'] }] } };
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: bundle }) });
    await expect(api.exportOwnerRecipeBookBackup()).resolves.toEqual(bundle);
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { ...bundle, pendingImports: { version: 9 } } }) });
    await expect(api.exportOwnerRecipeBookBackup()).rejects.toThrow('Unsupported pending imports');
  });

  it('rejects backup retrieval failure instead of returning a partial bundle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Backup unavailable' }), { status: 500 })));
    await expect(new GoApiClient('').exportOwnerRecipeBookBackup()).rejects.toThrow('Backup unavailable');
  });
});

describe('staged recipe import API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads staging and submits keep/cancel and ingredient writes only to staging endpoints', async () => {
    const result = { quarantined: 2, promotedRecipeIds: ['promoted'] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: result }) }));
    const api = new GoApiClient('');
    await expect(api.getQuarantinedRecipes()).resolves.toEqual(result);
    await expect(api.decideRecipeImport('batch/id', 'keep')).resolves.toEqual(result);
    await api.decideRecipeImport('batch/id', 'cancel');
    const data = { name: 'Salt', amount: 2, unit: 'g', sourceType: 'usda' as const, fdcId: 123 };
    await expect(api.resolveQuarantinedIngredient('staged/id', 'ingredient/id', data)).resolves.toEqual(result);
    await api.resolveQuarantinedIngredient('empty', 'new', data);
    expect(vi.mocked(fetch).mock.calls.map(([url, options]) => [url, options?.method, options?.body && JSON.parse(String(options.body))])).toEqual([
      ['/api/recipe-imports', 'GET', undefined],
      ['/api/recipe-imports/batch%2Fid/decision', 'POST', { action: 'keep' }],
      ['/api/recipe-imports/batch%2Fid/decision', 'POST', { action: 'cancel' }],
      ['/api/recipe-imports/staged%2Fid/ingredients/ingredient%2Fid', 'PUT', data],
      ['/api/recipe-imports/empty/ingredients/new', 'PUT', data],
    ]);
  });
});

describe('food database search', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exposes the server food results through the paginated client contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ foods: [{ fdcId: 123, description: 'Potatoes, raw' }], total: 1, page: 1, perPage: 20, totalPages: 1 }),
    }));
    const result = await new GoApiClient('').searchFoods('potatoes');
    expect(result.data).toEqual([{ fdcId: 123, description: 'Potatoes, raw' }]);
    expect(fetch).toHaveBeenCalledWith('/api/foods/search?q=potatoes&page=1&perPage=20', expect.any(Object));
  });
});

describe('grocery checklist API wire format', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses the JSON-string checkedItems returned by the Go API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { id: 'one', weekStart: '2026-10-12', checkedItems: '["milk","rice"]', updatedAt: '2026-10-12T00:00:00Z' } }),
    }));
    const record = await new GoApiClient('').getGroceryChecklist('2026-10-12');
    expect(record?.checkedItems).toEqual(['milk', 'rice']);
  });

  it('returns null when no saved checklist exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: null }) }));
    await expect(new GoApiClient('').getGroceryChecklist('2026-10-12')).resolves.toBeNull();
  });

  it('rejects a malformed checklist rather than treating it as an array of characters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { id: 'one', weekStart: '2026-10-12', checkedItems: 'not-json', updatedAt: '2026-10-12T00:00:00Z' } }),
    }));
    await expect(new GoApiClient('').getGroceryChecklist('2026-10-12')).rejects.toThrow();
  });

  it('encodes checkedItems for the wire and returns the parsed saved record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { id: 'one', weekStart: '2026-10-12', checkedItems: '["milk"]', updatedAt: '2026-10-12T00:00:00Z' } }),
    }));
    const record = await new GoApiClient('').upsertGroceryChecklist({ weekStart: '2026-10-12', checkedItems: ['milk'] });
    expect(record.checkedItems).toEqual(['milk']);
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(options?.body)).checkedItems).toBe('["milk"]');
  });
});
