# One file upload + deploy on VPS. Run on PC after git pull:
#   powershell -ExecutionPolicy Bypass -File scripts\upload-vps-bundle.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host "=== Upload + deploy Nexlify VPS ===" -ForegroundColor Cyan

& "$Root\scripts\nexlify-sync-all.ps1"

$bundle = "$Root\marketing-drop-in\scripts\vps-full-update.sh"
if (-not (Test-Path $bundle)) { throw "Bundle missing: $bundle" }

$config = Join-Path $Root "windows\deploy.config.json"
if (-not (Test-Path $config)) {
    Write-Host ""
    Write-Host "Upload manually via WinSCP:" -ForegroundColor Yellow
    Write-Host "  $bundle -> /root/vps-full-update.sh"
    Write-Host "Then on VPS: bash /root/vps-full-update.sh"
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

# WinSCP upload + remote deploy (same auth as upload - avoids plink batch password issues)
$winscp = @"
option batch on
option confirm off
$openLine
put "$bundle" /root/vps-full-update.sh
chmod 755 /root/vps-full-update.sh
call bash /root/vps-full-update.sh
exit
"@
$f = Join-Path $env:TEMP "upload-vps-bundle.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

Write-Host "-> Uploading bundle and running deploy on VPS..." -ForegroundColor Cyan
& $cfg.WinScp "/ini=nul" "/script=$f"
$code = $LASTEXITCODE
Remove-Item $f -Force -ErrorAction SilentlyContinue

if ($code -ne 0) {
    Write-Host ""
    Write-Host "WinSCP deploy failed (exit $code)." -ForegroundColor Red
    Write-Host "If upload succeeded, run on VPS: bash /root/vps-full-update.sh" -ForegroundColor Yellow
    exit $code
}

Write-Host ""
Write-Host "=== DONE - VPS updated ===" -ForegroundColor Green
