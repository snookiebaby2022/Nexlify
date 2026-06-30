. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = @'
set -e
cd /home/nexlify-panel
PORT=$(grep '^PORT=' .env | head -1 | cut -d= -f2- | tr -d '\r')
PORT=${PORT:-13000}
BASE="http://127.0.0.1:${PORT}"
echo "=== Smoke test on $BASE ==="
for path in /api/health /login /admin/settings/general /admin/management/tools/bulk-backup-urls /admin/servers/nginx-config /admin/enigmas/bouquet-tools /webplayer; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE$path" || echo ERR)
  echo "$code $path"
done
echo "=== Auth API (expect 403) ==="
curl -sS "$BASE/api/admin/sports/upcoming" | head -c 200
echo ""
curl -sS "$BASE/api/admin/settings?group=live-sports" | head -c 200
echo ""
echo "=== PM2 ==="
pm2 jlist | node -e "const l=JSON.parse(require('fs').readFileSync(0,'utf8')); const n=l.find(x=>x.name==='nexlify'); console.log('nexlify', n?.pm2_env?.status, 'version', n?.pm2_env?.version);"
'@
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd
& $cfg.Plink @plinkArgs
