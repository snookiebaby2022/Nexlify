# Deploy /livestream page to nexlify-web on the VPS (app only — does not restart nginx or wipe HLS)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$m = "/var/www/nexlify"
$port = if ($cfg.MarketingPort) { $cfg.MarketingPort } else { "3001" }

$files = @(
  @{ Local = "$root\marketing-drop-in\src\app\layout.tsx"; Remote = "$m/src/app/layout.tsx" },
  @{ Local = "$root\marketing-drop-in\src\app\livestream\page.tsx"; Remote = "$m/src/app/livestream/page.tsx" },
  @{ Local = "$root\marketing-drop-in\src\app\livestream\layout.tsx"; Remote = "$m/src/app/livestream/layout.tsx" },
  @{ Local = "$root\marketing-drop-in\src\app\api\livestream\status\route.ts"; Remote = "$m/src/app/api/livestream/status/route.ts" },
  @{ Local = "$root\marketing-drop-in\src\app\api\livestream\leave\route.ts"; Remote = "$m/src/app/api/livestream/leave/route.ts" },
  @{ Local = "$root\marketing-drop-in\src\components\LivestreamPlayer.tsx"; Remote = "$m/src/components/LivestreamPlayer.tsx" },
  @{ Local = "$root\marketing-drop-in\src\components\MarketingOverlays.tsx"; Remote = "$m/src/components/MarketingOverlays.tsx" },
  @{ Local = "$root\marketing-drop-in\src\components\ConditionalShell.tsx"; Remote = "$m/src/components/ConditionalShell.tsx" },
  @{ Local = "$root\marketing-drop-in\src\lib\livestream.ts"; Remote = "$m/src/lib/livestream.ts" },
  @{ Local = "$root\marketing-drop-in\src\lib\livestream-viewers.ts"; Remote = "$m/src/lib/livestream-viewers.ts" },
  @{ Local = "$root\nginx\nexlify.live-rtmp-hls.conf"; Remote = "/etc/nginx/nexlify.live-rtmp-hls.conf" },
  @{ Local = "$root\scripts\nexlify-hls-720-publish.sh"; Remote = "/opt/nexlify-rtmp/hls-720-publish.sh" }
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
$f = Join-Path $env:TEMP "deploy-livestream.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

$plinkPre = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkPre += "-i", $cfg.PrivateKey } else { $plinkPre += "-pw", $cfg.Password }
$plinkPre += "mkdir -p $m/src/app/livestream $m/src/app/api/livestream/status $m/src/app/api/livestream/leave $m/src/components $m/src/lib"
& $cfg.Plink @plinkPre 2>&1 | Out-Host

& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$remote = @(
  "cd $m",
  "grep -q '^PORT=' .env 2>/dev/null && sed -i 's/^PORT=.*/PORT=$port/' .env || echo PORT=$port >> .env",
  "grep -q '^HOSTNAME=' .env 2>/dev/null && sed -i 's/^HOSTNAME=.*/HOSTNAME=127.0.0.1/' .env || echo HOSTNAME=127.0.0.1 >> .env",
  "grep -q '^NEXT_PUBLIC_LIVESTREAM_HLS_URL=' .env 2>/dev/null && sed -i 's|^NEXT_PUBLIC_LIVESTREAM_HLS_URL=.*|NEXT_PUBLIC_LIVESTREAM_HLS_URL=https://nexlify.live/hls/nexlify.m3u8|' .env || echo NEXT_PUBLIC_LIVESTREAM_HLS_URL=https://nexlify.live/hls/nexlify.m3u8 >> .env",
  "grep -q '^LIVESTREAM_RTMP_SERVER=' .env 2>/dev/null && sed -i 's|^LIVESTREAM_RTMP_SERVER=.*|LIVESTREAM_RTMP_SERVER=rtmp://rtmp.nexlify.live/live|' .env || echo LIVESTREAM_RTMP_SERVER=rtmp://rtmp.nexlify.live/live >> .env",
  "grep -q '^LIVESTREAM_STREAM_KEY=' .env 2>/dev/null && sed -i 's/^LIVESTREAM_STREAM_KEY=.*/LIVESTREAM_STREAM_KEY=nexlify/' .env || echo LIVESTREAM_STREAM_KEY=nexlify >> .env",
  "grep -q '^NEXT_PUBLIC_LIVESTREAM_HLS_720_URL=' .env 2>/dev/null && sed -i 's|^NEXT_PUBLIC_LIVESTREAM_HLS_720_URL=.*|NEXT_PUBLIC_LIVESTREAM_HLS_720_URL=https://nexlify.live/hls/nexlify-720.m3u8|' .env || echo NEXT_PUBLIC_LIVESTREAM_HLS_720_URL=https://nexlify.live/hls/nexlify-720.m3u8 >> .env",
  "mkdir -p /opt/nexlify-rtmp",
  "chmod +x /opt/nexlify-rtmp/hls-720-publish.sh",
  "sed -i 's/\\r$//' /opt/nexlify-rtmp/hls-720-publish.sh",
  "nginx -t && systemctl reload nginx",
  "ss -tn sport = :1935 | grep -q ESTAB && bash /opt/nexlify-rtmp/hls-720-publish.sh nexlify || true",
  "npm install hls.js@1.5.15 --save",
  "npm run build",
  "test -f .next/BUILD_ID || (echo BUILD FAILED && exit 1)",
  "pm2 describe nexlify-web >/dev/null 2>&1 && pm2 restart nexlify-web --update-env || pm2 start npm --name nexlify-web --cwd /var/www/nexlify -- start -- -H 127.0.0.1 -p $port",
  "pm2 save",
  "sleep 3",
  "curl -s http://127.0.0.1:$port/api/livestream/status",
  "pm2 status nexlify-web"
) -join " && "

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += $remote

Write-Host "Deploying livestream player to $($cfg.Host)..." -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $cfg.Plink @plink 2>&1 | ForEach-Object { Write-Host $_ }
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap

if ($code -ne 0) {
  Write-Error "Remote deploy failed (exit $code). Check output above."
}
Write-Host "Done. Open https://nexlify.live/livestream" -ForegroundColor Green
