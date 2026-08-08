# Upload install-command.json ONLY — fixes /install page URL without rebuild.
# Run on PC after: git pull origin main
#
#   powershell -ExecutionPolicy Bypass -File scripts\upload-install-command-json.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$json = "$Root\marketing-drop-in\public\install-command.json"
if (-not (Test-Path $json)) {
    & "$Root\scripts\nexlify-sync-all.ps1"
}

$config = Join-Path $Root "windows\deploy.config.json"
if (-not (Test-Path $config)) {
    Write-Host ""
    Write-Host "=== FASTEST FIX (no deploy.config.json needed) ===" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "WinSCP — upload ONE file to BOTH paths:" -ForegroundColor Cyan
    Write-Host "  FROM: $json"
    Write-Host "  TO:   /var/www/nexlify/public/install-command.json"
    Write-Host "  TO:   /home/nexlify-panel/marketing-drop-in/public/install-command.json"
    Write-Host ""
    Write-Host "Then SSH and run:" -ForegroundColor Cyan
    Write-Host "  pm2 restart nexlify-web --update-env"
    Write-Host ""
    Write-Host "Verify: curl -s http://127.0.0.1:13001/install-command.json"
    Write-Host ""
    Write-Host "OR paste full fix on VPS (patches all paths):" -ForegroundColor Cyan
    Write-Host "  bash /root/vps-instant-install-url-fix.sh"
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
put "$json" /var/www/nexlify/public/install-command.json
put "$json" /home/nexlify-panel/marketing-drop-in/public/install-command.json
call pm2 restart nexlify-web --update-env
call curl -s http://127.0.0.1:13001/install-command.json
exit
"@
$f = Join-Path $env:TEMP "upload-install-command-json.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

Write-Host "Uploading install-command.json to both marketing paths..." -ForegroundColor Cyan
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Hard-refresh https://nexlify.live/install (Ctrl+Shift+R)" -ForegroundColor Green
