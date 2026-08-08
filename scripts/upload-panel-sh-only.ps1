# Upload ONLY panel.sh to vendor VPS (quick fix when full bundle deploy fails).
# Run on PC after: git pull origin main

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$panelSh = "$Root\marketing-drop-in\public\install\panel.sh"
if (-not (Test-Path $panelSh)) {
    & "$Root\scripts\nexlify-sync-all.ps1"
}

$config = Join-Path $Root "windows\deploy.config.json"
if (-not (Test-Path $config)) {
    Write-Host ""
    Write-Host "=== No deploy.config.json — use one of these ===" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Option A — WinSCP (manual, no config file):" -ForegroundColor Cyan
    Write-Host "  1. Open WinSCP, connect to 85.17.162.54 as root"
    Write-Host "  2. Drag this file to the right path:"
    Write-Host "     FROM: $panelSh"
    Write-Host "     TO:   /var/www/nexlify/public/install/panel.sh"
    Write-Host ""
    Write-Host "Option B — SCP from PowerShell (if OpenSSH installed):" -ForegroundColor Cyan
    Write-Host "  scp `"$panelSh`" root@85.17.162.54:/var/www/nexlify/public/install/panel.sh"
    Write-Host ""
    Write-Host "Option C — Create config from example:" -ForegroundColor Cyan
    Write-Host "  copy windows\deploy.config.example.json windows\deploy.config.json"
    Write-Host "  Edit host + password (or privateKey), then re-run this script."
    Write-Host ""
    Write-Host "Option D — Patch on VPS without upload (SSH as root on 85.17.162.54):" -ForegroundColor Cyan
    Write-Host "  bash /var/www/nexlify/scripts/vps-patch-panel-installer.sh"
    Write-Host "  (after full deploy) OR paste script from repo: marketing-drop-in/scripts/vps-patch-panel-installer.sh"
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
put "$panelSh" /var/www/nexlify/public/install/panel.sh
chmod 755 /var/www/nexlify/public/install/panel.sh
call grep -q detect_server_address /var/www/nexlify/public/install/panel.sh && echo PANEL_SH_OK || echo PANEL_SH_OLD
exit
"@
$f = Join-Path $env:TEMP "upload-panel-sh.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

Write-Host "Uploading panel.sh to VPS..." -ForegroundColor Cyan
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Test on customer server:" -ForegroundColor Green
Write-Host "  curl -fsSL 'https://nexlify.live/install/panel.sh?v=1.9.7' | sudo bash"
