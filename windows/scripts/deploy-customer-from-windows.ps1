# Sync local panel source to customer VPS and rebuild (same as vendor deploy, not nexlify.live tarball).
param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$CustomerPath = "/opt/nexlify-panel",
  [switch]$SyncOnly
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$hostKeyOpt = ""
if ($cfg.AcceptHostKey) { $hostKeyOpt = ' -hostkey="*"' }

$winscpScript = @"
option batch continue
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/$hostKeyOpt
lcd "$($cfg.ProjectRoot)"
cd "$CustomerPath"
synchronize remote -delete=none -filemask="|node_modules/;.next/;.git/;.env;*.db;dist/;windows/;.license-keys/;marketing-drop-in/;promo-for-nexlify-web/;src/instrumentation.ts;src/lib/cron-scheduler.ts" -transfer=binary
call rm -f src/instrumentation.ts src/lib/cron-scheduler.ts
call sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
exit
"@

$scriptFile = Join-Path $env:TEMP "nexlify-customer-sync.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
Write-Host "Syncing $($cfg.ProjectRoot) -> root@${CustomerHost}:$CustomerPath ..."
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "Customer WinSCP sync failed ($LASTEXITCODE)" }

if ($SyncOnly) {
  Write-Host "Customer sync complete (files only)." -ForegroundColor Green
  exit 0
}

$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword)
$plinkArgs += "cd $CustomerPath && rm -f .update-progress.json .update-progress.pid && sed -i 's/\r$//' scripts/*.sh ecosystem.config.cjs 2>/dev/null && chmod +x scripts/*.sh && ./scripts/deploy-vps.sh"
Write-Host "Rebuilding on customer (local sync, no tarball overwrite) ..."
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Customer rebuild failed ($LASTEXITCODE)" }

Write-Host ""
Write-Host "Customer panel updated at http://${CustomerHost}" -ForegroundColor Green
