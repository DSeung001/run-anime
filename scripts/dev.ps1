# Build frontend and run the app (server + overlay). Run from project root or anywhere.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location (Join-Path $Root "frontend")
Write-Host "==> Installing frontend dependencies..."
npm install
Write-Host "==> Building frontend..."
npm run build
Set-Location $Root
Write-Host "==> Starting run-anime..."
go run ./cmd/runanime
