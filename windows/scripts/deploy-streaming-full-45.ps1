# Deploy full streaming stability stack to server 45 (edge + panel build).
param(
  [string]$Server = "45.88.138.18",
  [string]$Password = "sufc196528",
  [string]$RemotePath = "/opt/nexlify-panel",
  [string]$Force = "1"
)

$ErrorActionPreference = "Stop"
$root = "c:\Users\lizzi\nexlify-panel"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$plink = "C:\Program Files\PuTTY\plink.exe"

$files = @(
  "ecosystem.config.cjs",
  "scripts/iptv-edge-proxy.mjs",
  "scripts/ensure-panel-env.sh",
  "scripts/apply-streaming-stability-live-safe.sh",
  "scripts/apply-streaming-full-deploy.sh",
  "scripts/install-streaming-stability-cron.sh",
  "scripts/nexlify-worker-wedge-guard.sh",
  "scripts/scale-panel-workers-live.sh",
  "scripts/nexlify-watchdog.sh",
  "scripts/nexlify-streaming-guard.sh",
  "scripts/nexlify-nginx-release-ports.sh",
  "scripts/install-iptv-edge-proxy.sh",
  "scripts/install-nginx-panel-https.sh",
  "scripts/install-nginx-stream-edge.sh",
  "scripts/prune-stale-live-connections.sh",
  "scripts/flush-live-connections.cjs",
  "scripts/panel-restart-safe.sh",
  "scripts/rematch-iptv-edge-auth.sh",
  "scripts/rebuild-panel-safe.sh",
  "src/lib/server-ports.ts",
  "src/lib/xtream.ts",
  "src/lib/connections.ts",
  "src/lib/redis.ts",
  "src/instrumentation.ts"
)

foreach ($rel in $files) {
  $local = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $local)) { Write-Warning "skip missing $rel"; continue }
  $remote = "$RemotePath/$($rel -replace '\\','/')"
  & $pscp -batch -pw $Password $local "root@${Server}:$remote"
}

$forceFlag = if ($Force -eq "1" -or $Force -eq "true") { "FORCE=1" } else { "" }
$cmd = "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh scripts/*.mjs ecosystem.config.cjs 2>/dev/null; chmod +x scripts/*.sh; $forceFlag bash scripts/apply-streaming-full-deploy.sh"
& $plink -batch -ssh "root@$Server" -pw $Password $cmd
Write-Host "Full streaming deploy finished on $Server." -ForegroundColor Green
