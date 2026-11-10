import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CookbookExport } from './cookbook-export';

const exportCookbookMock = vi.hoisted(() => vi.fn(async () => new Blob(['pdf'])));

vi.mock('@/lib/api-client', () => ({
  getApiClient: () => ({
    getBooks: async () => [{ id: 'book-1', title: 'My Cookbook' }],
    getBrandKits: async () => [],
  }),
}));
vi.mock('@/lib/pdf-export', () => ({ exportCookbook: exportCookbookMock }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  HTMLAnchorElement.prototype.click = vi.fn();
});

describe('cookbook PDF export', () => {
  beforeEach(() => exportCookbookMock.mockClear());

  it('requires choosing measurement units even after a book is selected', async () => {
    const user = userEvent.setup();
    render(<CookbookExport />);

    await user.click((await screen.findAllByRole('combobox'))[0]);
    await user.click(await screen.findByRole('option', { name: 'My Cookbook' }));

    expect(screen.getByRole('button', { name: 'Export Cookbook PDF' })).toBeDisabled();
    expect(screen.getByText('Measurement units')).toBeInTheDocument();
    expect(exportCookbookMock).not.toHaveBeenCalled();
  });

  it('passes the chosen units to the PDF generator', async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    render(<CookbookExport />);

    await user.click((await screen.findAllByRole('combobox'))[0]);
    await user.click(await screen.findByRole('option', { name: 'My Cookbook' }));
    await user.click(screen.getByRole('combobox', { name: 'Measurement units' }));
    await user.click(screen.getByRole('option', { name: 'Grams' }));
    await user.click(screen.getByRole('button', { name: 'Export Cookbook PDF' }));

    await waitFor(() => expect(exportCookbookMock).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'book-1', measurementSystem: 'grams' })));
  });
});
