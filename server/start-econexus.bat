@echo off
setlocal

title EcoNexus Server

echo ==========================================
echo        EcoNexus Server Starting...
echo ==========================================
echo.

cd /d "%~dp0"

echo Current server directory:
cd
echo.

echo Checking Node.js...
where node
if errorlevel 1 (
    echo.
    echo ERROR: Node.js was not found.
    echo Install Node.js LTS and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo Node.js version:
node --version

echo.
echo Checking server.js...
if not exist "%~dp0server.js" (
    echo ERROR: server.js was NOT found here:
    echo %~dp0server.js
    echo.
    pause
    exit /b 1
)

echo server.js found.
echo.

echo Starting THIS exact file:
echo %~dp0server.js
echo.

node "%~dp0server.js"

echo.
echo ==========================================
echo        SERVER PROCESS ENDED
echo ==========================================
echo.
echo If there was an error above, read it carefully.
echo.
pause