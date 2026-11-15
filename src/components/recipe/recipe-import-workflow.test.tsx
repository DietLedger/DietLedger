import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRecipeImport } from './recipe-import-workflow';

const api = vi.hoisted(() => ({ importRecipeBundle: vi.fn(), decideRecipeImport: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => api }));
const summary = { created: { recipes: 1 }, updated: {}, reused: {}, skipped: {}, conflicts: [], quarantined: 2 };
function ImportControl() {
  const { importFile, decisionDialog } = useRecipeImport();
  const [status, setStatus] = React.useState('');
  return <>{decisionDialog}<button onClick={async () => {
    const file = { name: 'recipes.json', text: async () => JSON.stringify({ format: 'dietledger.recipe-bundle', version: 2 }) } as File;
    try { const result = await importFile(file); setStatus(`Done: ${result.quarantined} quarantined`); } catch (error) { setStatus(String(error)); }
  }}>Import file</button><p>{status}</p></>;
}
function renderControl() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ImportControl /></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  api.importRecipeBundle.mockResolvedValue({ ...summary, pendingImportId: 'batch', requiresDecision: true });
  api.decideRecipeImport.mockResolvedValue(summary);
});
afterEach(cleanup);

describe('shared missing-record decision workflow', () => {
  it.each([['Stop and undo', 'cancel'], ['Relink later', 'keep']] as const)('requires explicit %s before completing import', async (label, action) => {
    const user = userEvent.setup();
    const client = renderControl();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await user.click(screen.getByRole('button', { name: 'Import file' }));
    expect(await screen.findByRole('dialog', { name: 'Missing food records' })).toHaveTextContent(/entire incoming batch/i);
    expect(api.decideRecipeImport).not.toHaveBeenCalled();
    expect(screen.queryByText(/Done:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(api.decideRecipeImport).toHaveBeenCalledWith('batch', action));
    expect(await screen.findByText(/Done:/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['recipe-imports'] });
  });

  it('retains the recoverable stage and dialog on decision failure, supports retry without importing again', async () => {
    api.decideRecipeImport.mockRejectedValueOnce(new Error('Connection lost'));
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole('button', { name: 'Import file' }));
    await user.click(await screen.findByRole('button', { name: 'Relink later' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Connection lost/);
    expect(screen.getByRole('dialog')).toHaveTextContent(/preserved/i);
    await user.click(screen.getByRole('button', { name: 'Relink later' }));
    await screen.findByText('Done: 2 quarantined');
    expect(api.importRecipeBundle).toHaveBeenCalledOnce();
  });

  it('does not dismiss or finish while a decision is pending', async () => {
    let resolve!: (value: typeof summary) => void;
    api.decideRecipeImport.mockReturnValue(new Promise(done => { resolve = done; }));
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole('button', { name: 'Import file' }));
    await user.click(await screen.findByRole('button', { name: 'Relink later' }));
    expect(screen.getByRole('button', { name: 'Stop and undo' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => resolve(summary));
    await screen.findByText('Done: 2 quarantined');
  });
});
