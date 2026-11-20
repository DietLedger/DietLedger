import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddFoodLogDialog } from './add-food-log-dialog';
import { emptyNutrition } from '@/lib/recipe-types';
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/hooks/use-nutrition', () => ({ useAddFoodLogEntry: () => ({ mutateAsync: mocks.save }), useUpdateFoodLogEntry: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({ getRecipes: async () => ({ data: [{ id: 'chicken', name: 'Official chicken', servings: 4 }] }), getCustomFoods: async () => [], getRecipe: async () => ({ id: 'chicken', name: 'Official chicken', servings: 4, ingredients: [{ calories: 100 }], customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 992 }, source: 'NHLBI', sourceLabel: '248 calories per serving', missingNutrients: ['vitaminD'] } }) }) }));
afterEach(cleanup);
describe('custom recipe food logging', () => {
  it('logs two official 248kcal servings as an immutable 496kcal snapshot, not ingredient sums', async () => {
    mocks.save.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AddFoodLogDialog open onOpenChange={() => {}} profileId="person" />);
    await user.click(await screen.findByRole('button', { name: /Official chicken/ }));
    expect(await screen.findByText(/248 calories per serving/)).toBeInTheDocument();
    const servings = screen.getByLabelText('Servings');
    await user.clear(servings); await user.type(servings, '2');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'recipe', sourceId: 'chicken', servings: 2, calories: 496 })));
  });
});
