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
  "package.json",
  "src/lib/panel-releases-feed.ts",
  "src/lib/panel-releases.json",
  "src/lib/panel-update-auto.ts",
  "src/lib/panel-update-bootstrap.ts",
  "src/lib/panel-update.ts",
  "src/lib/panel-update-job.ts",
  "src/lib/panel-health-watchdog.ts",
  "src/lib/cron-jobs.ts",
  "src/lib/ddos-shield.ts",
  "src/lib/playback-guard.ts",
  "src/lib/admin-sidebar-nav.tsx",
  "src/lib/content-folders.ts",
  "src/lib/panel-settings.ts",
  "src/app/api/admin/panel-update/route.ts",
  "src/app/api/internal/panel-update/route.ts",
  "src/app/admin/settings/updates/page.tsx",
  "src/components/panel-update-progress.tsx",
  "src/app/admin/settings/security/page.tsx",
  "src/components/stream-add-form.tsx",
  "src/components/stream-probe-player.tsx",
  "src/components/content-folder-page.tsx",
  "src/components/stream-manage-edit-page.tsx",
  "scripts/apply-panel-fast-update.sh",
  "scripts/panel-restart-safe.sh",
  "scripts/fix-panel-restart.sh",
  "scripts/fix-panel-auto-update.sh"
)

$puts = ($files | ForEach-Object {
  "put `"$(Join-Path $root $_)`" `"$RemotePath/$_`""
}) -join "`n"

$winscpScript = @"
option batch on
option confirm off
open sftp://root:$CustomerPassword@${CustomerHost}:22/ -hostkey="*"
call mkdir -p $RemotePath/src/app/api/internal/panel-update
lcd "$root"
$puts
exit
"@

$scriptFile = Join-Path $env:TEMP "nexlify-customer-global-hotfix.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
Write-Host "Uploading panel hotfix to $CustomerHost ..."
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed" }

$remoteCmd = "cd $RemotePath && sed -i 's/\r$//' scripts/*.sh && chmod +x scripts/*.sh && PANEL_CACHE_BUST=v160 bash scripts/apply-panel-fast-update.sh bootstrap && npm run build && bash scripts/panel-restart-safe.sh --nexlify-only && echo HOTFIX_OK"
$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
Write-Host "Rebuilding on $CustomerHost ..."
& $cfg.Plink @plinkArgs
