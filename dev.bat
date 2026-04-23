@echo off
setlocal enabledelayedexpansion
title NutriLabel Dev Mode

where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: bun is not installed or not in PATH
    echo Install it from https://bun.sh
    pause
    exit /b 1
)

echo [1/3] Installing dependencies...
if exist bun.lock del bun.lock
call bun install --no-save
if %errorlevel% neq 0 (
    echo ERROR: bun install failed
    pause
    exit /b 1
)

echo.
echo [2/3] Starting Next.js dev server...
start "NutriLabel Next.js" cmd /c "bun run dev"
timeout /t 5 /nobreak >nul

echo.
echo [3/3] Launching Tauri dev window...
cd src-tauri
call cargo tauri dev
cd ..
