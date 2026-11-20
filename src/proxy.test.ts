// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './lib/api-proxy';

function request(path = '/api/auth/login', body: BodyInit | null = null, headers?: HeadersInit, signal?: AbortSignal) {
  return new NextRequest(`http://app.example${path}`, { method: body ? 'POST' : 'GET', body, headers, signal, duplex: 'half' } as NonNullable<ConstructorParameters<typeof NextRequest>[1]>);
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('public API resource admission', () => {
  it('preserves the existing food storage defaults forwarding route and configured target', async () => {
    vi.stubEnv('API_URL', 'http://api.example.test');
    vi.resetModules();
    const { proxy: configuredProxy } = await import('./lib/api-proxy');
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ ok:true,data:[] }));
    vi.stubGlobal('fetch',fetch);
    const response = await configuredProxy(new NextRequest('http://web.example.test/api/food-storage-defaults'));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe('http://api.example.test/api/food-storage-defaults');
    expect(await response.json()).toEqual({ ok:true,data:[] });
  });

  it('rejects an untrusted declared length before consuming the request', async () => {
    const arrayBuffer = vi.fn();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const req = request('/api/auth/login', 'small', { 'content-length': String((1 << 20) + 1) });
    req.arrayBuffer = arrayBuffer;
    const response = await proxy(req);
    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('counts missing/false Content-Length and unread trailing chunks', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    for (const headers of [{}, { 'content-length': '1' }] as HeadersInit[]) {
      const response = await proxy(request('/api/auth/login', '{}'+ ' '.repeat(1 << 20), headers));
      expect(response.status).toBe(413);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards auth cookies/origin and every Set-Cookie but strips untrusted forwarding/control headers', async () => {
    const fetch = vi.fn(async (_url, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get('cookie')).toBe('refresh=synthetic');
      expect(headers.get('origin')).toBe('http://app.example');
      expect(headers.get('x-csrf-token')).toBe('synthetic-csrf');
      expect(headers.get('authorization')).toBe('Bearer synthetic');
      for (const key of ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'x-middleware-subrequest', 'x-nextjs-data', 'connection', 'x-drop']) expect(headers.has(key), key).toBe(false);
      expect(init.redirect).toBe('manual'); expect(init.cache).toBe('no-store');
      const response = new Response('ok', { headers: { 'content-type': 'application/json' } });
      response.headers.append('set-cookie', 'refresh=one; Path=/api/auth; HttpOnly; SameSite=Strict');
      response.headers.append('set-cookie', 'csrf=two; Path=/; SameSite=Strict');
      return response;
    }); vi.stubGlobal('fetch', fetch);
    const response = await proxy(request('/api/auth/login', '{"email":"synthetic@example.test"}', {
      cookie:'refresh=synthetic', origin:'http://app.example', 'x-csrf-token':'synthetic-csrf', authorization:'Bearer synthetic',
      'x-forwarded-for':'127.0.0.1', 'x-forwarded-host':'spoof.example', 'x-forwarded-proto':'https', forwarded:'for=127.0.0.1',
      'x-real-ip':'127.0.0.1', 'x-middleware-subrequest':'spoof', 'x-nextjs-data':'1', connection:'x-drop', 'x-drop':'secret',
    }));
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(await response.text()).toBe('ok');
  });

  it('admits a native bundle larger than the ordinary JSON limit without changing its body', async () => {
    const body = ' '.repeat(2 << 20);
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      expect(await new Response(init.body).text()).toBe(body);
      return new Response('ok');
    }));
    expect(await (await proxy(request('/api/recipe-bundles/import', body))).text()).toBe('ok');
  });

  it('rejects buffered concurrency before reading/cloning and releases it on completion', async () => {
    const resolves: Array<(r: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => resolves.push(resolve))));
    const pending = Array.from({ length:16 }, () => proxy(request('/api/recipes')));
    await vi.waitFor(() => expect(resolves).toHaveLength(16));
    const overflow = request('/api/auth/login', 'small'); overflow.arrayBuffer = vi.fn(); overflow.clone = vi.fn();
    const rejected = await proxy(overflow);
    expect(rejected.status).toBe(503); expect(overflow.arrayBuffer).not.toHaveBeenCalled(); expect(overflow.clone).not.toHaveBeenCalled();
    resolves.forEach(resolve => resolve(new Response(null, { status:204 })));
    await Promise.all(pending);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status:204 })));
    expect((await proxy(request('/api/recipes'))).status).toBe(204);
  });

  it('forwards bounded upload streams without arrayBuffer and limits upload concurrency to two', async () => {
    const resolves: Array<(r: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      expect(init.body).toBeInstanceOf(ReadableStream); expect((init as RequestInit & { duplex?: string }).duplex).toBe('half');
      expect(await new Response(init.body).text()).toBe('multipart-fixture');
      return new Promise<Response>(resolve => resolves.push(resolve));
    }));
    const reqs = Array.from({ length:2 }, () => { const req = request('/api/foods/seed/upload', 'multipart-fixture'); req.arrayBuffer = vi.fn(); return req; });
    const pending = reqs.map(req => proxy(req));
    await vi.waitFor(() => expect(resolves).toHaveLength(2));
    expect((await proxy(request('/api/foods/seed/upload', 'third'))).status).toBe(503);
    reqs.forEach(req => expect(req.arrayBuffer).not.toHaveBeenCalled());
    resolves.forEach(resolve => resolve(new Response(null, { status:204 }))); await Promise.all(pending);
  });

  it('counts streamed upload bytes and explicitly rejects cap+1 without buffering the dataset', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      while (!(await reader.read()).done) { /* consume without retaining chunks */ }
      return new Response(null, { status:204 });
    }));
    const chunk = new Uint8Array(1 << 20);
    let remaining = 512;
    const stream = new ReadableStream({ pull(controller) {
      if (remaining-- > 0) controller.enqueue(chunk);
      else { controller.enqueue(new Uint8Array(1)); controller.close(); }
    } });
    expect((await proxy(request('/api/foods/seed/upload', stream))).status).toBe(413);
  });

  it('times out a stalled request body and releases admission without forwarding a partial prefix', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
    const body = new ReadableStream<Uint8Array>({ pull() {} });
    const pending = proxy(request('/api/auth/login',body));
    await vi.advanceTimersByTimeAsync(30_001);
    expect((await pending).status).toBe(504);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('errors rather than silently truncates a response when its deadline expires', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('prefix')); },
      pull() {},
    }))));
    const response = await proxy(request('/api/recipes'));
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await vi.advanceTimersByTimeAsync(30_001);
    await expect(reader.read()).rejects.toThrow('interrupted');
  });

  it('retains response admission until its stream is canceled or consumed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ pull() {} }))));
    const responses = await Promise.all(Array.from({ length:16 }, () => proxy(request('/api/recipes'))));
    expect((await proxy(request('/api/recipes'))).status).toBe(503);
    await Promise.all(responses.map(response => response.body!.cancel()));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status:204 })));
    expect((await proxy(request('/api/recipes'))).status).toBe(204);
  });

  it('propagates cancellation to upstream fetch and does not leak a slot', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')));
    })));
    const pending = proxy(request('/api/recipes', null, undefined, controller.signal));
    controller.abort();
    expect((await pending).status).toBe(499);
  });
});
