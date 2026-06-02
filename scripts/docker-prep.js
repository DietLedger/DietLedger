#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'next.config.ts');
let content = fs.readFileSync(configPath, 'utf8');

if (!content.includes('output: "standalone"')) {
  content = content.replace(
    '  images:',
    '  output: "standalone",\n  images:'
  );
}

content = content.replace(
  '  output: "export"',
  '  // output: "export"'
);

fs.writeFileSync(configPath, content);
console.log('[docker-prep] next.config.ts updated for standalone output');
