#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bump = process.argv[2];

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
let version = pkg.version;

if (!version) {
  console.error('[version-sync] No version found in package.json');
  process.exit(1);
}

if (bump === 'bump') {
  const match = version.match(/^(.*?)(\d+)$/);
  if (!match) {
    console.error(`[version-sync] Cannot bump version: ${version}`);
    process.exit(1);
  }
  version = match[1] + (parseInt(match[2], 10) + 1);
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`[version-sync] Bumped version: ${pkg.version} -> ${version}`);
}

console.log(`[version-sync] Building version: ${version}`);

const syncTargets = [
  {
    file: path.join(root, 'src-tauri', 'tauri.conf.json'),
    pattern: /"version"\s*:\s*"[^"]*"/,
    replacement: `"version": "${version}"`,
  },
  {
    file: path.join(root, 'src-tauri', 'Cargo.toml'),
    pattern: /^version\s*=\s*"[^"]*"/m,
    replacement: `version = "${version}"`,
  },
];

for (const target of syncTargets) {
  if (!fs.existsSync(target.file)) continue;
  const content = fs.readFileSync(target.file, 'utf-8');
  const updated = content.replace(target.pattern, target.replacement);
  if (updated !== content) {
    fs.writeFileSync(target.file, updated);
    console.log(`[version-sync] Updated ${path.relative(root, target.file)}`);
  }
}

console.log(`[version-sync] Done. All targets synced to ${version}`);
