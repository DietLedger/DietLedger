#!/bin/bash
set -e

echo "🔨 Building NutriLabel for desktop..."
echo ""
echo "Step 1/4: Building Next.js standalone..."
bun run build
echo ""

echo "Step 2/4: Copying production server entry point..."
cp server.js .next/standalone/server.js
echo ""

echo "Step 3/4: Copying static assets..."
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
echo ""

echo "Step 4/4: Building Tauri app..."
cd src-tauri && cargo tauri build
echo ""

echo "✅ Build complete! Find your installer in src-tauri/target/release/bundle/"
