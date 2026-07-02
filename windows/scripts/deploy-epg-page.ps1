. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$m = "/var/www/nexlify"
$file = Join-Path $root "marketing-drop-in\src\app\epg\page.tsx"
$scriptFile = Join-Path $env:TEMP "nexlify-epg-deploy.txt"
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/ -hostkey=`"*`" -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/ -hostkey=`"*`""
}
$winscpScript = @"
option batch on
option confirm off
$openLine
lcd "$(Join-Path $root "marketing-drop-in")"
put "src\app\epg\page.tsx" "$m/src/app/epg/page.tsx"
exit
"@
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
Write-Host "Uploading EPG page..."
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed" }
$a = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $a += "-i", $cfg.PrivateKey } else { $a += "-pw", $cfg.Password }
Write-Host "Rebuilding nexlify-web..."
& $cfg.Plink @a "cd $m && npm run build && pm2 restart nexlify-web --update-env && echo EPG_DEPLOY_OK"
