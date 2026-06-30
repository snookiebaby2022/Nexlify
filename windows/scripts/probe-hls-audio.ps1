$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += @"
bash -lc 'LATEST=`$(ls -t /var/www/nexlify-hls/nexlify-*.ts 2>/dev/null | head -1); echo Segment: `$LATEST; if command -v ffprobe >/dev/null 2>&1; then echo --- AUDIO ---; ffprobe -hide_banner -show_streams -select_streams a "`$LATEST" 2>&1; echo --- VIDEO ---; ffprobe -hide_banner -show_streams -select_streams v "`$LATEST" 2>&1 | head -15; else echo ffprobe not installed; fi'
"@

& $cfg.Plink @plink 2>&1
