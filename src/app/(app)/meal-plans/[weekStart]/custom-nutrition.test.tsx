import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WeeklyPlanPage from './page';
import { emptyNutrition, toPublicRecipe } from '@/lib/recipe-types';
import type { RecipeRecord } from '@/lib/types';
const state = vi.hoisted(() => ({ recipe: {} as RecipeRecord }));
vi.mock('next/navigation', () => ({ useParams: () => ({ weekStart: '2026-11-16' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-recipes', () => ({ useRecipes: () => ({ data: [toPublicRecipe(state.recipe)] }) }));
vi.mock('@/hooks/use-settings', () => ({ useAppSettings: () => ({ data: {} }) }));
vi.mock('@/components/meal-plan/food-synergies-panel', () => ({ default: () => null }));
vi.mock('@/hooks/use-meal-plans', () => ({
  useWeekPlan: () => ({ data: { plan: { id: 'plan' }, entries: [{ id: 'entry', recipeId: 'recipe', sourceType: 'recipe', date: '2026-11-16', slot: 'noon', servings: 2 }], groups: [] } }),
  ...Object.fromEntries(['useEnsureMealPlan', 'useAddRecipeToSlot', 'useAddFoodToSlot', 'useRemoveEntry', 'useMoveEntry', 'useUpdateServings', 'useCreateMealGroup', 'useAddToGroup', 'useRemoveFromGroup', 'useDeleteMealGroupAndUngroup', 'useToggleLeftover', 'useUpdateSlotTimes', 'useReorderEntries'].map(name => [name, () => ({ mutate: vi.fn(), mutateAsync: vi.fn() })])),
}));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => new Proxy({}, { get: () => async () => [] }) }));
afterEach(cleanup);
describe('meal planner custom recipe nutrition', () => {
  it.each([true, false])('shows two official servings/unknown nutrients (custom override=%s)', custom => {
    state.recipe = { id: 'recipe', name: 'Official dinner', servings: 4, servingName: '3 chicken strips, ¼ cup sauce', instructions: null, ingredientGroups: [], createdAt: '', updatedAt: '',
      ingredients: [{ ...emptyNutrition(), calories: custom ? 100 : 992, id: 'ingredient', recipeId: 'recipe', fdcId: -1, name: 'Child', amount: 1, unit: '× recipe', description: '', groupId: null, linkedRecipeId: 'child', prepInstructions: [], missingNutrients: ['vitaminD'] }],
      ...(custom ? { customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 992 }, source: 'NHLBI', sourceLabel: '248 calories per serving', missingNutrients: ['vitaminD'] } } : {}),
    };
    render(<QueryClientProvider client={new QueryClient()}><WeeklyPlanPage /></QueryClientProvider>);
    fireEvent.click(screen.getByText('Mon'));
    fireEvent.click(screen.getByText('Official dinner'));
    expect(screen.getByText('496')).toBeInTheDocument();
    expect(screen.getByText('Vitamin D').closest('div')).toHaveTextContent('Not reported');
    if (custom) expect(screen.getByText('248 calories per serving')).toBeInTheDocument();
  });
});
