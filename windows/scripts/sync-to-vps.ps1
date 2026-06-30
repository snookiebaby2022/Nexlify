# Sync project to VPS via WinSCP (excludes node_modules, .next, .env, windows/)
param(
  [switch]$WhatIf
)

. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$hostKeyOpt = ""
if ($cfg.AcceptHostKey) {
  $hostKeyOpt = ' -hostkey="*"'
}

$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$winscpScript = @"
option batch on
option confirm off
$openLine
lcd "$($cfg.ProjectRoot)"
cd "$($cfg.RemotePath)"
synchronize remote -delete=none -filemask="|node_modules/;.next/;.git/;.env;*.db;windows/;.license-keys/;marketing-drop-in/;promo-for-nexlify-web/;src/instrumentation.ts;src/lib/cron-scheduler.ts" -transfer=binary
call rm -f src/instrumentation.ts src/lib/cron-scheduler.ts
call sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
exit
"@

$scriptFile = Join-Path $env:TEMP "nexlify-winscp-sync.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII

Write-Host "Syncing $($cfg.ProjectRoot) -> $($cfg.Username)@$($cfg.Host):$($cfg.RemotePath) ..."
if ($WhatIf) {
  Write-Host "--- WinSCP script ---"
  Get-Content -LiteralPath $scriptFile
  exit 0
}

& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
$code = $LASTEXITCODE
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue

if ($code -ne 0) {
  throw "WinSCP sync failed (exit $code). Connect once in WinSCP GUI if host key is rejected."
}
Write-Host "Sync complete."
