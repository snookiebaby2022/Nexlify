$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "bash -lc 'nginx -t && systemctl restart nginx && sleep 2 && rm -f /var/www/nexlify-hls/nexlify.m3u8 /var/www/nexlify-hls/nexlify-*.ts && echo RESTARTED && ss -tlnp | grep 1935'"
& $cfg.Plink @plink 2>&1
