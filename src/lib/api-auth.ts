import { getAccessToken, retireSession, sessionGeneration } from './auth-session';
import { getApiClient } from './api-client';

export function getApiAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Direct multipart/food/key callers still use the common cookie refresh flight.
export async function authenticatedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const generation = sessionGeneration();
  const send = () => {
    const headers = new Headers(init.headers);
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`); else headers.delete('Authorization');
    return fetch(input, { ...init, headers });
  };
  const hadToken = !!getAccessToken();
  let response = await send();
  if (generation !== sessionGeneration()) throw new Error('Session changed');
  if (response.status !== 401 || !hadToken) return response;
  try {
    await getApiClient().refreshToken();
    if (generation !== sessionGeneration()) throw new Error('Session changed');
    response = await send();
  } catch {
    if (generation === sessionGeneration()) {
      retireSession();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('dietledger:unauthorized'));
    }
    throw new Error('Unauthorized');
  }
  return response;
}
