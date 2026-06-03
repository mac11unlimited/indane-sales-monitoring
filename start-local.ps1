$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$node = "C:\Users\MUKESH KUMAR\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $node "$PSScriptRoot\local-server.mjs" 8095 127.0.0.1
