# Deploy marketing coupon: 3-month offer, trial users, checkout wiring
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot

$files = @(
  @{ Local = "$root\marketing-drop-in\src\components\CouponLaunchPopup.tsx"; Remote = "/var/www/nexlify/src/components/CouponLaunchPopup.tsx" },
  @{ Local = "$root\marketing-drop-in\src\components\TrialCouponBanner.tsx"; Remote = "/var/www/nexlify/src/components/TrialCouponBanner.tsx" },
  @{ Local = "$root\marketing-drop-in\src\components\TrialCouponRedirect.tsx"; Remote = "/var/www/nexlify/src/components/TrialCouponRedirect.tsx" },
  @{ Local = "$root\marketing-drop-in\src\lib\marketing-coupon.ts"; Remote = "/var/www/nexlify/src/lib/marketing-coupon.ts" },
  @{ Local = "$root\marketing-drop-in\src\app\api\trial\status\route.ts"; Remote = "/var/www/nexlify/src/app/api/trial/status/route.ts" },
  @{ Local = "$root\marketing-drop-in\src\app\api\checkout\route.ts"; Remote = "/var/www/nexlify/src/app/api/checkout/route.ts" },
  @{ Local = "$root\scripts\patch-marketing-trial-coupon.py"; Remote = "/tmp/patch-marketing-trial-coupon.py" },
  @{ Local = "$root\scripts\patch-marketing-dashboard-coupon-redirect.py"; Remote = "/tmp/patch-marketing-dashboard-coupon-redirect.py" },
  @{ Local = "$root\scripts\patch-marketing-coupon-popup.py"; Remote = "/tmp/patch-marketing-coupon-popup.py" }
)

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$putLines = ($files | ForEach-Object { "put `"$($_.Local)`" $($_.Remote)" }) -join "`n"
$winscp = @"
option batch on
option confirm off
$openLine
$putLines
exit
"@
$f = Join-Path $env:TEMP "deploy-marketing-coupon-trial.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

$plinkPre = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkPre += "-i", $cfg.PrivateKey } else { $plinkPre += "-pw", $cfg.Password }
$plinkPre += "mkdir -p /var/www/nexlify/src/app/api/trial/status"
& $cfg.Plink @plinkPre

& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$remote = @(
  "python3 /tmp/patch-marketing-trial-coupon.py",
  "python3 /tmp/patch-marketing-dashboard-coupon-redirect.py",
  "python3 /tmp/patch-marketing-coupon-popup.py",
  "cd /var/www/nexlify && npx prisma db push --accept-data-loss && npx prisma generate",
  "cd /var/www/nexlify && npm run build",
  "pm2 restart nexlify-web --update-env"
) -join " && "

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += $remote
& $cfg.Plink @plink
exit $LASTEXITCODE
