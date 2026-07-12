@echo off
setlocal
cd /d "%~dp0"

if not defined PORTAL_BASE_URL set PORTAL_BASE_URL=http://127.0.0.1:8000
if not defined PORTAL_USERNAME set PORTAL_USERNAME=security_loni_1
if not defined PORTAL_PASSWORD set PORTAL_PASSWORD=Indane@12345
if not defined SCAN_FOLDER set SCAN_FOLDER=%USERPROFILE%\Documents\Indane-Scanner-Inbox
if not defined SCAN_OUTPUT_FOLDER set SCAN_OUTPUT_FOLDER=%USERPROFILE%\Documents\Indane-Scanner-Output

echo INDANE HP ScanJet Agent
echo Portal: %PORTAL_BASE_URL%
echo User:   %PORTAL_USERNAME%
echo Inbox:  %SCAN_FOLDER%
echo Output: %SCAN_OUTPUT_FOLDER%
echo.
echo Configure HP Scan to save PDF/JPG files into the Inbox folder above.
echo Keep this window open at Gate-2 scanner PC.
echo.

python tools\hp_scanjet_agent.py --portal "%PORTAL_BASE_URL%" --username "%PORTAL_USERNAME%" --password "%PORTAL_PASSWORD%" --scan-folder "%SCAN_FOLDER%" --output-folder "%SCAN_OUTPUT_FOLDER%"

pause
