param([string]$Password = "")
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$winscp = @"
option batch on
option confirm off
$openLine
put "$root\scripts\diagnose-whmcs-smtp.php" /home/nexlify-panel/scripts/diagnose-whmcs-smtp.php
put "$root\scripts\configure-whmcs-smtp.php" /home/nexlify-panel/scripts/configure-whmcs-smtp.php
exit
"@
$f = Join-Path $env:TEMP "diagnose-whmcs-smtp.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$passArg = $Password.Replace("'", "'\\''")
$plink += "php /home/nexlify-panel/scripts/diagnose-whmcs-smtp.php '$passArg'"
& $cfg.Plink @plink
exit $LASTEXITCODE
