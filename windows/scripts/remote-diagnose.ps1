$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = @"
echo '=== pm2 describe nexlify ==='
pm2 describe nexlify 2>/dev/null | head -40
echo '=== pm2 list ==='
pm2 list
echo '=== ss 3000 3002 443 ==='
ss -tlnp | grep -E ':3000|:3002|:443' || true
echo '=== curl panel health ==='
curl -sS -w '\nHTTP %{http_code}\n' http://127.0.0.1:3000/api/health || true
echo '=== curl panel login head ==='
curl -sS http://127.0.0.1:3000/login 2>/dev/null | head -c 400
echo ''
echo '=== nginx sites ==='
ls -la /etc/nginx/sites-enabled/ 2>/dev/null
echo '=== find marketing dirs ==='
ls -d /home/nexlify* /var/www/*nexlify* 2>/dev/null || true
echo '=== .env PORT lines ==='
grep -E '^PORT=|^WEBSITE|^PANEL_' /home/nexlify-panel/.env 2>/dev/null | head -20
"@
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd
& $cfg.Plink @plinkArgs 2>&1
