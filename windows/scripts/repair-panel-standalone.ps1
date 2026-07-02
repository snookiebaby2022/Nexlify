# Fix panel client-side crash — copy missing standalone static assets + restart PM2
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$remotePanel = if ($cfg.RemotePath) { $cfg.RemotePath } else { "/home/nexlify-panel" }

$files = @(
  "scripts\vps-repair-standalone.sh",
  "scripts\prepare-standalone.sh",
  "scripts\verify-standalone.sh",
  "scripts\deploy-vps.sh",
  "scripts\pm2-start.sh",
  "scripts\ensure-marketing-env.sh",
  "marketing-drop-in\src\lib\webplayer-proxy.ts",
  "marketing-drop-in\src\app\api\webplayer\xtream\route.ts",
  "marketing-drop-in\src\app\webplayer\page.tsx"
)

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$putLines = @()
foreach ($rel in $files) {
  $local = Join-Path $root $rel
  if ($rel -like "marketing-drop-in*") {
    $remote = "/var/www/nexlify/src/" + ($rel -replace '\\','/' -replace '^marketing-drop-in/src/','')
  } else {
    $remote = "$remotePanel/" + ($rel -replace '\\','/')
  }
  $putLines += "put `"$local`" $remote"
}
$putBlock = $putLines -join "`n"

$winscp = @"
option batch on
option confirm off
$openLine
$putBlock
exit
"@
$f = Join-Path $env:TEMP "repair-standalone.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

$plinkPre = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkPre += "-i", $cfg.PrivateKey } else { $plinkPre += "-pw", $cfg.Password }
$plinkPre += "mkdir -p $remotePanel/scripts /var/www/nexlify/src/lib /var/www/nexlify/src/app/api/webplayer/xtream /var/www/nexlify/src/app/webplayer"
& $cfg.Plink @plinkPre 2>&1 | Out-Host

& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$remote = @"
sed -i 's/\r$//' $remotePanel/scripts/vps-repair-standalone.sh $remotePanel/scripts/prepare-standalone.sh $remotePanel/scripts/verify-standalone.sh $remotePanel/scripts/pm2-start.sh $remotePanel/scripts/deploy-vps.sh $remotePanel/scripts/ensure-marketing-env.sh
chmod +x $remotePanel/scripts/vps-repair-standalone.sh $remotePanel/scripts/prepare-standalone.sh $remotePanel/scripts/verify-standalone.sh
bash $remotePanel/scripts/vps-repair-standalone.sh
bash $remotePanel/scripts/ensure-marketing-env.sh /var/www/nexlify
cd /var/www/nexlify && npm run build && pm2 restart nexlify-web --update-env
"@

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += $remote

Write-Host "Repairing panel standalone + marketing webplayer..." -ForegroundColor Cyan
& $cfg.Plink @plink 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { Write-Error "Repair failed (exit $LASTEXITCODE)" }

Write-Host "Done - hard-refresh panel.nexlify.live in your browser" -ForegroundColor Green
