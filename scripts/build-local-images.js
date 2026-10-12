#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

const images = [
  { name: 'recipetool-dietledger', label: 'web' },
  { name: 'recipetool-api', label: 'api' },
];

function usage() {
  console.log(`DietLedger local Docker image build/load

Usage:
  node scripts/build-local-images.js [options]

Options:
  --dry-run             Print the docker commands without running them
  --no-version-tags     Build/load only the compose image names; skip :${pkg.version} tags
  -h, --help            Show this help

This is build/load-only for local Docker + Portainer. It intentionally does not
run ssh, scp, deploy/deploy.sh, or any remote deployment command.
`);
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    versionTags: true,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--no-version-tags') opts.versionTags = false;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return opts;
}

function run(cmd, args, opts) {
  const printable = [cmd, ...args].join(' ');
  if (opts.dryRun) {
    console.log(`[dry-run] ${printable}`);
    return;
  }

  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DOCKER_BUILDKIT: '1',
      APP_VERSION: pkg.version,
    },
  });

  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  console.log(`DietLedger local Docker build/load ${pkg.version}`);
  console.log('  mode: build/load local Docker daemon only (no remote deploy)');
  console.log('');

  // Build/load-only for Portainer: buildx --load installs both compose images
  // into the local Docker daemon. Do not add ssh/scp/deploy/deploy.sh here.
  run('docker', [
    'buildx',
    'bake',
    '--load',
    '--set',
    `api.args.BUILD_VERSION=${pkg.version}`,
    '-f',
    path.join(root, 'docker-compose.build.yml'),
  ], opts);

  if (opts.versionTags) {
    for (const image of images) {
      run('docker', ['tag', image.name, `${image.name}:${pkg.version}`], opts);
    }
  }

  console.log('');
  console.log('Expected local images for Portainer:');
  for (const image of images) {
    console.log(`  - ${image.name}:latest (${image.label})`);
    if (opts.versionTags) console.log(`  - ${image.name}:${pkg.version} (${image.label})`);
  }
  console.log('');
  run('docker', ['images', 'recipetool-dietledger'], opts);
  run('docker', ['images', 'recipetool-api'], opts);
}

try {
  main();
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
