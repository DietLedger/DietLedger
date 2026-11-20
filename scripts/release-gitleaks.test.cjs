'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

// Requires the actual pinned executable; deliberately never skips missing tools.
const binary = process.env.GITLEAKS_BIN || 'gitleaks';
const config = path.resolve(__dirname, '../.gitleaks.toml');
// Assemble test inputs without introducing new key-shaped source literals.
const fixtureSecret = ['01234567', '89abcdef'].join('').repeat(4);
const roleSecret = ['abcdef01', '23456789'].join('').repeat(4);
const historicalAuthFixture = ['test', '-sec', 'ret-', 'that', '-is-', 'long', '-eno', 'ugh-', 'for-', 'aes2', '56'].join('');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60000 });
  assert.ifError(result.error);
  return result;
}

function repository(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dietledger-scanner-contract-'));
  fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tree = path.join(dir, 'tree');
  fs.mkdirSync(tree);
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(tree, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data, { mode: 0o600 });
  }
  assert.equal(run('git', ['init', '-q'], tree).status, 0);
  assert.equal(run('git', ['add', '.'], tree).status, 0);
  assert.equal(run('git', ['-c', 'user.name=Private scanner contract', '-c', 'user.email=scan@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'SCAN ONLY synthetic fixture'], tree).status, 0);
  return { dir, tree };
}

function scan(repo, mode, configured) {
  const report = path.join(repo.dir, `${mode}-${configured ? 'configured' : 'default'}.json`);
  // Explicit empty config in a separate directory uses only built-in defaults.
  const defaultConfig = path.join(repo.dir, 'default.toml');
  fs.writeFileSync(defaultConfig, '[extend]\nuseDefault = true\n', { mode: 0o600 });
  const args = [mode, '--config', configured ? config : defaultConfig, '--redact=100', '--exit-code', '1', '--report-format', 'json', '--report-path', report];
  if (mode === 'git') args.push('--log-opts=--all');
  args.push('.');
  const result = run(binary, args, repo.tree);
  // Never include scanner output or secret material in assertion messages.
  assert.ok(fs.existsSync(report), 'scanner must produce a redacted JSON report');
  const findings = JSON.parse(fs.readFileSync(report, 'utf8'));
  for (const finding of findings) assert.equal(finding.Secret, 'REDACTED');
  return { status: result.status, findings };
}

for (const mode of ['dir', 'git']) {
  test(`Gitleaks ${mode}: built-in rules detect known fixtures; exact scoped exceptions allow them`, (t) => {
    const repo = repository(t, {
      'sync-server/runtime_roles_test.go': `const migratePassword = "${fixtureSecret}"\nconst apiPassword = "${roleSecret}"\n`,
      'sync-server/store_test_helper.go': `t.Setenv("HMAC_SECRET", "${fixtureSecret}")\n`,
    });
    const before = scan(repo, mode, false);
    assert.equal(before.status, 1);
    assert.equal(before.findings.length, 3, 'prove all three fixture occurrences were detected before exceptions');
    const after = scan(repo, mode, true);
    assert.equal(after.status, 0);
    assert.deepEqual(after.findings, []);
  });

  test(`Gitleaks ${mode}: unknown generic and provider-shaped keys in the same fixture file still fail`, (t) => {
    // Generate synthetic keys at runtime rather than checking key-like literals into source.
    const unknown = crypto.randomBytes(32).toString('hex');
    const provider = ['gh', 'p_'].join('') + crypto.randomBytes(18).toString('hex');
    const repo = repository(t, {
      'sync-server/runtime_roles_test.go': `const migratePassword = "${unknown}"\nconst apiPassword = "${roleSecret}"\nconst providerToken = "${provider}"\n`,
    });
    const result = scan(repo, mode, true);
    assert.equal(result.status, 1);
    assert.ok(result.findings.some(f => f.RuleID === 'generic-api-key'), 'unknown generic secret must still be detected');
    assert.ok(result.findings.some(f => f.RuleID === 'github-pat'), 'default provider rules must remain enabled');
    assert.ok(result.findings.every(f => f.File.endsWith('sync-server/runtime_roles_test.go')));
  });

  test(`Gitleaks ${mode}: exact fixtures outside the two approved files are not exempt`, (t) => {
    const repo = repository(t, { 'sync-server/other_test.go': `const apiPassword = "${fixtureSecret}"\n` });
    const result = scan(repo, mode, true);
    assert.equal(result.status, 1);
    assert.ok(result.findings.some(f => f.RuleID === 'generic-api-key'));
  });

  test(`Gitleaks ${mode}: the reviewed historical auth fixture is detected by defaults and allowed only by its exact exception`, (t) => {
    const repo = repository(t, {
      'sync-server/auth_test.go': `os.Setenv("HMAC_SECRET", "${historicalAuthFixture}")\n`,
    });
    const before = scan(repo, mode, false);
    assert.equal(before.status, 1);
    assert.equal(before.findings.length, 1, 'prove the historical fixture is detected before its exception');
    assert.equal(before.findings[0].RuleID, 'generic-api-key');
    const after = scan(repo, mode, true);
    assert.equal(after.status, 0);
    assert.deepEqual(after.findings, []);
  });

  test(`Gitleaks ${mode}: the historical auth fixture in a production file is not exempt`, (t) => {
    const repo = repository(t, {
      'sync-server/auth.go': `os.Setenv("HMAC_SECRET", "${historicalAuthFixture}")\n`,
    });
    const result = scan(repo, mode, true);
    assert.equal(result.status, 1);
    assert.ok(result.findings.some(f => f.RuleID === 'generic-api-key'));
  });

  test(`Gitleaks ${mode}: changed and high-entropy HMAC values in the auth test still fail`, (t) => {
    const changed = historicalAuthFixture + '-' + crypto.randomBytes(16).toString('hex');
    const unknown = crypto.randomBytes(32).toString('hex');
    const repo = repository(t, {
      'sync-server/auth_test.go': [
        `os.Setenv("HMAC_SECRET", "${historicalAuthFixture}")`,
        `os.Setenv("HMAC_SECRET", "${changed}")`,
        `os.Setenv("HMAC_SECRET", "${unknown}")`,
      ].join('\n') + '\n',
    });
    const result = scan(repo, mode, true);
    assert.equal(result.status, 1);
    assert.equal(result.findings.length, 2, 'only the exact reviewed literal may be exempt');
    assert.deepEqual(result.findings.map(f => f.StartLine).sort((a, b) => a - b), [2, 3]);
    assert.ok(result.findings.every(f => f.RuleID === 'generic-api-key'));
    assert.ok(result.findings.every(f => f.File.endsWith('sync-server/auth_test.go')));
  });

  test(`Gitleaks ${mode}: a nested lookalike auth-test path is not exempt`, (t) => {
    const repo = repository(t, {
      'nested/sync-server/auth_test.go': `os.Setenv("HMAC_SECRET", "${historicalAuthFixture}")\n`,
    });
    const result = scan(repo, mode, true);
    assert.equal(result.status, 1);
    assert.ok(result.findings.some(f => f.RuleID === 'generic-api-key'));
  });
}
