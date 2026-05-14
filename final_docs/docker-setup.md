# DietLedger Deployment Guide

Self-host DietLedger using Docker, bare metal (PM2 or systemd), or Portainer.

---

## Architecture

```
DietLedger (Next.js standalone on :3000) → SQLite (db/custom.db)
                ↓
           FDA API (external)
```

- **Runtime:** Node.js 20 (Alpine Linux in Docker)
- **Database:** SQLite via Prisma (file-based, stored in `db/custom.db`)
- **Port:** 3000 (configurable via `PORT` env var)

---

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| CPU | 1 core |
| RAM | 512 MB |
| Disk | 2 GB |
| OS | Any Linux (Ubuntu 22.04+ recommended) |

**Docker:** Docker 20.10+ and Docker Compose v2+

**Bare metal:** Node.js 20.x LTS

**FDA API key** (optional): Get a free key at https://fdc.nal.usda.gov/api-key-signup.html — 3,600 requests/hour. Without it the app uses `DEMO_KEY` (30 requests/hour).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server listen port |
| `HOSTNAME` | No | `127.0.0.1` (`0.0.0.0` if `DOCKER=1`) | Bind address |
| `DATABASE_URL` | No | `sqlite:db/custom.db` | SQLite database path |
| `FDA_API_KEY` | No | `DEMO_KEY` | FDA FoodData Central API key |
| `DOCKER` | No | unset | Set to `1` to bind `0.0.0.0` instead of localhost |
| `NODE_ENV` | No | `production` | Node environment |

---

## Method 1: Docker Compose

### 1. Clone and configure

```bash
git clone <repo-url> /opt/dietledger
cd /opt/dietledger
cp .env.example .env
```

Edit `.env`:

```
PORT=3000
DATABASE_URL=sqlite:/app/db/custom.db
FDA_API_KEY=DEMO_KEY
```

### 2. Build and start

```bash
docker compose up -d --build
```

### 3. Verify

```bash
docker compose logs -f dietledger
curl http://localhost:3000
```

### 4. Stop

```bash
docker compose down
```

Data persists in the `dietledger-data` Docker volume.

---

## Method 2: Plain Docker

### 1. Build the image

```bash
git clone <repo-url> /opt/dietledger
cd /opt/dietledger
docker build -t dietledger .
```

### 2. Run

```bash
docker run -d \
  --name dietledger \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DOCKER=1 \
  -e PORT=3000 \
  -e DATABASE_URL=sqlite:/app/db/custom.db \
  -e FDA_API_KEY=DEMO_KEY \
  -v dietledger-data:/app/db \
  --restart unless-stopped \
  dietledger
```

### 3. Verify

```bash
docker logs -f dietledger
curl http://localhost:3000
```

### 4. Stop / remove

```bash
docker stop dietledger
docker rm dietledger
```

---

## Method 3: Portainer

### 1. Install Portainer (if not already running)

```bash
docker volume create portainer_data
docker run -d \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Open `https://your-server-ip:9443` and create the admin account.

### 2. Deploy with Portainer Stacks

1. Go to **Stacks** → **Add stack**
2. Name it `dietledger`
3. Choose **Git repository** as the build method:
   - Repository URL: `<your-repo-url>`
   - Compose path: `docker-compose.yml`
4. Under **Environment variables**, add:

| Name | Value |
|------|-------|
| `PORT` | `3000` |
| `DATABASE_URL` | `sqlite:/app/db/custom.db` |
| `FDA_API_KEY` | `YOUR_KEY_HERE` |

5. Click **Deploy the stack**

### 3. Deploy with Portainer Containers (alternative)

Build on the server first:

```bash
cd /opt/dietledger
docker build -t dietledger .
```

Then in Portainer:

1. Go to **Containers** → **Add container**
2. Name: `dietledger`
3. Image: `dietledger`
4. Map port: host `3000` → container `3000` (TCP)
5. Under **Env** tab, add:
   - `NODE_ENV=production`
   - `DOCKER=1`
   - `PORT=3000`
   - `DATABASE_URL=sqlite:/app/db/custom.db`
   - `FDA_API_KEY=DEMO_KEY`
6. Under **Volumes** tab, map: `dietledger-data` → `/app/db`
7. Under **Restart policy**, choose `Unless stopped`
8. Click **Deploy the container**

### 4. Monitor in Portainer

- **Containers** → click `dietledger` → **Logs** to see output
- **Inspect** to check health status
- **Stats** for CPU/memory usage

---

## Method 4: Bare Metal (PM2)

