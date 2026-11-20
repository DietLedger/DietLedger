import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LegacyBrowserCleanup } from './legacy-browser-cleanup';

vi.mock('@/lib/legacy-browser-cleanup', () => ({ retireLegacyBrowserCache: async () => ({ reloadRequired: true }) }));
describe('legacy cache startup warning', () => {
  it('warns when an old controlling worker cannot be safely retired', async () => {
    render(<LegacyBrowserCleanup />);
    expect(await screen.findByRole('alert')).toHaveTextContent('close all DietLedger tabs');
    expect(screen.getByRole('alert')).toHaveTextContent('before switching accounts');
  });
});
