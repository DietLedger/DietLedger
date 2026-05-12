#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const patchPath = path.resolve(__dirname, 'patch-readlink.js');
const nodeOptions = [`--require`, patchPath];
if (process.env.NODE_OPTIONS) {
  nodeOptions.push(process.env.NODE_OPTIONS);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execSync(`${npx} next build --webpack`, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions.join(' '),
  },
});
