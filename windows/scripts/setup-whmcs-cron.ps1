# Fix WHMCS cron config + install root crontab every 5 minutes
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
put "$root\scripts\whmcs-cron-config.php" /home/nexlify-panel/scripts/whmcs-cron-config.php
put "$root\scripts\setup-whmcs-cron.sh" /home/nexlify-panel/scripts/setup-whmcs-cron.sh
exit
"@
$f = Join-Path $env:TEMP "setup-whmcs-cron.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "sed -i 's/\r$//' /home/nexlify-panel/scripts/setup-whmcs-cron.sh && chmod +x /home/nexlify-panel/scripts/setup-whmcs-cron.sh && bash /home/nexlify-panel/scripts/setup-whmcs-cron.sh && crontab -l | tail -3"
& $cfg.Plink @plink
exit $LASTEXITCODE
