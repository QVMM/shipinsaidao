@echo off
setlocal
cd /d "%~dp0\.."

if not exist node_modules (
  echo Missing local runtime dependencies. Please follow docs\DEPLOYMENT_OFFLINE.md first.
  pause
  exit /b 1
)

call npm run offline:check
if errorlevel 1 (
  pause
  exit /b 1
)

call npm run desktop
if errorlevel 1 pause
