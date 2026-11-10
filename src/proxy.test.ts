import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalApiUrl = process.env.API_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
});

describe('API proxy', () => {
  it('forwards food storage defaults requests to the Go API', async () => {
    process.env.API_URL = 'http://api.example.test';
    vi.resetModules();
    const { proxy } = await import('./proxy');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await proxy(new NextRequest('http://web.example.test/api/food-storage-defaults'));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.example.test/api/food-storage-defaults');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [] });
  });
});
