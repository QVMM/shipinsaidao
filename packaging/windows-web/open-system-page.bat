@echo off
setlocal
cd /d "%~dp0"

if not exist "runtime\server.url" (
  echo The system is not running. Run start-system.bat first.
  pause
  exit /b 1
)

set /p SYSTEM_URL=<"runtime\server.url"
start "" "%SYSTEM_URL%"
exit /b 0
