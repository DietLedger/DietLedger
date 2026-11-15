import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeImportDialog } from './recipe-import-dialog';
import { parseSeedRecipeMarkdown } from '@/lib/recipe-import';

const api = vi.hoisted(() => ({ getCustomFoods: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ getApiClient: () => api }));
vi.mock('@/lib/fda-client', () => ({ searchFDAFoods: async () => ({ foods: [], source: 'local' }) }));
afterEach(cleanup);

it('the actual import dialog allows saving every unresolved row for quarantine', async () => {
  const save = vi.fn();
  render(<RecipeImportDialog open drafts={[parseSeedRecipeMarkdown('# Soup\n## Ingredients\n- 100 g Mystery')]} currentIndex={0} isSaving={false} onOpenChange={vi.fn()} onDraftChange={vi.fn()} onUndoCurrent={vi.fn()} onSaveCurrent={save} onSkipCurrent={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Save all changes' })).toBeEnabled();
  expect(screen.getByRole('dialog')).toHaveTextContent(/quarantine/i);
  await userEvent.click(screen.getByRole('button', { name: 'Save all changes' }));
  expect(save).toHaveBeenCalledOnce();
});
