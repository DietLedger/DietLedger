@echo off
setlocal enabledelayedexpansion
title NutriLabel Build All Platforms

where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: bun is not installed or not in PATH
    echo Install it from https://bun.sh
    pause
    exit /b 1
)

set "BUILDS_DIR=%~dp0builds"
set "BASE_DIR=%~dp0"

echo ========================================
echo  NutriLabel - Build All Platforms
echo ========================================
echo.

call node scripts\version-sync.js
if %errorlevel% neq 0 (
    echo ERROR: version sync failed
    pause
    exit /b 1
)

echo Output directory: %BUILDS_DIR%
echo.

call :ensure_dir "%BUILDS_DIR%\windows"
call :ensure_dir "%BUILDS_DIR%\linux"
call :ensure_dir "%BUILDS_DIR%\macos"
call :ensure_dir "%BUILDS_DIR%\android"
call :ensure_dir "%BUILDS_DIR%\ios"
call :ensure_dir "%BUILDS_DIR%\server"

echo [1/3] Installing dependencies...
call bun install
if %errorlevel% neq 0 (
    echo ERROR: bun install failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo  Building for Windows (Tauri)
echo ========================================

cd "%BASE_DIR%src-tauri"
call cargo tauri build --bundles nsis
if %errorlevel% neq 0 (
    echo ERROR: Windows Tauri build failed
    cd "%BASE_DIR%"
    pause
    exit /b 1
)
echo Copying Windows artifacts...
for /f "delims=" %%f in ('dir /b /s "%BASE_DIR%src-tauri\target\release\bundle\nsis\*.exe" 2^>nul') do (
    copy /y "%%f" "%BUILDS_DIR%\windows\" >nul
)
for /f "delims=" %%f in ('dir /b /s "%BASE_DIR%src-tauri\target\release\*.exe" 2^>nul') do (
    if not exist "%BUILDS_DIR%\windows\%%~nxf" copy /y "%%f" "%BUILDS_DIR%\windows\" >nul
)
cd "%BASE_DIR%"
echo.

echo ========================================
echo  Building for Linux (Tauri cross-compile)
echo ========================================

echo NOTE: Linux builds require a cross-compilation toolchain or Docker.
echo Building AppImage and DEB targets...

cd "%BASE_DIR%src-tauri"
call cargo tauri build --bundles appimage,deb --target x86_64-unknown-linux-gnu 2>nul
if %errorlevel% equ 0 (
    echo Copying Linux artifacts...
    for /f "delims=" %%f in ('dir /b /s "%BASE_DIR%src-tauri\target\x86_64-unknown-linux-gnu\release\bundle\*" 2^>nul') do (
        copy /y "%%f" "%BUILDS_DIR%\linux\" >nul
    )
) else (
    echo WARNING: Linux cross-compile failed. This is expected on Windows without a toolchain.
    echo   To build for Linux, run build-all.sh on a Linux machine or use Docker.
    call :ensure_dir "%BUILDS_DIR%\linux\_skipped"
    echo. > "%BUILDS_DIR%\linux\_skipped\readme.txt"
    echo Linux build skipped - cross-compilation not available on this host. > "%BUILDS_DIR%\linux\_skipped\readme.txt"
    echo Build on a Linux machine or use Docker with: docker run -v %%cd%%:/app -w /app ghcr.io/nicehash/tauri-build bash build-all.sh >> "%BUILDS_DIR%\linux\_skipped\readme.txt"
)
cd "%BASE_DIR%"
echo.

echo ========================================
echo  Building for macOS (Tauri cross-compile)
echo ========================================

echo NOTE: macOS builds require an Apple developer environment or cross-compilation toolchain.
echo Building DMG and APP targets...

cd "%BASE_DIR%src-tauri"
call cargo tauri build --bundles dmg,app --target aarch64-apple-darwin 2>nul
if %errorlevel% equ 0 (
    echo Copying macOS artifacts...
    for /f "delims=" %%f in ('dir /b /s "%BASE_DIR%src-tauri\target\aarch64-apple-darwin\release\bundle\*" 2^>nul') do (
        copy /y "%%f" "%BUILDS_DIR%\macos\" >nul
    )
) else (
    echo WARNING: macOS cross-compile failed. This is expected on Windows.
    echo   To build for macOS, run build-all.sh on a macOS machine.
    call :ensure_dir "%BUILDS_DIR%\macos\_skipped"
    echo. > "%BUILDS_DIR%\macos\_skipped\readme.txt"
    echo macOS build skipped - cross-compilation not available on this host. > "%BUILDS_DIR%\macos\_skipped\readme.txt"
    echo Build on a macOS machine using: bash build-all.sh >> "%BUILDS_DIR%\macos\_skipped\readme.txt"
)
cd "%BASE_DIR%"
echo.

echo ========================================
echo  Building for Android (Capacitor)
echo ========================================

cd "%BASE_DIR%"

powershell -Command "(Get-Content next.config.ts) -replace '// output:', 'output:' | Set-Content next.config.ts"
echo Building Next.js static export...
call bun run build

if not exist "%BASE_DIR%out" (
    echo ERROR: Next.js static export failed - 'out' directory not found
    powershell -Command "(Get-Content next.config.ts) -replace 'output: \"export\"', '// output: \"export\"' | Set-Content next.config.ts"
    pause
    exit /b 1
)

if not exist "%BASE_DIR%android" (
    echo Adding Android platform...
    call npx cap add android
)

echo Syncing Capacitor...
call npx cap sync android

echo Copying Android project to builds...
xcopy /e /i /y /q "%BASE_DIR%android" "%BUILDS_DIR%\android" >nul

powershell -Command "(Get-Content next.config.ts) -replace 'output: \"export\"', '// output: \"export\"' | Set-Content next.config.ts"
echo.

echo ========================================
echo  Building for iOS (Capacitor)
echo ========================================

cd "%BASE_DIR%"

powershell -Command "(Get-Content next.config.ts) -replace '// output:', 'output:' | Set-Content next.config.ts"
echo Building Next.js static export...
call bun run build

if not exist "%BASE_DIR%out" (
    echo ERROR: Next.js static export failed - 'out' directory not found
    powershell -Command "(Get-Content next.config.ts) -replace 'output: \"export\"', '// output: \"export\"' | Set-Content next.config.ts"
    pause
    exit /b 1
)

if not exist "%BASE_DIR%ios" (
    echo Adding iOS platform...
    call npx cap add ios
)

echo Syncing Capacitor...
call npx cap sync ios

echo Copying iOS project to builds...
xcopy /e /i /y /q "%BASE_DIR%ios" "%BUILDS_DIR%\ios" >nul

powershell -Command "(Get-Content next.config.ts) -replace 'output: \"export\"', '// output: \"export\"' | Set-Content next.config.ts"
echo.

echo ========================================
echo  Building for Self-Hosted Server
echo ========================================

cd "%BASE_DIR%"

echo [2/3] Enabling standalone output for server build...
powershell -Command "(Get-Content next.config.ts) -replace '// output: \"standalone\"', 'output: \"standalone\"' -replace '// output:', 'output:' | Where-Object { $_ -notmatch 'output: \"export\"' } | Set-Content next.config.ts.bak"
powershell -Command "$c = Get-Content next.config.ts -Raw; $c = $c -replace '(?m)^\s*// output: \"standalone\"', '  output: \"standalone\"'; $c = $c -replace '(?m)^\s*output: \"export\"', '  // output: \"export\"'; Set-Content next.config.ts $c"

echo [3/3] Building Next.js standalone server...
call bun run build
if %errorlevel% neq 0 (
    echo ERROR: Standalone server build failed
    powershell -Command "$c = Get-Content next.config.ts -Raw; $c = $c -replace '(?m)^\s*output: \"standalone\"', '  // output: \"standalone\"'; Set-Content next.config.ts $c"
    pause
    exit /b 1
)

echo Assembling server bundle...
if not exist "%BUILDS_DIR%\server" mkdir "%BUILDS_DIR%\server"
xcopy /e /i /y /q "%BASE_DIR%.next\standalone" "%BUILDS_DIR%\server" >nul 2>nul
if exist "%BASE_DIR%.next\static" (
    if not exist "%BUILDS_DIR%\server\.next\static" mkdir "%BUILDS_DIR%\server\.next\static"
    xcopy /e /i /y /q "%BASE_DIR%.next\static" "%BUILDS_DIR%\server\.next\static" >nul
)
if exist "%BASE_DIR%public" (
    xcopy /e /i /y /q "%BASE_DIR%public" "%BUILDS_DIR%\server\public" >nul
)
copy /y "%BASE_DIR%server.js" "%BUILDS_DIR%\server\server.js" >nul
copy /y "%BASE_DIR%package.json" "%BUILDS_DIR%\server\package.json" >nul

echo Restoring next.config.ts...
powershell -Command "$c = Get-Content next.config.ts -Raw; $c = $c -replace '(?m)^\s*output: \"standalone\"', '  // output: \"standalone\"'; Set-Content next.config.ts $c"
echo.

echo ========================================
echo  Build Complete!
echo ========================================
echo.
echo Outputs:
echo   Windows: %BUILDS_DIR%\windows\
echo   Linux:   %BUILDS_DIR%\linux\
echo   macOS:   %BUILDS_DIR%\macos\
echo   Android: %BUILDS_DIR%\android\
echo   iOS:     %BUILDS_DIR%\ios\
echo   Server:  %BUILDS_DIR%\server\
echo.
echo NOTE: Android - Open %BUILDS_DIR%\android in Android Studio to build APK/AAB
echo NOTE: iOS     - Open %BUILDS_DIR%\ios in Xcode to build IPA
echo NOTE: Server  - Deploy builds/server/ to your host, run: node server.js
echo NOTE: Docker  - Run: docker-compose up --build
echo.

pause
exit /b 0

:ensure_dir
if not exist "%~1" mkdir "%~1"
exit /b 0
