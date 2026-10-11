# XLCAB — relance de l'environnement de DÉMONSTRATION local.
# Usage (PowerShell, depuis C:\xlcab) :  .\demo\start-demo.ps1
# Démarre PostgreSQL et Garnet (compatible Redis) s'ils ne tournent pas,
# puis l'API et les deux portails web dans des fenêtres séparées.
# Comptes de démo : xlcab_backend\demo-accounts.local.txt
# (régénérer avec : cd xlcab_backend ; npx ts-node prisma/seed-demo.ts)

$ErrorActionPreference = 'Stop'
$dev = 'C:\Users\Admin\dev'
$root = Split-Path -Parent $PSScriptRoot

# ── PostgreSQL 16 (portable) ──────────────────────────────────────────
& "$dev\pgsql\bin\pg_isready.exe" -h localhost -p 5432 *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Démarrage de PostgreSQL…'
  Start-Process -FilePath "$dev\pgsql\bin\pg_ctl.exe" -WindowStyle Hidden `
    -ArgumentList "-D `"$dev\pgdata`" -l `"$dev\pgdata.log`" -o `"-p 5432 -c listen_addresses=localhost`" start"
  Start-Sleep -Seconds 4
}

# ── Garnet (Redis) ────────────────────────────────────────────────────
if (-not (Get-Process GarnetServer -ErrorAction SilentlyContinue)) {
  Write-Host 'Démarrage de Garnet (Redis)…'
  $env:DOTNET_ROOT = "$dev\dotnet"
  # Culture neutre : sinon les distances GEO sortent avec une virgule (0,57).
  $env:DOTNET_SYSTEM_GLOBALIZATION_INVARIANT = '1'
  Start-Process -FilePath "$dev\garnet\net8.0\GarnetServer.exe" -WindowStyle Hidden `
    -ArgumentList '--port 6379 --bind 127.0.0.1 --lua -m 256m' `
    -RedirectStandardOutput "$dev\garnet.log" -RedirectStandardError "$dev\garnet.err.log"
  Start-Sleep -Seconds 3
}

# ── API et portails ───────────────────────────────────────────────────
Start-Process powershell -ArgumentList "-NoExit -Command cd '$root\xlcab_backend'; npm run start:dev"
Start-Process powershell -ArgumentList "-NoExit -Command cd '$root\xlcab_corporate'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit -Command cd '$root\xlcab_admin'; npm run dev"

Write-Host ''
Write-Host 'API            : http://localhost:3000'
Write-Host 'Portail entreprise : http://localhost:5173'
Write-Host 'Dashboard admin    : http://localhost:5174'
Write-Host 'Comptes de démo    : xlcab_backend\demo-accounts.local.txt'
