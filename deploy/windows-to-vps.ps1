<#
.SYNOPSIS
  Deploy Nexlify from Windows to VPS (nexlify.live)
.USAGE
  npm run deploy
  npm run deploy -- -VpsHost 85.17.162.54 -User root
  npm run deploy -- -ArchiveOnly
#>
param(
  [string]$VpsHost = "85.17.162.54",
  [string]$User = "root",
  [string]$RemotePath = "/var/www/nexlify",
  [string]$Domain = "nexlify.live",
  [switch]$ArchiveOnly,
  [switch]$UpdateOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Archive = Join-Path $env:TEMP "nexlify-deploy.tar.gz"
$ArchiveCopy = Join-Path $ProjectRoot "nexlify-deploy.tar.gz"

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host ("==> " + $msg) -ForegroundColor Cyan
}

Write-Step ("Packaging " + $ProjectRoot)
Push-Location $ProjectRoot
if (Test-Path $Archive) { Remove-Item $Archive -Force }
tar -czf $Archive `
  --exclude=node_modules `
  --exclude=.next `
  --exclude=.git `
  --exclude=dev.db `
  --exclude=data `
  --exclude=.env `
  --exclude=nexlify-deploy.tar.gz `
  --exclude=nexlify-panel `
  --exclude=whmcs `
  .
Copy-Item $Archive $ArchiveCopy -Force
Pop-Location

$sizeMb = [math]::Round((Get-Item $Archive).Length / 1MB, 1)
Write-Host ("Archive: " + $Archive + " (" + $sizeMb + " MB)")
Write-Host ("Copy:    " + $ArchiveCopy)

if ($ArchiveOnly) {
  Write-Host ""
  Write-Host "ArchiveOnly - upload manually:" -ForegroundColor Yellow
  Write-Host ("  1. Upload " + $Archive + " to VPS: /tmp/nexlify-deploy.tar.gz")
  Write-Host "  2. Web console:"
  Write-Host ("     mkdir -p " + $RemotePath)
  Write-Host ("     tar -xzf /tmp/nexlify-deploy.tar.gz -C " + $RemotePath)
  Write-Host ("     bash " + $RemotePath + "/deploy/remote-install.sh")
  exit 0
}

Write-Step ("Testing SSH " + $User + "@" + $VpsHost)
ssh -o BatchMode=yes -o ConnectTimeout=15 ($User + "@" + $VpsHost) "echo ok"
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "SSH failed. Try:" -ForegroundColor Yellow
  Write-Host "  npm run setup:ssh"
  Write-Host "  npm run deploy:pack   (manual upload)"
  exit 1
}
Write-Host "SSH OK"

Write-Step "Uploading archive"
ssh -o BatchMode=yes ($User + "@" + $VpsHost) ("mkdir -p " + $RemotePath)
scp -o BatchMode=yes $Archive ($User + "@" + $VpsHost + ":/tmp/nexlify-deploy.tar.gz")

if ($UpdateOnly) {
  $remoteScript = "deploy/remote-update.sh"
} else {
  $remoteScript = "deploy/remote-install.sh"
}

Write-Step ("Running " + $remoteScript + " on VPS")
$remoteCmd = "set -e; mkdir -p " + $RemotePath + "; tar -xzf /tmp/nexlify-deploy.tar.gz -C " + $RemotePath + "; chmod +x " + $RemotePath + "/deploy/*.sh; cd " + $RemotePath + "; bash " + $remoteScript
ssh ($User + "@" + $VpsHost) $remoteCmd

Write-Step "Health check"
$healthCmd = @"
set -e
curl -sfI http://127.0.0.1:3001 | head -1
curl -sf http://127.0.0.1:3000/api/health
bash $RemotePath/deploy/install-panel-watchdog.sh 2>/dev/null || true
pm2 status
"@
ssh ($User + "@" + $VpsHost) $healthCmd

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Deploy complete"
Write-Host (" Website:  https://" + $Domain + "/     (port 3001)")
Write-Host (" Staging:  https://panel.nexlify.live/login  (owner panel - npm run panel:staging)")
Write-Host (" Demo:     https://panel.demo.nexlify.live/   (public sandbox)")
Write-Host (" IP test:  http://" + $VpsHost)
Write-Host ""
Write-Host (" Site repair: ssh " + $User + "@" + $VpsHost + " bash " + $RemotePath + "/deploy/ensure-site.sh")
Write-Host (" Admin: ssh " + $User + "@" + $VpsHost + " grep ADMIN " + $RemotePath + "/.env")
Write-Host "============================================" -ForegroundColor Green
