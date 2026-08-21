# Upload fix files and kick off rebuild on multiple servers (no wait/poll).
param(
  [hashtable[]]$Targets = @(
    @{ Host = "75.119.137.174"; Password = "CkfUCKD6blClbTegdE9jYoO0vB7fR"; Path = "/opt/nexlify-panel" },
    @{ Host = "45.88.138.18"; Password = "sufc196528"; Path = "/opt/nexlify-panel" }
  )
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$hostKey = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }

$files = @(
  "package.json",
  "src/lib/panel-releases.json",
  "src/lib/connections.ts",
  "src/lib/connection-pulse.ts",
  "src/lib/connection-quality-live.ts",
  "src/lib/connection-quality.ts",
  "src/lib/hls-live-auth.ts",
  "src/app/api/internal/live-auth/route.ts",
  "scripts/iptv-edge-proxy.mjs"
)

foreach ($t in $Targets) {
  $remote = $t.Path
  $puts = ($files | ForEach-Object {
    "put `"$(Join-Path $root $_)`" `"$remote/$($_ -replace '\\','/')`""
  }) -join "`n"

  $winscp = @"
option batch on
option confirm off
open sftp://root:$($t.Password)@$($t.Host):22/$hostKey
lcd "$root"
$puts
exit
"@
  $sf = Join-Path $env:TEMP "nexlify-par-$($t.Host).txt"
  Set-Content -LiteralPath $sf -Value $winscp -Encoding ASCII
  Write-Host "[$($t.Host)] uploading $($files.Count) files..."
  & $cfg.WinScp "/ini=nul" "/script=$sf"
  Remove-Item $sf -Force -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { throw "$($t.Host) upload failed" }

  $cmd = 'cd ' + $remote + ' && rm -rf .next.staging && (nohup bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-fast-rebuild.log 2>&1 </dev/null &) && sleep 1 && echo REBUILD_STARTED'
  Write-Host "[$($t.Host)] starting background rebuild..."
  $out = & $cfg.Plink -batch -ssh "root@$($t.Host)" -pw $t.Password $cmd 2>&1 | Out-String
  Write-Host $out.Trim()
  if ($out -notmatch "REBUILD_STARTED") { throw "$($t.Host) rebuild kickoff failed: $out" }
  Write-Host "[$($t.Host)] OK" -ForegroundColor Green
}

Write-Host ""
Write-Host "Both servers uploaded. Rebuilds running in background (~5 min each)." -ForegroundColor Cyan
Write-Host "Tail log: plink root@HOST tail -f /tmp/nexlify-fast-rebuild.log" -ForegroundColor DarkGray
