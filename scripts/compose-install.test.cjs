'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = ['docker-compose.yml', 'docker-compose.portainer.yml'];
const secrets = {
  POSTGRES_PASSWORD: '1'.repeat(64),
  MIGRATION_DB_PASSWORD: '2'.repeat(64),
  API_DB_PASSWORD: '3'.repeat(64),
  HMAC_SECRET: '4'.repeat(64),
  SETUP_CLAIM_SECRET: '5'.repeat(64),
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dietledger-compose-config-'));
const emptyEnv = path.join(tmp, 'empty.env');
fs.writeFileSync(emptyEnv, '');
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

function compose(file, vars = {}, local = false) {
  const args = ['compose', '--env-file', emptyEnv, '-f', path.join(root, file)];
  if (local) args.push('-f', path.join(root, 'docker-compose.local.yml'));
  args.push('config', '--format', 'json');
  return spawnSync('docker', args, {
    cwd: tmp,
    env: { PATH: process.env.PATH, HOME: tmp, COMPOSE_DISABLE_ENV_FILE: '1', ...vars },
    encoding: 'utf8',
  });
}
function config(file, local = false) {
  const result = compose(file, { ...secrets, DIETLEDGER_VERSION: 'test-version' }, local);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}

test('standard and Portainer definitions are byte-identical and use explicit GHCR versions', () => {
  const main = fs.readFileSync(path.join(root, files[0]), 'utf8');
  assert.equal(main, fs.readFileSync(path.join(root, files[1]), 'utf8'));
  for (const image of ['api', 'web']) {
    assert.ok(main.includes(`ghcr.io/dietledger/dietledger-${image}:\${DIETLEDGER_VERSION:?select a published release version}`));
  }
});

for (const file of files) {
  test(`${file}: version and each secret fail closed when missing or empty`, () => {
    const all = { ...secrets, DIETLEDGER_VERSION: 'test-version' };
    for (const key of Object.keys(all)) {
      for (const value of [undefined, '']) {
        const vars = { ...all };
        if (value === undefined) delete vars[key]; else vars[key] = value;
        const result = compose(file, vars);
        assert.notEqual(result.status, 0, `${key} ${value === '' ? 'empty' : 'missing'} accepted`);
        assert.match(result.stderr, new RegExp(key));
      }
    }
  });

  test(`${file}: rendered stack has least-privilege secrets and private backend`, () => {
    const model = config(file);
    const services = model.services;
    assert.deepEqual(Object.keys(services).sort(), ['api', 'bootstrap', 'migrate', 'postgres', 'web']);
    assert.match(services.postgres.image, /^postgres:17-alpine@sha256:[a-f0-9]{64}$/);
    for (const name of ['bootstrap', 'migrate', 'api']) assert.equal(services[name].image, 'ghcr.io/dietledger/dietledger-api:test-version');
    assert.equal(services.web.image, 'ghcr.io/dietledger/dietledger-web:test-version');
    assert.deepEqual(services.bootstrap.command, ['bootstrap']);
    assert.deepEqual(services.migrate.command, ['migrate']);
    for (const [name, expected] of Object.entries({ postgres: ['POSTGRES_PASSWORD'], bootstrap: ['POSTGRES_PASSWORD', 'MIGRATION_DB_PASSWORD', 'API_DB_PASSWORD'], migrate: ['MIGRATION_DB_PASSWORD'], api: ['API_DB_PASSWORD', 'HMAC_SECRET', 'SETUP_CLAIM_SECRET'], web: [] })) {
      const service = services[name];
      const serialized = JSON.stringify(service.environment || {});
      for (const [key, value] of Object.entries(secrets)) assert.equal(serialized.includes(value), expected.includes(key), `${name}: ${key}`);
      assert.equal(service.env_file, undefined);
      assert.equal(service.privileged, undefined);
      assert.equal(service.build, undefined);
      if (name !== 'web') assert.equal(service.ports, undefined);
      for (const mount of service.volumes || []) assert.notEqual(mount.type, 'bind');
    }
    assert.deepEqual(services.web.ports.map(({ host_ip, published, target, protocol }) => ({ host_ip, published, target, protocol })), [{ host_ip: '127.0.0.1', published: '3000', target: 3000, protocol: 'tcp' }]);
    for (const [name, dependency, condition] of [['bootstrap', 'postgres', 'service_healthy'], ['migrate', 'bootstrap', 'service_completed_successfully'], ['api', 'migrate', 'service_completed_successfully'], ['web', 'api', 'service_healthy']]) assert.equal(services[name].depends_on[dependency].condition, condition);
    for (const name of ['postgres', 'api', 'web']) assert.ok(services[name].healthcheck);
    assert.equal(services.web.environment.API_URL, 'http://api:8080');
    assert.equal(model.volumes['pg-data'].labels?.['io.dietledger.install-root'], undefined);
  });

  test(`${file}: local override changes only app identities and pull policy`, () => {
    const base = config(file);
    const local = config(file, true);
    for (const name of ['bootstrap', 'migrate', 'api', 'web']) {
      assert.equal(local.services[name].image, name === 'web' ? 'recipetool-dietledger:latest' : 'recipetool-api:latest');
      assert.equal(local.services[name].pull_policy, 'never');
      local.services[name].image = base.services[name].image;
      delete local.services[name].pull_policy;
    }
    assert.deepEqual(local, base);
    const missing = compose(file, secrets, true);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /DIETLEDGER_VERSION/);
  });
}

test('runtime verifier refuses implicit endpoints and unpinned image inputs without Docker actions', async () => {
  const { pathToFileURL } = require('node:url');
  const { validateInputs } = await import(pathToFileURL(path.join(root, 'scripts/verify-compose-install.mjs')));
  const approved = { DIETLEDGER_TEST_DOCKER_HOST: 'unix:///synthetic-approved/docker.sock', DIETLEDGER_TEST_WEB_IMAGE: 'synthetic-web:candidate', DIETLEDGER_TEST_API_IMAGE: 'synthetic-api:candidate' };
  for (const key of Object.keys(approved)) {
    const missing = { ...approved }; delete missing[key];
    assert.throws(() => validateInputs(missing), new RegExp(key));
    assert.throws(() => validateInputs({ ...approved, [key]: '' }), new RegExp(key));
  }
  for (const endpoint of ['default', 'tcp://127.0.0.1:2375', 'ssh://remote', 'unix:///socket?query']) assert.throws(() => validateInputs({ ...approved, DIETLEDGER_TEST_DOCKER_HOST: endpoint }), /endpoint/);
  for (const image of ['latest', 'https://registry/image:tag', 'image:tag\nnext']) assert.throws(() => validateInputs({ ...approved, DIETLEDGER_TEST_WEB_IMAGE: image }), /Images/);
  assert.throws(() => validateInputs({ ...approved, DIETLEDGER_TEST_COMPOSE_FILE: 'relative.yml' }), /absolute/);
  const result = validateInputs({ ...approved, DIETLEDGER_TEST_COMPOSE_FILE: path.join(tmp, 'asset.yml'), DOCKER_CONFIG: tmp });
  assert.equal(result.endpoint, approved.DIETLEDGER_TEST_DOCKER_HOST);
  assert.equal(result.releaseAsset, true);
  assert.equal(result.dockerConfig, tmp);
});

test('example provides empty required secrets and operator guidance', () => {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  for (const key of Object.keys(secrets)) assert.match(example, new RegExp(`^${key}=$`, 'm'));
  assert.match(example, /^DIETLEDGER_VERSION=$/m);
  assert.match(example, /64 hex/i);
  assert.match(example, /independent/i);
  assert.match(example, /backup/i);
});
