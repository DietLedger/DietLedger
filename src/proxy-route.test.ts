// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as route from './app/api/[...path]/route';

afterEach(() => vi.unstubAllGlobals());

it('uses a dynamic Node transport route with no pre-admission API middleware clone', () => {
  expect(route.runtime).toBe('nodejs');
  expect(route.dynamic).toBe('force-dynamic');
  expect(existsSync(new URL('../middleware.ts', import.meta.url))).toBe(false);
  expect(existsSync(new URL('./proxy.ts', import.meta.url))).toBe(false);
  expect(existsSync(new URL('./middleware.ts', import.meta.url))).toBe(false);
  expect(existsSync(new URL('./lib/api-proxy.ts', import.meta.url))).toBe(true);
  expect(route.GET).toBe(route.POST);
  expect(route.POST).toBe(route.DELETE);
  expect(route.OPTIONS).toBe(route.POST);
});

it('transports a legitimate native bundle above the old framework 10 MiB clone cap byte-for-byte', async () => {
  const body = readFileSync(new URL('../recipe_meals_pdfs/deliciously-healthy-family-meals-full.recipe-bundle.json', import.meta.url),'utf8') + ' '.repeat(12 * 1024 * 1024);
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    expect(await new Response(init.body).text()).toBe(body);
    return new Response(null, { status:204 });
  }));
  const req = new NextRequest('http://app.example/api/recipe-bundles/import', { method:'POST', body });
  expect((await route.POST(req)).status).toBe(204);
});

it('returns an explicit API 404 for an unrecognized transport route', async () => {
  const response = await route.GET(new NextRequest('http://app.example/api/not-a-route'));
  expect(response.status).toBe(404);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
