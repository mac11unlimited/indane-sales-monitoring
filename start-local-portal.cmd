@echo off
setlocal
cd /d "%~dp0"
title INDANE SALES MONITORING - LOCAL PORTAL
echo.
echo ============================================================
echo   INDANE SALES MONITORING - LOCAL PORTAL
echo ============================================================
echo.
echo Starting server on this computer and local Wi-Fi network...
echo.
echo PC link:
echo   http://127.0.0.1:8095
echo.
echo Android phone on same Wi-Fi:
echo   http://192.168.31.30:8095
echo.
echo Keep this black window OPEN while using the portal.
echo To stop the portal, close this window.
echo.
echo ============================================================
echo.
set "NODE_EXE=C:\Users\MUKESH KUMAR\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" (
  echo Node runtime not found:
  echo %NODE_EXE%
  echo.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8095"
"%NODE_EXE%" "%~dp0local_server.mjs" 8095 0.0.0.0
echo.
echo Portal stopped. Press any key to close.
pause >nul
