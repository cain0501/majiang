@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mahjong Signup - Local Server

echo.
echo   Starting local server...
echo   Keep this window open while you use the app.
echo   Open:  http://127.0.0.1:8788
echo.

node _devserver.mjs

echo.
echo   Server stopped. Press any key to close.
pause >nul
