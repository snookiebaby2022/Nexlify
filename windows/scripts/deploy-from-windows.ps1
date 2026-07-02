# One-click: sync files (WinSCP) + build on VPS (plink / PuTTY)
param(
  [switch]$SyncOnly,
  [switch]$RemoteOnly,
  [switch]$Pm2Only
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"

Write-Host "=== Nexlify deploy from Windows ===" -ForegroundColor Cyan

if (-not $RemoteOnly) {
  & "$PSScriptRoot\sync-to-vps.ps1"
}

if ($SyncOnly) {
  Write-Host "Done (files synced only)." -ForegroundColor Green
  exit 0
}

if ($Pm2Only) {
  & "$PSScriptRoot\remote-deploy.ps1" -Pm2Only
} else {
  & "$PSScriptRoot\remote-deploy.ps1"
}

$cfg = Get-NexlifyDeployConfig
Write-Host ""
Write-Host "Panel updated. Open: http://$($cfg.Host):3000" -ForegroundColor Green
