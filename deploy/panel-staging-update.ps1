<#
.SYNOPSIS
  Apply IPTV panel patches on VPS and verify at panel.nexlify.live/login (owner staging).
.USAGE
  npm run panel:staging
#>
param(
  [string]$VpsHost = "85.17.162.54",
  [string]$User = "root",
  [string]$RemotePath = "/var/www/nexlify",
  [string]$StagingUrl = "https://panel.nexlify.live/login"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==> Panel staging update" -ForegroundColor Cyan
Write-Host "    Verify at: $StagingUrl" -ForegroundColor Yellow
Write-Host ""

ssh -o BatchMode=yes -o ConnectTimeout=15 ($User + "@" + $VpsHost) "echo ok"
if ($LASTEXITCODE -ne 0) {
  Write-Host "SSH failed. Run: npm run setup:ssh" -ForegroundColor Red
  exit 1
}

$remoteCmd = @"
set -e
cd $RemotePath
chmod +x deploy/panel-staging-update.sh deploy/ensure-panel-staging-access.sh 2>/dev/null || true
bash deploy/panel-staging-update.sh
"@

ssh ($User + "@" + $VpsHost) $remoteCmd

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Staging panel updated"
Write-Host " Test: $StagingUrl"
Write-Host " Lock to your IP: set PANEL_OWNER_IPS in $RemotePath/.env"
Write-Host "   then: ssh $User@$VpsHost bash $RemotePath/deploy/ensure-panel-staging-access.sh"
Write-Host "============================================" -ForegroundColor Green
