@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "runtime\server.url" (
  echo 系统尚未启动，请先双击“启动系统.bat”。
  pause
  exit /b 1
)

set /p SYSTEM_URL=<"runtime\server.url"
start "" "%SYSTEM_URL%"
exit /b 0
