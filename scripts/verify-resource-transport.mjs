#!/usr/bin/env node
// Disposable loopback fixtures only. Build with `npm run build:web` first.
// No Docker, application database, external provider, or deployed service.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const MiB = 1024 * 1024;
const manifest = JSON.parse(readFileSync(new URL('../.next/server/middleware-manifest.json', import.meta.url), 'utf8'));
assert.deepEqual(manifest.middleware, {}, 'automatic Middleware/Proxy cloning must be absent');
assert.deepEqual(manifest.sortedMiddleware, []);
const captures = [];
const held = new Set();
const api = createServer(async (req, res) => {
  if (req.url.includes('hold=1')) { held.add(res); res.on('close', () => held.delete(res)); return; }
  let bytes = 0;
  const hash = createHash('sha256');
  try {
    for await (const chunk of req) { bytes += chunk.length; hash.update(chunk); }
    captures.push({ bytes, hash:hash.digest('hex'), headers:req.headers, url:req.url });
    res.setHeader('content-type','application/json');
    res.setHeader('set-cookie', ['refresh=synthetic; Path=/api/auth; HttpOnly; SameSite=Strict', 'csrf=synthetic; Path=/; SameSite=Strict']);
    res.end(JSON.stringify({ bytes }));
  } catch { res.destroy(); }
});
let app;
let handle;
const web = createServer((req,res) => { void handle(req,res); });
const listen = async server => { server.listen(0,'127.0.0.1'); await once(server,'listening'); return server.address().port; };
const waitFor = async predicate => {
  const until = Date.now()+10_000;
  while (!predicate()) { assert(Date.now()<until,'fixture did not reach admission checkpoint'); await new Promise(resolve => setTimeout(resolve,10)); }
};

try {
  const apiPort = await listen(api);
  process.env.API_URL = `http://127.0.0.1:${apiPort}`;
  const webPort = await listen(web);
  const next = require('next');
  app = next({ dev:false,dir:root,hostname:'127.0.0.1',port:webPort });
  handle = app.getRequestHandler();
  await app.prepare();
  const base = `http://127.0.0.1:${webPort}`;
  const send = (path,body,headers={}) => fetch(base+path,{ method:'POST',body,duplex:'half',headers });

  // Use synthetic native v4 JSON with legal whitespace so hash/length checks
  // detect even silent tail truncation without depending on recipe artifacts.
  const native = JSON.stringify({ format:'dietledger.recipe-bundle', version:4, recipes:[] }) + ' '.repeat(12*MiB);
  let response = await send('/api/recipe-bundles/import',native,{ 'content-type':'application/json' });
  assert.equal(response.status,200);
  assert.equal((await response.json()).bytes,Buffer.byteLength(native));
  assert.equal(captures.at(-1).hash,createHash('sha256').update(native).digest('hex'));
  console.log('PASS actual Next transport: 12 MiB native JSON survives byte-for-byte above former clone cap');

  const upload = size => {
    let remaining = size;
    const chunk = new Uint8Array(64*1024).fill(32);
    return new ReadableStream({ pull(controller) {
      if (!remaining) { controller.close(); return; }
      const count = Math.min(remaining,chunk.length); remaining -= count;
      controller.enqueue(count === chunk.length ? chunk : chunk.subarray(0,count));
    } });
  };
  const multipartUpload = size => {
    const encoder = new TextEncoder();
    const prefix = encoder.encode('--synthetic\r\nContent-Disposition: form-data; name="file"; filename="foods.json"\r\nContent-Type: application/json\r\n\r\n[{"fdcId":123,"calories":2}');
    const suffix = encoder.encode(']\r\n--synthetic--\r\n');
    let remaining = size-prefix.length-suffix.length;
    let started = false;
    const spaces = new Uint8Array(64*1024).fill(32);
    return new ReadableStream({ pull(controller) {
      if (!started) { started = true; controller.enqueue(prefix); return; }
      if (remaining) { const count = Math.min(remaining,spaces.length); remaining -= count; controller.enqueue(spaces.subarray(0,count)); return; }
      controller.enqueue(suffix); controller.close();
    } });
  };
  response = await send('/api/foods/seed/upload',multipartUpload(512*MiB),{ 'content-type':'multipart/form-data; boundary=synthetic' });
  assert.equal(response.status,200);
  assert.equal((await response.json()).bytes,512*MiB);
  console.log('PASS actual Next transport: chunked 512 MiB upload reaches upstream in full');
  response = await send('/api/foods/seed/upload',multipartUpload(512*MiB+1),{ 'content-type':'multipart/form-data; boundary=synthetic' });
  assert.equal(response.status,413); await response.arrayBuffer();
  console.log('PASS actual Next transport: chunked 512 MiB + 1 upload returns explicit 413');

  const before = captures.length;
  response = await send('/api/auth/login',upload(MiB+1));
  assert.equal(response.status,413); await response.arrayBuffer(); assert.equal(captures.length,before);
  response = await send('/api/recipe-bundles/import',upload(32*MiB+1));
  assert.equal(response.status,413); await response.arrayBuffer(); assert.equal(captures.length,before);
  console.log('PASS actual Next transport: ordinary/native cap+1 rejects before upstream');

  response = await send('/api/auth/refresh','{}',{
    'content-type':'application/json',cookie:'refresh=synthetic',origin:'http://app.example',
    'x-csrf-token':'synthetic','x-forwarded-for':'192.0.2.1','x-forwarded-proto':'https',forwarded:'for=192.0.2.1',
  });
  assert.equal(response.headers.getSetCookie().length,2);
  assert.equal(response.headers.get('cache-control'),'no-store');
  await response.arrayBuffer();
  assert.equal(captures.at(-1).headers.cookie,'refresh=synthetic');
  assert.equal(captures.at(-1).headers.origin,'http://app.example');
  assert.equal(captures.at(-1).headers['x-csrf-token'],'synthetic');
  for (const key of ['x-forwarded-for','x-forwarded-proto','forwarded']) assert.equal(captures.at(-1).headers[key],undefined);
  console.log('PASS actual Next transport: auth cookie/CSRF forwarding, separate Set-Cookie, no-store and spoofed forwarding stripping');

  const pending = Array.from({length:16},() => fetch(base+'/api/recipes?hold=1'));
  await waitFor(() => held.size === 16);
  response = await fetch(base+'/api/recipes'); assert.equal(response.status,503); await response.arrayBuffer();
  for (const res of held) res.end('{}');
  await Promise.all(pending.map(async promise => { const result = await promise; await result.arrayBuffer(); }));
  await waitFor(() => held.size === 0);
  console.log('PASS actual Next transport: finite 16-request concurrency and release');

  const cancel = new AbortController();
  const canceled = fetch(base+'/api/recipes?hold=1',{signal:cancel.signal}).catch(() => null);
  await waitFor(() => held.size === 1); cancel.abort(); await canceled;
  await waitFor(() => held.size === 0);
  console.log('PASS actual Next transport: client cancellation closes upstream response');

  response = await fetch(base+'/login'); await response.arrayBuffer();
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert(response.headers.get('content-security-policy-report-only'));
  assert.equal(response.headers.get('content-security-policy'),null);
  assert.equal(response.headers.get('strict-transport-security'),null);
  console.log(`PASS actual Next ${require('next/package.json').version}: staged HTML headers, no HSTS assumption`);
} finally {
  for (const res of held) res.destroy();
  web.closeAllConnections(); api.closeAllConnections();
  await Promise.all([new Promise(resolve => web.close(resolve)),new Promise(resolve => api.close(resolve))]);
  await app?.close();
}
