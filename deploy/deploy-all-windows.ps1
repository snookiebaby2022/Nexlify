# Deploy website + run full 502 fix on VPS (website + panel + demo)
# Usage: powershell -File deploy/deploy-all-windows.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host "=== Deploy stream-billing (website) ===" -ForegroundColor Cyan
& "$Root\deploy\windows-to-vps.ps1" -UpdateOnly

Write-Host "=== Fix website + panel + SSL on VPS ===" -ForegroundColor Cyan
ssh root@85.17.162.54 "cd /var/www/nexlify && npm run db:seed && bash deploy/ensure-site.sh"

Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "  https://nexlify.live/"
Write-Host "  https://nexlify.live/demo"
Write-Host "  https://nexlify.live/panel/"
Write-Host "Cloudflare: Full (strict) + Purge cache"
