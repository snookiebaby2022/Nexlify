$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = "cd /home/nexlify-panel && sed -i 's/\r$//' scripts/*.sh && bash scripts/pm2-start.sh && pm2 list | head -12"
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd
Write-Host "Deduping and restarting vendor panel PM2..." -ForegroundColor Cyan
& $cfg.Plink @plinkArgs
