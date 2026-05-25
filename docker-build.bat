@echo off
setlocal enabledelayedexpansion
title DietLedger Docker Build

set "BASE_DIR=%~dp0"
set "OUTPUT=%BASE_DIR%docker-build"

echo ========================================
echo  DietLedger - Docker Build
echo ========================================
echo.

echo [1/4] Bumping version and syncing...
call node "%BASE_DIR%scripts\version-sync.js" bump
if %errorlevel% neq 0 (
    echo ERROR: Version bump failed
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -e "console.log(require('./package.json').version)"') do set "VERSION=%%v"
echo      Version: %VERSION%
echo.

echo [2/4] Building Docker images...
set "APP_VERSION=%VERSION%"
call docker compose -f "%BASE_DIR%docker-compose.build.yml" build %*
if %errorlevel% neq 0 (
    echo ERROR: Docker build failed
    pause
    exit /b 1
)
echo      Images built successfully.
echo.

if not exist "%OUTPUT%" mkdir "%OUTPUT%"

echo [3/4] Saving images to tar...
set "TAR_FILE=%OUTPUT%\dietledger-%VERSION%.tar"
call docker save -o "%TAR_FILE%" recipetool-dietledger recipetool-sync-server
if %errorlevel% neq 0 (
    echo ERROR: Docker save failed
    pause
    exit /b 1
)
echo      Saved to: %TAR_FILE%
echo.

echo [4/4] Generating load script...
(
echo @echo off
echo setlocal
echo echo Loading DietLedger %VERSION%...
echo docker load -i dietledger-%VERSION%.tar
echo if %%errorlevel%% neq 0 ^(
echo     echo ERROR: Failed to load images
echo     pause
echo     exit /b 1
echo ^)
echo echo.
echo echo Images loaded. Run with: docker compose -f docker-compose.yml up -d
echo pause
) > "%OUTPUT%\load-%VERSION%.bat"

echo ========================================
echo  Build Complete!
echo ========================================
echo.
echo  Version:  %VERSION%
echo  Output:   %OUTPUT%\
echo    Images: dietledger-%VERSION%.tar
echo    Load:   load-%VERSION%.bat
echo.
echo  Deploy:
echo    1. Copy docker-build\ to target host
echo    2. Run load-%VERSION%.bat
echo    3. Run: docker compose -f docker-compose.yml up -d
echo.

pause
exit /b 0
