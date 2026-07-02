$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "bash -lc 'ls -la /var/www/nexlify-hls/; echo ---; cat /etc/nginx/nexlify.live-rtmp-hls.conf; echo ---; ss -tn sport = :1935'"
& $cfg.Plink @plink 2>&1
