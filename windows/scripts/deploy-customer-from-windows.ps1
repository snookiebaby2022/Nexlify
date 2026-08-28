# Sync local panel source to customer VPS and rebuild (same as vendor deploy, not nexlify.live tarball).
param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$CustomerPath = "/opt/nexlify-panel",
  [switch]$SyncOnly,
  [switch]$Full,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

Sync-NexlifyPanelToRemote `
  -HostName $CustomerHost `
  -RemotePath $CustomerPath `
  -ProjectRoot $cfg.ProjectRoot `
  -Password $CustomerPassword `
  -PrivateKey $cfg.PrivateKey `
  -WinScp $cfg.WinScp `
  -Port 22 `
  -Username root `
  -AcceptHostKey:$cfg.AcceptHostKey

if ($SyncOnly) {
  Write-Host "Customer sync complete (files only)." -ForegroundColor Green
  exit 0
}

$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword)
if ($Full) {
  $remoteCmd = "cd $CustomerPath && rm -f .update-progress.json .update-progress.pid && sed -i 's/\r$//' scripts/*.sh ecosystem.config.cjs 2>/dev/null && chmod +x scripts/*.sh && ./scripts/deploy-vps.sh"
  Write-Host "Full rebuild on customer (git pull + npm install) ..."
} else {
  $forceFlag = if ($Force) { "1" } else { "0" }
  $remoteCmd = "cd $CustomerPath && export NEXLIFY_FORCE_BUILD=$forceFlag && bash scripts/deploy-customer-remote.sh"
  if ($Force) {
    Write-Host "Fast rebuild on customer (Force: bypass streaming guard) ..." -ForegroundColor Yellow
  } else {
    Write-Host "Fast rebuild on customer (synced files only, no npm install) ..."
  }
}
$plinkArgs += $remoteCmd
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Deploy failed on the SERVER (not a PowerShell bug)." -ForegroundColor Red
  Write-Host "Common fixes:" -ForegroundColor Yellow
  Write-Host "  - Add -Force if build was blocked by streaming guard (active viewers)" -ForegroundColor Yellow
  Write-Host "  - Stop load test first if postgres says 'connection slots' exhausted" -ForegroundColor Yellow
  Write-Host "  - Or sync only:  ... -SyncOnly" -ForegroundColor Yellow
  throw "Customer rebuild failed ($LASTEXITCODE)"
}

Write-Host ""
Write-Host "Customer panel updated at http://${CustomerHost}" -ForegroundColor Green
Write-Host "Tip: targeted hotfix -> deploy-customer-fast.ps1" -ForegroundColor DarkGray
