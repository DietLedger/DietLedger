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

echo [1/5] Running tests...
echo       Frontend...
call npm run test
if %errorlevel% neq 0 (
    echo ERROR: Frontend tests failed
    pause
    exit /b 1
)
echo       Backend...
pushd "%BASE_DIR%sync-server"
go test ./...
if %errorlevel% neq 0 (
    echo ERROR: Backend tests failed
    popd
    pause
    exit /b 1
)
popd
echo      All tests passed
echo.

echo [2/5] Syncing version...
call node "%BASE_DIR%scripts\version-sync.js" bump
if %errorlevel% neq 0 (
    echo ERROR: version sync failed
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -e "console.log(require('./package.json').version)"') do set "VERSION=%%v"
echo      Version: %VERSION%
echo.

echo [3/5] Building images (parallel via buildx bake)...
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

echo [4/5] Saving images to tar...
set "TAR_FILE=%OUTPUT%\dietledger-%VERSION%.tar"
docker save -o "%TAR_FILE%" recipetool-dietledger recipetool-api
if %errorlevel% neq 0 (
    echo ERROR: docker save failed
    pause
    exit /b 1
)
for %%f in ("%TAR_FILE%") do echo      Saved: %%~nxf (%%~zf bytes)
echo.

echo [5/5] Copying deployment files...
copy /Y "%BASE_DIR%docker-compose.yml" "%OUTPUT%\docker-compose.yml" >nul

(
echo # DietLedger %VERSION% - Deployment Configuration
echo # Copy this to .env and fill in values for your host
echo.
echo # ── PostgreSQL ───────────────────────────────────────────────────
echo POSTGRES_DB=dietledger
echo POSTGRES_USER=dietledger
echo POSTGRES_PASSWORD=CHANGE_ME_TO_A_STRONG_PASSWORD
echo.
echo # ── Ports ────────────────────────────────────────────────────────
echo PORT=3000
echo API_PORT=8080
echo.
echo # ── Go API Server ────────────────────────────────────────────────
echo # JWT signing secret — set to a long random string in production
echo # If unset, a random secret is generated each restart ^(tokens won't survive^)
echo HMAC_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_STRING
echo.
echo # CORS allowed origins ^(comma-separated^)
echo CORS_ORIGIN=http://localhost:3000
echo.
echo # Max request body size in MB ^(default: 10^)
echo # MAX_BODY_MB=10
echo.
echo # RSA private key PEM file path for JWT signing ^(optional, HMAC used if unset^)
echo # JWT_SIGNING_KEY_PATH=/path/to/private.pem
echo.
echo # Public API URL for browser ^(optional — frontend proxies /api/* by default^)
echo # NEXT_PUBLIC_API_URL=http://your-host:8080
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
