$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = "cp $($cfg.RemotePath)/nginx/panel.nexlify.live.conf /etc/nginx/sites-available/panel.nexlify.live && nginx -t && systemctl reload nginx"
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd
& $cfg.Plink @plinkArgs
