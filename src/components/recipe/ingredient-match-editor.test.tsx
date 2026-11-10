import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getApiClient } from '@/lib/api-client';
import type { Ingredient } from '@/lib/recipe-types';
import { IngredientMatchEditor } from './ingredient-match-editor';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, getApiClient: vi.fn() };
});

const ingredient = {
  id: 'ingredient-1', fdcId: 123, name: 'Seasoning', amount: 2, unit: 'tsp',
  description: '', calories: 5, totalFat: 0, saturatedFat: 0, transFat: 0,
  cholesterol: 0, sodium: 0, totalCarbs: 1, dietaryFiber: 0, totalSugars: 0,
  addedSugars: 0, protein: 0, vitaminD: 0, calcium: 0, iron: 0, potassium: 0,
  groupId: null, linkedRecipeId: null, sourceType: 'usda', sourceKey: '123',
  prepInstructions: [], storageLocation: '',
} as Ingredient;

function show(onRematch = vi.fn().mockResolvedValue(undefined), currentIngredient = ingredient) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <IngredientMatchEditor ingredient={currentIngredient} amount={2} unit="tsp" onRematch={onRematch} />
    </QueryClientProvider>,
  );
  return { onRematch };
}

async function searchFor(query: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Change match' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search database foods' }), { target: { value: query } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
}

describe('IngredientMatchEditor', () => {
  it('labels an explicitly selected no-nutrition ingredient instead of suggesting a database match is missing', () => {
    show(undefined, { ...ingredient, fdcId: -3, sourceType: 'manual', sourceKey: null });
    expect(screen.getByText('No nutrition selected')).toBeInTheDocument();
  });

  it('never offers a nutritionally empty custom food as a database match', async () => {
    const customFood = {
      id: 'custom-spice', name: 'Zero-calorie spice blend', calories: 0,
      totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 0,
      totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0, protein: 0,
      vitaminD: 0, calcium: 0, iron: 0, potassium: 0, createdAt: '2026-01-01',
    };
    const salt = { ...customFood, id: 'custom-salt', name: 'Salt spice with sodium', sodium: 38758 };
    vi.mocked(getApiClient).mockReturnValue({
      searchFoods: vi.fn().mockResolvedValue({ data: [] }),
      getCustomFoods: vi.fn().mockResolvedValue([customFood, salt]),
    } as any);
    show();

    await searchFor('spice');

    expect(await screen.findByRole('button', { name: 'Salt spice with sodium' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zero-calorie spice blend' })).not.toBeInTheDocument();
  });

  it('offers an explicit no-nutrition action for spices without selecting a zero-calorie food record', async () => {
    vi.mocked(getApiClient).mockReturnValue({
      searchFoods: vi.fn().mockResolvedValue({ data: [] }),
      getCustomFoods: vi.fn().mockResolvedValue([]),
    } as any);
    const { onRematch } = show();

    fireEvent.click(screen.getByRole('button', { name: 'Use no nutrition' }));

    await waitFor(() => expect(onRematch).toHaveBeenCalledWith(
      expect.objectContaining({ fdcId: -3, dataType: 'No nutrition', nutrients: expect.objectContaining({ calories: 0 }) }),
      2,
      'tsp',
    ));
  });

  it('offers and resolves zero-calorie USDA foods when they have meaningful nutrients', async () => {
    const salt = {
      fdcId: 173468, description: 'Salt, table', dataType: 'SR Legacy',
      servingSize: 100, servingSizeUnit: 'g', calories: 0, totalFat: 0,
      saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 38758,
      totalCarbs: 0, dietaryFiber: 0, totalSugars: 0, addedSugars: 0,
      protein: 0, vitaminD: 0, calcium: 0, iron: 0, potassium: 0,
    };
    const getFoodByFdcId = vi.fn().mockResolvedValue(salt);
    vi.mocked(getApiClient).mockReturnValue({
      searchFoods: vi.fn().mockResolvedValue({ data: [salt] }),
      getCustomFoods: vi.fn().mockResolvedValue([]),
      getFoodByFdcId,
    } as any);
    const { onRematch } = show();

    await searchFor('salt');
    fireEvent.click(await screen.findByRole('button', { name: 'Salt, table' }));

    await waitFor(() => expect(onRematch).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Salt, table',
        nutrients: expect.objectContaining({ calories: 0, sodium: 38758 }),
      }),
      2,
      'tsp',
    ));
    expect(getFoodByFdcId).toHaveBeenCalledWith(173468);
  });

  it('uses the selected search snapshot when by-ID lookup has a conflicting nutrient snapshot', async () => {
    const searchFood = {
      fdcId: 174260, description: 'Peanuts, all types, cooked, boiled, with salt',
      dataType: 'SR Legacy', brandOwner: null, servingSize: 100, servingSizeUnit: 'g',
      calories: 318, totalFat: 22, saturatedFat: 3, transFat: 0, cholesterol: 0,
      sodium: 751, totalCarbs: 21, dietaryFiber: 9, totalSugars: 4, addedSugars: 0,
      protein: 13, vitaminD: 0, calcium: 55, iron: 2, potassium: 180,
    };
    const conflictingByIdFood = { ...searchFood, calories: 0, totalFat: 0, sodium: 0, totalCarbs: 0, protein: 0 };
    const getFoodByFdcId = vi.fn().mockResolvedValue(conflictingByIdFood);
    vi.mocked(getApiClient).mockReturnValue({
      searchFoods: vi.fn().mockResolvedValue({ data: [searchFood] }),
      getCustomFoods: vi.fn().mockResolvedValue([]),
      getFoodByFdcId,
    } as any);
    const { onRematch } = show();

    await searchFor('peanuts');
    fireEvent.click(await screen.findByRole('button', { name: searchFood.description }));

    await waitFor(() => expect(onRematch).toHaveBeenCalledWith(
      expect.objectContaining({ description: searchFood.description, nutrients: expect.objectContaining({ calories: 318 }) }),
      2,
      'tsp',
    ));
    expect(getFoodByFdcId).toHaveBeenCalledWith(174260);
  });

  it('resolves the selected USDA food and passes its nutrition with the current measurement', async () => {
    const food = {
      fdcId: 456, description: 'Paprika', dataType: 'Foundation', brandOwner: null,
      servingSize: 100, servingSizeUnit: 'g', calories: 282,
      totalFat: 13, saturatedFat: 2, transFat: 0, cholesterol: 0, sodium: 68,
      totalCarbs: 54, dietaryFiber: 35, totalSugars: 10, addedSugars: 0,
      protein: 14, vitaminD: 0, calcium: 229, iron: 21, potassium: 2280,
    };
    const getFoodByFdcId = vi.fn().mockResolvedValue(food);
    vi.mocked(getApiClient).mockReturnValue({
      searchFoods: vi.fn().mockResolvedValue({ data: [food] }),
      getCustomFoods: vi.fn().mockResolvedValue([]),
      getFoodByFdcId,
    } as any);
    const { onRematch } = show();

    await searchFor('paprika');
    fireEvent.click(await screen.findByRole('button', { name: 'Paprika' }));

    await waitFor(() => expect(onRematch).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Paprika', nutrients: expect.objectContaining({ calories: 282 }) }),
      2,
      'tsp',
    ));
    expect(getFoodByFdcId).toHaveBeenCalledWith(456);
  });
});
