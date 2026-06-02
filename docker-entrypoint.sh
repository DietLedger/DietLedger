#!/bin/sh
set -e

VERSION=$(node -e "try{console.log(require('/app/package.json').version)}catch{try{console.log(require('fs').readFileSync('/app/BUILD_VERSION','utf-8').trim())}catch{console.log('unknown')}}")

echo "[DietLedger] Version: ${VERSION}"
echo "[DietLedger] Node: $(node -v)"
echo "[DietLedger] Environment: docker"
echo "[DietLedger] Backend: Go API server (all data via API)"
echo "[DietLedger] Starting server..."
exec node server.js
