#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const POSTGRES = 'postgres:17-alpine@sha256:e80acae3f1109e8e4533618b594918936f2858c63afc7204c4773148a673add8';
const names = ['web', 'api'];
const PUBLIC_ASSETS = ['release.json', '.env.example', 'docker-compose.yml', 'docker-compose.portainer.yml'];
const secrets = ['POSTGRES_PASSWORD', 'MIGRATION_DB_PASSWORD', 'API_DB_PASSWORD', 'HMAC_SECRET', 'SETUP_CLAIM_SECRET'];
const defaults = { POSTGRES_DB: 'dietledger', POSTGRES_USER: 'dietledger_bootstrap', BIND_ADDRESS: '127.0.0.1', PORT: '3000', CORS_ORIGIN: 'http://localhost:3000', AUTH_ALLOW_INSECURE_LOOPBACK: 'true', DIETLEDGER_VERSION: '' };
function readFile(root, file) {
  const source = path.join(root, file);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Public release asset must be a regular file: ${file}`);
  return fs.readFileSync(source, 'utf8');
}
function validate(root, manifest) {
  const expected = JSON.parse(readFile(root, 'package.json')).version;
  if (manifest.status !== 'candidate' || manifest.version !== expected || !/^\d+\.\d+\.\d+-beta\.\d+$/.test(expected)) throw new Error('Candidate version must match the reviewed beta package version.');
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit || '')) throw new Error('Sanitized source commit required.');
  if (manifest.platform !== 'linux/amd64' || manifest.postgres !== POSTGRES || !manifest.images || Object.keys(manifest.images).sort().join(',') !== 'api,web') throw new Error('Invalid candidate image metadata.');
  for (const name of names) if (!new RegExp(`^ghcr\\.io/dietledger/dietledger-${name}@sha256:[a-f0-9]{64}$`).test(manifest.images[name] || '')) throw new Error(`Invalid ${name} image reference.`);
}
function prepare(root, version, commit, digests) {
  if (!Array.isArray(digests) || digests.length !== 2 || digests.some(d => !/^sha256:[a-f0-9]{64}$/.test(d))) throw new Error('Exactly two pushed image digests required.');
  const images = Object.fromEntries(names.map((name, i) => [name, `ghcr.io/dietledger/dietledger-${name}@${digests[i]}`]));
  const manifest = { status: 'candidate', version, platform: 'linux/amd64', sourceCommit: commit, images, postgres: POSTGRES };
  validate(root, manifest);
  fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
function safeEnv(text) {
  const found = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match || found.has(match[1])) throw new Error('Invalid or duplicate env assignment.');
    const [, key, value] = match;
    if (secrets.includes(key) ? value !== '' : !(Object.hasOwn(defaults, key) && defaults[key] === value)) throw new Error(`Unsafe env template value: ${key}`);
    found.set(key, value);
  }
  for (const key of secrets) if (!found.has(key)) throw new Error(`Missing empty env secret: ${key}`);
  // Keep the reviewed generation/backup instructions alongside the empty values.
  // The release Compose already embeds digests and does not need a version input.
  return '# Released Compose files already pin the application images.\n' + text.split(/\r?\n/).filter(line => !/^DIETLEDGER_VERSION=/.test(line) && !/^# (?:Select a published release tag|assets pin image digests)/.test(line)).join('\n');
}
function renderCompose(text, manifest) {
  for (const name of names) {
    const source = `ghcr.io/dietledger/dietledger-${name}:\${DIETLEDGER_VERSION:?select a published release version}`;
    if (!text.includes(source)) throw new Error(`Missing expected ${name} Compose image.`);
    text = text.split(source).join(manifest.images[name]);
  }
  const refs = text.match(/ghcr\.io\/[^\s'"}]+/g) || [];
  if (!refs.length || refs.some(ref => !names.some(name => ref === manifest.images[name])) || text.includes('DIETLEDGER_VERSION')) throw new Error('Unexpected Compose image or version reference.');
  const images = [...text.matchAll(/^\s*image:\s*([^\s#]+)\s*(?:#.*)?$/gm)].map(match => match[1]);
  if (images.length !== 5 || images.filter(image => image === manifest.images.api).length !== 3 || images.filter(image => image === manifest.images.web).length !== 1 || images.filter(image => image === POSTGRES).length !== 1) throw new Error('Unexpected Compose service images.');
  return text;
}
function checksums(root, output, sourceCommit) {
  const expected = new Set([...PUBLIC_ASSETS, 'SHA256SUMS']);
  if (fs.existsSync(output)) {
    const stat = fs.lstatSync(output);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Release asset output must be a real directory.');
    for (const entry of fs.readdirSync(output)) {
      if (!expected.has(entry)) throw new Error(`Unexpected release asset output; refusing non-allowlisted file: ${entry}`);
      if (!fs.lstatSync(path.join(output, entry)).isFile() || fs.lstatSync(path.join(output, entry)).isSymbolicLink()) throw new Error(`Invalid release asset: ${entry}`);
    }
  }
  const json = readFile(root, 'release.json');
  const manifest = JSON.parse(json);
  validate(root, manifest);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '') || manifest.sourceCommit !== sourceCommit) throw new Error('Candidate source commit does not match selected release commit.');
  const assets = {
    'release.json': json,
    '.env.example': safeEnv(readFile(root, '.env.example')),
    'docker-compose.yml': renderCompose(readFile(root, 'docker-compose.yml'), manifest),
    'docker-compose.portainer.yml': renderCompose(readFile(root, 'docker-compose.portainer.yml'), manifest),
  };
  fs.mkdirSync(output, { recursive: true });
  const sums = [];
  for (const file of PUBLIC_ASSETS) {
    const data = assets[file];
    fs.writeFileSync(path.join(output, file), data);
    sums.push(`${crypto.createHash('sha256').update(data).digest('hex')}  ${file}`);
  }
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
}
module.exports = { prepare, checksums };
if (require.main === module) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'prepare') prepare(process.cwd(), args[0], args[1], args.slice(2));
  else if (mode === 'assets') checksums(process.cwd(), path.resolve(args[0] || 'release-assets'), args[1]);
  else throw new Error('Usage: release-manifest.cjs prepare VERSION COMMIT WEB_DIGEST API_DIGEST | assets DIRECTORY COMMIT');
}
