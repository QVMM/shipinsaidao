@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "runtime\node.exe" (
  echo [错误] 运行环境不完整。
  pause
  exit /b 1
)

"%~dp0runtime\node.exe" "%~dp0app\server\windows-web-stop.mjs"
if errorlevel 1 pause
timeout /t 2 /nobreak >nul
exit /b 0
