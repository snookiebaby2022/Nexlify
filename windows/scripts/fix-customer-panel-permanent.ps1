param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$RemotePath = "/opt/nexlify-panel"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot

# 1) Upload safe-update scripts
$files = @(
  "scripts/apply-panel-fast-update.sh",
  "scripts/panel-restart-safe.sh",
  "scripts/panel-update-recover.sh",
  "scripts/has-valid-next-build.sh",
  "scripts/prepare-standalone.sh",
  "scripts/verify-standalone.sh",
  "scripts/pm2-start.sh"
)
$puts = ($files | ForEach-Object {
  "put `"$(Join-Path $root $_)`" `"$RemotePath/$_`""
}) -join "`n"
$puts += "`nput `"$(Join-Path $root 'scripts/fix-customer-panel-permanent.sh')`" `"$RemotePath/scripts/fix-customer-panel-permanent.sh`""
$winscp = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
call mkdir -p $RemotePath/scripts
lcd "$root"
$puts
exit
"@
$f = Join-Path $env:TEMP "nexlify-customer-permanent.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
Write-Host "Uploading scripts to $CustomerHost ..."
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed" }

# 2) Run permanent fix on server (stop updates, recover, upgrade to v1.6.4)
$remoteCmd = "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh && chmod +x scripts/*.sh && bash scripts/fix-customer-panel-permanent.sh"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
Write-Host "Running permanent fix (may take several minutes) ..."
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Permanent fix failed (exit $LASTEXITCODE)" }
Write-Host "Customer panel fixed and upgraded." -ForegroundColor Green
