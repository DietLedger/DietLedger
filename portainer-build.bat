@echo off
setlocal
cd /d "%~dp0"

rem Build/load DietLedger images into the local Docker daemon for Portainer.
rem This is local-only and does not SSH, SCP, or run deploy/deploy.sh.
call npm run portainer -- %*
exit /b %errorlevel%
