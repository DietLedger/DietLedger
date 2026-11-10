import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import EditBookPage from './page';

const { push, update, bookState } = vi.hoisted(() => ({ push: vi.fn(), update: vi.fn().mockResolvedValue({}), bookState: { current: { id: 'book-1', title: 'Public Domain Recipes', description: 'Author: Various', coverColor: '#526c54' } } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'book-1' }), useRouter: () => ({ push }) }));
vi.mock('@/hooks/use-books', () => {
  return {
  useBookDetail: () => ({ data: { book: bookState.current }, isLoading: false }),
  useUpdateBook: () => ({ mutateAsync: update, isPending: false }),
};
});

describe('Edit Book', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookState.current = { id: 'book-1', title: 'Public Domain Recipes', description: 'Author: Various', coverColor: '#526c54' };
  });
  it('edits book metadata instead of displaying the recipe editor', async () => {
    render(<EditBookPage />);
    expect(screen.getByRole('heading', { name: 'Edit Book' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Revised Book' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Author: Various' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Book' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: 'book-1', data: { title: 'Revised Book', description: 'Author: Various', coverColor: '#526c54' } }));
    expect(push).toHaveBeenCalledWith('/books/book-1');
  });
  it('keeps an unsaved draft during a background refetch of the same book', () => {
    const { rerender } = render(<EditBookPage />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Draft Title' } });
    bookState.current = { ...bookState.current, title: 'Server Title' };
    rerender(<EditBookPage />);
    expect(screen.getByLabelText('Title')).toHaveValue('My Draft Title');
  });
  it('cancels without writing metadata', () => {
    render(<EditBookPage />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(update).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/books/book-1');
  });
});
