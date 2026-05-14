# DietLedger Sync Server — Setup & Usage Guide

A lightweight standalone sync server for synchronizing DietLedger data across multiple devices and browsers. Written in Go, stores data in SQLite, compiles to a single binary with no external dependencies.

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Browser A  │────▶│                  │◀────│  Desktop B  │
│  (IndexedDB)│◀────│  Sync Server     │────▶│  (IndexedDB)│
└─────────────┘     │  (Go + SQLite)   │     └─────────────┘
                    │  Port 8080       │
┌─────────────┐     │                  │     ┌─────────────┐
│  Phone C    │────▶│                  │◀────│  Browser D  │
│  (IndexedDB)│◀────│                  │────▶│  (IndexedDB)│
└─────────────┘     └──────────────────┘     └─────────────┘
```

- **Binary:** Single ~12MB executable, no runtime dependencies
- **Database:** SQLite with WAL mode (file-based, stored in `sync.db`)
- **Protocol:** JSON over HTTP with Bearer token authentication
- **Port:** 8080 (configurable)

---

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| CPU | 1 core |
| RAM | 64 MB |
| Disk | 50 MB (plus database size) |
| OS | Linux, macOS, or Windows |

**Building from source:** Go 1.18+ (the binary has no CGO dependencies)

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | Server listen port |
| `DB_PATH` | No | `./sync.db` | Path to SQLite database file |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin (use your domain in production) |
| `MAX_BODY_MB` | No | `10` | Maximum request body size in megabytes |

---

## Quick Start

### Option 1: Pre-built Binary

Download a release binary for your platform from the releases page, then:

```bash
# Linux / macOS
chmod +x dietledger-sync
./dietledger-sync

# Windows
dietledger-sync.exe
```

The server starts on port 8080. Open `http://localhost:8080/api/health` to verify.

### Option 2: Build from Source

```bash
cd sync-server
go build -ldflags="-s -w" -o dietledger-sync .
./dietledger-sync
```

### Option 3: Docker

```bash
# Build and run just the sync server
cd sync-server
docker build -t dietledger-sync .
docker run -d \
  --name dietledger-sync \
  -p 8080:8080 \
  -v sync-data:/data \
  dietledger-sync

# Or run alongside the web app
cd ..  # back to repo root
docker compose up -d
```

### Option 4: Cross-Compile All Platforms

```bash
cd sync-server
make build-all
# Outputs to dist/:
#   dietledger-sync-0.1.0-linux-amd64
#   dietledger-sync-0.1.0-linux-arm64
#   dietledger-sync-0.1.0-darwin-amd64      (macOS Intel)
#   dietledger-sync-0.1.0-darwin-arm64      (macOS Apple Silicon)
#   dietledger-sync-0.1.0-windows-amd64.exe
#   dietledger-sync-0.1.0-windows-arm64.exe
```

---

## Connecting DietLedger to the Sync Server

### Step 1: Start the sync server

Make sure the sync server is running and reachable. Test with:

```bash
curl http://your-server:8080/api/health
# Expected: {"ok":true,"service":"dietledger-sync","version":"0.1.0"}
```

### Step 2: Open Sync Settings in DietLedger

1. Open the DietLedger web app in your browser
2. Click the **Settings** gear icon in the top navigation bar
3. Click the **Sync** tab

### Step 3: Add a Sync Server

1. Click **Add Server**
2. Enter your server details:
   - **Label** — A friendly name (e.g., "Home Server")
   - **Server URL** — The URL of your sync server (e.g., `https://sync.example.com`)
3. Choose one of:
   - **Register New Account** — Creates a new account on the sync server with email and password. The server returns an API key automatically.
   - **Use Existing API Key** — Paste an API key if you already have one (e.g., from another device)
4. Click **Save Server**

The first sync is a full dump — all local data is uploaded, and any existing server data is downloaded.

### Step 4: Configure Auto-Sync

Each server has an auto-sync interval slider:

