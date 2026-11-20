import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoApiClient } from './api-client-go';

describe('dietary nutrition assessments', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('restores the server-owned editable starter with no client-selected criteria', async () => {
    const profile = { id: 'p', name: 'Edited name', allergens: '[]', dietaryTags: '["diabetesAware"]', nutrientThresholds: '[{"nutrient":"dietaryFiber","per1000KcalMin":14,"alertLevel":"warning"}]', isActive: false };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: profile }) }));
    const result = await new GoApiClient('').restoreDiabetesAwareProfile();
    expect(result.name).toBe('Edited name');
    expect(result.dietaryTags).toEqual(['diabetesAware']);
    expect(fetch).toHaveBeenCalledWith('/api/dietary-profiles/diabetes-aware-starter', expect.objectContaining({ method: 'POST', body: undefined }));
  });
  it('reads server assessments for the selected profile without submitting client nutrient facts', async () => {
    const assessments = [{ recipeId: 'recipe', status: 'notAssessed', reasons: ['Fiber not reported'] }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: assessments }) }));
    const result = await new GoApiClient('').getDietaryRecipeAssessments('my/profile');
    expect(result).toEqual(assessments);
    expect(fetch).toHaveBeenCalledWith('/api/dietary-profiles/my%2Fprofile/recipe-assessments', expect.objectContaining({ method: 'GET', body: undefined }));
  });
});

describe('dietary profile wire validation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('normalizes a successful null list after reset without hiding request failure', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const api = new GoApiClient('');
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: null }) });
    await expect(api.getDietaryProfiles()).resolves.toEqual([]);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Profiles unavailable' }), { status: 500 }));
    await expect(api.getDietaryProfiles()).rejects.toThrow('Profiles unavailable');
  });
  const profile = { id: 'p', name: 'Legacy profile', allergens: '[]', dietaryTags: '["diabetesAware"]', nutrientThresholds: '[]' };
  it.each([
    { dietaryTags: 'null' }, { dietaryTags: '{}' }, { dietaryTags: '["unknownRestriction"]' },
    { allergens: 'null' }, { allergens: '["unknownAllergen"]' },
    { nutrientThresholds: '{}' }, { nutrientThresholds: '[null]' },
  ])('rejects malformed legacy profile fields without silently dropping restrictions: %j', async overrides => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [{ ...profile, ...overrides }] }) }));
    await expect(new GoApiClient('').getDietaryProfiles()).rejects.toThrow(/dietary profile/i);
  });
});

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

  it('submits duplicate-book decisions with the original bundle for server revalidation', async () => {
    const bundle = { format: 'dietledger.recipe-bundle' as const, version: 2 as const, exportedAt: '2026-11-19T00:00:00Z', books: [] };
    const decisions = [{ bundleBookId: 'incoming', targetBookId: 'existing', action: 'replace' as const, targetFingerprint: 'fingerprint' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { created: {}, updated: {}, reused: {}, skipped: {}, conflicts: [] } }) }));
    await new GoApiClient('').importRecipeBundle(bundle, decisions);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/recipe-bundles/import', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ bundle, bookDecisions: decisions }),
    }));
  });

  it('normalizes a successful null staging list but rejects failed or malformed responses', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const api = new GoApiClient('');
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: null }) });
    await expect(api.getQuarantinedRecipes()).resolves.toEqual([]);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 500 }));
    await expect(api.getQuarantinedRecipes()).rejects.toThrow('Database unavailable');
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, error: 'Read failed', data: null }) });
    await expect(api.getQuarantinedRecipes()).rejects.toThrow();
    fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: {} }) });
    await expect(api.getQuarantinedRecipes()).rejects.toThrow();
  });

  it('reads staging and submits keep/cancel and ingredient writes only to staging endpoints', async () => {
    const result = { quarantined: 2, promotedRecipeIds: ['promoted'] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: result }) }));
    const api = new GoApiClient('');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: [] }) } as Response);
    await expect(api.getQuarantinedRecipes()).resolves.toEqual([]);
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
