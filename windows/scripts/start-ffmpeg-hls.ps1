$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += @"
bash -lc 'echo === RTMP CONN ===; ss -tn sport = :1935; echo === START FFMPEG ===; touch /var/log/nexlify-hls-ffmpeg.log; chmod 666 /var/log/nexlify-hls-ffmpeg.log; pkill -f "ffmpeg.*127.0.0.1:1935/live/nexlify" 2>/dev/null || true; nohup bash /opt/nexlify-rtmp/hls-publish.sh nexlify >/tmp/hls-publish.out 2>&1 & sleep 3; echo === PROCESSES ===; pgrep -af ffmpeg || echo none; echo === HLS ===; ls -la /var/www/nexlify-hls/ | head -10; echo === LOG ===; tail -10 /var/log/nexlify-hls-ffmpeg.log 2>/dev/null; tail -5 /tmp/hls-publish.out 2>/dev/null'
"@
& $cfg.Plink @plink 2>&1
