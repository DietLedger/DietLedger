#!/usr/bin/env bash
# Opt-in maintainer probe; it creates and deletes only its own isolated fixtures.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
[ -f .next/standalone/server.js ] || { echo 'Run npm run build:web first.' >&2; exit 1; }
for command in docker go openssl node; do command -v "$command" >/dev/null; done
tmp=$(mktemp -d)
containers=()
network=''
cleanup() {
  for id in "${containers[@]}"; do docker rm -f "$id" >/dev/null 2>&1 || true; done
  if [ -n "$network" ]; then docker network rm "$network" >/dev/null 2>&1 || true; fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT
# Bootstrap/migrate/serve are the real binary, restricted to this disposable network.
(cd sync-server && CGO_ENABLED=0 go build -o "$tmp/dietledger-api" .)
postgres=$(awk '/image: postgres/{print $2; exit}' docker-compose.yml)
node=$(awk '$1=="FROM" && $2 ~ /^node:/{print $2; exit}' Dockerfile)
network=$(docker network create --label dietledger-test=personal-key-https "dietledger-key-https-$(openssl rand -hex 6)")
bootstrap=$(openssl rand -hex 32)
migration=$(openssl rand -hex 32)
runtime=$(openssl rand -hex 32)
claim=$(openssl rand -hex 32)
hmac=$(openssl rand -hex 32)
mount="type=bind,source=$tmp/dietledger-api,target=/fixture-api,readonly"
pg=$(docker run -d --network "$network" --network-alias pg --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_DB=dietledger -e POSTGRES_USER=dietledger_bootstrap -e POSTGRES_PASSWORD="$bootstrap" "$postgres")
containers+=("$pg")
for _ in {1..35}; do
  if docker exec "$pg" pg_isready -h 127.0.0.1 -U dietledger_bootstrap -d dietledger >/dev/null; then break; fi
  sleep 1
done
docker run --rm --network "$network" --mount "$mount" --entrypoint /fixture-api \
  -e "DATABASE_URL=postgres://dietledger_bootstrap:$bootstrap@pg:5432/dietledger?sslmode=disable" \
  -e MIGRATION_DB_PASSWORD="$migration" -e API_DB_PASSWORD="$runtime" "$postgres" bootstrap
docker run --rm --network "$network" --mount "$mount" --entrypoint /fixture-api \
  -e "DATABASE_URL=postgres://dietledger_migrate:$migration@pg:5432/dietledger?sslmode=disable" "$postgres" migrate
api=$(docker run -d --network "$network" --network-alias api --mount "$mount" --entrypoint /fixture-api \
  -e "DATABASE_URL=postgres://dietledger_api:$runtime@pg:5432/dietledger?sslmode=disable" \
  -e HMAC_SECRET="$hmac" -e SETUP_CLAIM_SECRET="$claim" -e AUTH_ALLOW_INSECURE_LOOPBACK=false \
  -e CORS_ORIGIN=https://ledger.example.invalid:18443 "$postgres" serve)
containers+=("$api")
web=$(docker run -d --network "$network" -p 127.0.0.1::3000 -w /fixture-web \
  --mount "type=bind,source=$PWD/.next/standalone,target=/fixture-web,readonly" \
  -e API_URL=http://api:8080 -e HOSTNAME=0.0.0.0 -e PORT=3000 --entrypoint node "$node" server.js)
containers+=("$web")
for raw in "$api" "$pg"; do
  [ -z "$(docker port "$raw")" ] || { echo 'A private service published a port.' >&2; exit 1; }
done
port=$(docker port "$web" 3000/tcp)
port=${port#127.0.0.1:}
for _ in {1..35}; do
  if curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null
openssl req -x509 -newkey rsa:2048 -noenc -days 1 -subj /CN=ledger.example.invalid \
  -addext subjectAltName=DNS:ledger.example.invalid -keyout "$tmp/tls.key" -out "$tmp/tls.crt" >/dev/null 2>&1
node scripts/verify-personal-key-https.mjs "$port" "$tmp/tls.crt" "$tmp/tls.key" "$claim"
