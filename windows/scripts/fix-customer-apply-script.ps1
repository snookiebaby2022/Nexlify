param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$RemotePath = "/opt/nexlify-panel"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$file = Join-Path $root "scripts\apply-panel-fast-update.sh"
$scriptFile = Join-Path $env:TEMP "nexlify-customer-apply.txt"
$winscpScript = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
lcd "$root"
put "$file" "$RemotePath/scripts/apply-panel-fast-update.sh"
exit
"@
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
$cmd = "sed -i 's/\r$//' $RemotePath/scripts/apply-panel-fast-update.sh; chmod +x $RemotePath/scripts/apply-panel-fast-update.sh; grep -c 'pm2 stop nexlify' $RemotePath/scripts/apply-panel-fast-update.sh; PANEL_CACHE_BUST=v173 bash $RemotePath/scripts/apply-panel-fast-update.sh bootstrap"
& $cfg.Plink -batch -ssh root@$CustomerHost -pw $CustomerPassword $cmd
