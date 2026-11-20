import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CookbookExport } from './cookbook-export';
import { NutritionPdfReport } from '../nutrition/nutrition-pdf-report';

vi.mock('@/lib/api-client', () => ({ getApiClient: () => ({ getBrandKits: async () => [] }) }));

describe('PDF branding compatibility notice', () => {
  it.each([
    ['cookbook', () => <CookbookExport book={{ id: 'book', title: 'Synthetic book' }} />],
    ['nutrition report', () => <NutritionPdfReport />],
  ] as const)('explains supported logos before %s export', async (_name, component) => {
    render(component());
    expect(await screen.findByText(/SVG and external image URLs are not loaded/)).toHaveTextContent('safety and privacy');
    expect(screen.getByText(/PNG, JPEG, GIF or WebP/)).toBeInTheDocument();
  });
});
