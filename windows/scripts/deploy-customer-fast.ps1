# Fast customer deploy: upload only listed files, skip git pull + npm install.
# Use for hotfixes. Full tree sync: deploy-customer-from-windows.ps1
param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$CustomerPath = "/opt/nexlify-panel",
  [string[]]$Files = @(
    "package.json",
    "src/lib/panel-releases.json",
    "src/lib/connections.ts",
    "src/lib/connection-pulse.ts",
    "src/app/admin/dashboard/page.tsx",
    "src/lib/category-options.ts",
    "src/lib/repair-bouquet-category-split.ts",
    "src/lib/xtream.ts",
    "src/app/api/internal/connection-end/route.ts",
    "src/lib/stream-probe-fix-hints.ts",
    "src/lib/cron-jobs.ts",
    "src/lib/panel-monitoring-jobs.ts",
    "src/app/api/admin/stream-errors/route.ts",
    "src/app/admin/stream_errors/page.tsx",
    "src/app/admin/management/logs/page.tsx",
    "src/app/api/admin/categories/route.ts",
    "src/components/panel-web-player.tsx",
    "src/app/api/admin/connections/route.ts",
    "src/app/api/admin/stats/route.ts",
    "src/app/api/admin/servers/route.ts",
    "src/lib/dashboard-server-metrics.ts",
    "src/components/panel-update-banner.tsx",
    "src/components/panel-top-nav.tsx",
    "src/app/admin/connections/page.tsx",
    "src/app/admin/management/stream-providers/page.tsx",
    "src/lib/dashboard-server-metrics.ts",
    "src/lib/dashboard-widgets.ts",
    "src/components/realtime-dashboard.tsx",
    "src/components/dashboard-server-card.tsx",
    "src/components/dashboard-xui-server-tiles.tsx",
    "src/components/dashboard-most-watched-by-country.tsx",
    "src/lib/connection-quality.ts",
    "src/lib/hls-live-auth.ts",
    "src/app/api/internal/live-auth/route.ts",
    "src/app/api/admin/lines/route.ts",
    "scripts/iptv-edge-proxy.mjs"
  ),
  [switch]$SkipBuild,
  [switch]$SkipEdge
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot

$hostKeyOpt = ""
if ($cfg.AcceptHostKey) { $hostKeyOpt = ' -hostkey="*"' }

$mkdirs = New-Object System.Collections.Generic.HashSet[string]
foreach ($rel in $Files) {
  $dir = Split-Path $rel -Parent
  while ($dir -and $dir -ne ".") {
    [void]$mkdirs.Add("$CustomerPath/$($dir -replace '\\','/')")
    $dir = Split-Path $dir -Parent
  }
}
$mkdirCalls = ($mkdirs | Sort-Object | ForEach-Object { "call mkdir -p $_" }) -join "`n"

$puts = ($Files | ForEach-Object {
  $local = Join-Path $root $_
  if (-not (Test-Path -LiteralPath $local)) { throw "Missing local file: $_" }
  "put `"$local`" `"$CustomerPath/$($_ -replace '\\','/')`""
}) -join "`n"

$winscpScript = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/$hostKeyOpt
$mkdirCalls
lcd "$root"
$puts
exit
"@

$scriptFile = Join-Path $env:TEMP "nexlify-fast-deploy.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
Write-Host "Fast upload $($Files.Count) file(s) -> root@${CustomerHost}:$CustomerPath ..."
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed ($LASTEXITCODE)" }

if ($SkipBuild) {
  Write-Host "Upload complete (build skipped)." -ForegroundColor Green
  exit 0
}

# SkipEdge = do not reinstall/replace iptv-edge-proxy.mjs.
# panel-restart-safe always rematches PANEL_INTERNAL_SECRET + soft-restarts edge
# so panel-only hotfixes cannot leave UI up with dead playback again.
$remoteCmd = "cd $CustomerPath && sed -i 's/\r$//' scripts/*.sh scripts/*.mjs 2>/dev/null; chmod +x scripts/*.sh; npm run build && bash scripts/panel-restart-safe.sh --nexlify-only && echo FAST_DEPLOY_OK"
if (-not $SkipEdge) {
  $remoteCmd = "cd $CustomerPath && sed -i 's/\r$//' scripts/*.sh scripts/*.mjs 2>/dev/null; chmod +x scripts/*.sh; npm run build && bash scripts/panel-restart-safe.sh --nexlify-only && (bash scripts/sync-internal-secret-env.sh 2>/dev/null || bash scripts/install-iptv-edge-proxy.sh 2>/dev/null || true) && echo FAST_DEPLOY_OK"
}

Write-Host "Building on $CustomerHost (no git pull, no npm install) ..."
& $cfg.Plink -batch -ssh "root@$CustomerHost" -pw $CustomerPassword $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "Remote build failed ($LASTEXITCODE)" }

Write-Host ""
Write-Host "Fast deploy OK: http://${CustomerHost}" -ForegroundColor Green
if ($SkipEdge) {
  Write-Host "SkipEdge: edge binary not redeployed; auth rematch ran via panel-restart-safe." -ForegroundColor DarkGray
}