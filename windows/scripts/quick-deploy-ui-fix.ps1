param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$RemotePath = "/opt/nexlify-panel"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot

$files = @(
  "src/components/panel-update-progress.tsx",
  "src/lib/panel-update-job.ts"
)

$puts = ($files | ForEach-Object {
  "put `"$(Join-Path $root $_)`" `"$RemotePath/$_`""
}) -join "`n"

$winscpScript = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
lcd "$root"
$puts
exit
"@

$scriptFile = Join-Path $env:TEMP "nexlify-ui-fix.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
Write-Host "Uploading UI fix to $CustomerHost ..."
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed" }

$remoteCmd = "cd $RemotePath && pm2 stop nexlify 2>/dev/null || true && npm run build && bash scripts/panel-restart-safe.sh --nexlify-only && echo UI_FIX_OK"
& $cfg.Plink -batch -ssh "root@$CustomerHost" -pw $CustomerPassword $remoteCmd
