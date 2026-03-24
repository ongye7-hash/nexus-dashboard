@echo off
chcp 65001 >nul
title Nexus Dashboard Server
cd /d "%~dp0"
echo.
echo  ========================================
echo    Nexus Dashboard - http://localhost:8507
echo  ========================================
echo.
echo  Starting server...
echo  Press Ctrl+C or close window to stop.
echo.
call npm run dev
if errorlevel 1 (
    echo.
    echo  [ERROR] Failed to start server.
    echo  Make sure npm is installed and run "npm install" first.
    echo.
    pause
)
