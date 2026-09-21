@echo off
setlocal
cd /d "%~dp0"

if not exist "runtime\node.exe" (
  echo [ERROR] The embedded runtime is missing. Extract the complete ZIP package again.
  pause
  exit /b 1
)

if not exist "app\server\windows-web-start.mjs" (
  echo [ERROR] Application files are missing. Extract the complete ZIP package again.
  pause
  exit /b 1
)

if not exist "start-local-service.ps1" (
  echo [ERROR] The Windows service launcher is missing. Extract the complete ZIP package again.
  pause
  exit /b 1
)

del /q "runtime\launch-ready.url" 2>nul
del /q "runtime\startup-error.txt" 2>nul
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0start-local-service.ps1"
if errorlevel 1 goto :start_failed
echo Starting Tihua local web system. Please wait...
echo The browser will open as soon as the local web service is ready.

for /l %%I in (1,1,120) do (
  if exist "runtime\launch-ready.url" goto :ready
  if exist "runtime\startup-error.txt" goto :start_failed
  powershell.exe -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 1" >nul 2>nul
)

echo.
echo [START TIMEOUT] The local web system did not become ready in 120 seconds.
echo Run diagnose-startup.bat and send runtime\server.log to technical support.
pause
exit /b 1

:ready
set "SYSTEM_URL="
set /p SYSTEM_URL=<"runtime\launch-ready.url"
if not defined SYSTEM_URL goto :start_failed
echo System ready. Opening the web page in your browser...
start "" "%SYSTEM_URL%"
exit /b 0

:start_failed
echo.
echo [START FAILED]
if exist "runtime\startup-error.txt" type "runtime\startup-error.txt"
echo.
echo Run diagnose-startup.bat if more details are needed.
pause
exit /b 1
exit /b 0