- **0 minutes** — Manual only (sync when you click "Sync Now")
- **5 minutes** — Default, syncs every 5 minutes
- **Up to 60 minutes** — Longer intervals for battery conservation

You can also toggle a server on/off with the switch next to its name.

---

## Multi-Device Setup

To sync across multiple devices:

1. **First device** — Register a new account on the sync server. This uploads all your data.
2. **Additional devices** — Use the **same server URL** and click **Register New Account** with a *different* email, OR use **Use Existing API Key** with the API key from your first device.

To get your API key from an existing device:
- Open Settings → Sync tab → Edit the server → The API key is shown in the form

Each device gets its own `deviceId` so the server can exclude a device's own changes during pull.

---

## Sync Behavior

### When Sync Happens

- **On app open** — All enabled servers are synced
- **At intervals** — Each server syncs at its configured interval (default: 5 minutes)
- **On data change** — Changes are queued and synced at the next interval
- **When coming back online** — All servers sync after network reconnects
- **When tab becomes visible** — Syncs when you switch back to the DietLedger tab

### What Gets Synced

All user data stores are synchronized:

| Store | Contents |
|-------|----------|
| `recipes` | Recipes with ingredients |
| `books` | Recipe books |
| `chapters` | Book chapters |
| `chapterRecipes` | Recipe-to-chapter links |
| `chapterPages` | Custom pages in chapters |
| `bookPages` | Custom pages in books |
| `categories` | Recipe categories |
| `recipeCategories` | Recipe-to-category links |
| `templates` | Print/page templates |
| `mealPlans` | Weekly meal plans |
| `dayPlanEntries` | Individual meal entries |
| `mealGroups` | Named meal groups |
| `groceryChecklists` | Shopping checklists |
| `customFoods` | Custom food items |
| `nutritionProfiles` | Nutrition tracking profiles |
| `foodLogEntries` | Food log records |
| `weightEntries` | Weight tracking entries |

### Conflict Resolution

When two devices modify the same record:

1. **Last-write-wins** (automatic) — If one change is clearly newer, it takes precedence
2. **Manual resolution** — If changes happened within 1 second of each other, a conflict is flagged for you to resolve

The sync status indicator in the navigation bar shows:
- Green check — All synced
- Blue spinner — Currently syncing
- Yellow warning — Conflicts need resolution
- Red X — Connection error

---

## API Reference

All endpoints accept and return JSON. Protected endpoints require `Authorization: Bearer <api-key>`.

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check, returns service info |

| `POST` | `/api/sync/register` | Register a new user and device |

**Register request:**
```json
{
  "email": "user@example.com",
  "password": "your-password",
  "displayName": "Your Name",
  "deviceName": "My Laptop",
  "deviceType": "browser"
}
```

**Register response:**
```json
{
  "ok": true,
  "data": {
    "userId": "uuid...",
    "deviceId": "uuid...",
    "apiKey": "dl_hexstring..."
  }
}
```

### Authenticated Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sync/push` | Push local changes to the server |
| `GET` | `/api/sync/pull` | Pull remote changes since a timestamp |
| `GET` | `/api/sync/status` | Get sync status, device list, record counts |
| `GET` | `/api/sync/conflicts` | List unresolved conflicts |
| `POST` | `/api/sync/conflicts/{id}` | Resolve a conflict |
| `DELETE` | `/api/sync/device/{id}` | Remove a registered device |
| `POST` | `/api/sync/full-dump` | Upload all data (initial sync) |
| `GET` | `/api/sync/full-dump` | Download all data (initial sync) |

**Push request:**
```json
{
  "deviceId": "uuid...",
  "changes": [
    {
      "storeName": "recipes",
      "recordId": "uuid...",
      "action": "upsert",
      "data": "{...json...}",
      "checksum": "abc123",
      "timestamp": "2026-05-13T12:00:00Z"
    }
  ]
}
```

**Pull parameters:**
- `since` — ISO 8601 timestamp, only return changes after this time
- `deviceId` — Exclude changes from this device

---

## Production Deployment

### Running as a systemd Service (Linux)

