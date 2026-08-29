# Deploy v2.0.53: vendor publish + panel 45 + post-deploy fixes
param(
  [string]$PanelHost = "45.88.138.18",
  [string]$PanelPassword = "sufc196528",
  [string]$PanelPath = "/opt/nexlify-panel",
  [switch]$SkipVendor,
  [switch]$Skip45,
  [switch]$SkipLoadTest
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$ver = (Get-Content (Join-Path $cfg.ProjectRoot "package.json") -Raw | ConvertFrom-Json).version

Write-Host "=== Nexlify v$ver deploy ===" -ForegroundColor Cyan

if (-not $SkipVendor) {
  Write-Host "[1] Vendor sync + build ..." -ForegroundColor Yellow
  & "$PSScriptRoot\deploy-from-windows.ps1"
  if ($LASTEXITCODE -ne 0) { throw "Vendor deploy failed" }
  Write-Host "[2] Publish tarball to nexlify.live ..." -ForegroundColor Yellow
  & "$PSScriptRoot\publish-panel-release-remote.ps1"
  if ($LASTEXITCODE -ne 0) { throw "Publish failed" }
} else {
  Write-Host "[skip] Vendor + tarball" -ForegroundColor DarkGray
}

if (-not $Skip45) {
  Write-Host "[3] Sync + rebuild panel on $PanelHost ..." -ForegroundColor Yellow
  & "$PSScriptRoot\deploy-customer-from-windows.ps1" -CustomerHost $PanelHost -CustomerPassword $PanelPassword -CustomerPath $PanelPath
  if ($LASTEXITCODE -ne 0) { throw "Panel 45 deploy failed" }

  $post = @"
cd $PanelPath && bash scripts/server-cleanup.sh && node scripts/repair-stream-source-urls.cjs && node scripts/fix-young-dracula-duplicate.cjs && echo POST_OK
"@
  if (-not $SkipLoadTest) {
    $post = @"
cd $PanelPath && bash scripts/server-cleanup.sh && node scripts/repair-stream-source-urls.cjs && node scripts/fix-young-dracula-duplicate.cjs && node scripts/load-test-setup.cjs --lines=5000 && echo POST_OK
"@
  }
  Write-Host "[4] Post-deploy cleanup + data fixes on $PanelHost ..." -ForegroundColor Yellow
  & $cfg.Plink -batch -ssh "root@$PanelHost" -pw $PanelPassword $post
  if ($LASTEXITCODE -ne 0) { throw "Post-deploy failed" }
}

Write-Host ""
Write-Host "v$ver deployed. Load test: node scripts/load-test-run.cjs --host=https://darkcdn.store --concurrency=500" -ForegroundColor Green
