// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
function dryRun(args: string[] = []) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/build-local-images.js'), '--dry-run', ...args], {
    cwd: root, encoding: 'utf8',
  });
}

describe('portable local image build (never deployment)', () => {
  it('builds and loads both application images without contacting another host', () => {
    const result = dryRun();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[dry-run] docker buildx bake --load');
    expect(result.stdout).toContain('recipetool-dietledger');
    expect(result.stdout).toContain('recipetool-api');
    expect(result.stdout).not.toMatch(/\[dry-run\] (?:ssh|scp|sshpass|docker compose|docker restart)/);
  });

  it('tags both images with the reviewed application version', () => {
    const result = dryRun();
    expect(result.status).toBe(0);
    const tags = [...result.stdout.matchAll(/\[dry-run\] docker tag (\S+) (\S+)/g)];
    expect(tags.map(([, source, target]) => [source, target])).toEqual([
      ['recipetool-dietledger', `recipetool-dietledger:${version}`],
      ['recipetool-api', `recipetool-api:${version}`],
    ]);
    expect(result.stdout).not.toContain('recipetool-setup');
  });

  it('supports build-only development without version tags', () => {
    const result = dryRun(['--no-version-tags']);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('[dry-run] docker tag');
    expect(result.stdout).toContain('[dry-run] docker buildx bake --load');
    expect(result.stdout).not.toContain('recipetool-setup');
  });

  it('runs the read-only CI contracts for Compose, image stages, and release assets', () => {
    const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
    for (const contract of [
      'scripts/compose-install.test.cjs',
      'scripts/runtime-image-contract.test.cjs',
      'scripts/release-manifest.test.cjs',
    ]) expect(ci).toContain(contract);
  });

  it('rejects unknown build options instead of attempting a deploy', () => {
    const result = dryRun(['--unsupported-option']);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('[dry-run] docker');
  });
});
