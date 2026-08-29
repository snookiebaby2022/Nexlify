# Safe panel release for ALL customers:
#   vendor deploy -> verify -> publish tarball -> broadcast to every registered panel
#
# Usage:
#   .\windows\scripts\release-panel-safe.ps1
#   .\windows\scripts\release-panel-safe.ps1 -SkipBroadcast
#   .\windows\scripts\release-panel-safe.ps1 -DirectCustomer

param(
  [switch]$SkipVendor,
  [switch]$SkipTarball,
  [switch]$SkipBroadcast,
  [switch]$DirectCustomer,
  [switch]$SkipVerify,
  [switch]$VendorOnly,
  [switch]$CustomerOnly,
  [switch]$TarballOnly,
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = $env:NEXLIFY_CUSTOMER_SSH_PASSWORD,
  [string]$CustomerPath = "/opt/nexlify-panel"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

if ($VendorOnly) {
  $DirectCustomer = $false
  $SkipBroadcast = $true
}
if ($CustomerOnly) {
  $SkipVendor = $true
  $SkipTarball = $true
  $SkipBroadcast = $true
  $DirectCustomer = $true
}
if ($TarballOnly) {
  $SkipVendor = $true
  $DirectCustomer = $false
  $SkipBroadcast = $true
  $SkipVerify = $true
}

$localVer = (Get-Content (Join-Path $cfg.ProjectRoot "package.json") -Raw | ConvertFrom-Json).version
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Nexlify safe release  v$localVer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Invoke-VendorPlink {
  param([string]$Command)
  $args = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
  if ($cfg.PrivateKey) { $args += "-i", $cfg.PrivateKey } else { $args += "-pw", $cfg.Password }
  $args += $Command
  & $cfg.Plink @args
  if ($LASTEXITCODE -ne 0) { throw "Vendor remote failed (exit $LASTEXITCODE)" }
}

function Invoke-CustomerPlink {
  param([string]$Command)
  $sshKey = Get-NexlifyOpenSshKey -Preferred $cfg.PrivateKey
  if ($sshKey -and -not $CustomerPassword) {
    & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $sshKey "root@$CustomerHost" $Command
  } elseif ($CustomerPassword) {
    $args = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $Command)
    & $cfg.Plink @args
  } else {
    throw "No SSH key or NEXLIFY_CUSTOMER_SSH_PASSWORD is available"
  }
  if ($LASTEXITCODE -ne 0) { throw "Customer remote failed (exit $LASTEXITCODE)" }
}

function Test-PanelRelease {
  param(
    [string]$Label,
    [scriptblock]$Remote
  )
  if ($SkipVerify) {
    Write-Host "  [skip verify] $Label" -ForegroundColor DarkGray
    return
  }
  Write-Host "  Verifying $Label ..." -ForegroundColor Yellow
  & $Remote
  Write-Host "  $Label verify OK" -ForegroundColor Green
}

function Test-TarballOnNexlifyLive {
  if ($SkipTarball -or $SkipVerify) { return }
  Write-Host "  Checking nexlify.live tarball ..." -ForegroundColor Yellow
  $cmd = "curl -fsSL https://nexlify.live/downloads/nexlify-panel.tar.gz -o /tmp/nexlify-tar-check.tar.gz && (tar -xOf /tmp/nexlify-tar-check.tar.gz ./package.json || tar -xOf /tmp/nexlify-tar-check.tar.gz package.json) | grep -F '$localVer' && tar -tf /tmp/nexlify-tar-check.tar.gz | grep -F scripts/fix-panel-repair.sh >/dev/null && rm -f /tmp/nexlify-tar-check.tar.gz && echo tarball_ok"
  Invoke-VendorPlink $cmd
  Write-Host "  Tarball on nexlify.live matches v$localVer" -ForegroundColor Green
}

# --- 1 Vendor ---
if (-not $SkipVendor) {
  Write-Host "[1/5] Deploy vendor ($($cfg.Host)) ..." -ForegroundColor Cyan
  & "$PSScriptRoot\deploy-from-windows.ps1"
  if ($LASTEXITCODE -ne 0) { throw "Vendor deploy failed" }
  Test-PanelRelease "vendor" {
    Invoke-VendorPlink "cd $($cfg.RemotePath) && sed -i 's/\r$//' scripts/verify-panel-release.sh 2>/dev/null; chmod +x scripts/verify-panel-release.sh 2>/dev/null; bash scripts/verify-panel-release.sh"
  }
} else {
  Write-Host "[1/5] Skip vendor deploy" -ForegroundColor DarkGray
}

# --- 2 Tarball ---
if (-not $SkipTarball) {
  Write-Host "[2/5] Publish tarball + install scripts to nexlify.live ..." -ForegroundColor Cyan
  & "$PSScriptRoot\publish-panel-release-remote.ps1"
  if ($LASTEXITCODE -ne 0) { throw "Tarball publish failed" }
  Test-TarballOnNexlifyLive
} else {
  Write-Host "[2/5] Skip tarball publish" -ForegroundColor DarkGray
}

# --- 3 Broadcast ---
if (-not $SkipBroadcast) {
  Write-Host "[3/5] Broadcast update to all registered customer panels ..." -ForegroundColor Cyan
  & "$PSScriptRoot\broadcast-panel-updates-remote.ps1"
  if ($LASTEXITCODE -ne 0) { throw "Broadcast failed" }
  Write-Host "  Panels will update in the background via their own VPS." -ForegroundColor Green
} else {
  Write-Host "[3/5] Skip broadcast" -ForegroundColor DarkGray
}

# --- 4 Optional direct SSH customer ---
if ($DirectCustomer) {
  Write-Host "[4/5] Direct SSH deploy ($CustomerHost) ..." -ForegroundColor Cyan
  & "$PSScriptRoot\deploy-customer-from-windows.ps1" -CustomerHost $CustomerHost -CustomerPassword $CustomerPassword -CustomerPath $CustomerPath
  if ($LASTEXITCODE -ne 0) { throw "Direct customer deploy failed" }
  Test-PanelRelease "customer ($CustomerHost)" {
    Invoke-CustomerPlink "cd $CustomerPath && sed -i 's/\r$//' scripts/verify-panel-release.sh 2>/dev/null; chmod +x scripts/verify-panel-release.sh 2>/dev/null; bash scripts/verify-panel-release.sh"
  }
} else {
  Write-Host "[4/5] Skip direct SSH (use -DirectCustomer for a known host)" -ForegroundColor DarkGray
}

# --- 5 Summary ---
Write-Host ""
Write-Host "[5/5] Release complete" -ForegroundColor Green
Write-Host "  Local version     : v$localVer"
if (-not $SkipVendor) { Write-Host "  Vendor panel      : http://$($cfg.Host):3000" }
if (-not $SkipTarball) {
  Write-Host "  Public tarball    : https://nexlify.live/downloads/nexlify-panel.tar.gz"
  Write-Host "  Repair (any VPS)  : curl -fsSL https://nexlify.live/install/fix-panel-repair.sh | sudo bash"
}
if (-not $SkipBroadcast) { Write-Host "  Customer panels   : broadcast triggered (registered licenses)" }
if ($DirectCustomer) { Write-Host "  Direct customer   : http://${CustomerHost}" }
Write-Host ""
Write-Host "Tip: hard-refresh panels (Ctrl+Shift+R) after update completes." -ForegroundColor DarkGray
Write-Host ""
