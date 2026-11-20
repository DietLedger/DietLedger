import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import BookExportPage from '@/app/(app)/books/[id]/export/page';
import { CookbookExport } from './cookbook-export';

const bundle = { format: 'dietledger.recipe-bundle', version: 2, books: [{ title: 'Weeknight Meals' }] };
const { exportCookbookMock, exportRecipeBundleMock, getBooksMock, toastErrorMock } = vi.hoisted(() => ({
  exportCookbookMock: vi.fn(async () => new Blob(['pdf'])),
  exportRecipeBundleMock: vi.fn(),
  getBooksMock: vi.fn(async () => [{ id: 'book-1', title: 'My Cookbook' }]),
  toastErrorMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'weeknight' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/hooks/use-books', () => ({
  useBookDetail: () => ({ data: { book: { id: 'weeknight', title: 'Weeknight Meals' } } }),
}));
vi.mock('@/components/breadcrumb-context', () => ({ useSetBreadcrumbLabel: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ toast: toastErrorMock }));

vi.mock('@/lib/api-client', () => ({
  getApiClient: () => ({
    getBooks: getBooksMock,
    getBrandKits: async () => [],
    exportRecipeBundle: exportRecipeBundleMock,
  }),
}));
vi.mock('@/lib/pdf-export', () => ({ exportCookbook: exportCookbookMock }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});

const downloads: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  exportRecipeBundleMock.mockReset().mockResolvedValue(bundle);
  downloads.length = 0;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

describe('Print Studio cookbook PDF export', () => {

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
    render(<CookbookExport />);

    await user.click((await screen.findAllByRole('combobox'))[0]);
    await user.click(await screen.findByRole('option', { name: 'My Cookbook' }));
    await user.click(screen.getByRole('combobox', { name: 'Measurement units' }));
    await user.click(screen.getByRole('option', { name: 'Grams' }));
    await user.click(screen.getByRole('button', { name: 'Export Cookbook PDF' }));

    await waitFor(() => expect(exportCookbookMock).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'book-1', measurementSystem: 'grams' })));
  });
});

describe('cookbook Export page', () => {
  async function chooseBundle(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('combobox', { name: 'Export format' }));
    await user.click(screen.getByRole('option', { name: 'DietLedger bundle' }));
  }

  it('defaults to PDF and applies print settings to the cookbook in the URL', async () => {
    const user = userEvent.setup();
    render(<BookExportPage />);

    expect(await screen.findByRole('combobox', { name: 'Export format' })).toHaveTextContent('PDF');
    const exportButton = screen.getByRole('button', { name: 'Export Cookbook PDF' });
    expect(exportButton).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: 'Measurement units' }));
    await user.click(screen.getByRole('option', { name: 'Metric' }));
    await user.click(exportButton);

    expect(exportCookbookMock).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'weeknight', measurementSystem: 'metric' }));
    expect(downloads).toEqual(['Weeknight Meals.pdf']);
    expect(exportRecipeBundleMock).not.toHaveBeenCalled();
  });

  it('downloads the native bundle for the current cookbook without print settings', async () => {
    const user = userEvent.setup();
    render(<BookExportPage />);
    await chooseBundle(user);

    expect(screen.queryByText('Measurement units')).not.toBeInTheDocument();
    expect(screen.queryByText('Brand Kit (optional)')).not.toBeInTheDocument();
    expect(screen.queryByText('Page Size')).not.toBeInTheDocument();
    expect(screen.queryByText('Cover Page')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export DietLedger bundle' }));

    expect(exportRecipeBundleMock).toHaveBeenCalledExactlyOnceWith({ bookIds: ['weeknight'] });
    expect(downloads).toEqual(['weeknight_meals.dietledger-bundle.json']);
    expect(exportCookbookMock).not.toHaveBeenCalled();
    expect(getBooksMock).not.toHaveBeenCalled();
  });

  it('prevents a duplicate export and allows retry after a bundle error', async () => {
    const user = userEvent.setup();
    let rejectBundle!: (error: Error) => void;
    exportRecipeBundleMock.mockReturnValueOnce(new Promise((_, reject) => { rejectBundle = reject; }));
    render(<BookExportPage />);
    await chooseBundle(user);
    await user.click(screen.getByRole('button', { name: 'Export DietLedger bundle' }));

    expect(screen.getByRole('button', { name: 'Exporting...' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Export format' })).toBeDisabled();
    expect(screen.queryByText('Generating PDF...')).not.toBeInTheDocument();
    await act(async () => rejectBundle(new Error('Not allowed to export selected item')));

    expect(toastErrorMock).toHaveBeenCalledWith({ title: 'Export failed', description: 'Not allowed to export selected item', variant: 'destructive' });
    expect(downloads).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Export DietLedger bundle' }));
    expect(downloads).toEqual(['weeknight_meals.dietledger-bundle.json']);
  });
});
