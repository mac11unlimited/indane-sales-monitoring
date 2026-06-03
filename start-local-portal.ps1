$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = "C:\Users\MUKESH KUMAR\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$Port = 8095
$HostName = "0.0.0.0"

Set-Location $ProjectRoot
Write-Host "Starting INDANE SALES MONITORING local portal..." -ForegroundColor Cyan
Write-Host "Open: http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host "For Android on same Wi-Fi, open: http://<this-PC-IP>:$Port" -ForegroundColor Green
Write-Host "Keep this window open while using the portal." -ForegroundColor Yellow
& $Node "$ProjectRoot\local_server.mjs" $Port $HostName
