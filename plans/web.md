# NutriLabel Web Deployment Manual

Complete guide for deploying NutriLabel as a web-accessible application on a server.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Option A: Docker Deployment (Recommended)](#option-a-docker-deployment)
4. [Option B: Bare Metal Deployment](#option-b-bare-metal-deployment)
5. [Option C: Docker + Caddy Reverse Proxy](#option-c-docker--caddy-reverse-proxy)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [Environment Variables](#environment-variables)
8. [Database Management](#database-management)
9. [Backup & Recovery](#backup--recovery)
10. [Updating](#updating)
11. [Monitoring & Health Checks](#monitoring--health-checks)
12. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Internet → Reverse Proxy (Caddy/Nginx) → NutriLabel (Next.js standalone on :3000) → SQLite (db/custom.db)
                                          ↓
                                      FDA API (external)
```

NutriLabel runs as a Next.js standalone server with:
- **Runtime:** Node.js 20 (Alpine Linux in Docker)
- **Database:** SQLite via Prisma (file-based, stored in `db/custom.db`)
- **Storage:** All user data in a single SQLite file
- **Port:** 3000 (configurable via `PORT` env var)

---

## Prerequisites

### Minimum Server Requirements
- **CPU:** 1 core
- **RAM:** 512 MB
- **Disk:** 2 GB (more depending on recipe/food database size)
- **OS:** Any Linux distribution (Ubuntu 22.04+ recommended)
- **Network:** Public IP or domain name pointing to server

### Software Requirements

**For Docker deployment:**
- Docker 20.10+
- Docker Compose v2+

**For bare metal:**
- Node.js 20.x LTS
- npm or bun

**For SSL (automatic with Caddy):**
- A domain name (e.g., recipes.yourdomain.com)
- DNS A record pointing to server IP

---

## Option A: Docker Deployment (Recommended)

### Step 1: Prepare the Server

```bash
# SSH into your server
ssh user@your-server-ip

# Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
ssh user@your-server-ip
```

### Step 2: Transfer the Project

```bash
# From your local machine, clone or copy the project
git clone <your-repo-url> /opt/nutrilabel
cd /opt/nutrilabel
```

Or use `scp` if transferring a built artifact:

```bash
# From local machine
scp -r ./RecipeTool user@server:/opt/nutrilabel
```

### Step 3: Configure Environment

```bash
cd /opt/nutrilabel

# Create .env file
cat > .env << 'EOF'
PORT=3000
FDA_API_KEY=DEMO_KEY
EOF
```

To get an FDA API key:
1. Visit https://fdc.nal.usda.gov/api-key-signup.html
2. Fill out the form (free)
3. Copy the key into `.env`

### Step 4: Build and Run

```bash
# Build and start
docker compose up -d --build

# Verify it's running
docker compose logs -f nutrilabel
```

The app is now running on `http://your-server-ip:3000`.

### Step 5: Verify

```bash
curl http://localhost:3000
```

You should see the NutriLabel HTML response.

---

## Option B: Bare Metal Deployment

### Step 1: Install Node.js 20

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

### Step 2: Clone and Build

```bash
cd /opt
git clone <your-repo-url> nutrilabel
cd nutrilabel

# Install dependencies
npm install --omit=dev

# Build the standalone server
npm run build
```

### Step 3: Configure Environment

```bash
cat > .env << 'EOF'
PORT=3000
DATABASE_URL=sqlite:/opt/nutrilabel/db/custom.db
FDA_API_KEY=DEMO_KEY
DOCKER=1
EOF
```

### Step 4: Run with Process Manager

Using PM2 (recommended for production):

```bash
# Install PM2
npm install -g pm2

# Start NutriLabel
pm2 start server.js --name nutrilabel

# Save the process list (auto-restart on reboot)
pm2 save
pm2 startup
```

Using systemd:

```bash
sudo cat > /etc/systemd/system/nutrilabel.service << 'EOF'
[Unit]
Description=NutriLabel Recipe Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/nutrilabel
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DOCKER=1
Environment=DATABASE_URL=sqlite:/opt/nutrilabel/db/custom.db
Environment=FDA_API_KEY=DEMO_KEY

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable nutrilabel
sudo systemctl start nutrilabel
sudo systemctl status nutrilabel
```

### Step 5: Verify

```bash
curl http://localhost:3000
```

---

## Option C: Docker + Caddy Reverse Proxy

This is the recommended production setup with automatic HTTPS.

### Step 1: Set Up Docker (as in Option A, Steps 1-2)

### Step 2: Create a Docker Network

```bash
docker network create web
```

### Step 3: Configure docker-compose.yml

Edit `docker-compose.yml` to add the network and labels:

```yaml
services:
  nutrilabel:
    build: .
    container_name: nutrilabel
    networks:
      - web
    environment:
      - NODE_ENV=production
      - DOCKER=1
      - PORT=3000
      - FDA_API_KEY=${FDA_API_KEY:-DEMO_KEY}
    volumes:
      - nutrilabel-data:/app/db
    restart: unless-stopped
    labels:
      - "caddy=recipes.yourdomain.com"
      - "caddy.reverse_proxy={{upstreams 3000}}"

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    networks:
      - web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

networks:
  web:
    external: true

volumes:
  nutrilabel-data:
  caddy_data:
  caddy_config:
```

### Step 4: Update Caddyfile

```Caddyfile
recipes.yourdomain.com {
    reverse_proxy nutrilabel:3000 {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }

    # Compression
    encode gzip

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

### Step 5: Configure DNS

Point your domain to the server:
```
recipes.yourdomain.com  A  your-server-ip
```

### Step 6: Launch

```bash
docker compose up -d --build
```

Caddy will automatically provision an SSL certificate via Let's Encrypt. Your app is now accessible at `https://recipes.yourdomain.com`.

---

## SSL/TLS Configuration

### With Caddy (Automatic)

Caddy handles SSL automatically via Let's Encrypt. No additional configuration needed.

### With Nginx (Manual)

If you prefer Nginx:

```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d recipes.yourdomain.com

# Nginx config
sudo cat > /etc/nginx/sites-available/nutrilabel << 'EOF'
server {
    listen 443 ssl http2;
    server_name recipes.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/recipes.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/recipes.yourdomain.com/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name recipes.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
EOF

sudo ln -s /etc/nginx/sites-available/nutrilabel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Auto-renewal is handled by Certbot's systemd timer:
```bash
sudo systemctl status certbot.timer
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server listen port |
| `HOSTNAME` | No | `127.0.0.1` (or `0.0.0.0` if `DOCKER=1`) | Bind address |
| `DATABASE_URL` | No | `sqlite:db/custom.db` | SQLite database path |
| `FDA_API_KEY` | No | `DEMO_KEY` | FDA FoodData Central API key (30 req/hr on DEMO_KEY) |
| `DOCKER` | No | unset | Set to `1` to bind `0.0.0.0` instead of localhost |
| `NODE_ENV` | No | `production` | Node environment |

### Getting an FDA API Key

1. Go to https://fdc.nal.usda.gov/api-key-signup.html
2. Fill in name, email, and organization
3. You will receive a key via email within minutes
4. The free tier allows 3,600 requests per hour

---

## Database Management

### Location

The SQLite database is stored at `db/custom.db` relative to the application root.

In Docker, this is inside the `nutrilabel-data` volume:
```bash
# Find the volume mount point
docker volume inspect nutrilabel_nutrilabel-data
```

### Direct Access

```bash
# Docker
docker compose exec nutrilabel sh
# Then inside the container:
npx prisma studio --port 5555 &

# Or use sqlite3 directly
apt-get install sqlite3
sqlite3 /app/db/custom.db

# Bare metal
cd /opt/nutrilabel
npx prisma studio
```

### Schema Changes

After updating the Prisma schema:

```bash
# Generate the Prisma client
npx prisma generate

# Push schema to database (development)
npx prisma db push

# Create a migration (production)
npx prisma migrate dev --name your-migration-name
npx prisma migrate deploy
```

### Seeding the Food Database

The `SeedJob` model tracks FDA data imports. The food database can be populated via the application's UI or by running import scripts.

---

## Backup & Recovery

### Manual Backup

```bash
# Docker — copy database from container
docker compose cp nutrilabel:/app/db/custom.db ./backup-$(date +%Y%m%d).db

# Bare metal
cp /opt/nutrilabel/db/custom.db ./backup-$(date +%Y%m%d).db
```

### Automated Backup Cron Job

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * docker compose -f /opt/nutrilabel/docker-compose.yml cp nutrilabel:/app/db/custom.db /opt/backups/nutrilabel-$(date +\%Y\%m\%d).db

# Clean backups older than 30 days
0 3 * * * find /opt/backups -name "nutrilabel-*.db" -mtime +30 -delete
```

### Recovery

```bash
# Stop the app
docker compose down

# Restore database
docker compose run --rm -v nutrilabel-data:/app/db -v /opt/backups:/backup alpine cp /backup/nutrilabel-20250106.db /app/db/custom.db

# Restart
docker compose up -d
```

### Full Server Migration

```bash
# On old server
docker compose cp nutrilabel:/app/db/custom.db ./export.db
scp export.db user@new-server:/tmp/

# On new server (after fresh deploy)
docker compose down
docker compose run --rm -v nutrilabel-data:/app/db -v /tmp:/backup alpine cp /backup/export.db /app/db/custom.db
docker compose up -d
```

---

## Updating

### Docker Deployment

```bash
cd /opt/nutrilabel

# Pull latest changes
git pull origin main

# Rebuild and restart (zero-downtime)
docker compose up -d --build

# Verify
docker compose logs -f --tail=50 nutrilabel
```

### Bare Metal Deployment

```bash
cd /opt/nutrilabel

# Pull latest changes
git pull origin main

# Install dependencies
npm install --omit=dev

# Rebuild
npm run build

# Restart (PM2)
pm2 restart nutrilabel

# Restart (systemd)
sudo systemctl restart nutrilabel
```

### Database Migrations on Update

If the update includes schema changes:

```bash
# Docker
docker compose exec nutrilabel npx prisma migrate deploy

# Bare metal
npx prisma migrate deploy
```

---

## Monitoring & Health Checks

### Basic Health Check

Add to `docker-compose.yml`:

```yaml
services:
  nutrilabel:
    # ... existing config ...
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
```

### Log Monitoring

```bash
# Docker — follow logs
docker compose logs -f nutrilabel

# Docker — last 100 lines
docker compose logs --tail=100 nutrilabel

# PM2
pm2 logs nutrilabel

# systemd
journalctl -u nutrilabel -f
```

### Uptime Monitoring

Use a free external monitoring service:
- **UptimeRobot** (free, 50 monitors): https://uptimerobot.com
- **Better Stack** (free): https://betterstack.com

Configure a ping check to `https://recipes.yourdomain.com` every 5 minutes.

### Disk Space Monitoring

```bash
# Check database size
ls -lh /opt/nutrilabel/db/custom.db

# Docker volume size
docker system df -v
```

---

## Troubleshooting

### App Won't Start

```bash
# Check logs
docker compose logs nutrilabel

# Common issues:
# 1. Port already in use
sudo lsof -i :3000
# Kill the process or change PORT in .env

# 2. Database locked
docker compose down
docker compose up -d

# 3. Build failed
docker compose build --no-cache
```

### Database Errors

```bash
# Check database integrity
docker compose exec nutrilabel sh -c "npx prisma db push --force-reset"
# WARNING: This resets the database!

# Check SQLite integrity
docker compose exec nutrilabel sh -c "echo 'PRAGMA integrity_check;' | sqlite3 /app/db/custom.db"
```

### FDA API Rate Limiting

If you see FDA API errors:
```bash
# Check your key
echo $FDA_API_KEY

# Test directly
curl "https://api.nal.usda.gov/fdc/v1/foods/search?query=apple&api_key=YOUR_KEY"
```

The DEMO_KEY is limited to 30 requests/hour. Get a real key at https://fdc.nal.usda.gov/api-key-signup.html (free, 3,600 req/hr).

### Performance Issues

```bash
# Check container resources
docker stats nutrilabel

# Increase memory if needed (add to docker-compose.yml)
deploy:
  resources:
    limits:
      memory: 1G
```

### Can't Access From External Network

```bash
# Check firewall
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp  # Only if not using reverse proxy

# Check cloud provider security groups (AWS, DigitalOcean, etc.)
# Ensure ports 80 and 443 are open in the security group / firewall

# Check if the app is listening
curl http://localhost:3000
```

### Reverse Proxy Not Connecting

```bash
# Verify internal connectivity
docker compose exec caddy wget -qO- http://nutrilabel:3000

# Check Caddy logs
docker compose logs caddy

# If containers can't reach each other, verify they share a network
docker network inspect web
```

---

## Quick Reference: Complete Docker + Caddy Setup (Copy-Paste)

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER

# 2. Clone
git clone <repo-url> /opt/nutrilabel && cd /opt/nutrilabel

# 3. Configure
cat > .env << 'EOF'
FDA_API_KEY=DEMO_KEY
EOF

# 4. Create network
docker network create web

# 5. Launch
docker compose up -d --build

# 6. Done — visit https://recipes.yourdomain.com
```
