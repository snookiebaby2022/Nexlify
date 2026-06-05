# Full VPS repair: split nginx, panel on 127.0.0.1:3000, marketing on :3002
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$remoteCmd = "cd $($cfg.RemotePath) && sed -i 's/\r$//' scripts/vps-remote-repair.sh && chmod +x scripts/vps-remote-repair.sh && bash scripts/vps-remote-repair.sh"

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd

Write-Host "Running full repair on $($cfg.Host)..." -ForegroundColor Cyan
& $cfg.Plink @plinkArgs 2>&1
