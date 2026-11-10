import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IngredientStorageTag } from './ingredient-storage-tag';

describe('IngredientStorageTag', () => {
  it('keeps a valid storage-location tag visible beside a long ingredient name', () => {
    render(
      <p className="flex min-w-0">
        <span className="min-w-0 flex-1 truncate">A very long ingredient name that should be truncated</span>
        <IngredientStorageTag location="Refrigerator" />
      </p>,
    );

    const tag = screen.getByText('🧊 Refrigerator');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveClass('shrink-0');
  });

  it('does not render a tag for an empty or unsupported location', () => {
    const { rerender } = render(<IngredientStorageTag location="" />);
    expect(screen.queryByText(/Pantry|Refrigerator|Freezer|Countertop/)).not.toBeInTheDocument();
    rerender(<IngredientStorageTag location="invalid" />);
    expect(screen.queryByText(/invalid/)).not.toBeInTheDocument();
  });
});
