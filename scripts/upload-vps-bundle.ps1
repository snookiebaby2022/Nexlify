# One file upload fixes everything on VPS. Run on PC after git pull:
#   powershell -ExecutionPolicy Bypass -File scripts\upload-vps-bundle.ps1
#
# Requires windows\deploy.config.json (copy from deploy.config.example.json)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

# Sync + build bundle
& "$Root\scripts\nexlify-sync-all.ps1"

$bundle = "$Root\marketing-drop-in\scripts\vps-full-update.sh"
if (-not (Test-Path $bundle)) { throw "Bundle missing: $bundle" }

$config = Join-Path $Root "windows\deploy.config.json"
if (-not (Test-Path $config)) {
    Write-Host ""
    Write-Host "MANUAL: WinSCP upload $bundle to /root/vps-full-update.sh" -ForegroundColor Yellow
    Write-Host "Then VPS: bash /root/vps-full-update.sh" -ForegroundColor Yellow
    exit 0
}

. "$Root\windows\scripts\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
    "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
    "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$winscp = @"
option batch on
option confirm off
$openLine
put "$bundle" /root/vps-full-update.sh
exit
"@
$f = Join-Path $env:TEMP "upload-vps-bundle.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "bash /root/vps-full-update.sh"
& $cfg.Plink @plink

Write-Host "Done." -ForegroundColor Green
