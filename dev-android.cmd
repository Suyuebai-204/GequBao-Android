@echo off
REM 一键启动安卓真机 Live Reload 调试：自动配置 / 反向代理 / Vite / 安装并启动 debug 包
chcp 65001 >nul
cd /d "%~dp0"

node scripts\dev-android.mjs
if errorlevel 1 (
  echo.
  echo [dev:android] 调试启动失败，详见上方错误信息。
  exit /b 1
)
