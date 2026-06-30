#!/usr/bin/env bash
# Full Nexlify panel + IPTV smoke audit (run on VPS as root from panel dir).
set -uo pipefail

PANEL_DIR="${PANEL_DIR:-}"
for d in /home/nexlify-panel /opt/nexlify-panel "$(pwd)"; do
  if [ -f "${d}/package.json" ] && [ -f "${d}/.env" ]; then
    PANEL_DIR="$d"
    break
  fi
done
[ -n "$PANEL_DIR" ] || { echo "FAIL: panel directory not found"; exit 1; }
cd "$PANEL_DIR"

FAIL=0
warn() { echo "WARN: $*"; }
fail() { echo "FAIL: $*"; FAIL=1; }
ok() { echo "OK: $*"; }

echo "=== Nexlify full audit ==="
echo "Panel dir: $PANEL_DIR"
VER=$(grep '"version"' package.json | head -1 | sed 's/[^0-9.]//g')
echo "Version: $VER"
echo ""

echo "--- PM2 ---"
pm2 jlist 2>/dev/null | node -e "
const l=JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const x of l.filter(p=>p.name?.startsWith('nexlify'))) {
  console.log(x.name, x.pm2_env?.status, 'v'+(x.pm2_env?.version||'?'), 'restarts', x.pm2_env?.restart_time||0);
}
" 2>/dev/null || pm2 list | head -10

PORT=$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || echo 13000)
PORT=${PORT:-13000}
BASE="http://127.0.0.1:${PORT}"
echo ""
echo "--- Panel upstream ($BASE) ---"
for path in /api/health /login /player_api.php /get.php /webplayer; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$path" 2>/dev/null || echo 000)
  case "$path" in
    /player_api.php|/get.php) [ "$code" = "400" ] || [ "$code" = "401" ] && ok "$path HTTP $code" || fail "$path HTTP $code (expected 400/401)" ;;
    *) [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "308" ] && ok "$path HTTP $code" || fail "$path HTTP $code" ;;
  esac
done

echo ""
echo "--- IPTV server_info port check ---"
# Invalid creds still returns structure; grep port field from valid-shaped response
INFO=$(curl -sS --max-time 10 "$BASE/player_api.php?username=__audit__&password=__audit__" 2>/dev/null || echo "")
if echo "$INFO" | grep -q '"port"'; then
  P=$(echo "$INFO" | node -e "let j='';process.stdin.on('data',d=>j+=d);process.stdin.on('end',()=>{try{const o=JSON.parse(j);console.log(o.server_info?.port||'?')}catch{console.log('parse_err')}})" 2>/dev/null || echo "?")
  BEHIND=$(grep '^PANEL_BEHIND_NGINX=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r')
  PRIMARY=$(grep '^PANEL_PRIMARY_DOMAIN=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r' | tr -d '"')
  if [ "$BEHIND" = "1" ] && [[ "$PRIMARY" != *.*.*.* ]] && [ "$P" = "8080" ]; then
    fail "server_info.port=$P on HTTPS domain — Smarters will hit blocked :8080 (expected 443)"
  else
    ok "server_info.port=$P (domain=$PRIMARY behind_nginx=$BEHIND)"
  fi
else
  warn "Could not parse player_api server_info (auth response: ${INFO:0:80})"
fi

echo ""
echo "--- Nginx / ports ---"
BEHIND=$(grep '^PANEL_BEHIND_NGINX=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r')
PRIMARY=$(grep '^PANEL_PRIMARY_DOMAIN=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r' | tr -d '"')
IP_INSTALL=0
if [[ "$PRIMARY" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [ "$BEHIND" = "0" ]; then
  IP_INSTALL=1
fi
if [ -x scripts/verify-panel-ports.sh ]; then
  bash scripts/verify-panel-ports.sh 2>&1 | while read -r line; do
    if [ "$IP_INSTALL" = "1" ] && echo "$line" | grep -qE '443|13000'; then
      echo "SKIP (IP install): $line"
      continue
    fi
    case "$line" in
      *FAIL*) fail "${line#*FAIL }" ;;
      *WARN*) warn "${line#*WARN }" ;;
      *OK*) ok "${line#*OK }" ;;
      *) echo "$line" ;;
    esac
  done
else
  warn "verify-panel-ports.sh missing"
fi

echo ""
echo "--- Update job ---"
if [ -f .update-progress.json ]; then
  ST=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.update-progress.json','utf8')).status)" 2>/dev/null || echo unknown)
  if [ "$ST" = "running" ]; then
    AGE=$(node -e "const j=JSON.parse(require('fs').readFileSync('.update-progress.json','utf8')); const t=Date.parse(j.startedAt||0); console.log(t?Math.floor((Date.now()-t)/60000):999)" 2>/dev/null || echo 999)
    if [ "$AGE" -gt 30 ]; then
      fail "update job stuck running for ${AGE}m — clear .update-progress.json or re-run update"
    else
      warn "update job running (${AGE}m)"
    fi
  else
    ok "update job status=$ST"
  fi
else
  ok "no update job file"
fi

echo ""
echo "--- Critical scripts ---"
for f in scripts/has-valid-next-build.sh scripts/apply-panel-fast-update.sh scripts/sync-panel-ports.sh scripts/fix-stream-edge-now.sh; do
  [ -x "$f" ] || [ -f "$f" ] && ok "$f present" || fail "$f missing"
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "=== AUDIT PASSED ==="
  exit 0
else
  echo "=== AUDIT FAILED ($FAIL issue(s)) ==="
  exit 1
fi
