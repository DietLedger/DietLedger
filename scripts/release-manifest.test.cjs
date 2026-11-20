'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const manifest = require('./release-manifest.cjs');

const root = path.resolve(__dirname, '..');
const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const beta = fs.readFileSync(path.join(root, '.github/workflows/beta-release.yml'), 'utf8');

function temporaryReleaseRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dietledger-release-contract-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0.0-beta.1' }));
  const template = ['web', 'api', 'api', 'api'].map(name => `image: ghcr.io/dietledger/dietledger-${name}:\${DIETLEDGER_VERSION:?select a published release version}`).join('\n') + '\nimage: postgres:17-alpine@sha256:e80acae3f1109e8e4533618b594918936f2858c63afc7204c4773148a673add8\n';
  for (const file of ['docker-compose.yml', 'docker-compose.portainer.yml']) fs.writeFileSync(path.join(dir, file), template);
  fs.writeFileSync(path.join(dir, '.env.example'), 'DIETLEDGER_VERSION=\nPOSTGRES_PASSWORD=\nMIGRATION_DB_PASSWORD=\nAPI_DB_PASSWORD=\nHMAC_SECRET=\nSETUP_CLAIM_SECRET=\n');
  fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({ status: 'unreleased' }));
  return dir;
}

test('release manifest preparation does not mutate the version used for reviewed tag selection', (t) => {
  const dir = temporaryReleaseRoot(t);
  const before = fs.readFileSync(path.join(dir, 'package.json'));
  manifest.prepare(dir, '1.0.0-beta.1', 'a'.repeat(40), ['sha256:' + 'b'.repeat(64), 'sha256:' + 'c'.repeat(64)]);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'package.json')), before);
});

test('release asset generation fails closed on unexpected pre-existing payloads', (t) => {
  const dir = temporaryReleaseRoot(t);
  const output = path.join(dir, 'release-assets');
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, 'runtime.env'), 'synthetic-runtime-secret=do-not-package');
  assert.throws(() => manifest.checksums(dir, output, 'a'.repeat(40)), /unexpected|allowlist|asset/i);
  assert.equal(fs.existsSync(path.join(output, 'runtime.env')), true, 'validation must not destructively clean caller files');
});

