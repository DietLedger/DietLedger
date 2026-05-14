#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[DietLedger] Applying database schema..."
  npx prisma db push --skip-generate 2>/dev/null || echo "[DietLedger] Warning: prisma db push failed — database may need manual setup"
fi

echo "[DietLedger] Starting server..."
exec node server.js
