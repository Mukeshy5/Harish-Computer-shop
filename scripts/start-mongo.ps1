param([string]$MongoBinary = 'C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$databasePath = Join-Path $projectRoot '.runtime\mongo'
if (-not (Test-Path -LiteralPath $MongoBinary)) { throw 'Set -MongoBinary to the path of your installed mongod.exe, or start your MongoDB service.' }
if (Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue) { Write-Host 'A database is already listening on port 27017. Using your configured MONGODB_URI.'; exit 0 }
New-Item -ItemType Directory -Path $databasePath -Force | Out-Null
$process = Start-Process -FilePath $MongoBinary -ArgumentList @('--dbpath', ('"' + $databasePath + '"'), '--bind_ip', '127.0.0.1', '--port', '27017', '--logpath', ('"' + (Join-Path $projectRoot '.runtime\mongo.log') + '"')) -PassThru -WindowStyle Hidden
$process.Id | Set-Content -LiteralPath (Join-Path $projectRoot '.runtime\mongo.pid')
Write-Host "Local MongoDB started with PID $($process.Id). Data is stored in .runtime\mongo."
