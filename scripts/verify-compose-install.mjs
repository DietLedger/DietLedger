#!/usr/bin/env node
/**
 * OPT-IN, DESTRUCTIVE ONLY TO A NEW DISPOSABLE COMPOSE PROJECT.
 * Obtain operator approval before running. Node 22+, Docker/Compose >= 2.24.4
 * (--wait and !override), and preloaded web/API/pinned PostgreSQL images required.
 * No installer, source build, pull, retag, prune, or existing-stack adoption.
 *
 * Required: DIETLEDGER_TEST_DOCKER_HOST=unix:///operator-approved/socket
 *           DIETLEDGER_TEST_WEB_IMAGE and DIETLEDGER_TEST_API_IMAGE (tag or digest)
 * Optional: DIETLEDGER_TEST_COMPOSE_FILE (absolute released Compose asset path;
 *           its app digest references must exactly match the supplied images)
 *           DIETLEDGER_TEST_DOCKER_CONFIG (absolute isolated Docker config dir;
 *           explicit DOCKER_CONFIG is also accepted, never the HOME default)
 *           DIETLEDGER_TEST_SUMMARY (new JSON output file, created 0600)
 * Default Compose: repository docker-compose.yml. All credentials are synthetic.
 * Output deliberately omits subprocess output, HTTP bodies, credentials and URLs.
 * This is HTTP/Compose verification, not browser, Portainer, anonymous-pull or
 * readiness-refusal certification. Run the existing Go authority/ledger tests
 * separately on an approved disposable cluster. No Docker is run by --help.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setDefaultResultOrder } from 'node:dns';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const services = ['postgres', 'bootstrap', 'migrate', 'api', 'web'];
const secretNames = ['POSTGRES_PASSWORD', 'MIGRATION_DB_PASSWORD', 'API_DB_PASSWORD', 'HMAC_SECRET', 'SETUP_CLAIM_SECRET'];
const state = { step: 'input validation', temp: null, armed: false, cleaning: false, interrupted: false, child: null };
const summary = {
  result: 'not-run', checks: [], cleanup: 'not-needed',
  limitations: ['HTTP client, not a real browser', 'No Portainer certification', 'No registry/anonymous-pull certification', 'Readiness-refusal/admin-authority Go regressions must be run separately'],
};
function requireThat(condition, message) { if (!condition) throw new Error(message); }
function same(actual, expected, message) {
  // Never allow assert's value-rendering diagnostics to expose credentials.
  try { assert.deepStrictEqual(actual, expected); } catch { throw new Error(message); }
}
const hex = () => randomBytes(32).toString('hex');
const lines = text => text.trim().split(/\r?\n/).filter(Boolean);

export function validateInputs(env) {
  for (const key of ['DIETLEDGER_TEST_DOCKER_HOST', 'DIETLEDGER_TEST_WEB_IMAGE', 'DIETLEDGER_TEST_API_IMAGE']) {
    requireThat(Boolean(env[key]), `${key} is required; obtain operator approval before running`);
  }
  const endpoint = env.DIETLEDGER_TEST_DOCKER_HOST;
  // Unix sockets are local; never resolve a mutable Docker context or TCP daemon.
  requireThat(/^unix:\/\/\/[^\s\0?#%]+$/.test(endpoint) && !/[\s\0?#%]/.test(endpoint), 'Docker endpoint must be an explicit local unix:/// socket');
  const image = value => !value.includes('//') && !/\s/.test(value) && /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(value) &&
    (value.includes('@') ? /@sha256:[a-f0-9]{64}$/.test(value) && value.split('@').length === 2 : /:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(value));
  requireThat(image(env.DIETLEDGER_TEST_WEB_IMAGE) && image(env.DIETLEDGER_TEST_API_IMAGE), 'Images must be explicit tagged or sha256-digest identities, not URLs');
  const asset = env.DIETLEDGER_TEST_COMPOSE_FILE;
  requireThat(asset === undefined || (asset.length > 0 && isAbsolute(asset)), 'DIETLEDGER_TEST_COMPOSE_FILE must be an absolute path');
  const dockerConfig = env.DIETLEDGER_TEST_DOCKER_CONFIG ?? env.DOCKER_CONFIG;
  requireThat(dockerConfig === undefined || (dockerConfig.length > 0 && isAbsolute(dockerConfig)), 'DIETLEDGER_TEST_DOCKER_CONFIG must be an absolute isolated config directory');
  return { endpoint, webImage: env.DIETLEDGER_TEST_WEB_IMAGE, apiImage: env.DIETLEDGER_TEST_API_IMAGE, composeFile: asset || join(root, 'docker-compose.yml'), releaseAsset: asset !== undefined, dockerConfig };
}

async function run(args, { input = '', password, allowFailure = false, timeout = 240000 } = {}) {
  requireThat(!state.interrupted || state.cleaning, 'verification interrupted');
  return new Promise((resolveRun, rejectRun) => {
    // No inherited Docker context/config, application variables, proxy settings,
    // credentials or Compose overrides. PGPASSWORD is deliberately per-exec only.
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: state.temp, DOCKER_CONFIG: state.dockerConfig || join(state.temp, 'docker-config'), LANG: 'C.UTF-8', COMPOSE_DISABLE_ENV_FILE: '1', COMPOSE_ANSI: 'never' };
    if (password !== undefined) env.PGPASSWORD = password;
    const child = spawn('docker', ['--host', state.endpoint, ...args], { cwd: state.temp, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    state.child = child;
    const out = [], err = [];
    let size = 0, stopped = false;
    const stop = () => { stopped = true; child.kill('SIGKILL'); };
    const timer = setTimeout(stop, timeout);
    const collect = dest => b => { size += b.length; if (size > 8 * 1024 * 1024) stop(); else dest.push(b); };
    child.stdout.on('data', collect(out)); child.stderr.on('data', collect(err));
    child.stdin.on('error', () => {}); // Exit/error is handled below, including early CLI rejection.
    child.on('error', () => { clearTimeout(timer); state.child = null; rejectRun(new Error('Docker command could not start')); });
    child.on('close', code => {
      clearTimeout(timer); state.child = null;
      const result = { code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') };
      if (stopped) rejectRun(new Error('Docker command exceeded time/output limit'));
      else if (code !== 0 && !allowFailure) rejectRun(new Error('Docker command failed (output redacted)'));
      else resolveRun(result);
    });
    child.stdin.end(input);
  });
}
function composeArgs(...args) { return ['compose', '--project-name', state.project, '--env-file', state.envPath, '-f', state.composeFile, '-f', state.overridePath, ...args]; }
const compose = (...args) => run(composeArgs(...args));
function parseJson(text) { try { return JSON.parse(text); } catch { throw new Error('Invalid JSON inspection/response (output redacted)'); } }
const inspect = async (...args) => parseJson((await run(args)).stdout);
async function step(name, fn) {
  state.step = name;
  console.log(`[verify] ${name}`);
  const result = await fn(); summary.checks.push(name); return result;
}
async function allocatePort() {
  const server = createServer();
  await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
  const port = server.address().port;
  await new Promise((res, rej) => server.close(e => e ? rej(e) : res()));
  // There is an unavoidable close/bind race; a collision fails closed, no retries
  // against other projects or listeners and no attempts to kill their owners.
  return port;
}
async function prepare(inputs) {
  Object.assign(state, inputs);
  state.temp = await mkdtemp(join(tmpdir(), 'dietledger-compose-verify-'));
  await chmod(state.temp, 0o700);
  await mkdir(join(state.temp, 'docker-config'), { mode: 0o700 });
  state.project = `dietledger-verify-${randomBytes(12).toString('hex')}`;
  state.volume = `dietledger-verify-data-${randomBytes(12).toString('hex')}`;
  state.port = await allocatePort();
  state.origin = `http://localhost:${state.port}`;
  // Keep URL/Origin identical while avoiding localhost -> ::1 against an
  // IPv4-only publication. Every HTTP request still goes through Next.
  setDefaultResultOrder('ipv4first');
  state.secrets = Object.fromEntries(secretNames.map(k => [k, hex()]));
  state.envPath = join(state.temp, 'synthetic.env'); state.overridePath = join(state.temp, 'override.yml');
  const env = { ...state.secrets, DIETLEDGER_VERSION: 'local', PORT: String(state.port), BIND_ADDRESS: '127.0.0.1', AUTH_ALLOW_INSECURE_LOOPBACK: 'true', CORS_ORIGIN: state.origin };
  await writeFile(state.envPath, Object.entries(env).map(([k,v]) => `${k}=${v}\n`).join(''), { flag: 'wx', mode: 0o600 });
  const app = image => `    image: ${JSON.stringify(image)}\n    pull_policy: never\n`;
  const override = `services:\n  bootstrap:\n${app(state.apiImage)}  migrate:\n${app(state.apiImage)}  api:\n${app(state.apiImage)}  web:\n${app(state.webImage)}    ports: !override\n      - "127.0.0.1:${state.port}:3000"\nvolumes:\n  pg-data:\n    name: ${state.volume}\n`;
  await writeFile(state.overridePath, override, { flag: 'wx', mode: 0o600 });
}
function scopedSecrets(env, service) {
  const scope = { postgres: ['POSTGRES_PASSWORD'], bootstrap: ['POSTGRES_PASSWORD','MIGRATION_DB_PASSWORD','API_DB_PASSWORD'], migrate: ['MIGRATION_DB_PASSWORD'], api: ['API_DB_PASSWORD','HMAC_SECRET','SETUP_CLAIM_SECRET'], web: [] }[service];
  for (const key of secretNames) requireThat(JSON.stringify(env).includes(state.secrets[key]) === scope.includes(key), `${service} secret exposure does not match required scope`);
}
async function preflight() {
  if (state.releaseAsset) {
    const asset = parseJson((await run(['compose', '--project-name', state.project, '--env-file', state.envPath, '-f', state.composeFile, 'config', '--format', 'json'])).stdout);
    for (const name of ['bootstrap','migrate','api','web']) {
      const image = name === 'web' ? state.webImage : state.apiImage;
      requireThat(/@sha256:[a-f0-9]{64}$/.test(image) && asset.services?.[name]?.image === image, 'Release asset and explicit app digests must match exactly');
    }
  }
  const model = parseJson((await compose('config', '--format', 'json')).stdout);
  same(Object.keys(model.services).sort(), [...services].sort(), 'Unexpected Compose service inventory');
  same(Object.keys(model.volumes || {}), ['pg-data'], 'Unexpected persistent volume inventory');
  requireThat(model.volumes['pg-data'].name === state.volume && !model.volumes['pg-data'].external && !model.volumes['pg-data'].driver_opts, 'Volume must be new, local and managed by this unique project');
  requireThat(Object.keys(model.secrets || {}).length === 0 && Object.keys(model.configs || {}).length === 0, 'External secret/config objects are not allowed');
  for (const network of Object.values(model.networks || {})) requireThat(!network.external && (!network.name || network.name === `${state.project}_default`) && !network.driver_opts, 'Network must belong only to the unique project');
  for (const [name, service] of Object.entries(model.services)) {
    requireThat(!service.build && !service.container_name && !service.privileged && !service.network_mode && !service.pid && !service.devices && !service.volumes_from && !service.env_file, 'Unsafe Compose service configuration');
    if (name === 'postgres') {
      requireThat(/^postgres:17-alpine@sha256:[a-f0-9]{64}$/.test(service.image), 'PostgreSQL must retain its official pinned identity');
      same(service.volumes?.map(v => ({ type: v.type, source: v.source, target: v.target })), [{ type: 'volume', source: 'pg-data', target: '/var/lib/postgresql/data' }], 'Unexpected PostgreSQL storage');
    } else {
      requireThat(!service.volumes?.length, 'Application services must not mount host/storage resources');
      requireThat(service.image === (name === 'web' ? state.webImage : state.apiImage) && service.pull_policy === 'never', 'App candidate identity/pull policy mismatch');
    }
    scopedSecrets(service.environment || {}, name);
    if (name !== 'web') requireThat(!service.ports?.length, 'Only web may publish ports');
  }
  same(model.services.web.ports?.map(p => ({ host_ip: p.host_ip, published: String(p.published), target: p.target, protocol: p.protocol })), [{ host_ip: '127.0.0.1', published: String(state.port), target: 3000, protocol: 'tcp' }], 'Web must publish only the chosen loopback port');
  for (const [name, dep, condition] of [['bootstrap','postgres','service_healthy'], ['migrate','bootstrap','service_completed_successfully'], ['api','migrate','service_completed_successfully'], ['web','api','service_healthy']]) requireThat(model.services[name].depends_on?.[dep]?.condition === condition, 'Compose dependency ordering mismatch');
  requireThat(model.services.api.environment.AUTH_ALLOW_INSECURE_LOOPBACK === 'true' && model.services.api.environment.CORS_ORIGIN === state.origin && model.services.web.environment.API_URL === 'http://api:8080', 'Same-origin loopback transport configuration mismatch');
  // Refuse any collision before the first mutation. No global listing is changed.
  for (const resource of ['ps','volume','network']) {
    const args = resource === 'ps' ? ['ps','-aq'] : [resource,'ls','-q'];
    requireThat(!(await run([...args,'--filter',`label=com.docker.compose.project=${state.project}`])).stdout.trim(), 'Random project name already owns resources; refusing adoption');
  }
  requireThat(!lines((await run(['volume','ls','--format','{{.Name}}'])).stdout).includes(state.volume), 'Random volume already exists; refusing adoption');
  state.imageIds = {};
  for (const [name, image] of Object.entries({ web: state.webImage, api: state.apiImage, postgres: model.services.postgres.image })) {
    const [item] = await inspect('image','inspect',image);
    requireThat(/^sha256:[a-f0-9]{64}$/.test(item?.Id), 'Prebuilt image must already be loaded on the approved endpoint');
    state.imageIds[name] = item.Id;
  }
  // A private HOME/DOCKER_CONFIG plus --pull never intentionally cannot fetch
  // anything. Anonymous pulls, when needed, happen separately before this run.
}
async function container(service) {
  const ids = lines((await compose('ps','-aq',service)).stdout);
  requireThat(ids.length === 1, 'Expected exactly one service container');
  const [item] = await inspect('inspect',ids[0]);
  requireThat(item?.Config?.Labels?.['com.docker.compose.project'] === state.project && item.Config.Labels['com.docker.compose.service'] === service, 'Container ownership labels do not match');
  return item;
}
async function topology() {
  for (const name of services) {
    const item = await container(name);
    const expectedId = state.imageIds[name === 'postgres' ? 'postgres' : name === 'web' ? 'web' : 'api'];
    requireThat(item.Image === expectedId, 'Container image ID differs from preflight candidate');
    scopedSecrets(item.Config.Env || [], name);
    const bindings = Object.entries(item.HostConfig.PortBindings || {}).filter(([, v]) => v?.length);
    if (name === 'web') same(bindings, [['3000/tcp', [{ HostIp: '127.0.0.1', HostPort: String(state.port) }]]], 'Unexpected web port binding');
    else requireThat(bindings.length === 0, 'A backend/job published a port');
    requireThat(item.HostConfig.NetworkMode !== 'host', 'Host networking is forbidden');
    if (['bootstrap','migrate'].includes(name)) requireThat(item.State.Status === 'exited' && item.State.ExitCode === 0, 'Bootstrap/migrate job did not exit zero');
    else requireThat(item.State.Status === 'running' && item.State.Health?.Status === 'healthy', 'Runtime service is not healthy');
    for (const mount of item.Mounts || []) requireThat(name === 'postgres' && mount.Type === 'volume' && mount.Name === state.volume && mount.Destination === '/var/lib/postgresql/data', 'Unexpected runtime mount');
  }
  const [volume] = await inspect('volume','inspect',state.volume);
  requireThat(volume?.Name === state.volume && volume.Labels?.['com.docker.compose.project'] === state.project && volume.Labels?.['com.docker.compose.volume'] === 'pg-data', 'New volume ownership labels do not match');
}
async function up(...args) { await compose('up','-d','--wait','--wait-timeout','180','--no-build','--pull','never',...args); await topology(); }
async function http(path, { method = 'GET', body, session, cookie = session?.cookie, csrf = session?.csrf, expected = 200, origin = state.origin } = {}) {
  const headers = { Origin: origin };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  let response, text;
  try { response = await fetch(`${state.origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(15000) }); text = await response.text(); }
  catch { throw new Error('Same-origin web HTTP request failed (details redacted)'); }
  requireThat(response.status === expected, `Unexpected HTTP status (expected ${expected}, received ${response.status})`);
  const data = response.headers.get('content-type')?.includes('json') && text ? parseJson(text) : null;
  return { response, text, data };
}
function auth(result) {
  const body = result.data;
  requireThat(typeof body?.accessToken === 'string' && body.accessToken.length > 0 && typeof body.csrfToken === 'string' && body.csrfToken.length > 0 && body.user?.id && body.refreshToken === undefined, 'Top-level AuthResult contract mismatch');
  requireThat(result.response.headers.get('cache-control')?.includes('no-store'), 'Authentication response must not be cached');
  const cookies = result.response.headers.getSetCookie();
  const selected = cookies.filter(v => v.startsWith('dietledger_refresh_loopback='));
  requireThat(selected.length === 1 && /;\s*HttpOnly/i.test(selected[0]) && /;\s*SameSite=Strict/i.test(selected[0]) && !/;\s*Secure/i.test(selected[0]), 'Loopback refresh-cookie contract mismatch');
  const cookie = selected[0].split(';',1)[0];
  requireThat(cookie.split('=')[1]?.length > 0, 'Missing refresh-cookie value');
  return { token: body.accessToken, csrf: body.csrfToken, user: body.user, cookie };
}
const login = async account => auth(await http('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } }));
const refresh = async session => auth(await http('/api/auth/refresh', { method: 'POST', session }));
function account(prefix) { return { email: `${prefix}-${randomBytes(8).toString('hex')}@example.test`, password: `Aa1!${hex()}`, displayName: 'Synthetic Compose verifier' }; }
async function sql(query, { user = 'dietledger_bootstrap', denied = false } = {}) {
  const password = state.secrets[{ dietledger_bootstrap: 'POSTGRES_PASSWORD', dietledger_migrate: 'MIGRATION_DB_PASSWORD', dietledger_api: 'API_DB_PASSWORD' }[user]];
  requireThat(password, 'Unknown SQL principal');
  // TCP + PGPASSWORD proves password-authenticated runtime authority; never use
  // PostgreSQL's local socket trust, a credential URL or password in argv.
  const result = await run(composeArgs('exec','-T','-e','PGPASSWORD','postgres','psql','-X','-w','-h','127.0.0.1','-U',user,'-d','dietledger','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-f','-'), { password, input: `${query}\n`, allowFailure: denied, timeout: 20000 });
  if (denied) requireThat(result.code !== 0 && /42501/.test(result.stderr), 'Forbidden SQL must fail specifically for insufficient privilege');
  return result.stdout.trim();
}
async function snapshot() {
  const result = {};
  for (const [name, query] of Object.entries({
    users: 'SELECT row_to_json(t)::text FROM (SELECT id,email,display_name,password_hash,is_admin FROM users ORDER BY id) t',
    books: 'SELECT row_to_json(t)::text FROM (SELECT * FROM recipe_books ORDER BY id) t',
    ciphertext: "SELECT user_id||':'||key_name||':'||encode(encrypted_value,'hex') FROM user_secrets ORDER BY user_id,key_name",
    roleFlags: "SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ('dietledger_bootstrap','dietledger_migrate','dietledger_api') ORDER BY rolname",
    roleHashes: "SELECT rolname,rolpassword FROM pg_authid WHERE rolname IN ('dietledger_bootstrap','dietledger_migrate','dietledger_api') ORDER BY rolname",
    ledger: 'SELECT version FROM schema_migrations ORDER BY version',
  })) result[name] = await sql(query);
  return result;
}
async function verifyPersistence(baseline, ordinary, admin, pendingSession, bookId, secretId, providerValue) {
  same(await snapshot(), baseline, 'Account/book/ciphertext/role-password/authority/ledger state changed');
  // The pre-restart cookie must survive; do not replace it with a new login first.
  const session = await refresh(pendingSession);
  requireThat(session.user.id === pendingSession.user.id, 'Persisted session principal changed');
  for (const user of [ordinary, admin]) {
    const signedIn = await login(user);
    requireThat(signedIn.user.email === user.email && signedIn.user.isAdmin === (user === admin), 'Account authority/login changed after runtime restart');
    await http('/api/auth/logout', { method: 'POST', session: signedIn });
  }
  const book = await http(`/api/books/${bookId}`, { session });
  requireThat(book.data?.data?.title === 'Synthetic Compose persistence record', 'Book API data did not persist');
  const secret = await http(`/api/secrets/${secretId}`, { session });
  requireThat(secret.data?.data?.value === providerValue, 'Provider secret failed decryption after restart');
  return session;
}
async function verify() {
  await step('fresh Compose startup and healthy topology', () => up());
  await step('web HTML and same-origin API health', async () => {
    const html = await http('/'); requireThat(/<html[\s>]/i.test(html.text), 'Web root did not return HTML');
    const health = await http('/api/health'); requireThat(health.data?.ok === true && health.data?.service === 'dietledger-api', 'API health response mismatch');
  });
  const admin = account('admin'), ordinary = account('ordinary');
  await step('first-admin claim refusal and successful admission', async () => {
    await http('/api/auth/register', { method: 'POST', body: admin, expected: 403 });
    await http('/api/auth/register', { method: 'POST', body: { ...admin, setupClaim: hex() }, expected: 403 });
    const session = auth(await http('/api/auth/register', { method: 'POST', body: { ...admin, setupClaim: state.secrets.SETUP_CLAIM_SECRET }, expected: 201 }));
    requireThat(session.user.isAdmin === true, 'First user was not granted administrator authority');
    await http('/api/instance/registration', { method: 'PATCH', session, body: { registrationEnabled: true } });
    await http('/api/auth/logout', { method: 'POST', session });
  });
  let session;
  await step('ordinary registration/login/refresh/logout and origin/CSRF refusal', async () => {
    const registered = auth(await http('/api/auth/register', { method: 'POST', body: ordinary, expected: 201 }));
    requireThat(registered.user.isAdmin === false, 'Ordinary registration granted administrator authority');
    await http('/api/auth/logout', { method: 'POST', session: registered });
    session = await login(ordinary);
    await http('/api/auth/refresh', { method: 'POST', session, csrf: '', expected: 403 });
    await http('/api/auth/refresh', { method: 'POST', session, origin: 'http://localhost:1', expected: 403 });
    session = await refresh(session);
    await http('/api/instance/registration', { method: 'PATCH', session, body: { registrationEnabled: false }, expected: 403 });
  });
  let bookId, secretId;
  const providerValue = `synthetic-${hex()}`;
  await step('API book and encrypted provider-secret persistence', async () => {
    const book = await http('/api/books', { method: 'POST', session, body: { title: 'Synthetic Compose persistence record', description: 'Disposable test data', coverColor: '#123456' }, expected: 201 });
    bookId = book.data?.data?.id;
    const secret = await http('/api/secrets', { method: 'POST', session, body: { keyName: 'fda-api-key', value: providerValue }, expected: 201 });
    secretId = secret.data?.data?.id;
    requireThat(typeof bookId === 'string' && typeof secretId === 'string', 'API creation response did not contain IDs');
    const type = await sql("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='user_secrets' AND column_name='encrypted_value'");
    requireThat(type === 'bytea', 'Inspect provider-secret schema before reading ciphertext');
    const ciphertexts = lines(await sql("SELECT encode(encrypted_value,'hex') FROM user_secrets"));
    requireThat(ciphertexts.length === 1 && /^[a-f0-9]+$/.test(ciphertexts[0]) && ciphertexts[0].length > providerValue.length * 2 && !ciphertexts[0].includes(Buffer.from(providerValue).toString('hex')), 'Provider secret is not encrypted at rest');
    const decrypted = await http(`/api/secrets/${secretId}`, { session });
    requireThat(decrypted.data?.data?.value === providerValue, 'Initial provider-secret decryption failed');
  });
  await step('TCP runtime-user metadata and forbidden SQL', async () => {
    requireThat(await sql('SELECT current_user', { user: 'dietledger_api' }) === 'dietledger_api', 'Runtime TCP identity check failed');
    requireThat(await sql('SELECT current_user', { user: 'dietledger_migrate' }) === 'dietledger_migrate', 'Migrator TCP identity check failed');
    requireThat(await sql("SELECT count(*)=1 AND bool_and(NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls) FROM pg_roles WHERE rolname='dietledger_api'", { user: 'dietledger_api' }) === 't', 'Runtime authority flags are not all false');
    for (const query of ['CREATE TABLE public.harness_forbidden(id int)', 'CREATE ROLE harness_forbidden', 'CREATE SCHEMA harness_forbidden', 'ALTER TABLE public.users ADD COLUMN harness_forbidden int', 'UPDATE public.schema_migrations SET version=version', 'SET ROLE dietledger_migrate']) await sql(`BEGIN; ${query}; ROLLBACK;`, { user: 'dietledger_api', denied: true });
  });
  const baseline = await snapshot();
  for (const [name, restart] of [
    ['repeated Compose up preserves data and credentials', () => up()],
    ['bootstrap/migrate/API/web recreation preserves data and credentials', () => up('--force-recreate','bootstrap','migrate','api','web')],
    ['PostgreSQL restart preserves data and refresh sessions', async () => { await compose('restart','postgres'); await up(); }],
  ]) await step(name, async () => { await restart(); session = await verifyPersistence(baseline, ordinary, admin, session, bookId, secretId, providerValue); });
  await step('logout revokes persisted session', async () => {
    await http('/api/auth/logout', { method: 'POST', session });
    await http('/api/auth/refresh', { method: 'POST', session, expected: 401 });
    await http('/api/books', { session, cookie: '', csrf: '', expected: 401 });
  });
}
async function cleanup() {
  if (!state.armed) return;
  state.cleaning = true; state.step = 'cleanup ownership verification';
  try {
    // Inspect every project-labelled resource, including orphans. No prune and
    // never remove anything unless its unique project and volume labels agree.
    const ids = lines((await run(['ps','-aq','--filter',`label=com.docker.compose.project=${state.project}`])).stdout);
    for (const id of ids) {
      const [item] = await inspect('inspect',id);
      requireThat(item.Config?.Labels?.['com.docker.compose.project'] === state.project, 'Refusing cleanup of foreign container');
      for (const m of item.Mounts || []) requireThat(m.Type === 'volume' && m.Name === state.volume, 'Refusing cleanup of unexpected storage mount');
    }
    const names = lines((await run(['volume','ls','--format','{{.Name}}','--filter',`label=com.docker.compose.project=${state.project}`])).stdout);
    requireThat(names.every(n => n === state.volume), 'Refusing cleanup of unexpected project volume');
    const exists = lines((await run(['volume','ls','--format','{{.Name}}'])).stdout).includes(state.volume);
    if (exists) {
      const [v] = await inspect('volume','inspect',state.volume);
      requireThat(v.Name === state.volume && v.Labels?.['com.docker.compose.project'] === state.project && v.Labels?.['com.docker.compose.volume'] === 'pg-data', 'Refusing cleanup of foreign volume');
    }
    const networks = lines((await run(['network','ls','-q','--filter',`label=com.docker.compose.project=${state.project}`])).stdout);
    for (const id of networks) {
      const [n] = await inspect('network','inspect',id);
      requireThat(n.Labels?.['com.docker.compose.project'] === state.project && n.Name === `${state.project}_default`, 'Refusing cleanup of foreign network');
    }
    await compose('down','-v','--remove-orphans');
    for (const args of [['ps','-aq'], ['volume','ls','-q'], ['network','ls','-q']]) requireThat(!(await run([...args,'--filter',`label=com.docker.compose.project=${state.project}`])).stdout.trim(), 'Unique test resources remain after cleanup');
    summary.cleanup = 'passed';
  } catch {
    summary.cleanup = 'failed'; process.exitCode = 1;
    console.error(`[verify] cleanup refused or failed; operator must inspect only project ${state.project} / volume ${state.volume}. No prune attempted.`);
  } finally { state.cleaning = false; }
}
export async function main(env = process.env) {
  try {
    const inputs = validateInputs(env);
    await step('private synthetic configuration', () => prepare(inputs));
    summary.project = state.project; summary.volume = state.volume;
    await step('rendered contract, new resources and preloaded candidate IDs', preflight);
    summary.imageIds = state.imageIds; summary.composeSource = state.releaseAsset ? 'released-asset' : 'repository-source';
    state.armed = true;
    await verify(); summary.result = 'passed';
  } catch (error) {
    summary.result = 'failed'; summary.failedStep = state.step; process.exitCode = 1;
    // Only validation errors have known, non-sensitive values. Never echo errors
    // from Docker, filesystem, fetch, JSON or assert internals.
    console.error(`[verify] failed at: ${state.step}${state.step === 'input validation' ? ` (${error.message})` : ' (details redacted)'}`);
  } finally {
    await cleanup();
    if (summary.cleanup === 'failed') summary.result = 'failed';
    // Keep the 0700 packet and 0600 env/override for safe manual cleanup when
    // ownership cannot be proved or down fails. Never print their contents/path.
    if (state.temp && summary.cleanup !== 'failed') await rm(state.temp, { recursive: true, force: true }).catch(() => { summary.result = 'failed'; process.exitCode = 1; console.error('[verify] private temporary-directory cleanup failed'); });
    console.log(JSON.stringify(summary, null, 2));
    if (env.DIETLEDGER_TEST_SUMMARY) {
      try { await writeFile(resolve(env.DIETLEDGER_TEST_SUMMARY), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); }
      catch { process.exitCode = 1; console.error('[verify] summary destination unavailable or already exists; not overwritten'); }
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Opt-in Compose install verifier; obtain operator approval first.\nRequired: DIETLEDGER_TEST_DOCKER_HOST=unix:///approved/socket, DIETLEDGER_TEST_WEB_IMAGE, DIETLEDGER_TEST_API_IMAGE.\nOptional: DIETLEDGER_TEST_COMPOSE_FILE (absolute; exact matching released digests), DIETLEDGER_TEST_DOCKER_CONFIG (absolute isolated config), DIETLEDGER_TEST_SUMMARY (new private JSON file).\nRun: node scripts/verify-compose-install.mjs\nRequires preloaded web/API/pinned PostgreSQL images, Node 22+, Compose >=2.24.4. No build/pull/prune.');
  } else if (process.argv.length !== 2) { console.error('Unknown arguments; use --help. No Docker action performed.'); process.exitCode = 1; }
  else {
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { state.interrupted = true; state.child?.kill('SIGKILL'); });
    await main();
  }
}
