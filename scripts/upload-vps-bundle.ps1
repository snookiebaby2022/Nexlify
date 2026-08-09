# One file upload + deploy on VPS. Run on PC after git pull:
#   powershell -ExecutionPolicy Bypass -File scripts\upload-vps-bundle.ps1
#
# Uses vps-marketing-hotfix-deploy.sh (small, in git) by default.
# Pass -Full to upload the large vps-full-update.sh bundle instead.

param(
    [switch]$Full
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host "=== Upload + deploy Nexlify VPS ===" -ForegroundColor Cyan

if ($Full) {
    & "$Root\scripts\nexlify-sync-all.ps1"
    $bundle = "$Root\marketing-drop-in\scripts\vps-full-update.sh"
    $remotePath = "/root/vps-full-update.sh"
    $remoteCmd = "nohup bash /root/vps-full-update.sh > /root/vps-full-update.log 2>&1 & echo DEPLOY_STARTED_PID=`$!"
} else {
    $bundle = "$Root\marketing-drop-in\scripts\vps-marketing-hotfix-deploy.sh"
    $remotePath = "/root/vps-marketing-hotfix-deploy.sh"
    $remoteCmd = "bash /root/vps-marketing-hotfix-deploy.sh"
}

if (-not (Test-Path $bundle)) {
    if ($Full) {
        throw "Bundle missing: $bundle - run: bash marketing-drop-in/scripts/generate-vps-bundle.sh"
    }
    throw "Hotfix script missing: $bundle - git pull origin main"
}

$config = Join-Path $Root "windows\deploy.config.json"
if (-not (Test-Path $config)) {
    Write-Host ""
    Write-Host "Upload manually via WinSCP:" -ForegroundColor Yellow
    Write-Host "  $bundle -> $remotePath"
    Write-Host "Then on VPS: bash $remotePath"
    exit 0
}

. "$Root\windows\scripts\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
if ($cfg.PrivateKey -and (Test-Path -LiteralPath $cfg.PrivateKey)) {
    $openLine = "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} elseif ($cfg.Password) {
    $openLine = "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
} else {
    throw "Set password or privateKey in windows\deploy.config.json"
}

$winscp = @"
option batch on
option confirm off
$openLine
put "$bundle" $remotePath
chmod 755 $remotePath
call bash -c '$remoteCmd'
exit
"@

$f = Join-Path $env:TEMP "upload-vps-bundle.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

Write-Host "-> Uploading $(Split-Path $bundle -Leaf) and running deploy on VPS..." -ForegroundColor Cyan
& $cfg.WinScp "/ini=nul" "/script=$f"
$code = $LASTEXITCODE
Remove-Item $f -Force -ErrorAction SilentlyContinue

if ($code -ne 0) {
    Write-Host ""
    Write-Host "WinSCP deploy failed (exit $code)." -ForegroundColor Red
    Write-Host "If upload succeeded, run on VPS: bash $remotePath" -ForegroundColor Yellow
    exit $code
}

Write-Host ""
Write-Host "=== UPLOAD OK - deploy running on VPS ===" -ForegroundColor Green
Write-Host 'Monitor (full deploy): tail -f /root/vps-full-update.log' -ForegroundColor Cyan
Write-Host 'When done: bash /root/nexlify-full-platform-audit.sh' -ForegroundColor Cyan
