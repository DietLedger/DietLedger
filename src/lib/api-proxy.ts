import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const PROXY_ROUTES = [
  '/api/auth/',
  '/api/instance',
  '/api/account',
  '/api/recipes',
  '/api/recipe-bundles',
  '/api/recipe-imports',
  '/api/food-storage-defaults',
  '/api/books',
  '/api/chapters/',
  '/api/pages/',
  '/api/chapter-recipes/',
  '/api/book-pages/',
  '/api/categories',
  '/api/meal-plans',
  '/api/entries/',
  '/api/groups/',
  '/api/grocery',
  '/api/profiles',
  '/api/log/',
  '/api/weight/',
  '/api/custom-foods',
  '/api/share',
  '/api/community',
  '/api/foods',
  '/api/health',
  '/api/about',
  '/api/keys',
  '/api/personal-keys',
  '/api/nutrition/sync',
  '/api/settings',
  '/api/templates',
  '/api/dietary-profiles',
  '/api/allergen-rules',
  '/api/brand-kits',
  '/api/pantry-staples',
  '/api/secrets',
];

function shouldProxy(pathname: string): boolean {
  for (const route of PROXY_ROUTES) {
    if (pathname === route) return true;
    const prefix = route.endsWith('/') ? route : route + '/';
    if (pathname.startsWith(prefix) || pathname.startsWith(route + '?')) return true;
  }
  if (pathname.match(/^\/api\/foods\/\d/)) return true;
  return false;
}

const MiB = 1024 * 1024;
let bufferedActive = 0;
let uploadActive = 0;

function bodyBudget(path: string): number {
  if (path.replace(/\/$/, '') === '/api/foods/seed/upload') return 512 * MiB;
  if (path.replace(/\/$/, '') === '/api/recipe-bundles/import') return 32 * MiB;
  return MiB;
}

function errorResponse(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    ...(status === 503 ? { 'Retry-After': '1' } : {}),
  } });
}

function stripHopHeaders(headers: Headers): void {
  for (const token of (headers.get('connection') || '').split(',')) {
    if (token.trim()) headers.delete(token.trim());
  }
  for (const name of ['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'expect']) headers.delete(name);
}

function ingressHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  stripHopHeaders(headers);
  // There is no trustworthy socket peer in NextRequest. Never promote public
  // request headers into client identity/HTTPS assertions at the Go boundary.
  for (const name of [...headers.keys()]) {
    if (name.startsWith('x-forwarded-') || name.startsWith('x-middleware-') || name.startsWith('x-nextjs-') ||
        ['forwarded', 'x-real-ip', 'true-client-ip', 'cf-connecting-ip', 'via'].includes(name)) headers.delete(name);
  }
  return headers;
}

export async function proxy(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname;
  if (!shouldProxy(path)) return path.startsWith('/api/') ? errorResponse(404, 'not found') : NextResponse.next();
  const upload = path.replace(/\/$/, '') === '/api/foods/seed/upload';
  const budget = bodyBudget(path);
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > budget)) return errorResponse(413, 'request body exceeds route limit');
  // This check precedes any request clone, reader, or allocation in this code.
  if ((upload ? uploadActive : bufferedActive) >= (upload ? 2 : 16)) return errorResponse(503, 'request capacity exceeded');
  if (upload) uploadActive++; else bufferedActive++;

  let finished = false;
  let oversized = false;
  let cancelBody: (() => void) | undefined;
  let failResponse: (() => void) | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, upload ? 600_000 : 30_000);
  timer.unref?.();
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    if (upload) uploadActive--; else bufferedActive--;
  };
  controller.signal.addEventListener('abort', () => { cancelBody?.(); failResponse?.(); finish(); }, { once: true });
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();

  try {
    if (controller.signal.aborted) return errorResponse(499, 'request canceled');
    const headers = ingressHeaders(request);
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method, headers, signal: controller.signal, redirect: 'manual', cache: 'no-store',
    };
    if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
      const reader = request.body.getReader();
      cancelBody = () => { void reader.cancel().catch(() => {}); };
      let bytes = 0;
      const bounded = new ReadableStream<Uint8Array>({
        async pull(stream) {
          try {
            const { value, done } = await reader.read();
            if (done) { stream.close(); return; }
            bytes += value.byteLength;
            if (bytes > budget) {
              oversized = true; cancelBody?.();
              stream.error(new Error('request body exceeds route limit'));
              controller.abort(); return;
            }
            stream.enqueue(value);
          } catch { stream.error(new Error('request body unavailable')); }
        },
        cancel() { cancelBody?.(); },
      });
      if (upload) {
        init.body = bounded; init.duplex = 'half';
      } else {
        // Bounded ordinary/native JSON only. Do not use Request.clone() or
        // arrayBuffer() before explicit admission and actual-byte accounting.
        init.body = await new Response(bounded).arrayBuffer();
      }
    }
    if (oversized) { finish(); return errorResponse(413, 'request body exceeds route limit'); }
    if (controller.signal.aborted) {
      finish();
      return request.signal.aborted ? errorResponse(499, 'request canceled') : errorResponse(504, 'upstream deadline exceeded');
    }
    const target = new URL(path + request.nextUrl.search, API_URL);
    const upstream = await fetch(target.toString(), init);
    const responseHeaders = new Headers(upstream.headers);
    const cookies = upstream.headers.getSetCookie();
    stripHopHeaders(responseHeaders);
    // Fetch decodes content encoding; do not advertise the original encoding
    // or length. Keep all cookies separately, including clearing/rotation pairs.
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('set-cookie');
    for (const cookie of cookies) responseHeaders.append('set-cookie', cookie);
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Frame-Options', 'DENY');
    responseHeaders.set('Referrer-Policy', 'no-referrer');
    if (!upstream.body) { cancelBody?.(); finish(); return new Response(null, { status: upstream.status, headers: responseHeaders }); }
    const reader = upstream.body.getReader();
    const cancelRequestBody = cancelBody;
    cancelBody = () => { cancelRequestBody?.(); void reader.cancel().catch(() => {}); };
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        failResponse = () => stream.error(new Error('upstream response interrupted'));
        if (controller.signal.aborted) failResponse();
      },
      async pull(stream) {
        try {
          const { value, done } = await reader.read();
          if (done) { stream.close(); cancelRequestBody?.(); finish(); } else stream.enqueue(value);
        } catch { stream.error(new Error('upstream response unavailable')); finish(); }
      },
      cancel() { controller.abort(); finish(); },
    });
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    cancelBody?.(); finish();
    if (oversized) return errorResponse(413, 'request body exceeds route limit');
    if (request.signal.aborted) return errorResponse(499, 'request canceled');
    if (controller.signal.aborted) return errorResponse(504, 'upstream deadline exceeded');
    return errorResponse(502, 'upstream unavailable');
  }
}
