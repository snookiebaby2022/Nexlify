# Deploy IPTV production stack to server 45
param(
  [ValidateSet("safe", "full", "env")]
  [string]$Phase = "safe",
  [switch]$Force,
  [string]$ServerHost = "45.88.138.18",
  [string]$User = "root",
  [string]$Password = "sufc196528",
  [string]$VerifyUser = "lucky15",
  [string]$VerifyPass = "chedpie30"
)

$ErrorActionPreference = "Stop"
$plink = "C:\Program Files\PuTTY\plink.exe"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

$scripts = @(
  "scripts/apply-iptv-production-stack.sh",
  "scripts/verify-iptv-playback.sh",
  "scripts/ensure-panel-env.sh",
  "scripts/tune-streaming-host.sh",
  "scripts/install-streaming-stability-cron.sh",
  "scripts/apply-streaming-safeguards.sh",
  "scripts/apply-streaming-full-deploy.sh",
  "scripts/install-nginx-stream-edge.sh",
  "scripts/install-iptv-edge-proxy.sh"
)

foreach ($rel in $scripts) {
  $local = Join-Path $repo $rel
  if (-not (Test-Path $local)) { Write-Warning "missing $rel"; continue }
  $remote = "/opt/nexlify-panel/$rel".Replace("\", "/")
  & $pscp -batch -pw $Password $local "${User}@${ServerHost}:$remote"
}

$forceFlag = if ($Force) { "FORCE=1" } else { "" }
$remoteCmd = @"
cd /opt/nexlify-panel
git fetch origin main 2>/dev/null || true
git reset --hard origin/main 2>/dev/null || true
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/apply-iptv-production-stack.sh scripts/verify-iptv-playback.sh
PHASE=$Phase $forceFlag VERIFY_USER=$VerifyUser VERIFY_PASS=$VerifyPass bash scripts/apply-iptv-production-stack.sh
"@

Write-Host "Deploying PHASE=$Phase to $ServerHost ..."
& $plink -batch -ssh "${User}@${ServerHost}" -pw $Password $remoteCmd
