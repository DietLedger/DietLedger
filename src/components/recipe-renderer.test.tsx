import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RecipeRenderer, { type RecipeData } from './recipe-renderer';
import BookRenderer from './book-renderer';
import TemplatePreview from './template-preview';
import type { TemplateRecord } from '@/lib/types';
import { emptyNutrition } from '@/lib/recipe-types';
afterEach(cleanup);
describe('published recipe previews', () => {
  it.each(['book', 'template'])('forwards metadata through %s preview rather than stale/example nutrition', mode => {
    const recipe: RecipeData = { name: 'Chicken', description: 'Chef notes', servings: 4, servingName: '3 chicken strips, ¼ cup sauce', customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 992 }, source: 'NHLBI', sourceLabel: 'Official label text', missingNutrients: ['vitaminD'] }, ingredients: [], ingredientGroups: [], instructionSteps: [], instructionGroups: [] };
    const template: TemplateRecord = { id: 'template', name: 'Recipe', type: 'recipe', isDefault: true, createdAt: '', updatedAt: '', layout: { pageSize: 'card', orientation: 'portrait', margins: { top: 0, right: 0, bottom: 0, left: 0 }, sections: [{ id: 'title', type: 'title', visible: true, order: 0, column: 1, style: {} }, { id: 'nutrition', type: 'nutrition-label', visible: true, order: 1, column: 1, style: {} }], theme: { primaryColor: '#000', backgroundColor: '#fff', textColor: '#000', accentColor: '#000', fontFamily: 'inherit', borderRadius: 0 } } };
    render(mode === 'book' ? <BookRenderer chapters={[{ title: 'Dinners', items: [{ type: 'recipe', data: { recipe } }] }]} /> : <TemplatePreview template={template} recipe={recipe} />);
    expect(screen.getByText('Chef notes')).toBeInTheDocument();
    expect(screen.getByText('248')).toBeInTheDocument();
    expect(screen.getByText('Official label text')).toBeInTheDocument();
    expect(screen.getByText('Vitamin D').closest('div')).toHaveTextContent('Not reported');
  });
  it('renders authoritative nutrition/description/source even if an older caller provides stale ingredient totals', () => {
    const recipe: RecipeData = { name: 'Chicken', description: 'Chef notes', servings: 4, servingName: '3 chicken strips, ¼ cup sauce', customNutrition: { basis: 'recipeTotal', nutrients: { ...emptyNutrition(), calories: 992 }, source: 'NHLBI', sourceLabel: 'Official label text', missingNutrients: ['vitaminD'] }, ingredients: [], ingredientGroups: [], instructionSteps: [], instructionGroups: [] };
    render(<RecipeRenderer recipe={recipe} nutritionData={{ ...emptyNutrition(), calories: 100, servings: 4 }} />);
    expect(screen.getByText('Chef notes')).toBeInTheDocument();
    expect(screen.getByText('248')).toBeInTheDocument();
    expect(screen.getByText('Official label text')).toBeInTheDocument();
    expect(screen.getByText('Vitamin D').closest('div')).toHaveTextContent('Not reported');
    expect(screen.queryByText('4 3 chicken strips, ¼ cup sauces')).not.toBeInTheDocument();
    expect(screen.getAllByText(/3 chicken strips, ¼ cup sauce/).length).toBeGreaterThan(0);
  });
});
