$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "bash -lc 'echo === rtmp service ===; systemctl is-active nexlify-rtmp 2>/dev/null || echo no-service; echo === port 1935 ===; ss -tlnp | grep 1935; echo === etc rtmp conf ===; cat /etc/nginx/nexlify.live-rtmp-hls.conf; echo === opt rtmp conf ===; cat /opt/nexlify-rtmp/rtmp.conf 2>/dev/null; echo === publish script ===; ls -la /opt/nexlify-rtmp/hls-publish.sh; head -3 /opt/nexlify-rtmp/hls-publish.sh'"
& $cfg.Plink @plink 2>&1
