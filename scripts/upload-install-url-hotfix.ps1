# Upload instant install URL fix to VPS (~10 sec fix, no full rebuild).
# Run on PC after: git pull origin main
#
#   powershell -ExecutionPolicy Bypass -File scripts\upload-install-url-hotfix.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$hotfix = "$Root\marketing-drop-in\scripts\vps-instant-install-url-fix.sh"
if (-not (Test-Path $hotfix)) { throw "Missing: $hotfix" }

$config = Join-Path $Root "windows\deploy.config.json"
if (-not (Test-Path $config)) {
    Write-Host ""
    Write-Host "=== FIX THE INSTALL URL NOW (pick one) ===" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "FASTEST — SSH as root on 85.17.162.54, paste this ONE command:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host @'
find /var/www/nexlify/.next -type f -name '*.js' -exec grep -l 'panel.sh?v1.9.7' {} \; 2>/dev/null | while read f; do sed -i 's|panel.sh?v1.9.7|panel.sh?v=1.9.7|g; s|panel.sh?v1.9.7|panel.sh?v=1.9.7|g' "$f"; done; pm2 restart nexlify-web --update-env; sleep 3; curl -s http://127.0.0.1:13001/install | grep -o 'panel.sh[^"'\'' ]*' | head -3
'@ -ForegroundColor White
    Write-Host ""
    Write-Host "Option B — WinSCP upload then run:" -ForegroundColor Cyan
    Write-Host "  FROM: $hotfix"
    Write-Host "  TO:   /root/vps-instant-install-url-fix.sh"
    Write-Host "  SSH:  bash /root/vps-instant-install-url-fix.sh"
    Write-Host ""
    Write-Host "Option C — Create windows\deploy.config.json from example, then re-run this script."
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
put "$hotfix" /root/vps-instant-install-url-fix.sh
chmod 755 /root/vps-instant-install-url-fix.sh
call bash /root/vps-instant-install-url-fix.sh
exit
"@
$f = Join-Path $env:TEMP "upload-install-url-hotfix.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

Write-Host "Uploading and running instant install URL fix..." -ForegroundColor Cyan
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Hard-refresh https://nexlify.live/install (Ctrl+Shift+R)" -ForegroundColor Green
