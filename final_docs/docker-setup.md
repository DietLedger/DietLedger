# DietLedger Phase 1 Deployment Guide

Deploy DietLedger as a hosted multi-user web application.

---

## Architecture

```text
Browser
  -> Next.js web app (frontend server, port 3000)
  -> Go API server (backend, port 8080)
  -> PostgreSQL (database, port 5432)
```

Three containers:

| Container | Image | Port | Role |
|-----------|-------|------|------|
| `dietledger-web` | `recipetool-dietledger` | 3000 | Next.js standalone server serving the frontend |
| `dietledger-api` | `recipetool-api` | 8080 | Go API server handling all application logic |
| `dietledger-postgres` | `postgres:17-alpine` | 5432 | PostgreSQL database (source of truth) |

PostgreSQL may be a managed database service, host-level PostgreSQL, or the optional Docker Compose service.

---

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| CPU | 1 core |
| RAM | 1 GB |
| Disk | 5 GB |
| Docker | Docker 20.10+ and Docker Compose v2+ |
| PostgreSQL | 17+ (or use the Compose service) |

---

## Environment Variables

### PostgreSQL

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_DB` | No | `dietledger` | Database name |
| `POSTGRES_USER` | No | `dietledger` | Database user |
| `POSTGRES_PASSWORD` | **Yes** | `dietledger` | Database password (change in production) |

### API Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | API server listen port |
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origins (comma-separated) |
| `HMAC_SECRET` | **Yes** | (generated) | JWT signing secret. If unset, a random secret is generated on each restart and tokens will not survive restarts. |
| `JWT_SIGNING_KEY_PATH` | No | - | Path to RSA PEM key for RS256 JWT signing. If unset, HS256 with HMAC_SECRET is used. |
| `FDA_API_KEY` | No | `DEMO_KEY` | FDA FoodData Central API key |
| `MAX_BODY_MB` | No | `10` | Maximum request body size in megabytes |

### Frontend Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Frontend listen port |
| `API_URL` | No | - | Internal API URL for server-side requests (e.g., `http://dietledger-api:8080`) |
| `NEXT_PUBLIC_API_URL` | No | - | Public API URL for browser requests. If unset, the frontend proxies `/api/*` to the Go API. |
| `FDA_API_KEY` | No | `DEMO_KEY` | FDA API key for server-side food search |

---

## Quick Start

### 1. Build images

```bash
docker compose -f docker-compose.build.yml build
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your production values. At minimum, set:

- `POSTGRES_PASSWORD` to a strong password
- `HMAC_SECRET` to a long random string
- `CORS_ORIGIN` to your frontend domain

### 3. Start services

```bash
docker compose up -d
```

### 4. Verify

```bash
curl http://localhost:8080/api/health
curl http://localhost:3000
```

The API server runs PostgreSQL migrations automatically on startup. Migration failure prevents the API from serving traffic.

---

## Local Development with Docker

The `docker-compose.yml` includes an optional PostgreSQL service for local development:

```bash
docker compose up -d
```

This starts all three containers. The frontend and API images must be built first using `docker-compose.build.yml`.

To use an external PostgreSQL instead, remove the `postgres` service from `docker-compose.yml` and set `DATABASE_URL` to point to your external instance.

---

## Building Images

### Build both images

```bash
docker compose -f docker-compose.build.yml build
```

### Build individually

```bash
docker compose -f docker-compose.build.yml build web
docker compose -f docker-compose.build.yml build api
```

### Pre-built distribution (Windows)

```bat
build-all.bat
```

This builds both Docker images, saves them to a tar archive, and creates a deployment package in `docker-build/`.

---

## Database Migrations

The Go API server runs migrations automatically on startup:

- Migrations are embedded in the API binary
- Applied migrations are recorded in `schema_migrations`
- Migrations are idempotent (safe to run multiple times)
- If migration fails, the API exits immediately and will not serve traffic

### Migration files

Migration SQL files are in `sync-server/migrations/` and follow the naming convention `NNNNNN_name.up.sql` / `NNNNNN_name.down.sql`.

---

## Updating

```bash
git pull
docker compose -f docker-compose.build.yml build
docker compose up -d
```

The API will apply any new migrations automatically on startup.

---

## Backup

PostgreSQL data is stored in the `pg-data` Docker volume. Use `pg_dump` for backups:

```bash
docker compose exec postgres pg_dump -U dietledger dietledger > backup.sql
```

### Restore

```bash
docker compose exec -T postgres psql -U dietledger dietledger < backup.sql
```

---

## Health Checks

All containers have health checks configured:

| Container | Endpoint | Interval |
|-----------|----------|----------|
| `dietledger-api` | `GET /api/health` | 30s |
| `dietledger-web` | `GET /` | 30s |
| `dietledger-postgres` | `pg_isready` | 10s |

The API server depends on PostgreSQL being healthy. The web server depends on the API being healthy.
