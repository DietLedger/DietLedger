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

if not exist node_modules (
    echo [1/2] Installing dependencies...
    call bun install
    if %errorlevel% neq 0 (
        echo ERROR: bun install failed
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed.
)

echo.
echo [2/2] Starting Next.js dev server...
call bun run dev
