# Deploy streaming stack v2.0.52 to customer panel hosts (75, 45, etc.)
param(
  [string[]]$Hosts = @("75.119.137.174"),
  [hashtable]$Passwords = @{
    "45.88.138.18"   = "sufc196528"
    "75.119.137.174" = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
  },
  [string]$RemotePath = "/opt/nexlify-panel"
)

$ErrorActionPreference = "Stop"
$root = "c:\Users\lizzi\nexlify-panel"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$plink = "C:\Program Files\PuTTY\plink.exe"

$files = @(
  "package.json",
  "ecosystem.config.cjs",
  "scripts/iptv-edge-proxy.mjs",
  "scripts/ensure-panel-env.sh",
  "scripts/apply-streaming-reapply-local.sh",
  "scripts/apply-streaming-full-deploy.sh",
  "scripts/apply-edge-hotfix.sh",
  "scripts/patch-live-auth-edge.cjs",
  "scripts/patch-line-playback-probe.cjs",
  "scripts/patch-line-playback-probe-parallel.cjs",
  "scripts/install-iptv-edge-proxy.sh",
  "scripts/nexlify-streaming-guard.sh",
  "scripts/nexlify-worker-wedge-guard.sh",
  "scripts/scale-panel-workers-live.sh",
  "src/lib/server-ports.ts",
  "src/lib/xtream.ts",
  "src/lib/line-playback.ts",
  "src/lib/host-metrics.ts",
  "src/app/api/internal/live-auth/route.ts",
  "src/app/api/admin/stats/route.ts",
  "src/lib/dashboard-server-metrics.ts",
  "src/app/api/admin/dashboard-stream/route.ts"
)

foreach ($host in $Hosts) {
  $pw = $Passwords[$host]
  if (-not $pw) { Write-Warning "No password for $host — skip"; continue }
  Write-Host "=== Deploy streaming to $host ===" -ForegroundColor Cyan
  foreach ($rel in $files) {
    $local = Join-Path $root $rel
    if (-not (Test-Path -LiteralPath $local)) { continue }
    $remote = "$RemotePath/$($rel -replace '\\','/')"
    & $pscp -batch -pw $pw $local "root@${host}:$remote"
  }
  $cmd = "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh scripts/*.mjs scripts/*.cjs 2>/dev/null; chmod +x scripts/*.sh; chattr -i src/app/api/internal/live-auth/route.ts src/lib/line-playback.ts 2>/dev/null; export NEXLIFY_SKIP_GIT_RESET=1 NEXLIFY_FORCE_BUILD=1 FORCE=1; bash scripts/apply-streaming-reapply-local.sh"
  & $plink -batch -ssh "root@$host" -pw $pw $cmd
  Write-Host "=== Done $host ===" -ForegroundColor Green
}
