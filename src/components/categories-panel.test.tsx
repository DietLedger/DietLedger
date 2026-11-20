import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CategoriesPanel from './categories-panel';
import type { CategoryRecord } from '@/lib/types';

const api = vi.hoisted(() => ({ getCategories: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => api }));
afterEach(cleanup);

const category = (id: string, name: string, parentId: string | null = null): CategoryRecord => ({
  id, name, parentId, createdAt: '', updatedAt: '',
});

beforeEach(() => {
  vi.resetAllMocks();
  api.getCategories.mockResolvedValue([
    category('desserts', 'Desserts'), category('cakes', 'Cakes', 'desserts'), category('soups', 'Soups'),
  ]);
  api.deleteCategory.mockResolvedValue(undefined);
});

function renderPanel(readOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><CategoriesPanel readOnly={readOnly} /></QueryClientProvider>);
}

async function openConfirmation() {
  await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));
  return screen.getByRole('alertdialog');
}

describe('admin category bulk deletion', () => {
  it('toggles individual categories independently and selects all or none, including collapsed children', async () => {
    renderPanel();
    const dessert = await screen.findByRole('checkbox', { name: 'Select Desserts' });
    const cakes = screen.getByRole('checkbox', { name: 'Select Cakes' });
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeDisabled();
    await userEvent.click(dessert);
    expect(dessert).toBeChecked();
    expect(cakes).not.toBeChecked();
    await userEvent.click(dessert);
    expect(dessert).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Desserts' }));
    await userEvent.click(screen.getByRole('button', { name: 'all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Expand Desserts' }));
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'none' }));
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeDisabled();
  });

  it('warns about cascading subcategories and sends no requests on cancel', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Desserts' }));
    const dialog = await openConfirmation();
    expect(dialog).toHaveTextContent(/subcategories.*not checked/i);
    expect(dialog).toHaveTextContent(/recipes.*not.*deleted/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteCategory).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Select Desserts' })).toBeChecked();
  });

  it('deletes only checked categories and clears selection after success', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Cakes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Soups' }));
    const dialog = await openConfirmation();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteCategory.mock.calls.map(([id]) => id)).toEqual(['cakes', 'soups']));
    await waitFor(() => expect(screen.getByRole('button', { name: /delete selected/i })).toBeDisabled());
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('refreshes the tree after deleting a parent and its unchecked descendants', async () => {
    let categories = [category('desserts', 'Desserts'), category('cakes', 'Cakes', 'desserts'), category('soups', 'Soups')];
    api.getCategories.mockImplementation(async () => categories);
    api.deleteCategory.mockImplementation(async () => {
      categories = categories.filter((category) => category.id === 'soups');
    });
    renderPanel();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Desserts' }));
    const dialog = await openConfirmation();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Desserts')).not.toBeInTheDocument());
    expect(screen.queryByText('Cakes')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Soups' })).not.toBeChecked();
    expect(api.deleteCategory).toHaveBeenCalledExactlyOnceWith('desserts');
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeDisabled();
  });

  it('blocks duplicate submission and selection changes while deleting', async () => {
    let finish!: () => void;
    api.deleteCategory.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderPanel();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Soups' }));
    const dialog = await openConfirmation();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(within(dialog).getByRole('button', { name: /deleting/i })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // Radix hides background content from the accessibility tree while the modal is open.
    for (const checkbox of screen.getAllByRole('checkbox', { hidden: true })) expect(checkbox).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.deleteCategory).toHaveBeenCalledOnce();
  });

  it('reports partial failure and retains only unsuccessful selections for retry', async () => {
    api.deleteCategory.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Permission denied'));
    renderPanel();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Cakes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Soups' }));
    const dialog = await openConfirmation();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Permission denied/);
    expect(screen.getByRole('checkbox', { name: 'Select Cakes' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Soups' })).toBeChecked();
    api.deleteCategory.mockResolvedValue(undefined);
    const retryDialog = await openConfirmation();
    await userEvent.click(within(retryDialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteCategory.mock.calls.map(([id]) => id)).toEqual(['cakes', 'soups', 'soups']));
  });

  it('returns focus to bulk delete on cancel and to Create Category after successful deletion', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Soups' }));
    let dialog = await openConfirmation();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /delete selected/i })).toHaveFocus());
    dialog = await openConfirmation();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Category' })).toHaveFocus());
  });

  it('does not expose bulk controls in the read-only view', async () => {
    renderPanel(true);
    await screen.findByText('Desserts');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete selected|^all$|^none$/i })).not.toBeInTheDocument();
  });

  it('does not allow deletion when the list is empty', async () => {
    api.getCategories.mockResolvedValue([]);
    renderPanel();
    await screen.findByText('No Categories Yet');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    const deleteButton = screen.queryByRole('button', { name: /delete selected/i });
    if (deleteButton) expect(deleteButton).toBeDisabled();
    expect(api.deleteCategory).not.toHaveBeenCalled();
  });
});
