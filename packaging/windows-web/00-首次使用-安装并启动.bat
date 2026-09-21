@echo off
setlocal
cd /d "%~dp0"
title Tihua System - First Run

echo.
echo ========================================
echo   Tihua System - First Run
echo ========================================
echo.
echo [1/3] Checking system files...

if not exist "runtime\node.exe" goto :files_missing
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
  if not exist "runtime\node-arm64.exe" goto :files_missing
  if not exist "runtime\voice-arm64\sherpa-onnx-offline.exe" goto :files_missing
)
if not exist "app\server\windows-web-start.mjs" goto :files_missing
if not exist "start-local-service.ps1" goto :files_missing
if not exist "models\offline\sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17\model.int8.onnx" goto :files_missing
echo [2/3] Creating desktop shortcuts...
set "SHORTCUT_READY=1"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0create-shortcuts.ps1"
if errorlevel 1 set "SHORTCUT_READY=0"

echo [3/3] Starting system...
call "%~dp0start-system.bat"
if errorlevel 1 exit /b 1

echo.
echo First-run setup completed.
if "%SHORTCUT_READY%"=="0" (
  echo Desktop shortcuts could not be created. Run start-system.bat from this folder.
) else (
  echo Use the Tihua desktop shortcut next time.
)
powershell.exe -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 4" >nul 2>nul
exit /b 0

:files_missing
echo.
echo [ERROR] The package is incomplete.
echo Right-click the ZIP file, choose Extract All, then run this file from the extracted folder.
pause
exit /b 1
