param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$localSh = Join-Path $cfg.ProjectRoot "scripts\customer-apply-update.sh"
$winscp = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
put "$localSh" /tmp/customer-apply-update.sh
exit
"@
$f = Join-Path $env:TEMP "customer-apply-update-upload.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword)
$plinkArgs += "sed -i 's/\r$//' /tmp/customer-apply-update.sh && chmod +x /tmp/customer-apply-update.sh && PANEL_DIR=/opt/nexlify-panel bash /tmp/customer-apply-update.sh"
Write-Host "Full tarball sync + rebuild on $CustomerHost ..."
& $cfg.Plink @plinkArgs
