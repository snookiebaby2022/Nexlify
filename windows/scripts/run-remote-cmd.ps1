param([Parameter(Mandatory=$true)][string]$Command)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$plinkArgs = @(
  "-batch"
  "-ssh"
  "$($cfg.Username)@$($cfg.Host)"
  "-P", "$($cfg.Port)"
)

if ($cfg.PrivateKey) {
  $plinkArgs += "-i", $cfg.PrivateKey
} else {
  $plinkArgs += "-pw", $cfg.Password
}

$plinkArgs += $Command
& $cfg.Plink @plinkArgs
exit $LASTEXITCODE
