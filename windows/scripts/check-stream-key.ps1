$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += @"
bash -lc 'echo === MANIFESTS ===; ls -la /var/www/nexlify-hls/*.m3u8 2>/dev/null; echo === NEXLIFY MANIFEST ===; cat /var/www/nexlify-hls/nexlify.m3u8 2>/dev/null || echo MISSING; echo === ACTIVE MANIFEST ===; head -8 /var/www/nexlify-hls/*.m3u8 2>/dev/null | head -20; echo === ENV ===; grep LIVESTREAM /var/www/nexlify/.env; echo === LATEST SEGMENT ===; L=`$(ls -t /var/www/nexlify-hls/*.ts 2>/dev/null | head -1); echo `$L; ls -la `$L; ffprobe -hide_banner -show_streams `$L 2>&1 | head -20'
"@
& $cfg.Plink @plink 2>&1
