# Upload streaming guardrail scripts only — no npm build, no panel restart on target.
param(
  [string[]]$Hosts = @("45.88.138.18", "75.119.137.174"),
  [hashtable]$Passwords = @{
    "45.88.138.18" = "sufc196528"
    "75.119.137.174" = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
  },
  [string]$RemotePath = "/opt/nexlify-panel"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$plink = "C:\Program Files\PuTTY\plink.exe"

$scriptFiles = @(
  "scripts/apply-streaming-safeguards.sh",
  "scripts/ensure-panel-env.sh",
  "scripts/install-iptv-edge-proxy.sh",
  "scripts/install-nginx-panel-https.sh",
  "scripts/nexlify-nginx-release-ports.sh",
  "scripts/nexlify-watchdog.sh",
  "scripts/nexlify-streaming-guard.sh",
  "scripts/prune-stale-live-connections.sh",
  "scripts/panel-restart-safe.sh",
  "scripts/rematch-iptv-edge-auth.sh",
  "scripts/rebuild-panel-safe.sh",
  "scripts/apply-panel-fast-update.sh",
  "scripts/sync-internal-secret-env.sh",
  "scripts/tune-streaming-host.sh",
  "nginx/nexlify-panel-http.conf"
)

foreach ($h in $Hosts) {
  $pw = $Passwords[$h]
  if (-not $pw) { Write-Warning "No password for $h — skip"; continue }
  Write-Host "=== $h scripts-only ===" -ForegroundColor Cyan
  foreach ($rel in $scriptFiles) {
    $local = Join-Path $root $rel
    if (-not (Test-Path -LiteralPath $local)) { Write-Warning "missing $rel"; continue }
    $remote = if ($rel.StartsWith("nginx/")) { "/etc/nginx/conf.d/nexlify-panel-http.conf.ref" } else { "$RemotePath/$($rel -replace '\\','/')" }
    if ($rel -eq "nginx/nexlify-panel-http.conf") {
      & $pscp -batch -pw $pw $local "root@${h}:$RemotePath/nginx/nexlify-panel-http.conf"
    } else {
      & $pscp -batch -pw $pw $local "root@${h}:$remote"
    }
    if ($LASTEXITCODE -ne 0) { throw "upload failed $rel -> $h" }
  }
  $cmd = "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh 2>/dev/null; chmod +x scripts/*.sh; export NEXLIFY_SAFE_NO_RESTART=1 NEXLIFY_SAFE_NO_EDGE=1; bash scripts/apply-streaming-safeguards.sh"
  & $plink -batch -ssh "root@$h" -pw $pw $cmd
  if ($LASTEXITCODE -ne 0) { Write-Warning "guardrails apply had errors on $h" }
  Write-Host "OK $h" -ForegroundColor Green
}

Write-Host "Guardrails deployed (no build, no panel restart when healthy)." -ForegroundColor Green
