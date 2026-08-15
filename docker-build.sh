#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$BASE_DIR/docker-build"
BUMP=false
BUILD_ARGS=()

for arg in "$@"; do
    case "$arg" in
        --bump) BUMP=true ;;
        *) BUILD_ARGS+=("$arg") ;;
    esac
done

echo "========================================"
echo " DietLedger - Docker Build (Linux)"
echo "========================================"
echo ""

echo "[1/5] Syncing version..."
if [ "$BUMP" = true ]; then
    node "$BASE_DIR/scripts/version-sync.js" bump
else
    node "$BASE_DIR/scripts/version-sync.js"
fi
VERSION=$(node -e "console.log(require('$BASE_DIR/package.json').version)")
echo "     Version: $VERSION"
echo ""

echo "[1/5] Bumping version and syncing..."
node "$BASE_DIR/scripts/version-sync.js" bump
VERSION=$(node -e "console.log(require('$BASE_DIR/package.json').version)")
echo "     Version: $VERSION"
echo ""

echo "[2/5] Building Docker images..."
export APP_VERSION="$VERSION"
export DOCKER_BUILDKIT=1
docker compose -f "$BASE_DIR/docker-compose.build.yml" build --parallel "${BUILD_ARGS[@]}"
echo "     Images built successfully."
echo ""

mkdir -p "$OUTPUT"

echo "[3/5] Saving images to tar..."
TAR_FILE="$OUTPUT/dietledger-$VERSION.tar"
docker save -o "$TAR_FILE" recipetool-dietledger recipetool-api
echo "     Saved to: $TAR_FILE"
echo ""

echo "[4/5] Copying deployment files..."
cp "$BASE_DIR/docker-compose.yml" "$OUTPUT/docker-compose.yml"

cat > "$OUTPUT/.env.example" << EOF
# DietLedger $VERSION - Deployment Configuration
# Copy this to .env and fill in values for your host

# PostgreSQL
POSTGRES_DB=dietledger
POSTGRES_USER=dietledger
POSTGRES_PASSWORD=CHANGE_ME

# Ports
PORT=3000
API_PORT=8080

# API server
CORS_ORIGIN=http://localhost:3000

# Mode: leave commented for server mode, or set true for local-only
# NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=false

# JWT signing secret (set this to prevent tokens invalidating on restart)
# HMAC_SECRET=change-me-to-a-long-random-string
EOF

if [ ! -f "$OUTPUT/.env" ]; then
    cp "$OUTPUT/.env.example" "$OUTPUT/.env"
    echo "     Created .env from template - edit before deploying."
else
    echo "     Existing .env preserved."
fi

echo "[5/5] Generating load script..."
cat > "$OUTPUT/load-$VERSION.sh" << 'LOAD_EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAR_FILE=$(ls "$SCRIPT_DIR"/dietledger-*.tar 2>/dev/null | head -1)

if [ -z "$TAR_FILE" ]; then
    echo "ERROR: No dietledger-*.tar found in $SCRIPT_DIR"
    exit 1
fi

echo "Loading DietLedger from $(basename "$TAR_FILE")..."
docker load -i "$TAR_FILE"

echo ""
echo "Images loaded successfully."
echo ""
echo "Next steps:"
echo "  1. Edit .env with your settings (especially POSTGRES_PASSWORD)"
echo "  2. Run: docker compose up -d"
echo ""
LOAD_EOF
chmod +x "$OUTPUT/load-$VERSION.sh"


echo "========================================"
echo " Build Complete!"
echo "========================================"
echo ""
echo "  Version:  $VERSION"
echo "  Output:   $OUTPUT/"
echo "    Images: dietledger-$VERSION.tar"
echo "    Load:   load-$VERSION.sh"
echo "    Deploy: docker-compose.yml + .env"
echo ""
echo "  Deploy to target host:"
echo "    1. Copy docker-build/ folder to target"
echo "    2. Run: bash load-$VERSION.sh"
echo "    3. Edit .env (set POSTGRES_PASSWORD, etc.)"
echo "    4. Run: docker compose up -d"
echo ""
