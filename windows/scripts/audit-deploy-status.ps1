param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$CustomerPath = "/opt/nexlify-panel"
)
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

function Test-RemotePanel {
  param([string]$Label, [string[]]$PlinkArgs, [string]$Path)
  Write-Host ""
  Write-Host "=== $Label ===" -ForegroundColor Cyan
  $checks = @(
    "grep version $Path/package.json | head -1",
    "ls $Path/src/lib/builtin-addons-catalog.ts 2>&1",
    "grep -c 'pm2 stop nexlify' $Path/scripts/apply-panel-fast-update.sh 2>/dev/null || echo apply_stop:0",
    "grep -c MAX_SAME_VERSION_FAILED_MS $Path/src/lib/panel-update-job.ts 2>/dev/null || echo job_clear:0",
    "grep -c nexlify-update-dismiss $Path/src/components/panel-update-progress.tsx 2>/dev/null || echo dismiss:0",
    "test -f $Path/.update-progress.json && echo update_job:present || echo update_job:none",
    "test -f $Path/.next/BUILD_ID && cat $Path/.next/BUILD_ID || echo build:none",
    "pm2 list 2>/dev/null | grep nexlify | head -4",
    "curl -sS -o /dev/null -w 'login_http:%{http_code}' http://127.0.0.1/login; echo"
  )
  $cmd = $checks -join "; echo '---'; "
  & $cfg.Plink @PlinkArgs $cmd
}

Write-Host "=== LOCAL ===" -ForegroundColor Cyan
$root = $cfg.ProjectRoot
Write-Host ((Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version)

$vendorArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $vendorArgs += "-i", $cfg.PrivateKey } else { $vendorArgs += "-pw", $cfg.Password }
Test-RemotePanel -Label "VENDOR $($cfg.Host)" -PlinkArgs $vendorArgs -Path $cfg.RemotePath

$customerArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword)
Test-RemotePanel -Label "CUSTOMER $CustomerHost" -PlinkArgs $customerArgs -Path $CustomerPath

Write-Host ""
Write-Host "=== TARBALL (live download) ===" -ForegroundColor Cyan
& $cfg.Plink @customerArgs "curl -sS https://nexlify.live/downloads/nexlify-panel.tar.gz | gzip -dc | tar -xOf - package.json | grep version | head -1"

Write-Host ""
Write-Host "=== VENDOR tarball on disk ===" -ForegroundColor Cyan
& $cfg.Plink @vendorArgs "gzip -dc /var/www/nexlify/public/downloads/nexlify-panel.tar.gz 2>/dev/null | tar -xOf - package.json | grep version | head -1; ls -la /var/www/nexlify/public/downloads/nexlify-panel.tar.gz 2>/dev/null"
