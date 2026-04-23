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
echo Output directory: %BUILDS_DIR%
echo.

call :ensure_dir "%BUILDS_DIR%\windows"
call :ensure_dir "%BUILDS_DIR%\linux"
call :ensure_dir "%BUILDS_DIR%\android"
call :ensure_dir "%BUILDS_DIR%\ios"

echo [1/2] Installing dependencies...
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
echo  Build Complete!
echo ========================================
echo.
echo Outputs:
echo   Windows: %BUILDS_DIR%\windows\
echo   Linux:   %BUILDS_DIR%\linux\
echo   Android: %BUILDS_DIR%\android\
echo   iOS:     %BUILDS_DIR%\ios\
echo.
echo NOTE: Android - Open %BUILDS_DIR%\android in Android Studio to build APK/AAB
echo NOTE: iOS     - Open %BUILDS_DIR%\ios in Xcode to build IPA
echo.

pause
exit /b 0

:ensure_dir
if not exist "%~1" mkdir "%~1"
exit /b 0
