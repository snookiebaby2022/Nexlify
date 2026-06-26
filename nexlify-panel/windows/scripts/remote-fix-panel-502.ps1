# Re-register PM2 panel on :3000 from deploy path (fixes nginx 502)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$remoteCmd = "cd $($cfg.RemotePath) && sed -i 's/\r$//' scripts/*.sh 2>/dev/null; chmod +x scripts/vps-fix-panel-502.sh scripts/pm2-start.sh; ./scripts/vps-fix-panel-502.sh"

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd

Write-Host "Fixing panel 502 on $($cfg.Host)..." -ForegroundColor Cyan
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Remote fix failed (plink exit $LASTEXITCODE)" }
Write-Host "Done. Try https://panel.nexlify.live/" -ForegroundColor Green