test('release asset output contains only the fixed public allowlist', (t) => {
  const dir = temporaryReleaseRoot(t);
  fs.appendFileSync(path.join(dir, '.env.example'), '# Generate 32 random bytes as 64 lowercase hex characters for EACH value.\n# Back up HMAC_SECRET to preserve encrypted provider settings.\n');
  fs.writeFileSync(path.join(dir, '.local.env'), 'synthetic-private-key=not-for-release');
  fs.writeFileSync(path.join(dir, 'runtime.env'), 'synthetic-runtime-key=not-for-release');
  const output = path.join(dir, 'release-assets');
  manifest.prepare(dir, '1.0.0-beta.1', 'a'.repeat(40), ['sha256:' + 'b'.repeat(64), 'sha256:' + 'c'.repeat(64)]);
  manifest.checksums(dir, output, 'a'.repeat(40));
  assert.deepEqual(fs.readdirSync(output).sort(), [
    '.env.example', 'SHA256SUMS', 'docker-compose.portainer.yml', 'docker-compose.yml', 'release.json',
  ]);
  const compose = fs.readFileSync(path.join(output, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /dietledger-web@sha256:b{64}/);
  assert.match(compose, /dietledger-api@sha256:c{64}/);
  const envTemplate = fs.readFileSync(path.join(output, '.env.example'), 'utf8');
  assert.doesNotMatch(envTemplate, /DIETLEDGER_VERSION/);
  assert.match(envTemplate, /64 lowercase hex/);
  assert.match(envTemplate, /Back up HMAC_SECRET/);
  const crypto = require('node:crypto');
  for (const line of fs.readFileSync(path.join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
    const [hash, file] = line.split('  ');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex'), hash);
  }
  assert.equal(fs.existsSync(path.join(output, '.local.env')), false);
  assert.equal(fs.existsSync(path.join(output, 'runtime.env')), false);
});

test('actual source templates generate matching install assets without a runtime version variable', (t) => {
  const dir = temporaryReleaseRoot(t);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  for (const file of ['.env.example', 'docker-compose.yml', 'docker-compose.portainer.yml']) fs.copyFileSync(path.join(root, file), path.join(dir, file));
  manifest.prepare(dir, pkg.version, 'a'.repeat(40), ['sha256:' + 'b'.repeat(64), 'sha256:' + 'c'.repeat(64)]);
  manifest.checksums(dir, path.join(dir, 'assets'), 'a'.repeat(40));
  const read = name => fs.readFileSync(path.join(dir, 'assets', name), 'utf8');
  assert.equal(read('docker-compose.yml'), read('docker-compose.portainer.yml'));
  assert.doesNotMatch(read('docker-compose.yml'), /DIETLEDGER_VERSION|DIETLEDGER_INSTALL_ROOT/);
  assert.match(read('.env.example'), /encrypted offline/);
  for (const key of ['POSTGRES_PASSWORD', 'MIGRATION_DB_PASSWORD', 'API_DB_PASSWORD', 'HMAC_SECRET', 'SETUP_CLAIM_SECRET']) assert.match(read('.env.example'), new RegExp(`^${key}=$`, 'm'));
});

test('assets reject unreleased or tampered metadata and unsafe templates', (t) => {
  const dir = temporaryReleaseRoot(t);
  const output = path.join(dir, 'assets');
  assert.throws(() => manifest.checksums(dir, output, 'a'.repeat(40)), /candidate|version/i);
  const digests = ['sha256:' + 'b'.repeat(64), 'sha256:' + 'c'.repeat(64)];
  const valid = manifest.prepare(dir, '1.0.0-beta.1', 'a'.repeat(40), digests);
  for (const altered of [
    { ...valid, status: 'unreleased' },
    { ...valid, sourceCommit: 'bad' },
    { ...valid, version: '1.0.0-beta.2' },
    { ...valid, images: { ...valid.images, web: 'ghcr.io/other/web@' + digests[0] } },
    { ...valid, images: { ...valid.images, setup: 'unexpected' } },
    { ...valid, images: { ...valid.images, api: 'ghcr.io/dietledger/dietledger-api:latest' } },
  ]) {
    fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(altered));
    assert.throws(() => manifest.checksums(dir, output, 'a'.repeat(40)));
  }
  fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(valid));
  assert.throws(() => manifest.checksums(dir, output, 'd'.repeat(40)), /commit/i);
  assert.throws(() => manifest.checksums(dir, output), /commit/i);
  fs.appendFileSync(path.join(dir, '.env.example'), 'HMAC_SECRET=synthetic-secret\n');
  assert.throws(() => manifest.checksums(dir, output, 'a'.repeat(40)), /env|secret/i);
});

test('assets refuse altered compose image refs and symlink inputs', (t) => {
  const dir = temporaryReleaseRoot(t);
  manifest.prepare(dir, '1.0.0-beta.1', 'a'.repeat(40), ['sha256:' + 'b'.repeat(64), 'sha256:' + 'c'.repeat(64)]);
  const compose = path.join(dir, 'docker-compose.yml');
  fs.appendFileSync(compose, 'image: ghcr.io/other/not-allowed:latest\n');
  assert.throws(() => manifest.checksums(dir, path.join(dir, 'assets'), 'a'.repeat(40)), /image|compose/i);
  fs.unlinkSync(compose);
  fs.symlinkSync(path.join(dir, 'docker-compose.portainer.yml'), compose);
  assert.throws(() => manifest.checksums(dir, path.join(dir, 'assets'), 'a'.repeat(40)), /regular|symlink/i);
});

