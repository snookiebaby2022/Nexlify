param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$RemotePath = "/opt/nexlify-panel"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$remoteCmd = "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh && export NEXT_PRIVATE_WORKER_THREADS=false && rm -rf .next && npm run build && bash scripts/panel-restart-safe.sh --nexlify-only && echo FIX_OK"

$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
Write-Host "Rebuilding panel on $CustomerHost (fix unstyled UI) ..."
& $cfg.Plink @plinkArgs
