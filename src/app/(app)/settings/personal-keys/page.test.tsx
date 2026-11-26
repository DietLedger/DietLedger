import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonalKeysPage from './page';

const session = vi.hoisted(() => ({ user: { id: 'fixture-owner', isAdmin: false }, generation: 1 }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: session.user }) }));
vi.mock('@/lib/auth-session', () => ({
  authenticatedPrincipalID: () => session.user.id,
  sessionGeneration: () => session.generation,
}));
vi.mock('@/lib/api-auth', () => ({
  getApiAuthHeaders: () => ({ Authorization: 'Bearer fixture-session' }),
  authenticatedFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
}));

const key = 'dlpk1_SYNTHETIC_INVALID_FIXTURE';
const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  session.user = { id: 'fixture-owner', isAdmin: false };
  session.generation = 1;
  vi.stubGlobal('fetch', mockFetch.mockReset());
  mockFetch.mockImplementation(async (_, init) => init?.method === 'POST'
    ? Response.json({ ok: true, data: { id: 'key-id', key } }, { status: 201 })
    : Response.json({ ok: true, data: [] }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function fill() {
  const ui = userEvent.setup();
  await ui.type(screen.getByLabelText('Key name'), 'Phone');
  await ui.type(screen.getByLabelText('Current password'), 'synthetic password');
  await ui.click(screen.getByRole('checkbox', { name: 'Full personal access' }));
  return ui;
}

describe('personal keys', () => {
  it.each([false, true])('shows the secret once and uses session credentials (admin=%s)', async (isAdmin) => {
    session.user.isAdmin = isAdmin;
    render(<PersonalKeysPage />);
    const ui = await fill();
    await ui.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText(key)).toBeInTheDocument();
    const posts = mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('/api/personal-keys');
    expect(new Headers(posts[0][1]?.headers).get('X-CSRF-Token')).toBe('dietledger');
    expect(JSON.parse(posts[0][1]?.body as string)).toMatchObject({ name: 'Phone', scopes: expect.arrayContaining(['diary:write', 'sharing:publish']) });
    await ui.click(screen.getByRole('button', { name: 'Hide key' }));
    expect(screen.queryByText(key)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('drops an issuance result that arrives after switching accounts', async () => {
    let resolve: (response: Response) => void = () => {};
    mockFetch.mockImplementation(async (_, init) => init?.method === 'POST'
      ? new Promise<Response>((done) => { resolve = done; })
      : Response.json({ data: [] }));
    const { rerender } = render(<PersonalKeysPage />);
    const ui = await fill();
    await ui.click(screen.getByRole('button', { name: 'Create key' }));
    await waitFor(() => expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    session.user = { id: 'fixture-other', isAdmin: false };
    session.generation += 1;
    rerender(<PersonalKeysPage />);
    resolve(Response.json({ data: { key } }, { status: 201 }));
    await waitFor(() => expect(screen.getByLabelText('Key name')).toHaveValue(''));
    expect(screen.queryByText(key)).not.toBeInTheDocument();
  });
});
