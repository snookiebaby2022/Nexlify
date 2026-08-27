# Deploy 20k scale stack to a server
param(
  [string]$ServerHost = "45.88.138.18",
  [string]$User = "root",
  [string]$Password = "sufc196528",
  [switch]$Force,
  [string]$EdgeIps = "",
  [string]$VerifyUser = "lucky15",
  [string]$VerifyPass = "chedpie30"
)

$ErrorActionPreference = "Stop"
$plink = "C:\Program Files\PuTTY\plink.exe"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

$scaleScripts = Get-ChildItem (Join-Path $repo "scripts") -Filter "*.sh" | Where-Object {
  $_.Name -match "iptv|edge|20k|multi-edge|pgbouncer|redis-prod|kernel-20k|fleet|verify-iptv|verify-20k|verify-multi|audit-live|apply-iptv|apply-20k|apply-multi|sync-edge|remote-edge|remote-stream"
}
foreach ($f in $scaleScripts) {
  $remote = "/opt/nexlify-panel/scripts/$($f.Name)"
  & $pscp -batch -pw $Password $f.FullName "${User}@${ServerHost}:$remote"
}

$forceEnv = if ($Force) { "FORCE=1 PHASE=full" } else { "PHASE=safe" }
$edgeEnv = if ($EdgeIps) { "EDGE_IPS=$EdgeIps" } else { "" }
$cmd = @"
cd /opt/nexlify-panel
git fetch origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null || true
sed -i 's/\r$//' scripts/*.sh
chmod +x scripts/*.sh
VERIFY_USER=$VerifyUser VERIFY_PASS=$VerifyPass $edgeEnv bash scripts/apply-20k-scale-stack.sh
$forceEnv bash scripts/apply-iptv-production-stack.sh
"@
& $plink -batch -ssh "${User}@${ServerHost}" -pw $Password $cmd
