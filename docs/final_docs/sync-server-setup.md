# Historical DietLedger API Server Setup — superseded

> Archived guide; do not use as current installation or authentication instructions. Current deployment and security contracts are in [standard Compose / GHCR installation](../docker-registry-install.md) and [architecture](../ARCHITECTURE.md).

The DietLedger API server is the sole backend for Phase 1. Written in Go, backed by PostgreSQL.

---

## Architecture

```text
Browser -> Next.js frontend -> Go API server -> PostgreSQL
```

- Binary: Single static executable, no CGO dependencies
- Database: PostgreSQL 17+
- Protocol: REST over HTTP, JSON request/response bodies
- Auth: JWT access tokens + refresh tokens, Bearer auth
- Port: 8080 (configurable via `PORT`)

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | Server listen port |
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string (e.g., `postgres://user:pass@host:5432/dbname?sslmode=disable`) |
| `CORS_ORIGIN` | No | `*` | Comma-separated allowed CORS origins |
| `HMAC_SECRET` | **Yes** | None | Required stable secret for signing and encrypted provider settings. Startup fails closed if missing/invalid; there is no random-key fallback. Preserve the original value with database backups. |
| `JWT_SIGNING_KEY_PATH` | No | - | Path to RSA PEM private key for RS256 signing |
| `MAX_BODY_MB` | No | `10` | Maximum request body size in megabytes |

> **USDA FoodData Central API key:** configured per-user in the app Settings
> (stored encrypted in the database). There is no server-level environment
> variable for it.

---

## Quick Start

### Build from source

```bash
cd sync-server
go build -ldflags="-s -w -X main.version=$(cat ../package.json | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).version)") -o dietledger-api .
./dietledger-api
```

### Docker

```bash
docker compose -f docker-compose.build.yml build api
docker compose up -d api
```

### Verify

```bash
curl http://localhost:8080/api/health
```

Returns:

```json
{"ok":true,"service":"dietledger-api","version":"1.0.0-beta.65"}
```

---

## Database Migrations

Migrations run automatically at startup. The API exits immediately if migrations fail.

Migration files are in `sync-server/migrations/` and are embedded in the binary via `go:embed`.

---

## Running Tests

### Unit tests (no database required)

```bash
cd sync-server
go test ./...
```

### Integration tests (require PostgreSQL)

```bash
export TEST_DATABASE_URL="postgres://dietledger:dietledger@localhost:5432/dietledger_test?sslmode=disable"
cd sync-server
go test ./...
```

Integration tests create and tear down the schema for each test. They require an empty or disposable test database.

---

## Production Deployment

The API server is designed to run behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel) with TLS termination.

### Reverse proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;

    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

### Reverse proxy (Caddy)

```
api.example.com {
    reverse_proxy localhost:8080
}
```

### systemd service

```ini
[Unit]
Description=DietLedger API Server
After=network.target postgresql.service

[Service]
Type=simple
User=dietledger
WorkingDirectory=/opt/dietledger-api
ExecStart=/opt/dietledger-api/dietledger-api
Environment=PORT=8080
Environment=DATABASE_URL=postgres://dietledger:password@localhost:5432/dietledger?sslmode=disable
Environment=CORS_ORIGIN=https://dietledger.example.com
Environment=HMAC_SECRET=your-long-random-secret
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## Health and About Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Returns `{"ok":true,"service":"dietledger-api","version":"..."}` |
| `GET` | `/api/about` | None | Returns service name, version, and description |

Docker health checks use `/api/health` every 30 seconds.
