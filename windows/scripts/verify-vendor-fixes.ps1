. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$a = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $a += "-i", $cfg.PrivateKey } else { $a += "-pw", $cfg.Password }
Write-Host "=== VENDOR live panel ===" -ForegroundColor Cyan
$cmd = "grep -c 'pm2 stop nexlify' /home/nexlify-panel/scripts/apply-panel-fast-update.sh; test -f /home/nexlify-panel/src/lib/builtin-addons-catalog.ts && echo catalog:yes || echo catalog:no; grep -c nexlify-update-dismiss /home/nexlify-panel/src/components/panel-update-progress.tsx"
& $cfg.Plink @a $cmd
Write-Host "=== TARBALL apply script snippet ===" -ForegroundColor Cyan
$cmd2 = "gzip -dc /var/www/nexlify/public/downloads/nexlify-panel.tar.gz | tar -xO ./scripts/apply-panel-fast-update.sh | grep -A2 'cmd_build' | head -20"
& $cfg.Plink @a $cmd2
