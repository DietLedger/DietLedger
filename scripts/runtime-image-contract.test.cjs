'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const api = fs.readFileSync(path.join(root, 'sync-server/Dockerfile'), 'utf8');
const stages = [...dockerfile.matchAll(/^FROM\s+(\S+)\s+AS\s+(\S+)\s*\n([\s\S]*?)(?=^FROM\s|$(?![\s\S]))/gm)];
const stage = name => {
  const value = stages.find(match => match[2] === name);
  assert.ok(value, `missing ${name} stage`);
  return { parent: value[1], body: value[3] };
};

test('builder retains pinned Node, npm and exact lockfile installation', () => {
  assert.match(dockerfile, /FROM node:22\.23\.2-alpine@sha256:[a-f0-9]{64} AS base/);
  assert.match(stage('base').body, /test "\$\(node --version\)" = "v22\.23\.2"/);
  assert.match(dockerfile, /npm install -g npm@11\.16\.0/);
  assert.match(stage('deps').body, /COPY package\.json package-lock\.json \.\//);
  assert.match(stage('deps').body, /RUN npm ci\b/);
  assert.match(stage('builder').body, /npx next build --webpack/);
});

test('only the web service inherits the package-manager-free Node runtime stage', () => {
  assert.deepEqual(stages.map(match => match[2]), ['base', 'deps', 'builder', 'runtime', 'runner']);
  assert.equal(stage('runner').parent, 'runtime');
  assert.notEqual(stage('deps').parent, 'runtime');
  assert.notEqual(stage('builder').parent, 'runtime');
  const runtime = stage('runtime').body;
  for (const location of ['/usr/local/lib/node_modules/npm', '/usr/local/lib/node_modules/corepack', '/opt/yarn-v*']) {
    assert.ok(runtime.includes(location), `runtime must remove ${location}`);
  }
  for (const tool of ['npm', 'npx', 'yarn', 'yarnpkg', 'corepack', 'pnpm', 'pnpx']) {
    assert.ok(runtime.includes(`/usr/local/bin/${tool}`), `remove ${tool} shim`);
  }
  assert.match(runtime, /command -v/);
  assert.match(runtime, /node --version/);
  assert.doesNotMatch(stage('runner').body, /npm (?:ci|install)|corepack enable|yarn install/);
});

test('Node runtime base enforces reviewed fixed Alpine library minimums', () => {
  const base = stage('base').body;
  assert.match(base, /apk add --no-cache --upgrade/);
  for (const minimum of ['musl>=1.2.6-r3', 'musl-utils>=1.2.6-r3', 'zlib>=1.4-r0', 'libcrypto3>=3.5.9-r1', 'libssl3>=3.5.9-r1']) {
    assert.ok(base.includes(minimum), `missing reviewed fix floor ${minimum}`);
  }
});

test('API preserves pinned Go compiler and patches existing zlib without role or entrypoint changes', () => {
  assert.match(api, /FROM golang:1\.27\.4-alpine@sha256:[a-f0-9]{64}/);
  assert.match(api, /apk (?:add --no-cache --upgrade|add --upgrade --no-cache)[^\n]*['"]zlib>=1\.4-r0['"]/);
  assert.match(api, /USER apiuser/);
  assert.match(api, /ENTRYPOINT \["dietledger-api"\]/);
});

test('final entrypoints require Node/server/helper libraries, not package-manager CLIs', () => {
  for (const filename of ['docker-entrypoint.sh']) {
    const contents = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.doesNotMatch(contents, /(?:exec|spawnSync|spawn|execFileSync|execFile)\s*(?:\(\s*['"]|\s+)(?:npm|npx|yarn|corepack)\b/);
  }
  assert.match(stage('runner').body, /USER dietledger/);
  assert.doesNotMatch(dockerfile, /deploy\/(?:setup|install)\.cjs|install\.ps1|install\.sh/);
});
