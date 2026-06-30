$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += @"
bash -lc 'echo === ffmpeg ===; pgrep -af ffmpeg || echo none; echo === hls files ===; ls -lt /var/www/nexlify-hls/ | head -8; echo === manifest ===; head -5 /var/www/nexlify-hls/nexlify.m3u8 2>/dev/null || echo no manifest; echo === probe ===; L=`$(ls -t /var/www/nexlify-hls/nexlify*.ts 2>/dev/null | head -1); if [ -n "`$L" ]; then ffprobe -hide_banner -show_streams -select_streams v "`$L" 2>&1 | head -8; else echo no ts; fi; echo === log ===; tail -5 /var/log/nexlify-hls-ffmpeg.log 2>/dev/null || echo no log'
"@
& $cfg.Plink @plink 2>&1
