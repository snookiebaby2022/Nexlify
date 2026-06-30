$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$files = @(
  @{ Local = "$root\marketing-drop-in\src\lib\panel-install.ts"; Remote = "/var/www/nexlify/src/lib/panel-install.ts" },
  @{ Local = "$root\marketing-drop-in\src\components\PanelInstallInstructions.tsx"; Remote = "/var/www/nexlify/src/components/PanelInstallInstructions.tsx" }
)
$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}
$puts = ($files | ForEach-Object { "put `"$($_.Local)`" `"$($_.Remote)`"" }) -join "`n"
$winscp = @"
option batch on
option confirm off
$openLine
$puts
exit
"@
$f = Join-Path $env:TEMP "sync-install-ui.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += "cd /var/www/nexlify && npm run build && pm2 restart nexlify-web --update-env"
& $cfg.Plink @plinkArgs
