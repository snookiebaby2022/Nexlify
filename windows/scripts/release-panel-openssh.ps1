# Vendor + customer release using native OpenSSH (supports OpenSSH private keys).
param(
  [switch]$SkipVendor,
  [switch]$SkipTarball,
  [switch]$SkipBroadcast,
  [switch]$DirectCustomer,
  [switch]$CustomerOnly,
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$CustomerPath = "/opt/nexlify-panel"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

if ($CustomerOnly) {
  $SkipVendor = $true
  $SkipTarball = $true
  $SkipBroadcast = $true
  $DirectCustomer = $true
}

$localVer = (Get-Content (Join-Path $cfg.ProjectRoot "package.json") -Raw | ConvertFrom-Json).version
$sshKey = [string]$cfg.PrivateKey
if (-not $sshKey -or -not (Test-Path -LiteralPath $sshKey)) {
  throw "OpenSSH private key not found. Set privateKey in windows/deploy.config.json"
}
if ($sshKey -like "*.ppk") {
  $twin = $sshKey -replace '\.ppk$', ""
  if (Test-Path -LiteralPath $twin) { $sshKey = $twin }
}

$vendorTarget = "$($cfg.Username)@$($cfg.Host)"
$remotePath = [string]$cfg.RemotePath
if (-not $remotePath) { throw "remotePath missing from deploy.config.json" }

function Invoke-VendorSsh {
  param([Parameter(Mandatory = $true)][string]$RemoteCmd)
  # Pass remote command as a single argv; avoid ConvertTo-Json / nested bash -lc quoting.
  & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $sshKey -p "$($cfg.Port)" $vendorTarget $RemoteCmd
  if ($LASTEXITCODE -ne 0) { throw "Vendor SSH failed (exit $LASTEXITCODE)" }
}

function Sync-Vendor {
  Write-Host "Syncing project to vendor via tar|ssh ..." -ForegroundColor Cyan
  $tarExe = Join-Path $env:SystemRoot "System32\tar.exe"
  if (-not (Test-Path -LiteralPath $tarExe)) {
    throw "Windows tar.exe not found at $tarExe"
  }

  $tgz = Join-Path $env:TEMP "nexlify-panel-sync.tar.gz"
  Remove-Item -LiteralPath $tgz -Force -ErrorAction SilentlyContinue

  $excludes = @(
    "--exclude=node_modules"
    "--exclude=.next"
    "--exclude=.git"
    "--exclude=.env"
    "--exclude=windows"
    "--exclude=.license-keys"
    "--exclude=marketing-drop-in"
    "--exclude=promo-for-nexlify-web"
    "--exclude=dist"
    "--exclude=.next.zip"
    "--exclude=deploy-all.log"
  )

  Push-Location $cfg.ProjectRoot
  try {
    & $tarExe -czf $tgz @excludes .
    if ($LASTEXITCODE -ne 0) { throw "Local tar failed ($LASTEXITCODE)" }
  } finally {
    Pop-Location
  }

  & scp.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $sshKey -P "$($cfg.Port)" $tgz "${vendorTarget}:/tmp/nexlify-panel-sync.tgz"
  if ($LASTEXITCODE -ne 0) { throw "scp upload failed ($LASTEXITCODE)" }

  # Single-line only — Windows here-strings embed CR and break remote bash.
  Invoke-VendorSsh "mkdir -p $remotePath && tar -xzf /tmp/nexlify-panel-sync.tgz -C $remotePath && rm -f /tmp/nexlify-panel-sync.tgz && cd $remotePath && rm -f src/instrumentation.ts src/lib/cron-scheduler.ts && sed -i 's/\r`$//' scripts/*.sh && chmod +x scripts/*.sh"
  Remove-Item -LiteralPath $tgz -Force -ErrorAction SilentlyContinue
  Write-Host "Sync complete." -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Nexlify OpenSSH release  v$localVer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $SkipVendor) {
  Write-Host "[1/5] Deploy vendor ($($cfg.Host)) ..." -ForegroundColor Cyan
  Sync-Vendor
  & scp.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $sshKey -P "$($cfg.Port)" `
    (Join-Path $cfg.ProjectRoot "scripts\deploy-vps.sh") `
    "${vendorTarget}:${remotePath}/scripts/deploy-vps.sh"
  if ($LASTEXITCODE -ne 0) { throw "scp deploy-vps.sh failed ($LASTEXITCODE)" }

  # Single-line remote cmds only — PowerShell here-strings inject CR and break bash `cd`.
  Invoke-VendorSsh "cd $remotePath && sed -i 's/\r`$//' scripts/*.sh && chmod +x scripts/*.sh && bash scripts/deploy-vps.sh"
  Invoke-VendorSsh "cd $remotePath && if [ -f scripts/verify-panel-release.sh ]; then sed -i 's/\r`$//' scripts/verify-panel-release.sh && chmod +x scripts/verify-panel-release.sh && bash scripts/verify-panel-release.sh; else curl -fsS http://127.0.0.1:13000/api/health || curl -fsS http://127.0.0.1:3000/api/health; fi"
  Write-Host "  vendor OK" -ForegroundColor Green
} else {
  Write-Host "[1/5] Skip vendor" -ForegroundColor DarkGray
}

if (-not $SkipTarball) {
  Write-Host "[2/5] Publish tarball ..." -ForegroundColor Cyan
  Invoke-VendorSsh "cd $remotePath && bash scripts/publish-panel-release.sh"
  Invoke-VendorSsh "curl -fsSL https://nexlify.live/downloads/nexlify-panel.tar.gz -o /tmp/nexlify-tar-check.tar.gz && (tar -xOf /tmp/nexlify-tar-check.tar.gz ./package.json || tar -xOf /tmp/nexlify-tar-check.tar.gz package.json) | grep -F '$localVer' && rm -f /tmp/nexlify-tar-check.tar.gz && echo tarball_ok"
  Write-Host "  tarball OK" -ForegroundColor Green
} else {
  Write-Host "[2/5] Skip tarball" -ForegroundColor DarkGray
}

if (-not $SkipBroadcast) {
  Write-Host "[3/5] Broadcast to registered panels ..." -ForegroundColor Cyan
  Invoke-VendorSsh "sed -i 's/\r`$//' /home/nexlify-panel/scripts/run-broadcast-panel-update.sh; chmod +x /home/nexlify-panel/scripts/run-broadcast-panel-update.sh; bash /home/nexlify-panel/scripts/run-broadcast-panel-update.sh"
  Write-Host "  broadcast OK" -ForegroundColor Green
} else {
  Write-Host "[3/5] Skip broadcast" -ForegroundColor DarkGray
}

if ($DirectCustomer) {
  Write-Host "[4/5] Direct customer deploy ($CustomerHost) ..." -ForegroundColor Cyan
  & "$PSScriptRoot\deploy-customer-from-windows.ps1" -CustomerHost $CustomerHost -CustomerPassword $CustomerPassword -CustomerPath $CustomerPath
  if ($LASTEXITCODE -ne 0) { throw "Customer deploy failed" }
  Write-Host "  customer OK" -ForegroundColor Green
} else {
  Write-Host "[4/5] Skip direct customer" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "[5/5] Release complete v$localVer" -ForegroundColor Green
if (-not $SkipVendor) { Write-Host "  Vendor: http://$($cfg.Host):3000" }
if ($DirectCustomer) { Write-Host "  Customer: http://$CustomerHost" }
Write-Host ""
