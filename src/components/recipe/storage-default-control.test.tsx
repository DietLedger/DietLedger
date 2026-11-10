import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import { StorageDefaultControl } from './storage-default-control';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, getApiClient: vi.fn() };
});

describe('ingredient storage default action', () => {
  function show(identity: { sourceType: 'usda' | 'custom_food'; sourceKey: string } | null = { sourceType: 'usda', sourceKey: '456' }, location = 'Freezer', onSaveIngredientLocation = vi.fn().mockResolvedValue(undefined)) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const onLocationChange = vi.fn();
    render(<QueryClientProvider client={client}><StorageDefaultControl identity={identity} location={location} onLocationChange={onLocationChange} onSaveIngredientLocation={onSaveIngredientLocation} /></QueryClientProvider>);
    return { client, onLocationChange, onSaveIngredientLocation };
  }

  it('saves the selected location to this ingredient and its future default', async () => {
    const updateFoodStorageDefault = vi.fn().mockResolvedValue({ sourceType: 'usda', sourceKey: '456', location: 'Freezer' });
    vi.mocked(getApiClient).mockReturnValue({ updateFoodStorageDefault } as any);
    const { onSaveIngredientLocation } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Update default' }));
    await waitFor(() => expect(updateFoodStorageDefault).toHaveBeenCalledWith('usda', '456', 'Freezer'));
    expect(onSaveIngredientLocation).toHaveBeenCalledWith('Freezer');
    expect(onSaveIngredientLocation.mock.invocationCallOrder[0]).toBeLessThan(updateFoodStorageDefault.mock.invocationCallOrder[0]);
    expect(await screen.findByText(/saved for this ingredient and as the default/i)).toBeInTheDocument();
  });

  it('does not update the default if saving this recipe ingredient fails', async () => {
    const updateFoodStorageDefault = vi.fn();
    vi.mocked(getApiClient).mockReturnValue({ updateFoodStorageDefault } as any);
    show(undefined, 'Freezer', vi.fn().mockRejectedValue(new Error('Ingredient save failed')));
    fireEvent.click(screen.getByRole('button', { name: 'Update default' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingredient location save failed: Ingredient save failed');
    expect(updateFoodStorageDefault).not.toHaveBeenCalled();
  });

  it('reports partial failure when saving the default fails after saving the ingredient', async () => {
    vi.mocked(getApiClient).mockReturnValue({ updateFoodStorageDefault: vi.fn().mockRejectedValue(new Error('Offline')) } as any);
    const saveCurrent = vi.fn().mockResolvedValue(undefined);
    show(undefined, 'Freezer', saveCurrent);
    fireEvent.click(screen.getByRole('button', { name: 'Update default' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingredient location saved, but default update failed: Offline');
    expect(saveCurrent).toHaveBeenCalledWith('Freezer');
  });

  it.each([{ sourceType: 'manual', sourceKey: null, location: 'Freezer' }, { sourceType: 'usda', sourceKey: '456', location: '' }])('does not submit for invalid selection %o', ({ sourceType, sourceKey, location }) => {
    show(sourceType === 'usda' && sourceKey ? { sourceType, sourceKey } : null, location);
    expect(screen.getByRole('button', { name: 'Update default' })).toBeDisabled();
  });
});
