# Push nginx RTMP/HLS config and reload nginx on VPS
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$localConf = Join-Path $cfg.ProjectRoot "nginx\nexlify.live-rtmp-hls.conf"

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}
$f = Join-Path $env:TEMP "push-rtmp-conf.txt"
Set-Content -LiteralPath $f -Value @"
option batch on
option confirm off
$openLine
put "$localConf" /etc/nginx/nexlify.live-rtmp-hls.conf
exit
"@ -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "nginx -t && systemctl reload nginx && grep -E 'wait_key|hls_fragment' /etc/nginx/nexlify.live-rtmp-hls.conf"
& $cfg.Plink @plink 2>&1
