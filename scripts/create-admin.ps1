$ErrorActionPreference = 'Stop'
$backendPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'Harish computer backend'
$adminSecret = Read-Host 'Choose admin password (12+ characters, uppercase, lowercase, number; at most 72 UTF-8 bytes)' -AsSecureString
$secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecret)
Push-Location $backendPath
try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr)
    node scripts/create-admin.js
    if ($LASTEXITCODE -ne 0) { throw 'Admin account creation failed. Check MongoDB and the details entered.' }
} finally {
    Remove-Item Env:\ADMIN_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
    Pop-Location
}
