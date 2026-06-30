. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = "cd /home/nexlify-panel && bash scripts/publish-panel-release.sh"
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd
Write-Host "Publishing panel release on $($cfg.Host)..."
& $cfg.Plink @plinkArgs
exit $LASTEXITCODE
