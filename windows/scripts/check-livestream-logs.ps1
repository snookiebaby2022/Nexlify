$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$localSh = Join-Path $cfg.ProjectRoot "scripts\check-livestream-logs-remote.sh"

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}
$f = Join-Path $env:TEMP "check-livestream-logs.txt"
Set-Content -LiteralPath $f -Value @"
option batch on
option confirm off
$openLine
put "$localSh" /tmp/check-livestream-logs-remote.sh
exit
"@ -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "sed -i 's/\r$//' /tmp/check-livestream-logs-remote.sh && bash /tmp/check-livestream-logs-remote.sh"
& $cfg.Plink @plink 2>&1
