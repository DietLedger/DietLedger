import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoApiClient } from './api-client-go';

describe('authenticated food storage defaults API', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('reads caller defaults using the authorized API request', async () => {
    localStorage.setItem('dietledger_access_token', 'user-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [{ sourceType: 'usda', sourceKey: '456', location: 'Pantry' }] }) }));
    expect(await new GoApiClient('').getFoodStorageDefaults()).toEqual([{ sourceType: 'usda', sourceKey: '456', location: 'Pantry' }]);
    expect(fetch).toHaveBeenCalledWith('/api/food-storage-defaults', expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer user-token' }) }));
  });

  it('explicitly replaces one default with encoded identity and location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { sourceType: 'custom_food', sourceKey: 'my id', location: 'Freezer' } }) }));
    expect(await new GoApiClient('').updateFoodStorageDefault('custom_food', 'my id', 'Freezer')).toEqual({ sourceType: 'custom_food', sourceKey: 'my id', location: 'Freezer' });
    expect(fetch).toHaveBeenCalledWith('/api/food-storage-defaults/custom_food/my%20id', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ location: 'Freezer' }) }));
  });
});