test('CI uses immutable web build and asserts package version unchanged', () => {
  assert.match(ci, /npm run build:web/);
  assert.doesNotMatch(ci, /^\s*- run: npm run build\s*$/m);
  assert.match(ci, /VERSION_BEFORE/);
  assert.match(ci, /VERSION_AFTER/);
  assert.match(ci, /npm audit --audit-level=low/);
  assert.match(ci, /npm audit --omit=dev --audit-level=low/);
  assert.match(ci, /govulncheck@v1\.10\.0/);
  assert.match(ci, /go-version: ['"]1\.27\.4['"]/);
});

test('CI scans source and every fetched branch/tag history with redacted Gitleaks output', () => {
  assert.match(ci, /fetch-depth: 0/);
  assert.match(ci, /refs\/heads\/\*/);
  assert.match(ci, /refs\/tags\/\*/);
  assert.match(ci, /go install github\.com\/zricethezav\/gitleaks\/v8@v8\.30\.0/);
  assert.match(ci, /node --test scripts\/release-gitleaks\.test\.cjs/);
  assert.match(ci, /--log-opts=.*--all/);
  assert.match(ci, /--redact/);
  assert.match(ci, /gitleaks.*dir/);
  assert.doesNotMatch(ci, /paths-ignore:.*tests/i);
});

test('beta gate verifies exact tag ancestry from repository default branch before privileged jobs', () => {
  const gate = beta.slice(0, beta.indexOf('\n  quality:'));
  assert.match(beta, /manual_test_confirmed/);
  assert.match(beta, /sanitized_source_confirmed/);
  assert.match(gate, /fetch-depth: 0/);
  assert.match(gate, /github\.event\.repository\.default_branch/);
  assert.match(gate, /merge-base --is-ancestor/);
  assert.match(gate, /refs\/tags\/v/);
  assert.match(gate, /github\.sha/);
  assert.doesNotMatch(beta, /ref:\s*\$\{\{\s*inputs\./);
  assert.match(beta, /environment: beta-images/);
  assert.match(beta, /environment: beta-release/);
});

test('beta release scans each saved image separately before any push without passing Docker socket', () => {
  const imageJob = beta.slice(beta.indexOf('\n  images:'), beta.indexOf('\n  release:'));
  assert.match(imageJob, /VERSION_BEFORE/);
  assert.match(imageJob, /docker save/);
  assert.match(imageJob, /aquasecurity\/trivy:0\.69\.3/);
  assert.match(imageJob, /image --input/);
  assert.match(imageJob, /:ro/);
  assert.match(imageJob, /--severity HIGH,CRITICAL/);
  assert.match(imageJob, /--exit-code 1/);
  const firstPush = imageJob.indexOf('docker push');
  const firstScan = imageJob.indexOf('image --input');
  assert.ok(firstScan >= 0 && firstScan < firstPush);
  assert.match(imageJob, /for .* in .*WEB.*API/);
  assert.doesNotMatch(imageJob, /dietledger-setup/);
  assert.match(imageJob, /docker image inspect/);
  assert.match(imageJob, /org\.opencontainers\.image\.revision/);
  assert.match(imageJob, /test "\$\(docker image inspect[^\n]*org\.opencontainers\.image\.source[^\n]*" = "https:\/\/github.com\/\$GITHUB_REPOSITORY"/);
  assert.doesNotMatch(imageJob, /(?:--volume|-v)\s+[^\n]*docker\.sock/);
  const runtimeCheck = imageJob.indexOf('node scripts/verify-compose-install.mjs');
  assert.ok(runtimeCheck > 0 && runtimeCheck < firstPush, 'exercise the exact built candidates before publishing');
  const postgresPull = imageJob.indexOf('docker pull postgres:17-alpine@sha256:');
  assert.ok(postgresPull > 0 && postgresPull < runtimeCheck, 'preload pinned PostgreSQL for the no-pull runtime verifier');
  assert.match(imageJob, /DIETLEDGER_TEST_WEB_IMAGE="\$WEB"/);
  assert.match(imageJob, /DIETLEDGER_TEST_API_IMAGE="\$API"/);
  assert.match(imageJob, /include-hidden-files: true/, 'the safe .env.example must actually reach the release job');
  assert.match(imageJob, /DIETLEDGER_TEST_COMPOSE_FILE="\$PWD\/release-assets\/docker-compose.yml"/);
  assert.match(imageJob, /docker image inspect --format '\{\{\.Id\}\}'/);
});
