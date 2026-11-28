// Disposable HTTPS transport probe for a locally built web/API candidate.
// Run only with the harness documented in the scoped personal-key spec.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const [upstreamPort, certPath, keyPath, claim] = process.argv.slice(2);
assert.match(upstreamPort ?? '', /^\d+$/);
assert.match(claim ?? '', /^[0-9a-f]{64}$/);
const certificate = readFileSync(certPath);
const server = https.createServer({ cert: certificate, key: readFileSync(keyPath) }, (req, res) => {
  const pathname = req.url.split('?')[0];
  const authorizations = req.headersDistinct.authorization ?? [];
  // Reject ambiguities before the framework HTTP parser can collapse them.
  const keyAttempt = authorizations.some((value) => /(?:^|[\t ,])dlpk1_/.test(value));
  if (authorizations.length > 1 || (keyAttempt && (authorizations[0].includes(',') ||
      /[\\%]|\/\/|(?:^|\/)\.{1,2}(?:\/|$)/.test(pathname)))) {
    res.writeHead(400, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  const headers = { ...req.headers };
  for (const name of Object.keys(headers)) {
    if (name === 'connection' || name === 'forwarded' || name.startsWith('x-forwarded-')) delete headers[name];
  }
  const backend = http.request({ host: '127.0.0.1', port: Number(upstreamPort), path: req.url, method: req.method, headers }, (answer) => {
    res.writeHead(answer.statusCode, { ...answer.headers, 'cache-control': 'no-store' });
    answer.pipe(res);
  });
  backend.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(backend);
});
const tlsPort = 18443;
const origin = `https://ledger.example.invalid:${tlsPort}`;
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(tlsPort, '127.0.0.1', resolve); });

const request = ({ method = 'GET', path, headers = {}, body, trust = certificate, servername = 'ledger.example.invalid' }) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = https.request({ hostname: '127.0.0.1', port: tlsPort, servername, ca: trust, method, path,
    headers: { Host: `ledger.example.invalid:${tlsPort}`, ...headers, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { raw += chunk; });
    res.on('end', () => {
      let json;
      try { json = JSON.parse(raw); } catch { /* TLS/transport errors may be non-JSON. */ }
      resolve({ status: res.statusCode, headers: res.headers, json });
    });
  });
  req.setTimeout(8000, () => req.destroy(new Error('probe timeout')));
  req.on('error', reject);
  req.end(data);
});
const access = (token) => ({ Authorization: `Bearer ${token}` });
const assertStatus = (response, status, label) => assert.equal(response.status, status, label);

try {
  const register = await request({ method: 'POST', path: '/api/auth/register', headers: { Origin: origin }, body: {
    email: 'fixture@example.invalid', password: 'synthetic-fixture-password', displayName: 'HTTPS fixture', setupClaim: claim,
  } });
  assertStatus(register, 201, 'register through TLS/Next');
  assert.ok(register.headers['set-cookie'].some((c) => c.startsWith('__Host-dietledger_refresh=') && c.includes('Secure')));
  const cookie = register.headers['set-cookie'].find((c) => c.startsWith('__Host-dietledger_refresh=')).split(';')[0];
  const refresh = await request({ method: 'POST', path: '/api/auth/refresh', headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': 'dietledger' } });
  assertStatus(refresh, 200, 'existing session refresh');
  const management = { ...access(refresh.json.accessToken), Origin: origin, 'X-CSRF-Token': 'dietledger' };
  const issued = await request({ method: 'POST', path: '/api/personal-keys', headers: management, body: {
    name: 'Disposable fixture', scopes: ['profiles:read', 'diary:write', 'books:read', 'books:write', 'recipes:write', 'sharing:read', 'sharing:publish'], password: 'synthetic-fixture-password',
  } });
  assertStatus(issued, 201, 'password-confirmed issuance');
  const { key, id } = issued.json.data;
  const headers = access(key);
  const discover = await request({ path: '/api/auth/key', headers });
  assertStatus(discover, 200, 'key-only HTTPS discovery');
  assert.equal(discover.json.data.account.id, register.json.user.id);
  assert.equal(discover.headers['cache-control'], 'no-store');
  assert.equal(discover.headers['set-cookie'], undefined);
  const profiles = await request({ path: '/api/profiles', headers });
  assertStatus(profiles, 200, 'owned profile read');
  // Accounts may start without a tracking profile; only this disposable fixture creates one.
  const selected = profiles.json.data[0] ?? (await request({ method: 'POST', path: '/api/profiles', headers: management, body: { name: 'Fixture', sex: 'female' } })).json.data;
  assertStatus(await request({ method: 'POST', path: `/api/profiles/${selected.id}/log`, headers, body: {
    date: '2026-01-01', mealSlot: 'noon', name: 'Fixture', sourceType: 'manual', servings: 1,
  } }), 201, 'owned diary create');
  const book = await request({ method: 'POST', path: '/api/books', headers, body: { title: 'Fixture' } });
  assertStatus(book, 201, 'owned book create');
  const chapters = `/api/books/${book.json.data.id}/chapters/`;
  assertStatus(await request({ path: chapters, headers }), 200, 'exact chapters slash preserved');
  assertStatus(await request({ path: chapters.slice(0, -1), headers }), 403, 'chapters without slash denied');
  const recipe = await request({ method: 'POST', path: '/api/recipes', headers, body: { name: 'Fixture', servings: 2 } });
  assertStatus(recipe, 201, 'owned recipe create');
  const share = await request({ method: 'POST', path: '/api/share', headers, body: {
    recipeId: recipe.json.data.id, title: 'Fixture', recipeData: '{}', visibility: 'public',
  } });
  assertStatus(share, 201, 'owned recipe publishing');
  assertStatus(await request({ method: 'DELETE', path: `/api/share/${share.json.id}`, headers }), 200, 'owned share revocation');
  assertStatus(await request({ path: '/api/instance/users', headers }), 403, 'administrator-owned key denied administrator action');
  assertStatus(await request({ path: `/api/profiles/${selected.id}/log`, headers }), 403, 'write grant does not imply read');
  assertStatus(await request({ path: '/api/profiles/./', headers }), 400, 'raw noncanonical target rejected before Next');
  assertStatus(await request({ path: '/api/auth/key', headers: { Authorization: ['Bearer fixture', `Bearer ${key}`] } }), 400, 'duplicate header rejected before Next');
  assertStatus(await request({ method: 'HEAD', path: '/api/auth/key', headers }), 403, 'unlisted method denied');
  await assert.rejects(request({ path: '/api/auth/key', headers, servername: 'wrong.example.invalid' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  await assert.rejects(request({ path: '/api/auth/key', headers, trust: [] }), /self-signed|unable to verify/);
  assertStatus(await request({ method: 'DELETE', path: `/api/personal-keys/${id}`, headers: management }), 200, 'session revocation');
  assertStatus(await request({ path: '/api/auth/key', headers }), 401, 'immediate rejection of revoked key');
  console.log('PASS: disposable HTTPS key issuance, discovery, scoped operations, admin denial, TLS and immediate revocation.');
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
