# Deploy marketing v1.5.3: features, coupon popup, llms.txt
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$root = $cfg.ProjectRoot
$files = @(
  @{ Local = "$root\marketing-drop-in\src\app\features\page.tsx"; Remote = "/var/www/nexlify/src/app/features/page.tsx" },
  @{ Local = "$root\marketing-drop-in\src\components\CouponLaunchPopup.tsx"; Remote = "/var/www/nexlify/src/components/CouponLaunchPopup.tsx" },
  @{ Local = "$root\marketing-drop-in\public\llms.txt"; Remote = "/var/www/nexlify/public/llms.txt" },
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
mkdir /var/www/nexlify/src/app/features
mkdir /var/www/nexlify/src/components
$putLines
exit
"@
$f = Join-Path $env:TEMP "deploy-marketing-v153.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += "python3 /tmp/patch-marketing-coupon-popup.py && cd /var/www/nexlify && npm run build && pm2 restart nexlify-web --update-env"
& $cfg.Plink @plink
exit $LASTEXITCODE
