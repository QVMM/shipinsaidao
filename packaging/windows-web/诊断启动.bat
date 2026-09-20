@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo 替抗蓟化 Windows 本地 Web 版诊断启动
echo 请保持本窗口打开；按 Ctrl+C 可以停止服务。
echo.
"%~dp0runtime\node.exe" "%~dp0app\server\windows-web-start.mjs"
echo.
echo 服务已退出。最近日志位于 runtime\server.log
pause
