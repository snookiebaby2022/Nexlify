$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$CustomerHost = "75.119.137.174"
$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
$files = @(
  @{ L = "scripts\pm2-start.sh"; R = "/opt/nexlify-panel/scripts/pm2-start.sh" },
  @{ L = "scripts\fix-customer-port80-pm2.sh"; R = "/opt/nexlify-panel/scripts/fix-customer-port80-pm2.sh" }
)
$winscp = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
"@
foreach ($f in $files) {
  $winscp += "`nput `"$(Join-Path $cfg.ProjectRoot $($f.L))`" `"$($f.R)`""
}
$winscp += "`nexit"
$path = Join-Path $env:TEMP "sync-customer-pm2-fix.txt"
Set-Content -LiteralPath $path -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$path"
Write-Host "Synced pm2-start.sh + fix script to customer." -ForegroundColor Green
