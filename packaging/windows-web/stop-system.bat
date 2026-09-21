@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=runtime\node.exe"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NODE_EXE=runtime\node-arm64.exe"

if not exist "%NODE_EXE%" (
  echo [ERROR] The embedded runtime is missing.
  pause
  exit /b 1
)

"%~dp0%NODE_EXE%" "%~dp0app\server\windows-web-stop.mjs"
if errorlevel 1 pause
powershell.exe -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 2" >nul 2>nul
exit /b 0