Create `/etc/systemd/system/dietledger-sync.service`:

```ini
[Unit]
Description=DietLedger Sync Server
After=network.target

[Service]
Type=simple
User=syncuser
Group=syncuser
WorkingDirectory=/opt/dietledger-sync
ExecStart=/opt/dietledger-sync/dietledger-sync
Environment=PORT=8080
Environment=DB_PATH=/opt/dietledger-sync/data/sync.db
Environment=CORS_ORIGIN=https://your-dietledger-domain.com
Environment=MAX_BODY_MB=10
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false syncuser
sudo mkdir -p /opt/dietledger-sync/data
sudo chown syncuser:syncuser /opt/dietledger-sync/data
sudo cp dietledger-sync /opt/dietledger-sync/
sudo systemctl daemon-reload
sudo systemctl enable dietledger-sync
sudo systemctl start dietledger-sync
```

### Running Behind a Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name sync.example.com;

    ssl_certificate /etc/letsencrypt/live/sync.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sync.example.com/privkey.pem;

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

### Running Behind a Reverse Proxy (Caddy)

```
sync.example.com {
    reverse_proxy localhost:8080
}
```

---

## Security

### CORS

Set `CORS_ORIGIN` to your DietLedger domain in production:

```
CORS_ORIGIN=https://dietledger.example.com
```

Multiple origins are not currently supported. Use `*` only for development.

### API Keys

- API keys are `dl_` prefixed 64-character hex strings generated with `crypto/rand`
- Keys are stored in the SQLite database and compared directly
- Each user gets a unique API key on registration
- To revoke access: remove the device in Settings → Sync → Edit → Remove

### Transport

Always run the sync server behind HTTPS in production. Use a reverse proxy (nginx, Caddy, Cloudflare Tunnel) to handle TLS termination.

---

## Backup & Restore

### Backup

```bash
# Stop the server first
sudo systemctl stop dietledger-sync

# Copy the database
cp /opt/dietledger-sync/data/sync.db ./sync-backup-$(date +%Y%m%d).db

# Restart
sudo systemctl start dietledger-sync
```

For Docker:

```bash
docker cp dietledger-sync:/data/sync.db ./sync-backup-$(date +%Y%m%d).db
```

### Restore

```bash
sudo systemctl stop dietledger-sync
cp ./sync-backup-YYYYMMDD.db /opt/dietledger-sync/data/sync.db
sudo chown syncuser:syncuser /opt/dietledger-sync/data/sync.db
sudo systemctl start dietledger-sync
```

---

## Updating

### Binary

```bash
cd sync-server
go build -ldflags="-s -w" -o dietledger-sync .
sudo systemctl restart dietledger-sync
```

### Docker

```bash
cd /path/to/RecipeTool
git pull
docker compose up -d --build sync-server
```

---

## Monitoring

### Health Check

```bash
curl http://localhost:8080/api/health
```

Docker includes an automatic health check every 30 seconds.

### Logs

```bash
# systemd
journalctl -u dietledger-sync -f

# Docker
docker logs -f dietledger-sync
```

---

## Troubleshooting

### "Failed to connect to sync server"

- Verify the server is running: `curl http://your-server:8080/api/health`
- Check firewall rules allow traffic on port 8080
- If using HTTPS, verify the certificate is valid
- Check that `CORS_ORIGIN` matches the DietLedger app's origin

### "Invalid API key"

- The API key may have been regenerated. Re-enter it in Settings → Sync → Edit.
- Make sure you copied the full key including the `dl_` prefix

### Sync seems stuck

- Click "Sync Now" in the sync settings
- Check the browser console for network errors
- Verify the server has disk space for the SQLite database
- Check server logs for errors

### Large database sync is slow

- Increase `MAX_BODY_MB` if you have very large recipe collections
- The first sync (full dump) may take longer; subsequent syncs are incremental
- Check server disk I/O performance

### Database is locked errors in logs

- This shouldn't happen with WAL mode, but if it does, ensure only one process is accessing the database file
- For Docker, make sure only one container is using the volume
