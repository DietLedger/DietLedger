import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateRecord } from '@/lib/types';
import TemplatesPage from './page';
import EditTemplatePage from './[id]/page';

const state = vi.hoisted(() => ({ admin: false, push: vi.fn(), update: vi.fn(), remove: vi.fn(), duplicate: vi.fn() }));
const defaultTemplate: TemplateRecord = {
  id: 'default-template', name: 'Global default', type: 'recipe', isDefault: true,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  layout: { pageSize: 'a4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 }, sections: [],
    theme: { primaryColor: '#000000', backgroundColor: '#ffffff', textColor: '#000000', accentColor: '#000000', fontFamily: 'Arial', borderRadius: 0 } },
};
const ownTemplate = { ...defaultTemplate, id: 'own-template', name: 'My template', isDefault: false };

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }), useParams: () => ({ id: 'default-template' }) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'caller', isAdmin: state.admin } }) }));
vi.mock('@/components/breadcrumb-context', () => ({ useSetBreadcrumbLabel: vi.fn() }));
vi.mock('@/components/template-editor-panel', () => ({ default: () => <div data-testid="layout-editor" /> }));
vi.mock('@/hooks/use-templates', () => ({
  useTemplates: () => ({ data: [defaultTemplate, ownTemplate] }),
  useTemplate: () => ({ data: defaultTemplate, isLoading: false }),
  useUpdateTemplate: () => ({ mutateAsync: state.update, isPending: false }),
  useDeleteTemplate: () => ({ mutateAsync: state.remove }),
  useDuplicateTemplate: () => ({ mutateAsync: state.duplicate }),
}));

beforeEach(() => {
  vi.clearAllMocks(); state.admin = false;
  state.duplicate.mockResolvedValue({ ...ownTemplate, id: 'new-copy' });
});
afterEach(cleanup);

describe('default-template write permissions', () => {
  it('offers only copying for an ordinary user viewing a global default', () => {
    render(<TemplatesPage />);
    expect(screen.queryByRole('button', { name: 'Edit Global default' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Global default' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Global default' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit My template' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete My template' })).toBeInTheDocument();
  });

  it('preserves administrator edit/delete controls for defaults', () => {
    state.admin = true;
    render(<TemplatesPage />);
    expect(screen.getByRole('button', { name: 'Edit Global default' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Global default' })).toBeInTheDocument();
  });

  it('does not expose the default editor or writes on a direct ordinary-user route', async () => {
    render(<EditTemplatePage />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument());
    expect(screen.queryByTestId('layout-editor')).not.toBeInTheDocument();
    expect(screen.getByText(/Default templates are read-only/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /make a copy/i }));
    await waitFor(() => expect(state.duplicate).toHaveBeenCalledWith('default-template'));
    expect(state.push).toHaveBeenCalledWith('/settings/templates/new-copy');
    expect(state.update).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('retains the administrator editor and save workflow', async () => {
    state.admin = true;
    render(<EditTemplatePage />);
    fireEvent.click(await screen.findByRole('button', { name: /^save$/i }));
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'default-template' }));
  });
});
