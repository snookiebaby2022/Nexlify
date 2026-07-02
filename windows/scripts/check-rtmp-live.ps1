$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "bash -lc 'echo === rtmp stat ===; curl -s http://127.0.0.1:8080/stat 2>/dev/null | head -5 || echo no-stat-page; echo === ffmpeg ===; pgrep -af ffmpeg || echo none; echo === hls ===; ls -la /var/www/nexlify-hls/'"
& $cfg.Plink @plink 2>&1
