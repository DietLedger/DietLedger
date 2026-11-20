import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomNutritionEditor, CustomNutritionNotice } from './custom-nutrition-editor';
import { emptyNutrition } from '@/lib/recipe-types';
import NutritionLabel from '@/components/nutrition-label';
afterEach(cleanup);
const customNutrition = { basis: 'recipeTotal' as const, nutrients: { ...emptyNutrition(), calories: 992 }, source: 'NHLBI', sourceLabel: '248 calories per serving', missingNutrients: ['vitaminD'] };
describe('custom recipe nutrition authoring', () => {
  it('authors whole-recipe facts and description, treating blank facts as missing, never implicit measured zeros', async () => {
    const save = vi.fn().mockResolvedValue({}); const user = userEvent.setup();
    render(<CustomNutritionEditor recipe={{ description: '' }} onSave={save} />);
    await user.click(screen.getByRole('button', { name: 'Edit description and nutrition' }));
    await user.type(screen.getByLabelText('Recipe description'), 'Chef notes');
    await user.click(screen.getByLabelText('Use custom recipe nutrition'));
    await user.type(screen.getByLabelText('Nutrition source'), 'NHLBI');
    await user.type(screen.getByLabelText('Original nutrition label'), '248 calories per serving');
    await user.type(screen.getByLabelText('Calories (kcal), whole recipe'), '992');
    await user.type(screen.getByLabelText('Total Fat (g), whole recipe'), '0');
    await user.click(screen.getByRole('button', { name: 'Save description and nutrition' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ description: 'Chef notes', customNutrition: expect.objectContaining({ basis: 'recipeTotal', source: 'NHLBI', nutrients: { ...emptyNutrition(), calories: 992 }, missingNutrients: expect.arrayContaining(['vitaminD', 'protein']) }) })));
    expect(save.mock.calls[0][0].customNutrition.missingNutrients).not.toContain('totalFat');
  });
  it('discloses source/missing facts and supports explicit override removal with visible save errors', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Save unavailable')).mockResolvedValue({}); const user = userEvent.setup();
    render(<CustomNutritionEditor recipe={{ customNutrition }} onSave={save} />);
    expect(screen.getByText(/Not reported.*vitaminD/)).toBeInTheDocument();
    expect(screen.getByText('248 calories per serving')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit description and nutrition' }));
    await user.click(screen.getByLabelText('Use custom recipe nutrition'));
    await user.click(screen.getByRole('button', { name: 'Save description and nutrition' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable');
    await user.click(screen.getByRole('button', { name: 'Save description and nutrition' }));
    expect(save).toHaveBeenLastCalledWith({ description: '', customNutrition: null });
  });
  it('enforces the server nutrient bound while enabled but permits disabling an invalid stale numeric draft', async () => {
    const save = vi.fn().mockResolvedValue({}); const user = userEvent.setup();
    render(<CustomNutritionEditor recipe={{ customNutrition }} onSave={save} />);
    await user.click(screen.getByRole('button', { name: 'Edit description and nutrition' }));
    const input = screen.getByLabelText('Calories (kcal), whole recipe');
    expect(input).toHaveAttribute('max', '1000000');
    fireEvent.change(input, { target: { value: '1000001' } });
    await user.click(screen.getByRole('button', { name: 'Save description and nutrition' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1,000,000');
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('Use custom recipe nutrition'));
    await user.type(screen.getByLabelText('Recipe description'), 'Description only');
    await user.click(screen.getByRole('button', { name: 'Save description and nutrition' }));
    expect(save).toHaveBeenCalledWith({ description: 'Description only', customNutrition: null });
  });

  it('does not print a missing nutrient as measured zero or a zero percent daily value', () => {
    render(<><CustomNutritionNotice nutrition={customNutrition} /><NutritionLabel data={{ ...customNutrition.nutrients, servings: 4, missingNutrients: ['vitaminD'] }} /></>);
    const row = screen.getByText('Vitamin D').closest('div')!;
    expect(row).toHaveTextContent('Not reported');
    expect(row).not.toHaveTextContent('0mcg');
    expect(row).not.toHaveTextContent('0%');
  });
});
