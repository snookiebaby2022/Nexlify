# Generate MP4 + deploy TikTok promo to /var/www/nexlify
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$panel = $cfg.RemotePath
$m = "/var/www/nexlify"

Write-Host "Syncing panel repo..." -ForegroundColor Cyan
& "$PSScriptRoot\sync-to-vps.ps1"

$remoteCmd = @"
set -e
chmod +x $panel/scripts/generate-tiktok-promo-mp4.sh
bash $panel/scripts/generate-tiktok-promo-mp4.sh $m/public/promo/nexlify-tiktok-ad.mp4
mkdir -p $m/src/components/promo $m/src/app/promo/tiktok $m/public/promo
cp $panel/marketing-drop-in/src/components/promo/TikTokSellAd.tsx $m/src/components/promo/TikTokSellAd.tsx
cp $panel/marketing-drop-in/src/app/promo/tiktok/page.tsx $m/src/app/promo/tiktok/page.tsx
cd $m
npm run build
pm2 restart nexlify-web --update-env
pm2 save
curl -sI http://127.0.0.1:3001/promo/nexlify-tiktok-ad.mp4 | head -3
curl -sI http://127.0.0.1:3001/promo/tiktok | head -3
echo OK
"@ -replace "`r",""

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd

Write-Host "Generating MP4 + deploying to $($cfg.Host)..." -ForegroundColor Cyan
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Deploy failed (plink exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "Download:" -ForegroundColor Green
Write-Host "  https://nexlify.live/promo/nexlify-tiktok-ad.mp4"
Write-Host "  https://nexlify.live/promo/tiktok"
