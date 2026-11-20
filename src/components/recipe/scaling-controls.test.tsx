import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ScalingControls } from './scaling-controls';

afterEach(cleanup);

function mount(onApplyScale = vi.fn()) {
  render(<TooltipProvider><ScalingControls recipe={{
    id: 'recipe', servings: 2, ingredients: [
      { id: 'sauce', name: 'Tomato sauce, canned, no salt added', amount: 4, unit: 'tbsp' },
      { id: 'oregano', name: 'Oregano, dried', amount: 1, unit: 'tsp' },
      { id: 'basil', name: 'Basil, fresh', amount: 1, unit: 'leaf' },
    ],
  }} onApplyScale={onApplyScale} /></TooltipProvider>);
  return onApplyScale;
}

describe('ScalingControls', () => {
  it('shows exact proportional amounts by default and applies those same values', async () => {
    const user = userEvent.setup();
    const onApply = mount();
    await user.click(screen.getByRole('button', { name: 'Multiplier' }));
    await user.click(screen.getByRole('button', { name: '2x' }));
    expect(screen.getByText('8 tbsp')).toBeInTheDocument();
    expect(screen.getByText('2 tsp')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply Scale' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      ingredients: expect.arrayContaining([
        expect.objectContaining({ id: 'sauce', scaledAmount: 8, scaledUnit: 'tbsp', displayAmount: '8' }),
        expect.objectContaining({ id: 'oregano', scaledAmount: 2, scaledUnit: 'tsp', displayAmount: '2' }),
      ]),
    }));
  });

  it('offers beta seasoning estimates only for eligible dried seasonings and allows per-row proportional override', async () => {
    const user = userEvent.setup();
    const onApply = mount();
    await user.click(screen.getByRole('button', { name: 'Multiplier' }));
    await user.click(screen.getByRole('button', { name: '2x' }));
    await user.click(screen.getByLabelText('Large batch scaling (Beta)'));
    expect(screen.getByText('1 ½ tsp')).toBeInTheDocument();
    expect(screen.getByText('2 leaf')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Proportional'));
    expect(screen.getByText('2 tsp')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply Scale' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      ingredients: expect.arrayContaining([
        expect.objectContaining({ id: 'oregano', scaledAmount: 2 }),
        expect.objectContaining({ id: 'basil', scaledAmount: 2 }),
      ]),
    }));
  });

  it('warns and stays proportional above fourfold scale', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Multiplier' }));
    fireEvent.click(screen.getByRole('button', { name: '4x' }));
    // Scale through the servings input, which can exceed the quick multiplier choices.
    await user.click(screen.getByRole('button', { name: 'Servings' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
    await user.click(screen.getByLabelText('Large batch scaling (Beta)'));
    expect(screen.getByText(/Above 4x, seasoning amounts remain proportional/)).toBeInTheDocument();
    expect(screen.getByText('5 tsp')).toBeInTheDocument();
  });
});