### 1. Install Node.js 20

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Or using NodeSource (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Clone and build

```bash
cd /opt
sudo git clone <repo-url> dietledger
cd dietledger
sudo npm install --omit=dev
sudo npx prisma generate
sudo npm run build
```

### 3. Create user and set permissions

```bash
sudo useradd -r -s /bin/false dietledger
sudo mkdir -p /opt/dietledger/db /opt/dietledger/logs
sudo chown -R dietledger:dietledger /opt/dietledger
```

### 4. Configure environment

Edit `ecosystem.config.cjs` — update `FDA_API_KEY` in the `env` block.

### 5. Run with PM2

```bash
sudo npm install -g pm2
sudo -u dietledger pm2 start ecosystem.config.cjs
sudo pm2 save
sudo pm2 startup
```

### 6. Verify

```bash
pm2 status
curl http://localhost:3000
```

---

## Method 5: Bare Metal (systemd)

### 1. Install Node.js 20 and build

Same steps as PM2 (Steps 1–3 above).

### 2. Edit the service file

```bash
sudo nano deploy/dietledger.service
```

Update `FDA_API_KEY` in the `Environment` lines.

### 3. Install and start

```bash
sudo cp deploy/dietledger.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dietledger
sudo systemctl start dietledger
sudo systemctl status dietledger
```

### 4. Verify

```bash
curl http://localhost:3000
```

### 5. View logs

```bash
journalctl -u dietledger -f
```

---

## Database Management

### Location

| Method | Database path |
|--------|--------------|
| Docker | Inside volume `dietledger-data` at `/app/db/custom.db` |
| Bare metal | `/opt/dietledger/db/custom.db` |

### Direct Access (Docker)

```bash
docker compose exec dietledger sh
npx prisma studio --port 5555 &
# Or use sqlite3
apk add sqlite3
sqlite3 /app/db/custom.db
```

### Direct Access (Bare Metal)

```bash
cd /opt/dietledger
npx prisma studio
```

### Schema Changes

After updating the Prisma schema in the source:

```bash
npx prisma generate
npx prisma db push
```

For Docker, the `docker-entrypoint.sh` runs `prisma db push` automatically on startup.

---

## Updating

### Docker Compose

```bash
cd /opt/dietledger
git pull
docker compose up -d --build
docker compose logs -f --tail=50 dietledger
```

### Plain Docker

```bash
cd /opt/dietledger
git pull
docker build -t dietledger .
docker stop dietledger && docker rm dietledger
# Re-run the docker run command from Method 2
```

### Portainer (Stack)

1. Go to **Stacks** → `dietledger`
2. Click **Pull and redeploy**

### Bare Metal (PM2)

```bash
cd /opt/dietledger
git pull
npm install --omit=dev
npx prisma generate
npm run build
pm2 restart dietledger
```

### Bare Metal (systemd)

```bash
cd /opt/dietledger
git pull
npm install --omit=dev
npx prisma generate
npm run build
sudo systemctl restart dietledger
```

---

## Backup & Restore

### Manual Backup

```bash
# Docker
docker cp dietledger:/app/db/custom.db ./backup-$(date +%Y%m%d).db

# Bare metal
cp /opt/dietledger/db/custom.db ./backup-$(date +%Y%m%d).db
```

### Restore (Docker)

```bash
docker compose down
docker compose run --rm -v dietledger-data:/app/db -v $(pwd):/backup alpine \
  cp /backup/backup-YYYYMMDD.db /app/db/custom.db
docker compose up -d
```

### Restore (Bare Metal)

```bash
sudo systemctl stop dietledger   # or: pm2 stop dietledger
cp ./backup-YYYYMMDD.db /opt/dietledger/db/custom.db
sudo systemctl start dietledger  # or: pm2 start dietledger
```

---

## Server Migration

### Docker to Docker

```bash
# On old server
docker cp dietledger:/app/db/custom.db ./export.db
scp export.db user@new-server:/tmp/

# On new server (after fresh deploy)
docker compose down
docker compose run --rm -v dietledger-data:/app/db -v /tmp:/backup alpine \
  cp /backup/export.db /app/db/custom.db
docker compose up -d
```

### Bare Metal to Bare Metal

```bash
# On old server
scp /opt/dietledger/db/custom.db user@new-server:/tmp/

# On new server (after fresh deploy)
sudo systemctl stop dietledger   # or: pm2 stop dietledger
sudo cp /tmp/custom.db /opt/dietledger/db/custom.db
sudo chown dietledger:dietledger /opt/dietledger/db/custom.db
sudo systemctl start dietledger  # or: pm2 start dietledger
```

---

## What Gets Stored Where

| Path | Description | Persisted? |
|------|-------------|------------|
| `db/custom.db` | SQLite database (all user data) | Yes — Docker volume or on disk |
| `logs/` | PM2 log files | Optional |
| `/app` or `/opt/dietledger` | Application code | No — rebuilt on each deploy |

The database is the only thing you need to back up. Everything else is rebuilt from source.
