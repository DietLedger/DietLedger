#!/bin/sh
set -e

VERSION=$(node -e "try{console.log(require('/app/package.json').version)}catch{try{console.log(require('fs').readFileSync('/app/BUILD_VERSION','utf-8').trim())}catch{console.log('unknown')}}")

echo "[DietLedger] Version: ${VERSION}"
echo "[DietLedger] Node: $(node -v)"
echo "[DietLedger] Environment: docker"

DB_PATH="/app/db/custom.db"
if [ ! -f "$DB_PATH" ]; then
  echo "[DietLedger] Initializing database from seed..."
  cp /app/db/seed.db "$DB_PATH"
else
  echo "[DietLedger] Using existing database"
fi

if [ -f "/app/db/fts5-setup.sql" ]; then
  sqlite3 "$DB_PATH" < /app/db/fts5-setup.sql 2>/dev/null || true
fi

echo "[DietLedger] Starting server..."
exec node server.js
