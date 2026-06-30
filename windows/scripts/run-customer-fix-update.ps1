param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = "curl -fsSL 'https://nexlify.live/install/fix-panel-auto-update.sh?v=169' | bash"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
Write-Host "Running full panel update on $CustomerHost ..."
& $cfg.Plink @plinkArgs
