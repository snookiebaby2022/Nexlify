$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += @"
bash -lc 'echo === ENV ===; grep LIVESTREAM /var/www/nexlify/.env 2>/dev/null; echo === UFW 1935 ===; ufw status 2>/dev/null | grep 1935 || echo no-ufw-rule; echo === RECENT NGINX ERROR ===; tail -20 /var/log/nginx/error.log; echo === RTMP STAT via curl localhost ===; curl -sS -m 3 http://127.0.0.1/stat 2>&1 | head -3; echo === ACTIVE CONNECTIONS 1935 ===; ss -tn sport = :1935 | head -10; echo === TEST EXEC SCRIPT MANUALLY 2s ===; timeout 2 bash /opt/nexlify-rtmp/hls-publish.sh nexlify 2>&1 | head -5; echo exit:$?; echo === FFMPEG LOG AFTER TEST ===; tail -5 /var/log/nexlify-hls-ffmpeg.log 2>/dev/null || echo no-log'
"@
& $cfg.Plink @plink 2>&1
