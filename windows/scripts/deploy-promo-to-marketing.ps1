# Copy promo landing from nexlify-panel into /var/www/nexlify on the VPS and rebuild marketing app.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$panel = $cfg.RemotePath
$marketing = "/var/www/nexlify"

$remoteCmd = @"
set -e
mkdir -p $marketing/src/app/promo $marketing/src/components
cp $panel/promo-for-nexlify-web/app/promo/page.tsx $marketing/src/app/promo/page.tsx
cp $panel/promo-for-nexlify-web/components/promo-landing.tsx $marketing/src/components/promo-landing.tsx
cd $marketing
npm run build
pm2 restart nexlify-web --update-env
pm2 save
curl -sI http://127.0.0.1:3001/promo | head -3
echo DONE
"@ -replace "`r",""

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd

Write-Host "Deploying /promo to $marketing on $($cfg.Host)..." -ForegroundColor Cyan
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Deploy failed (plink exit $LASTEXITCODE)" }
Write-Host "Live: https://nexlify.live/promo?utm_source=tiktok&utm_medium=video&utm_campaign=operators" -ForegroundColor Green
