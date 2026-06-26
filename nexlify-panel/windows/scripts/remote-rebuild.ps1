. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = "cd $($cfg.RemotePath) && sed -i 's/\r$//' scripts/deploy-vps.sh 2>/dev/null; rm -rf .next && ./scripts/deploy-vps.sh"
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd
Write-Host "Rebuilding on VPS..."
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Rebuild failed" }
