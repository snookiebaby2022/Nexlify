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
    Write-Host "No deploy.config.json — upload manually:" -ForegroundColor Yellow
    Write-Host "  FROM: $panelSh"
    Write-Host "  TO:   /var/www/nexlify/public/install/panel.sh"
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
