param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$RemotePath = "/opt/nexlify-panel"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot

$applyScript = Join-Path $root "scripts\apply-panel-fast-update.sh"

$winscpScript = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
put "$applyScript" "$RemotePath/scripts/apply-panel-fast-update.sh"
exit
"@
$scriptFile = Join-Path $env:TEMP "nexlify-sync-fix.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed" }

$remoteCmd = "cd $RemotePath && sed -i 's/\r$//' scripts/apply-panel-fast-update.sh && chmod +x scripts/apply-panel-fast-update.sh && PANEL_CACHE_BUST=v172 bash scripts/apply-panel-fast-update.sh all && bash scripts/panel-restart-safe.sh --nexlify-only && echo UPDATE_OK"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
& $cfg.Plink @plinkArgs
