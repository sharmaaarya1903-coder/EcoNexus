@echo off
cd /d "%~dp0"
echo ==========================================
echo        EcoNexus Server Starting...
echo ==========================================
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js was not found.
  echo Install Node.js LTS, then run this file again.
  echo.
  pause
  exit /b 1
)
node server.js
pause
