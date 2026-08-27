# Deploy multi-edge LB stack (run on LB VPS or panel nginx host)
param(
  [Parameter(Mandatory = $true)]
  [string]$EdgeIps,
  [string]$StreamHost = "darkcdn.store",
  [int]$EdgePort = 8080,
  [string]$ServerHost = "",
  [string]$User = "root",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$plink = "C:\Program Files\PuTTY\plink.exe"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

if (-not $ServerHost) { throw "Set -ServerHost to the LB server IP" }

$scripts = @(
  "scripts/apply-multi-edge-stack.sh",
  "scripts/install-multi-edge-lb.sh",
  "scripts/verify-multi-edge-health.sh"
)
foreach ($rel in $scripts) {
  & $pscp -batch -pw $Password (Join-Path $repo $rel) "${User}@${ServerHost}:/opt/nexlify-panel/$($rel.Replace('\','/'))"
}

$cmd = "cd /opt/nexlify-panel && sed -i 's/\r$//' scripts/*.sh && chmod +x scripts/*.sh && EDGE_IPS=$EdgeIps STREAM_HOST=$StreamHost EDGE_PORT=$EdgePort bash scripts/apply-multi-edge-stack.sh"
& $plink -batch -ssh "${User}@${ServerHost}" -pw $Password $cmd
