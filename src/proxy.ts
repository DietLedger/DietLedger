import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const PROXY_ROUTES = [
  '/api/auth/',
  '/api/instance',
  '/api/account',
  '/api/recipes',
  '/api/recipe-bundles',
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

export async function proxy(request: NextRequest) {
  if (shouldProxy(request.nextUrl.pathname)) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, API_URL);

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-forwarded-for', request.headers.get('x-forwarded-for') || '127.0.0.1');

    const init: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.arrayBuffer();
      init.duplex = 'half';
    }

    const upstream = await fetch(target.toString(), init);

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('transfer-encoding');

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  return NextResponse.next();
}
