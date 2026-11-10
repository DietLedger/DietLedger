import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoApiClient } from './api-client-go';

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
