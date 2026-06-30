# Deploy comprehensive marketing SEO to nexlify-web
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot

$seoFiles = @(
  "src\lib\seo.ts",
  "src\app\layout.tsx",
  "src\app\page.tsx",
  "src\app\sitemap.ts",
  "src\app\robots.ts",
  "src\app\pricing\page.tsx",
  "src\app\install\page.tsx",
  "src\app\register\page.tsx",
  "src\app\features\page.tsx",
  "src\app\help\page.tsx",
  "src\app\demo\page.tsx",
  "src\components\Hero.tsx",
  "src\components\HomeSeoContent.tsx",
  "src\components\JsonLd.tsx",
  "src\components\BreadcrumbJsonLd.tsx",
  "src\components\PricingJsonLd.tsx",
  "src\components\FaqJsonLd.tsx",
  "public\nexlifyindexnow2026seokey48chars00.txt"
)

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$plinkPre = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkPre += "-i", $cfg.PrivateKey } else { $plinkPre += "-pw", $cfg.Password }
$plinkPre += "mkdir -p /tmp/marketing-seo-drop-in/src/{lib,app/{pricing,install,register,features,help,demo},components} /tmp/marketing-seo-drop-in/public"
& $cfg.Plink @plinkPre

$mkdirLines = ""

$putLines = ($seoFiles | ForEach-Object {
  $local = Join-Path $root "marketing-drop-in\$_"
  $remote = "/tmp/marketing-seo-drop-in/$_".Replace("\", "/")
  "put `"$local`" $remote"
}) -join "`n"

$patchPy = Join-Path $root "scripts\patch-marketing-seo.py"
$winscp = @"
option batch on
option confirm off
$openLine
$mkdirLines
put "$patchPy" /tmp/patch-marketing-seo.py
$putLines
exit
"@
$f = Join-Path $env:TEMP "deploy-marketing-seo.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$remote = @(
  "python3 /tmp/patch-marketing-seo.py",
  "cd /var/www/nexlify && npm run build",
  "pm2 restart nexlify-web --update-env"
) -join " && "

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += $remote
& $cfg.Plink @plink

exit $LASTEXITCODE
