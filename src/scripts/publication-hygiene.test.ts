// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '../..');

describe('public-release configuration boundary', () => {
  it('does not track local runtime or opaque backup artifacts in the publication index', () => {
    const tracked = spawnSync('git', ['ls-files', '--', '.env', 'RecipeTool.zip', 'db/custom.db', 'sync-server/dietledger-api.exe'], { cwd: root, encoding: 'utf8' });
    expect(tracked.status).toBe(0);
    expect(tracked.stdout.trim()).toBe('');
  });

  it('excludes credential-bearing local artifacts from both Docker build contexts', () => {
    const frontend = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/);
    for (const pattern of ['.env', '.env.*', '*.key', 'RecipeTool.zip', '.worktree-safety', '.pi', '.codegraph', '.dietledger-install.json']) expect(frontend.includes(pattern)).toBe(true);
    const backend = fs.readFileSync(path.join(root, 'sync-server/.dockerignore'), 'utf8').split(/\r?\n/);
    for (const pattern of ['.env', '.env.*', '*.pem', '*.key', '*.db', '*.exe']) expect(backend.includes(pattern)).toBe(true);
  });

  it('provides inert placeholders and no implied usable default signing/database secret', () => {
    const template = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    for (const name of ['POSTGRES_PASSWORD', 'MIGRATION_DB_PASSWORD', 'API_DB_PASSWORD', 'HMAC_SECRET', 'SETUP_CLAIM_SECRET']) {
      expect(new RegExp(`^${name}=$`, 'm').test(template)).toBe(true);
    }
    expect(template).toContain('BIND_ADDRESS=127.0.0.1');
    expect(template).not.toContain('FDA_API_KEY=');
  });

  it('binds the standalone web listener to all container interfaces so localhost healthchecks work', () => {
    const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
    expect(dockerfile).toContain('ENV HOSTNAME=0.0.0.0');
    expect(compose).toMatch(/(?:-\s*HOSTNAME=|HOSTNAME:\s*)["']?0\.0\.0\.0/);
  });

  it('keeps private operational tooling out of public package scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(Object.keys(pkg.scripts).some(name => name.startsWith('deploy:') || name.startsWith('build:deploy'))).toBe(false);
    expect(pkg.scripts['docker:build:local']).toBe('node scripts/build-local-images.js');
  });
});
