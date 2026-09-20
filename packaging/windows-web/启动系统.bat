@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "runtime\node.exe" (
  echo [错误] 运行环境不完整，请重新解压完整交付包。
  pause
  exit /b 1
)

if not exist "app\server\windows-web-start.mjs" (
  echo [错误] 系统文件不完整，请重新解压完整交付包。
  pause
  exit /b 1
)

start "替抗蓟化本地服务" /min "%~dp0runtime\node.exe" "%~dp0app\server\windows-web-start.mjs"
echo 正在启动替抗蓟化本地 Web 系统，请稍候……
echo 页面将自动使用 Edge 或 Chrome 打开。
timeout /t 4 /nobreak >nul

if exist "runtime\startup-error.txt" (
  echo.
  echo [启动失败] 请双击“诊断启动.bat”查看原因。
  pause
  exit /b 1
)

exit /b 0
