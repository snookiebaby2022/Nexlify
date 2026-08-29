# Deploy streaming stability to server 45 — NO panel/edge restart (scale up only).
param(
  [string]$Server = "45.88.138.18",
  [string]$Password = "sufc196528",
  [string]$RemotePath = "/opt/nexlify-panel"
)

$ErrorActionPreference = "Stop"
$root = "c:\Users\lizzi\nexlify-panel"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$plink = "C:\Program Files\PuTTY\plink.exe"

$files = @(
  "ecosystem.config.cjs",
  "scripts/ensure-panel-env.sh",
  "scripts/apply-streaming-stability-live-safe.sh",
  "scripts/apply-streaming-safeguards.sh",
  "scripts/install-streaming-stability-cron.sh",
  "scripts/nexlify-worker-wedge-guard.sh",
  "scripts/scale-panel-workers-live.sh",
  "scripts/nexlify-watchdog.sh",
  "scripts/nexlify-streaming-guard.sh",
  "scripts/nexlify-nginx-release-ports.sh",
  "scripts/install-iptv-edge-proxy.sh",
  "scripts/install-nginx-panel-https.sh",
  "scripts/prune-stale-live-connections.sh",
  "scripts/flush-live-connections.cjs",
  "scripts/panel-restart-safe.sh",
  "scripts/rematch-iptv-edge-auth.sh",
  "scripts/rebuild-panel-safe.sh",
  "scripts/apply-panel-fast-update.sh"
)

foreach ($rel in $files) {
  $local = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $local)) { Write-Warning "skip missing $rel"; continue }
  $remote = "$RemotePath/$($rel -replace '\\','/')"
  & $pscp -batch -pw $Password $local "root@${Server}:$remote"
}

& $plink -batch -ssh "root@$Server" -pw $Password "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh ecosystem.config.cjs 2>/dev/null; chmod +x scripts/*.sh; bash scripts/apply-streaming-stability-live-safe.sh"
Write-Host "Stability stack applied on $Server (streams not restarted)." -ForegroundColor Green
