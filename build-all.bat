@echo off
setlocal enabledelayedexpansion
title DietLedger Docker Build
set "BASE_DIR=%~dp0"
set "OUTPUT=%BASE_DIR%docker-build"

echo ========================================
echo  DietLedger - Docker Build
echo ========================================
echo.

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: docker is not in PATH
    pause
    exit /b 1
)

echo [1/4] Syncing version...
call node "%BASE_DIR%scripts\version-sync.js" bump
if %errorlevel% neq 0 (
    echo ERROR: version sync failed
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -e "console.log(require('./package.json').version)"') do set "VERSION=%%v"
echo      Version: %VERSION%
echo.

echo [2/4] Building images (parallel via buildx bake)...
set DOCKER_BUILDKIT=1
set "APP_VERSION=%VERSION%"

docker buildx bake --load --set api.args.BUILD_VERSION=%VERSION% -f "%BASE_DIR%docker-compose.build.yml"
if %errorlevel% neq 0 (
    echo ERROR: Docker build failed
    pause
    exit /b 1
)
echo      Both images built OK
echo.

if not exist "%OUTPUT%" mkdir "%OUTPUT%"

echo [3/4] Saving images to tar...
set "TAR_FILE=%OUTPUT%\dietledger-%VERSION%.tar"
docker save -o "%TAR_FILE%" recipetool-dietledger recipetool-api
if %errorlevel% neq 0 (
    echo ERROR: docker save failed
    pause
    exit /b 1
)
for %%f in ("%TAR_FILE%") do echo      Saved: %%~nxf (%%~zf bytes)
echo.

echo [4/4] Copying deployment files...
copy /Y "%BASE_DIR%docker-compose.yml" "%OUTPUT%\docker-compose.yml" >nul

(
echo # DietLedger %VERSION% - Deployment Configuration
echo # Copy this to .env and fill in values for your host
echo.
echo # PostgreSQL
echo POSTGRES_DB=dietledger
echo POSTGRES_USER=dietledger
echo POSTGRES_PASSWORD=CHANGE_ME
echo.
echo # Ports
echo PORT=3000
echo API_PORT=8080
echo.
echo # API server
echo CORS_ORIGIN=http://localhost:3000
echo FDA_API_KEY=DEMO_KEY
echo.
echo # Mode: leave commented for server mode, or set true for local-only
echo # NEXT_PUBLIC_DIETLEDGER_LOCAL_ONLY=false
echo.
echo # JWT signing secret
echo # HMAC_SECRET=change-me-to-a-long-random-string
) > "%OUTPUT%\.env.example"

if not exist "%OUTPUT%\.env" (
    copy /Y "%OUTPUT%\.env.example" "%OUTPUT%\.env" >nul
    echo      Created .env from template
) else (
    echo      Existing .env preserved
)

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
echo echo Images loaded. Next steps:
echo echo   1. Edit .env with your settings
echo echo   2. Run: docker compose up -d
echo echo.
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
echo    Deploy: docker-compose.yml + .env
echo.
echo  Deploy to target host:
echo    1. Copy docker-build\ to target
echo    2. Run load-%VERSION%.bat
echo    3. Edit .env
echo    4. Run: docker compose up -d
echo.

pause
exit /b 0
