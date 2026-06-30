. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$file = Join-Path $root "scripts\apply-panel-fast-update.sh"
$scriptFile = Join-Path $env:TEMP "nexlify-apply-sync.txt"
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/ -hostkey=`"*`" -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/ -hostkey=`"*`""
}
$winscpScript = @"
option batch on
option confirm off
$openLine
lcd "$root"
put "$file" "$($cfg.RemotePath)/scripts/apply-panel-fast-update.sh"
exit
"@
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP failed" }
$a = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $a += "-i", $cfg.PrivateKey } else { $a += "-pw", $cfg.Password }
& $cfg.Plink @a "sed -i 's/\r$//' $($cfg.RemotePath)/scripts/apply-panel-fast-update.sh; chmod +x $($cfg.RemotePath)/scripts/apply-panel-fast-update.sh; grep -c 'pm2 stop nexlify' $($cfg.RemotePath)/scripts/apply-panel-fast-update.sh"
Write-Host "Re-publishing tarball with fixed apply script..."
& $cfg.Plink @a "cd $($cfg.RemotePath) && bash scripts/publish-panel-release.sh"
