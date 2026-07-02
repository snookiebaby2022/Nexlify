$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$files = @(
  "scripts/pm2-start.sh",
  "scripts/panel-restart-safe.sh",
  "scripts/full-audit-smoke.sh",
  "scripts/audit-repair-customer.sh"
)
$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}
$puts = ($files | ForEach-Object { "put `"$(Join-Path $root $_)`" `"$($cfg.RemotePath)/$_`"" }) -join "`n"
$winscp = @"
option batch on
option confirm off
$openLine
$puts
exit
"@
$f = Join-Path $env:TEMP "sync-pm2-scripts.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Write-Host "PM2 scripts synced to vendor." -ForegroundColor Green
