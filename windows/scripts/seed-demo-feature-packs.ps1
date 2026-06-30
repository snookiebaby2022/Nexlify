# Seed demo feature pack licenses on vendor panel VPS
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$remoteCmd = "cd $($cfg.RemotePath) && sed -i 's/\r$//' scripts/seed-demo-feature-packs.sh && chmod +x scripts/seed-demo-feature-packs.sh && bash scripts/seed-demo-feature-packs.sh"

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd

& $cfg.Plink @plinkArgs
exit $LASTEXITCODE
