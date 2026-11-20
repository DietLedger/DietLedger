// Run: node scripts/security-browser/run.mjs
// Existing Vite + installed Chromium only. No live app or browser profile.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.dirname(fileURLToPath(import.meta.url));
const runtime = await mkdtemp(path.join(root, '.security-browser-'));
const chromium = process.env.CHROMIUM_PATH ?? path.join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
assert(existsSync(chromium), 'Set CHROMIUM_PATH to an existing Chromium executable; no download is performed.');
let browser;
let server;
const clients = [];
const errors = [];
const attempted = [];
const requests = [];
let workerMode = 'legacy';
let account = 'synthetic-A';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class CDP {
  pending = new Map();
  handlers = new Map();
  sequence = 0;
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message));
          else pending.resolve(message.result);
        }
      } else for (const handler of this.handlers.get(message.method) ?? []) handler(message.params);
    });
  }
  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    return new CDP(socket);
  }
  on(method, handler) { this.handlers.set(method, [...(this.handlers.get(method) ?? []), handler]); }
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 90000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

try {
  await build({
    root, configFile: false, logLevel: 'error', cacheDir: path.join(runtime, 'vite-cache'),
    resolve: { alias: [
      { find: '@/lib/api-client', replacement: path.join(dir, 'api.ts') },
      { find: '@', replacement: path.join(root, 'src') },
    ] },
    build: { outDir: path.join(runtime, 'dist'), emptyOutDir: true, minify: false, rollupOptions: { input: path.join(dir, 'fixture.ts'), output: { entryFileNames: 'fixture.js' } } },
  });
  const dist = path.join(runtime, 'dist');
  const allowedExportPaths = new Set(['/', ...(await readdir(dist, { recursive: true })).filter(file => file.endsWith('.js')).map(file => `/${file}`)]);
  const pageHtml = '<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="font-family:Arial"><div id="preview"></div><script type="module" src="/fixture.js"></script></body></html>';
  const oldWorker = await readFile(path.join(dir, 'legacy-worker.js'), 'utf8');
  const tombstone = await readFile(path.join(root, 'public/sw.js'), 'utf8');
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    requests.push(url.pathname);
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/sw.js') { res.setHeader('Content-Type', 'text/javascript'); if (workerMode === 'unavailable') { res.statusCode = 503; res.end(); } else res.end(workerMode === 'legacy' ? oldWorker : tombstone); }
    else if (url.pathname === '/other/sw.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('self.addEventListener("install",()=>self.skipWaiting());'); }
    else if (url.pathname === '/manifest.json') { res.setHeader('Content-Type', 'application/json'); res.end('{}'); }
    else if (/^\/icon-(192|512)\.png$/.test(url.pathname)) { res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')); }
    else if (url.pathname === '/api/private') res.end(account);
    else if (url.pathname === '/api/delayed') { const body = account; setTimeout(() => res.end(body), 700); }
    else if (url.pathname.startsWith('/canary')) { res.statusCode = 404; res.end('canary'); }
    else if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(pageHtml); }
    else {
      const file = path.resolve(dist, `.${url.pathname}`);
      if (!file.startsWith(`${dist}${path.sep}`)) { res.statusCode = 404; res.end(); return; }
      try { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(file)); }
      catch { res.statusCode = 404; res.end(); }
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await mkdir(path.join(runtime, 'tmp'));
  // On Linux use a short proc alias to this fixture-owned cwd: long workspace
  // paths otherwise exceed Chromium's Unix-domain socket path limit.
  browser = spawn(chromium, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(runtime, 'profile')}`, 'about:blank'], { cwd: path.join(runtime, 'tmp'), stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: '/proc/self/cwd' } });
  let browserErrors = '';
  browser.stderr.on('data', data => { browserErrors = (browserErrors + data).slice(-5000); });
  const devtools = path.join(runtime, 'profile/DevToolsActivePort');
  for (let i = 0; !existsSync(devtools) && i < 150; i++) await sleep(100);
  assert(existsSync(devtools), `Chromium did not start: ${browserErrors}`);
  const port = readFileSync(devtools, 'utf8').split('\n')[0];
  async function page() {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const cdp = await CDP.open(target.webSocketDebuggerUrl); clients.push(cdp);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
    cdp.on('Runtime.exceptionThrown', value => errors.push(value.exceptionDetails.text));
    cdp.on('Network.requestWillBeSent', value => { if (/^https?:/.test(value.request.url)) attempted.push(value.request.url); });
    cdp.on('Fetch.requestPaused', value => {
      if (/^https?:/.test(value.request.url) && !value.request.url.startsWith(`${origin}/`)) {
        attempted.push(`BLOCKED ${value.request.url}`);
        void cdp.send('Fetch.failRequest', { requestId: value.requestId, errorReason: 'BlockedByClient' });
      } else void cdp.send('Fetch.continueRequest', { requestId: value.requestId });
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await cdp.send('Page.navigate', { url: origin });
    for (let i = 0; i < 100; i++) { if (await cdp.evaluate('!!window.securityFixture')) return cdp; await sleep(100); }
    throw new Error('Browser fixture failed to load');
  }
  const a = await page();
  console.log('Browser:', (await a.send('Browser.getVersion')).product);
  assert.equal((await a.evaluate('window.securityFixture.retire()')).reloadRequired, false, 'fresh install cleanup failed');
  const exportsResult = await a.evaluate('window.securityFixture.exportsCheck()');
  assert(attempted.every(value => !value.startsWith('BLOCKED') && new URL(value).origin === origin && allowedExportPaths.has(new URL(value).pathname)), 'unexpected export network attempt');
  assert(requests.every(value => allowedExportPaths.has(value)), 'unexpected export network request');
  console.log('PASS real export renderers:', JSON.stringify(exportsResult));
  await a.evaluate('window.securityFixture.previewExport()');
  await sleep(100);
  const screenshot = await a.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(runtime, 'export-preview.png'), Buffer.from(screenshot.data, 'base64'));

  await a.evaluate('window.securityFixture.legacyInstall()');
  const b = await page();
  const offline = (cdp, value) => cdp.send('Network.emulateNetworkConditions', { offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await offline(a, true);
  assert.equal(await a.evaluate('window.securityFixture.privateRead()'), 'synthetic-A', 'RED fixture must reproduce previous private offline fallback');
  await offline(a, false);
  console.log('PASS legacy precondition: offline cache disclosed synthetic-A');

  // Unsupported/offline upgrade must visibly report retained control, not imply
  // unregister immediately removes an active controller.
  workerMode = 'unavailable';
  await offline(a, true);
  const offlineResult = await a.evaluate('window.securityFixture.retire()');
  if (!offlineResult) {
    await offline(a, false);
    await a.evaluate('window.securityFixture.privateRead()'); await sleep(200);
    await offline(a, true);
    console.log('RED legacy control after unregister/delete:', await a.evaluate('window.securityFixture.privateRead()'));
  }
  assert.equal(offlineResult?.reloadRequired, true, 'controlling old worker needs reload warning when offline');
  assert(await a.evaluate(`navigator.serviceWorker.getRegistrations().then(rows => rows.some(row => row.scope === location.origin + '/'))`), 'failed upgrade lost the supported update path');
  await offline(a, false);
  console.log('PASS offline retirement reports reload-required');

  workerMode = 'tombstone';
  await a.evaluate('window.pendingLegacyRead = window.securityFixture.delayedRead(); true');
  await sleep(50);
  const retired = await a.evaluate('window.securityFixture.retire()');
  assert.equal(retired.reloadRequired, false, 'online upgrade failed to replace legacy control');
  await a.evaluate('window.pendingLegacyRead'); await sleep(300);
  assert(!(await b.evaluate('window.securityFixture.cacheNames()')).includes('dietledger-v1'), 'delayed old write recreated retired cache before repeat cleanup');
  await b.evaluate('window.securityFixture.assertUnrelated()');
  assert(!(await b.evaluate('window.securityFixture.cacheNames()')).includes('dietledger-v1'), 'delayed old write recreated retired cache');
  assert.equal((await b.evaluate('window.securityFixture.retire()')).reloadRequired, false); // logout A
  account = 'synthetic-B';
  assert.equal((await b.evaluate('window.securityFixture.retire()')).reloadRequired, false); // account switch to B
  assert.equal(await b.evaluate('window.securityFixture.privateRead()'), 'synthetic-B');
  await offline(a, true); await offline(b, true);
  assert.equal(await a.evaluate('window.securityFixture.privateRead()'), 'OFFLINE', 'old tab served private fallback after retirement');
  assert.equal(await b.evaluate('window.securityFixture.privateRead()'), 'OFFLINE', 'switched account served private fallback after retirement');
  assert(!(await b.evaluate('window.securityFixture.cacheNames()')).includes('dietledger-v1'), 'private cache revived after account switch');
  await b.evaluate('window.securityFixture.assertUnrelated()');
  console.log('PASS worker upgrade, two controlled tabs, delayed request, logout/account switch, offline denial and unrelated state preservation');

  await offline(a, false); await offline(b, false);
  const fresh = await page();
  assert.equal((await fresh.evaluate('window.securityFixture.retire()')).reloadRequired, false);
  assert.equal(await fresh.evaluate('window.securityFixture.privateRead()'), 'synthetic-B');
  assert(!await fresh.evaluate('!!navigator.serviceWorker.controller'), 'fresh navigation still controlled by retired worker');
  await offline(fresh, true);
  assert.equal(await fresh.evaluate('window.securityFixture.privateRead()'), 'OFFLINE');
  assert(!errors.length, `uncaught browser exceptions: ${errors.join(',')}`);
  console.log('PASS fresh navigation/cleanup and offline no-fallback; no uncaught page exceptions');
} finally {
  for (const client of clients) client.close();
  if (browser) { browser.kill('SIGTERM'); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), sleep(3000)]); if (browser.exitCode === null) browser.kill('SIGKILL'); }
  if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  if (process.argv.includes('--keep-artifacts')) console.log('Synthetic artifacts:', path.relative(root, runtime));
  else await rm(runtime, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
