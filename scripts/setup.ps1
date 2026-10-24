$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $projectRoot 'Harish computer backend'
$frontendPath = Join-Path $projectRoot 'Harish computer frontend'
Push-Location $backendPath
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
    if (-not (Test-Path -LiteralPath '.env')) {
        $secret = node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"
        $envContent = (Get-Content -LiteralPath '.env.example' -Raw).Replace('JWT_SECRET=', "JWT_SECRET=$secret")
        Set-Content -LiteralPath '.env' -Value $envContent -Encoding utf8
        Write-Host 'Created backend .env with a random session secret. Configure MONGODB_URI if needed.'
    }
} finally { Pop-Location }
Push-Location $frontendPath
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
} finally { Pop-Location }
Write-Host 'Setup complete. Start MongoDB, then run .\scripts\create-admin.ps1.'
