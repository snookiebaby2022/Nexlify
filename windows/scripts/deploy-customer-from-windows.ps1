# Sync local panel source to customer VPS and rebuild (same as vendor deploy, not nexlify.live tarball).
param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$CustomerPath = "/opt/nexlify-panel",
  [switch]$SyncOnly,
  [switch]$Full
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$hostKeyOpt = ""
if ($cfg.AcceptHostKey) { $hostKeyOpt = ' -hostkey="*"' }

# Exclude heavy local folders (.opencode alone is 1000+ files and slows every deploy).
$filemask = "|node_modules/;.next/;.next.staging/;.next.backup/;.git/;.env;*.db;dist/;windows/;.license-keys/;marketing-drop-in/;promo-for-nexlify-web/;.opencode/;.cursor/;docs/;agent-transcripts/;src/instrumentation.ts;src/lib/cron-scheduler.ts"

$winscpScript = @"
option batch continue
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/$hostKeyOpt
lcd "$($cfg.ProjectRoot)"
cd "$CustomerPath"
synchronize remote -delete=none -filemask="$filemask" -transfer=binary
call rm -f src/instrumentation.ts src/lib/cron-scheduler.ts
call sed -i 's/\r$//' scripts/*.sh scripts/*.mjs 2>/dev/null || true
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
if ($Full) {
  $remoteCmd = "cd $CustomerPath && rm -f .update-progress.json .update-progress.pid && sed -i 's/\r$//' scripts/*.sh ecosystem.config.cjs 2>/dev/null && chmod +x scripts/*.sh && ./scripts/deploy-vps.sh"
  Write-Host "Full rebuild on customer (git pull + npm install) ..."
} else {
  $remoteCmd = "cd $CustomerPath && rm -f .update-progress.json .update-progress.pid && sed -i 's/\r$//' scripts/*.sh scripts/*.mjs ecosystem.config.cjs 2>/dev/null; chmod +x scripts/*.sh; npx prisma generate && npx prisma migrate deploy && (bash scripts/verify-db-schema.sh 2>/dev/null || node scripts/audit-db-schema.cjs) && npm run build && bash scripts/panel-restart-safe.sh --nexlify-only && (bash scripts/install-iptv-edge-proxy.sh 2>/dev/null || pm2 restart nexlify-iptv-edge 2>/dev/null || true) && echo DEPLOY_OK"
  Write-Host "Fast rebuild on customer (synced files only, no npm install) ..."
}
$plinkArgs += $remoteCmd
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Customer rebuild failed ($LASTEXITCODE)" }

Write-Host ""
Write-Host "Customer panel updated at http://${CustomerHost}" -ForegroundColor Green
Write-Host "Tip: targeted hotfix -> deploy-customer-fast.ps1" -ForegroundColor DarkGray
