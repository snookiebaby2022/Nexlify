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
    "src/lib/connection-quality-live.ts",
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

if ($SkipEdge) {
  $remoteCmd = "cd $CustomerPath && sed -i 's/\r$//' scripts/*.sh scripts/*.mjs 2>/dev/null; chmod +x scripts/*.sh; npm run build && bash scripts/panel-restart-safe.sh --nexlify-only && echo FAST_DEPLOY_OK"
} else {
  $remoteCmd = "cd $CustomerPath && sed -i 's/\r$//' scripts/*.sh scripts/*.mjs 2>/dev/null; chmod +x scripts/*.sh; npm run build && bash scripts/panel-restart-safe.sh --nexlify-only && (bash scripts/sync-internal-secret-env.sh 2>/dev/null || bash scripts/install-iptv-edge-proxy.sh 2>/dev/null || pm2 restart nexlify-iptv-edge 2>/dev/null || true) && echo FAST_DEPLOY_OK"
}

Write-Host "Building on $CustomerHost (no git pull, no npm install) ..."
& $cfg.Plink -batch -ssh "root@$CustomerHost" -pw $CustomerPassword $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "Remote build failed ($LASTEXITCODE)" }

Write-Host ""
Write-Host "Fast deploy OK: http://${CustomerHost}" -ForegroundColor Green
