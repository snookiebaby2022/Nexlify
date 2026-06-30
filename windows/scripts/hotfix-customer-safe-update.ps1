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
  "scripts/apply-panel-fast-update.sh",
  "scripts/panel-restart-safe.sh",
  "scripts/panel-update-recover.sh",
  "scripts/has-valid-next-build.sh",
  "scripts/prepare-standalone.sh",
  "scripts/verify-standalone.sh"
)

$puts = ($files | ForEach-Object {
  "put `"$(Join-Path $root $_)`" `"$RemotePath/$_`""
}) -join "`n"

$winscp = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
call mkdir -p $RemotePath/scripts
lcd "$root"
$puts
exit
"@
$f = Join-Path $env:TEMP "nexlify-customer-safe-update.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
Write-Host "Uploading safe-update scripts to $CustomerHost ..."
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed" }

$remoteCmd = "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh && chmod +x scripts/*.sh && bash scripts/panel-update-recover.sh && curl -sS -o /dev/null -w health:%{http_code} http://127.0.0.1/api/health && echo && curl -sS -o /dev/null -w admin:%{http_code} http://127.0.0.1/admin/ && echo"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
Write-Host "Running recover + health check ..."
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Recover failed (exit $LASTEXITCODE)" }
Write-Host "Customer panel recovered." -ForegroundColor Green
