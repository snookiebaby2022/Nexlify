. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$a = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $a += "-i", $cfg.PrivateKey } else { $a += "-pw", $cfg.Password }
$cmd = "gzip -dc /var/www/nexlify/public/downloads/nexlify-panel.tar.gz | tar -tf - | head -15"
& $cfg.Plink @a $cmd
Write-Host "--- package.json version ---"
$cmd2 = "gzip -dc /var/www/nexlify/public/downloads/nexlify-panel.tar.gz | tar -xO ./package.json | grep version | head -1"
& $cfg.Plink @a $cmd2
Write-Host "--- apply-panel stop nexlify ---"
$cmd3 = "gzip -dc /var/www/nexlify/public/downloads/nexlify-panel.tar.gz | tar -xO ./scripts/apply-panel-fast-update.sh | grep -c 'pm2 stop nexlify' || echo 0"
& $cfg.Plink @a $cmd3
Write-Host "--- builtin catalog in tarball ---"
$cmd4 = "gzip -dc /var/www/nexlify/public/downloads/nexlify-panel.tar.gz | tar -tf - | grep builtin-addons || echo missing"
& $cfg.Plink @a $cmd4
