// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const localOnly = [
  'build-all.bat', 'docker-build.bat', 'docker-build.sh',
  'scripts/build-and-deploy.js', 'scripts/deploy-built-tar.js',
  'deploy/deploy.sh', 'deploy/dietledger.service', 'ecosystem.config.cjs',
  '.zscripts/build.sh', '.zscripts/mini-services-build.sh', 'scripts/build-tauri.sh',
];

describe('portable publication boundary', () => {
  it('does not track operator-only build, upload and obsolete native-deployment tools', () => {
    const tracked = execFileSync('git', ['ls-files', '--', ...localOnly], { cwd: root, encoding: 'utf8' });
    expect(tracked.trim()).toBe('');
  });

  it('excludes every retained local-only tool from the frontend Docker context', () => {
    const ignored = readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/);
    for (const filename of localOnly.filter(name => !name.startsWith('.zscripts/'))) expect(ignored).toContain(filename);
    expect(ignored).toContain('.zscripts');
  });

  it('does not advertise private SSH deployment commands as public package scripts', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(Object.values(pkg.scripts).some(command => /scripts\/(?:build-and-deploy|deploy-built-tar)\.js/.test(String(command)))).toBe(false);
    expect(pkg.scripts['docker:build:local']).toBe('node scripts/build-local-images.js');
  });
});
