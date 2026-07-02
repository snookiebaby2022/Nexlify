# Generate demo walkthrough MP4 + deploy to /var/www/nexlify
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$panel = $cfg.RemotePath
$m = "/var/www/nexlify"

Write-Host "Syncing panel repo..." -ForegroundColor Cyan
& "$PSScriptRoot\sync-to-vps.ps1"

$remoteCmd = @"
set -e
command -v espeak-ng >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq espeak-ng)
chmod +x $panel/scripts/generate-tiktok-demo-mp4.sh
bash $panel/scripts/generate-tiktok-demo-mp4.sh $m/public/promo/nexlify-tiktok-demo.mp4
pm2 restart nexlify-web --update-env || true
mkdir -p $m/src/components/promo $m/src/app/promo/tiktok-demo $m/public/promo
cp $panel/marketing-drop-in/src/components/promo/TikTokDemoWalkthrough.tsx $m/src/components/promo/TikTokDemoWalkthrough.tsx
cp $panel/marketing-drop-in/src/app/promo/tiktok-demo/page.tsx $m/src/app/promo/tiktok-demo/page.tsx
cd $m
npm run build
pm2 restart nexlify-web --update-env
pm2 save
curl -sI http://127.0.0.1:3001/promo/nexlify-tiktok-demo.mp4 | head -3
curl -sI http://127.0.0.1:3001/promo/tiktok-demo | head -3
echo OK
"@ -replace "`r",""

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd

Write-Host "Generating demo MP4 + deploying to $($cfg.Host)..." -ForegroundColor Cyan
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Deploy failed (plink exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "Record or download:" -ForegroundColor Green
Write-Host "  https://nexlify.live/promo/tiktok-demo   (animated - screen record this)"
Write-Host "  https://nexlify.live/promo/nexlify-tiktok-demo.mp4"
Write-Host "Demo panel:" -ForegroundColor Green
Write-Host "  https://panel.demo.nexlify.live"
