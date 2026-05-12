#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILDS_DIR="$SCRIPT_DIR/builds"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

command -v bun >/dev/null 2>&1 || { error "bun is not installed. Install from https://bun.sh"; exit 1; }
command -v cargo >/dev/null 2>&1 || { warn "cargo not found — Tauri desktop builds will be skipped"; }

mkdir -p "$BUILDS_DIR"/{windows,linux,macos,android,ios,server}

echo "========================================"
echo " NutriLabel - Build All Platforms"
echo "========================================"
echo ""
echo "Output directory: $BUILDS_DIR"
echo ""

info "Installing dependencies..."
bun install

restore_config() {
    git checkout -- next.config.ts 2>/dev/null || true
}

trap restore_config EXIT

# -----------------------------------------------------------------------
# Detect host platform for native Tauri builds
# -----------------------------------------------------------------------
HOST_OS="$(uname -s 2>/dev/null || echo Unknown)"

echo ""
echo "========================================"
echo " Building for Windows (Tauri)"
echo "========================================"

if [[ "$HOST_OS" == "MINGW"* || "$HOST_OS" == "MSYS"* || "$HOST_OS" == "CYGWIN"* ]]; then
    info "Native Windows build..."
    cd "$SCRIPT_DIR/src-tauri"
    cargo tauri build --bundles nsis
    cp -v target/release/bundle/nsis/*.exe "$BUILDS_DIR/windows/" 2>/dev/null || true
    cp -v target/release/*.exe "$BUILDS_DIR/windows/" 2>/dev/null || true
    cd "$SCRIPT_DIR"
else
    warn "Windows build skipped — not running on Windows."
    mkdir -p "$BUILDS_DIR/windows/_skipped"
    echo "Windows build skipped - run on a Windows host." > "$BUILDS_DIR/windows/_skipped/readme.txt"
fi

echo ""
echo "========================================"
echo " Building for Linux (Tauri)"
echo "========================================"

if [[ "$HOST_OS" == "Linux" ]]; then
    info "Native Linux build..."
    cd "$SCRIPT_DIR/src-tauri"
    cargo tauri build --bundles appimage,deb
    cp -rv target/release/bundle/* "$BUILDS_DIR/linux/" 2>/dev/null || true
    cd "$SCRIPT_DIR"
else
    warn "Linux build skipped — not running on Linux."
    mkdir -p "$BUILDS_DIR/linux/_skipped"
    echo "Linux build skipped - run on a Linux host or use Docker." > "$BUILDS_DIR/linux/_skipped/readme.txt"
fi

echo ""
echo "========================================"
echo " Building for macOS (Tauri)"
echo "========================================"

if [[ "$HOST_OS" == "Darwin" ]]; then
    info "Native macOS build..."
    cd "$SCRIPT_DIR/src-tauri"
    cargo tauri build --bundles dmg,app
    cp -rv target/release/bundle/* "$BUILDS_DIR/macos/" 2>/dev/null || true
    cp -rv target/aarch64-apple-darwin/release/bundle/* "$BUILDS_DIR/macos/" 2>/dev/null || true
    cd "$SCRIPT_DIR"
else
    warn "macOS build skipped — not running on macOS."
    mkdir -p "$BUILDS_DIR/macos/_skipped"
    echo "macOS build skipped - run on a macOS host." > "$BUILDS_DIR/macos/_skipped/readme.txt"
fi

echo ""
echo "========================================"
echo " Building for Android (Capacitor)"
echo "========================================"

cd "$SCRIPT_DIR"

sed -i.bak 's|// output:|output:|' next.config.ts
info "Building Next.js static export..."
bun run build

if [ ! -d "out" ]; then
    error "Next.js static export failed — 'out' directory not found"
    restore_config
    exit 1
fi

if [ ! -d "android" ]; then
    info "Adding Android platform..."
    npx cap add android
fi

info "Syncing Capacitor..."
npx cap sync android

info "Copying Android project..."
rm -rf "$BUILDS_DIR/android"
cp -r android "$BUILDS_DIR/android"

sed -i.bak 's|output: "export"|// output: "export"|' next.config.ts

echo ""
echo "========================================"
echo " Building for iOS (Capacitor)"
echo "========================================"

cd "$SCRIPT_DIR"

sed -i.bak 's|// output:|output:|' next.config.ts
info "Building Next.js static export..."
bun run build

if [ ! -d "out" ]; then
    error "Next.js static export failed — 'out' directory not found"
    restore_config
    exit 1
fi

if [ ! -d "ios" ]; then
    info "Adding iOS platform..."
    npx cap add ios
fi

info "Syncing Capacitor..."
npx cap sync ios

info "Copying iOS project..."
rm -rf "$BUILDS_DIR/ios"
cp -r ios "$BUILDS_DIR/ios"

sed -i.bak 's|output: "export"|// output: "export"|' next.config.ts

echo ""
echo "========================================"
echo " Building for Self-Hosted Server"
echo "========================================"

cd "$SCRIPT_DIR"

sed -i.bak 's|// output: "standalone"|  output: "standalone"|' next.config.ts
sed -i.bak 's|  output: "export"|  // output: "export"|' next.config.ts

info "Building Next.js standalone server..."
bun run build

if [ ! -d ".next/standalone" ]; then
    error "Standalone build failed — .next/standalone not found"
    restore_config
    exit 1
fi

info "Assembling server bundle..."
rm -rf "$BUILDS_DIR/server"
mkdir -p "$BUILDS_DIR/server"
cp -r .next/standalone/* "$BUILDS_DIR/server/"
mkdir -p "$BUILDS_DIR/server/.next/static"
cp -r .next/static/* "$BUILDS_DIR/server/.next/static/"
cp -r public "$BUILDS_DIR/server/public" 2>/dev/null || mkdir -p "$BUILDS_DIR/server/public"
cp server.js "$BUILDS_DIR/server/server.js"
cp package.json "$BUILDS_DIR/server/package.json"

restore_config
trap - EXIT

echo ""
echo "========================================"
echo " Build Complete!"
echo "========================================"
echo ""
echo "Outputs:"
echo "  Windows: $BUILDS_DIR/windows/"
echo "  Linux:   $BUILDS_DIR/linux/"
echo "  macOS:   $BUILDS_DIR/macos/"
echo "  Android: $BUILDS_DIR/android/"
echo "  iOS:     $BUILDS_DIR/ios/"
echo "  Server:  $BUILDS_DIR/server/"
echo ""
echo "NOTE: Android - Open $BUILDS_DIR/android in Android Studio to build APK/AAB"
echo "NOTE: iOS     - Open $BUILDS_DIR/ios in Xcode to build IPA"
echo "NOTE: Server  - Deploy builds/server/ to your host, run: node server.js"
echo "NOTE: Docker  - Run: docker-compose up --build"
echo ""
