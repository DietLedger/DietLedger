#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Build/load DietLedger images into the local Docker daemon for Portainer.
# This is local-only and does not SSH, SCP, or run deploy/deploy.sh.
npm run portainer -- "$@"
