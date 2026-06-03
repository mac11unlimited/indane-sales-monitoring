@echo off
setlocal
cd /d "%~dp0"
title INDANE SALES MONITORING - HTTP PORTAL
echo.
echo ============================================================
echo   INDANE SALES MONITORING - HTTP PORTAL
echo ============================================================
echo.
echo Opening local portal on:
echo   http://127.0.0.1:8095
echo.
echo For phone on same Wi-Fi after firewall permission:
echo   http://192.168.31.30:8095
echo.
echo Keep this window OPEN while using the portal.
echo.
echo ============================================================
echo.
start "" "http://127.0.0.1:8095"
"C:\Users\MUKESH KUMAR\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" "%~dp0local_http_portal.py"
echo.
echo Portal stopped. Press any key to close.
pause >nul
