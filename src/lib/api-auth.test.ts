import { afterEach, describe, expect, it } from 'vitest';
import { getApiAuthHeaders } from './api-auth';
import { setAccessToken, retireSession } from './auth-session';

afterEach(() => { retireSession(); localStorage.clear(); });

describe('getApiAuthHeaders', () => {
  it('returns the bearer token used by authenticated API routes', () => {
    setAccessToken('access-token');
    expect(getApiAuthHeaders()).toEqual({ Authorization: 'Bearer access-token' });
  });

  it('returns no authorization header when no token is stored', () => {
    expect(getApiAuthHeaders()).toEqual({});
  });
});
