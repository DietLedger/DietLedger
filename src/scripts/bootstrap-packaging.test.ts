// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (name: string) => readFileSync(path.join(root, name), 'utf8');

describe('portable Docker build inputs', () => {
  it('retains explicit frontend and backend build contexts and conventional local image names', () => {
    const build = read('docker-compose.build.yml');
    expect(build).toMatch(/context: \./);
    expect(build).toMatch(/context: \.\/sync-server/);
    expect(build).toContain('image: recipetool-dietledger');
    expect(build).toContain('image: recipetool-api');
    expect([...build.matchAll(/^  [a-z][a-z0-9_-]*:\s*$/gm)]).toHaveLength(2);
    expect(build).not.toMatch(/\bsetup\b|recipetool-setup/);
    expect(read('Dockerfile')).not.toMatch(/^FROM\s+\S+\s+AS\s+setup\s*$/m);
  });

  it('does not initialize runtime credentials or attach the Docker socket during image builds', () => {
    for (const name of ['Dockerfile', 'sync-server/Dockerfile', 'docker-compose.build.yml']) {
      const source = read(name);
      expect(source).not.toMatch(/(?:COPY|ADD)\s+(?:["']?\.env(?:\s|["']))/i);
      expect(source).not.toMatch(/(?:ENV|ARG)\s+(?:HMAC_SECRET|POSTGRES_PASSWORD|SETUP_CLAIM_SECRET)\s*=/i);
      expect(source).not.toContain('/var/run/docker.sock');
      expect(source).not.toContain('privileged: true');
    }
  });

  it('uses a build-only helper rather than embedding upload or stack-recreation steps', () => {
    const source = read('scripts/build-local-images.js');
    expect(source).toContain("'bake'");
    expect(source).toContain("'--load'");
    expect(source).not.toMatch(/run\('(?:ssh|scp|sshpass)'/);
    expect(source).not.toMatch(/'up',\s*'-d'/);
  });
});
