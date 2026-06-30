. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$broadcastCmd = "cd /var/www/nexlify && npx prisma generate && set -a && [ -f .env ] && . ./.env && set +a && npx tsx scripts/broadcast-panel-update.ts"
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $broadcastCmd
Write-Host "Broadcasting panel updates to all registered customer panels..."
& $cfg.Plink @plinkArgs
exit $LASTEXITCODE
