import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DietaryProfileList } from './dietary-profile-editor';
import { useDietarySelection } from '@/lib/dietary-selection';
import type { DietaryProfileRecord } from '@/lib/types';
const mocks = vi.hoisted(() => ({ update: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({ getDietaryProfiles: mocks.get, updateDietaryProfile: mocks.update }) }));
let saved: DietaryProfileRecord;
beforeEach(() => {
  useDietarySelection.setState({ activeProfileId: null });
  saved = { id: 'starter', name: 'Diabetes-aware', allergens: [], dietaryTags: ['diabetesAware'], nutrientThresholds: [{ nutrient: 'sodium', dailyMax: 2300, alertLevel: 'warning' }, { nutrient: 'dietaryFiber', per1000KcalMin: 14, alertLevel: 'warning' }], isActive: false, createdAt: '', updatedAt: '' };
  mocks.get.mockReset().mockImplementation(async () => [saved]);
  mocks.update.mockReset().mockImplementation(async (_id: string, data: Partial<DietaryProfileRecord>) => { saved = { ...saved, ...data, updatedAt: 'changed' }; return saved; });
});
afterEach(cleanup);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DietaryProfileList /></QueryClientProvider>);
}
describe('editable default profile', () => {
  it('edits the default, refreshes the list, and reloads the saved targets after reopening', async () => {
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: 'Edit Diabetes-aware' }));
    fireEvent.change(screen.getByLabelText('Profile Name'), { target: { value: 'My diabetes targets' } });
    fireEvent.change(screen.getByLabelText('dietaryFiber Minimum g per 1,000 kcal'), { target: { value: '20' } });
    await user.click(screen.getByRole('button', { name: 'Update Profile' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(await screen.findByRole('button', { name: 'Edit My diabetes targets' }));
    expect(screen.getByLabelText('dietaryFiber Minimum g per 1,000 kcal')).toHaveValue(20);
    expect(mocks.update).toHaveBeenCalledWith('starter', expect.objectContaining({ name: 'My diabetes targets', nutrientThresholds: expect.arrayContaining([expect.objectContaining({ nutrient: 'dietaryFiber', per1000KcalMin: 20 })]) }));
  });
  it('keeps edits open and displays a failed save without falsely reporting success', async () => {
    mocks.update.mockRejectedValue(new Error('Invalid nutrition target'));
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: 'Edit Diabetes-aware' }));
    await user.click(screen.getByRole('button', { name: 'Update Profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid nutrition target');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Profile' })).not.toBeDisabled();
  });
});
