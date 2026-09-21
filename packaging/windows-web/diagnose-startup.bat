@echo off
setlocal
cd /d "%~dp0"

echo Tihua Windows local web diagnostic startup
echo Keep this window open. Press Ctrl+C to stop the service.
echo.
set "NODE_EXE=runtime\node.exe"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
  set "NODE_EXE=runtime\node-arm64.exe"
  set "OFFLINE_VOICE_CLI_DIR=%~dp0runtime\voice-arm64"
)
"%~dp0%NODE_EXE%" "%~dp0app\server\windows-web-start.mjs"
echo.
echo The service exited. Recent logs: runtime\server.log
pause
