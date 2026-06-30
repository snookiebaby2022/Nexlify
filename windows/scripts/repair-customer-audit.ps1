param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$localSh = Join-Path $cfg.ProjectRoot "scripts\audit-repair-customer.sh"
$winscp = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
put "$localSh" /tmp/audit-repair-customer.sh
exit
"@
$f = Join-Path $env:TEMP "audit-repair-upload.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword)
$plinkArgs += "sed -i 's/\r$//' /tmp/audit-repair-customer.sh && chmod +x /tmp/audit-repair-customer.sh && bash /tmp/audit-repair-customer.sh"
& $cfg.Plink @plinkArgs
