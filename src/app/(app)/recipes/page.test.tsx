import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RecipeTransferStatus } from '@/components/recipe/recipe-transfer-status';

describe('Recipes transfer status', () => {
  it('wraps long errors inside a bounded scroll area rather than truncating them', () => {
    const message = `Import failed: ${'book_pages_book_id_fkey'.repeat(30)}`;
    render(<RecipeTransferStatus status={{ kind: 'err', msg: message }} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveClass('max-h-32', 'overflow-y-auto');
    expect(screen.getByText(message)).toHaveClass('min-w-0', 'break-words');
    expect(screen.getByText(message)).not.toHaveClass('truncate');
  });

  it('renders no panel without a status, keeping short success messages compact', () => {
    const { rerender } = render(<RecipeTransferStatus status={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Import failed/)).not.toBeInTheDocument();
    rerender(<RecipeTransferStatus status={{ kind: 'ok', msg: 'Imported recipes' }} />);
    expect(screen.getByText('Imported recipes')).toHaveClass('truncate');
  });
});
