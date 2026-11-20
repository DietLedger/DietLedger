import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BreadcrumbProvider } from '@/components/breadcrumb-context';
import SharedRecipePage from './page';
import { emptyNutrition } from '@/lib/recipe-types';
const state = vi.hoisted(() => ({ snapshot: '' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ shareId: 'share' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({ getSharedRecipe: async () => ({ id: 'share', title: 'Chicken', recipeData: state.snapshot, tags: '', description: '' }) }) }));
afterEach(cleanup);
describe('shared published nutrition', () => {
  it.each([true, false])('retains parsed metadata and missing nutrient semantics (override=%s)', async custom => {
    state.snapshot = JSON.stringify({ name: 'Chicken', description: 'Chef notes', servings: 4, servingName: '3 chicken strips, ¼ cup sauce',
      ingredients: [{ ...emptyNutrition(), calories: custom ? 100 : 992, id: 'ingredient', name: 'Linked child', amount: 1, unit: '× recipe', groupId: null, linkedRecipeId: 'child', prepInstructions: [], storageLocation: '', missingNutrients: ['vitaminD'] }],
      ...(custom ? { customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 992 }, source: 'NHLBI', sourceLabel: 'Official source label', missingNutrients: ['vitaminD'] } } : {}),
    });
    render(<QueryClientProvider client={new QueryClient()}><BreadcrumbProvider><SharedRecipePage /></BreadcrumbProvider></QueryClientProvider>);
    expect(await screen.findByText('248')).toBeInTheDocument();
    expect(screen.getByText('Chef notes')).toBeInTheDocument();
    expect(screen.getByText('Vitamin D').closest('div')).toHaveTextContent('Not reported');
    if (custom) expect(screen.getAllByText('Official source label').length).toBeGreaterThan(0);
    expect(screen.queryByText('4 3 chicken strips, ¼ cup sauces')).not.toBeInTheDocument();
  });
});
