param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword)
$plinkArgs += "pm2 logs nexlify --lines 30 --nostream 2>&1 | tail -35"
& $cfg.Plink @plinkArgs
