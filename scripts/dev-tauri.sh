#!/bin/bash
set -e

echo "🚀 Starting NutriLabel in dev mode..."
cd src-tauri && cargo tauri dev
