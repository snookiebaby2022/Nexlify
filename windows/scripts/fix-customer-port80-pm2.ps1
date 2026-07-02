param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$localSh = Join-Path $cfg.ProjectRoot "scripts\fix-customer-port80-pm2.sh"

$winscp = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
put "$localSh" /tmp/fix-customer-port80-pm2.sh
exit
"@
$f = Join-Path $env:TEMP "fix-port80-upload.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"

$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword)
$plinkArgs += "sed -i 's/\r$//' /tmp/fix-customer-port80-pm2.sh && chmod +x /tmp/fix-customer-port80-pm2.sh && PANEL_DIR=/opt/nexlify-panel bash /tmp/fix-customer-port80-pm2.sh"
Write-Host "Fixing customer port 80 PM2 conflict on $CustomerHost ..." -ForegroundColor Cyan
& $cfg.Plink @plinkArgs
