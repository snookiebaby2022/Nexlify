#!/usr/bin/env bash
# Parity smoke: PHP panel vs Next for auth / catalog / zap / connections.
set -euo pipefail

BASE="${SMOKE_BASE:-http://127.0.0.1}"
NEXT="${SMOKE_NEXT:-http://127.0.0.1:13000}"
UA="${SMOKE_UA:-VLC/3.0.20 LibVLC/3.0.20}"
FAIL=0

pass() { echo "  OK   $*"; }
fail() { echo "  FAIL $*"; FAIL=1; }

echo "=== panel-php smoke (base=${BASE}) ==="

echo "[1] health"
if curl -fsS -m 8 "${BASE}/panel-php/health" | grep -q '"ok":true'; then
  pass "panel-php health"
else
  fail "panel-php health"
fi

FIX=""
if [ -f /root/.nexlify-75-playback-fixture.json ]; then
  FIX="$(cat /root/.nexlify-75-playback-fixture.json)"
elif [ -f /opt/nexlify-panel/scripts/ensure-smoke-playback.cjs ]; then
  FIX="$(cd /opt/nexlify-panel && node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1 || true)"
fi

if [ -z "$FIX" ] || ! echo "$FIX" | grep -q '"username"'; then
  echo "[2] skip credentialed checks (no fixture)"
  exit "$FAIL"
fi

U="$(node -e 'console.log(JSON.parse(process.argv[1]).username)' "$FIX")"
P="$(node -e 'console.log(JSON.parse(process.argv[1]).password)' "$FIX")"
SID="$(node -e 'const f=JSON.parse(process.argv[1]); console.log(f.streamId || f.playbackId || f.xtreamId || "")' "$FIX")"
# Prefer numeric stream_id from live catalog when fixture id is stale
curl -fsS -m 30 -A "$UA" "${BASE}/player_api.php?username=${U}&password=${P}&action=get_live_streams" -o /tmp/panel-php-live.json || true
CAT_SID="$(node -e 'const fs=require("fs"); try{const a=JSON.parse(fs.readFileSync("/tmp/panel-php-live.json","utf8")); process.stdout.write(String(a[0]&&a[0].stream_id||""))}catch{process.stdout.write("")}')"
if [ -n "${CAT_SID:-}" ]; then
  SID="$CAT_SID"
fi

echo "[2] player_api auth (PHP)"
PHP_AUTH="$(curl -fsS -m 20 -A "$UA" "${BASE}/player_api.php?username=${U}&password=${P}" || true)"
echo "$PHP_AUTH" | grep -q '"auth":1' && pass "php auth=1" || fail "php auth"
echo "$PHP_AUTH" | grep -qE '"port":"(80|8080|443)"' && pass "php server_info port" || fail "php server_info port"
echo "$PHP_AUTH" | grep -q 'https_port' && pass "php https_port present" || fail "php https_port"

echo "[3] get_live_streams"
LIVE="$(cat /tmp/panel-php-live.json 2>/dev/null || true)"
echo "$LIVE" | grep -q 'stream_id' && pass "live catalog" || fail "live catalog"
COUNT="$(node -e 'const fs=require("fs"); try{console.log(JSON.parse(fs.readFileSync("/tmp/panel-php-live.json","utf8")).length)}catch{console.log(0)}')"
[ "${COUNT:-0}" -gt 0 ] && pass "live count=$COUNT" || fail "live count"

echo "[4] get.php m3u"
M3U_CODE="$(curl -sS -m 60 -A "$UA" -o /tmp/panel-php-smoke.m3u -w '%{http_code}' "${BASE}/get.php?username=${U}&password=${P}&type=m3u_plus&output=ts" || echo 000)"
grep -q '^#EXTM3U' /tmp/panel-php-smoke.m3u 2>/dev/null && pass "m3u http=$M3U_CODE" || fail "m3u"

echo "[5] xmltv.php + epg.php"
XML_CODE="$(curl -sS -m 30 -A "$UA" -o /tmp/panel-php-smoke.xml -w '%{http_code}' "${BASE}/xmltv.php?username=${U}&password=${P}" || echo 000)"
[ "$XML_CODE" = "200" ] && pass "xmltv http=$XML_CODE" || fail "xmltv http=$XML_CODE"
EPG_CODE="$(curl -sS -m 30 -A "$UA" -o /tmp/panel-php-smoke-epg.xml -w '%{http_code}' "${BASE}/epg.php?username=${U}&password=${P}" || echo 000)"
[ "$EPG_CODE" = "200" ] && pass "epg.php http=$EPG_CODE" || fail "epg.php http=$EPG_CODE"
PL_CODE="$(curl -sS -m 30 -A "$UA" -o /dev/null -w '%{http_code}' "${BASE}/playlist.php?username=${U}&password=${P}&type=m3u_plus&output=ts" || echo 000)"
[ "$PL_CODE" = "200" ] && pass "playlist.php http=$PL_CODE" || fail "playlist.php"

echo "[5b] xplugin/progress/constants/init"
for ep in xplugin.php progress.php constants.php init.php; do
  C="$(curl -sS -m 10 -A "$UA" -o /tmp/panel-php-$ep.out -w '%{http_code}' "${BASE}/${ep}?username=${U}&password=${P}" || echo 000)"
  [ "$C" = "200" ] && pass "$ep http=$C" || fail "$ep http=$C"
done
RTMP_C="$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "${BASE}/rtmp.php" || echo 000)"
[ "$RTMP_C" = "501" ] || [ "$RTMP_C" = "200" ] && pass "rtmp.php http=$RTMP_C" || fail "rtmp.php http=$RTMP_C"

echo "[6] live-auth headers"
SECRET=""
if [ -f /etc/nexlify-panel/panel.env ]; then
  SECRET="$(grep '^PANEL_INTERNAL_SECRET=' /etc/nexlify-panel/panel.env | head -1 | cut -d= -f2-)"
fi
if [ -z "$SECRET" ] && [ -f /opt/nexlify-panel/.env ]; then
  SECRET="$(grep '^PANEL_INTERNAL_SECRET=' /opt/nexlify-panel/.env | head -1 | cut -d= -f2- | tr -d '"' )"
fi
if [ -n "$SECRET" ] && [ -n "$SID" ]; then
  URI="/live/${U}/${P}/${SID}.ts"
  AUTH_HDRS="$(curl -sS -m 10 -D - -o /dev/null \
    -H "Authorization: Bearer ${SECRET}" \
    -H "X-Panel-Internal-Secret: ${SECRET}" \
    -H "X-Original-Uri: ${URI}" \
    "${BASE}/api/internal/live-auth" || true)"
  echo "$AUTH_HDRS" | grep -qi 'X-Nexlify-Upstream:' && pass "live-auth upstream" || fail "live-auth upstream"
  echo "$AUTH_HDRS" | grep -qi 'X-Nexlify-Line-Id:' && pass "live-auth line" || fail "live-auth line"
  echo "$AUTH_HDRS" | grep -qi 'X-Nexlify-Stream-Id:' && pass "live-auth stream" || fail "live-auth stream"
else
  echo "  skip live-auth (no secret/sid)"
fi

echo "[7] zap .ts (classic-lb via Main)"
if [ -n "$SID" ]; then
  TS_URL="${BASE}/live/${U}/${P}/${SID}.ts"
  # Live MPEG-TS is an endless chunked stream — do NOT use Range (LB ignores it → 0 bytes).
  # Pull until timeout; success = first byte 0x47 and enough payload.
  rm -f /tmp/panel-php-smoke.ts
  TS_CODE="$(curl -sS -m 8 -A "$UA" -o /tmp/panel-php-smoke.ts -w '%{http_code}' "$TS_URL" 2>/dev/null || true)"
  TS_CODE="$(printf '%s' "$TS_CODE" | tr -cd '0-9' | head -c 3)"
  # curl -m on endless stream often exits 28 with http_code blank — treat as 200 if magic ok
  TS_BYTES="$(wc -c < /tmp/panel-php-smoke.ts 2>/dev/null | tr -d ' ' || echo 0)"
  TS_MAGIC="$(od -An -t x1 -N 1 /tmp/panel-php-smoke.ts 2>/dev/null | tr -d ' ')"
  if [ "${TS_BYTES:-0}" -gt 10000 ] && [ "$TS_MAGIC" = "47" ]; then
    pass "zap ts http=${TS_CODE:-200} bytes=${TS_BYTES}"
  else
    fail "zap ts http=${TS_CODE:-000} bytes=${TS_BYTES} magic=${TS_MAGIC:-?}"
  fi
  [ "${TS_CODE:-000}" != "302" ] && pass "no 302 on media" || fail "302 on media"

  echo "[7b] token /live/{token}/{id}.ts + /play/{token} + /auth/{token}"
  TOK="$(php -r '
    require "/opt/nexlify-panel-php/php/lib.php";
    echo Nexlify\PanelPhp\mint_play_token($argv[1], $argv[2], $argv[3], 3600);
  ' "$U" "$P" "$SID" 2>/dev/null || true)"
  if [ -n "${TOK:-}" ]; then
    AUTH_C="$(curl -sS -m 8 -o /dev/null -w '%{http_code}' -A "$UA" "${BASE}/auth/${TOK}" || echo 000)"
    [ "$AUTH_C" = "200" ] && pass "auth/token http=$AUTH_C" || fail "auth/token http=$AUTH_C"
    rm -f /tmp/panel-php-tok.ts
    timeout 6 curl -sS -A "$UA" -o /tmp/panel-php-tok.ts "${BASE}/live/${TOK}/${SID}.ts" 2>/dev/null || true
    TOK_BYTES="$(wc -c < /tmp/panel-php-tok.ts 2>/dev/null | tr -d ' ' || echo 0)"
    TOK_MAGIC="$(od -An -t x1 -N 1 /tmp/panel-php-tok.ts 2>/dev/null | tr -d ' ')"
    if [ "${TOK_BYTES:-0}" -gt 5000 ] && [ "$TOK_MAGIC" = "47" ]; then
      pass "token live ts bytes=$TOK_BYTES"
    else
      fail "token live ts bytes=${TOK_BYTES} magic=${TOK_MAGIC:-?}"
    fi
    PLAY_TOK="$(php -r '
      require "/opt/nexlify-panel-php/php/lib.php";
      echo Nexlify\PanelPhp\mint_play_token($argv[1], $argv[2], $argv[3], 3600);
    ' "$U" "$P" "$SID" 2>/dev/null || true)"
    rm -f /tmp/panel-php-play.ts
    timeout 6 curl -sS -A "$UA" -o /tmp/panel-php-play.ts "${BASE}/play/${PLAY_TOK}.ts" 2>/dev/null || true
    PLAY_BYTES="$(wc -c < /tmp/panel-php-play.ts 2>/dev/null | tr -d ' ' || echo 0)"
    PLAY_MAGIC="$(od -An -t x1 -N 1 /tmp/panel-php-play.ts 2>/dev/null | tr -d ' ')"
    if [ "${PLAY_BYTES:-0}" -gt 5000 ] && [ "$PLAY_MAGIC" = "47" ]; then
      pass "play/token ts bytes=$PLAY_BYTES"
    else
      fail "play/token ts bytes=${PLAY_BYTES} magic=${PLAY_MAGIC:-?}"
    fi
  else
    fail "mint_play_token failed"
  fi
fi

echo "[8] optional Next compare"
if curl -fsS -m 5 "${NEXT}/api/health" >/dev/null 2>&1; then
  curl -fsS -m 20 -A "$UA" "${NEXT}/player_api.php?username=${U}&password=${P}" -o /tmp/panel-php-next-auth.json || true
  printf '%s' "$PHP_AUTH" > /tmp/panel-php-auth.json
  PHP_PORT="$(node -e 'const fs=require("fs"); try{console.log(JSON.parse(fs.readFileSync("/tmp/panel-php-auth.json","utf8")).server_info.port)}catch{console.log("")}')"
  NEXT_PORT="$(node -e 'const fs=require("fs"); try{console.log(JSON.parse(fs.readFileSync("/tmp/panel-php-next-auth.json","utf8")).server_info.port)}catch{console.log("")}')"
  if [ -n "$PHP_PORT" ] && [ "$PHP_PORT" = "$NEXT_PORT" ]; then
    pass "port parity php=$PHP_PORT next=$NEXT_PORT"
  else
    echo "  WARN port php=${PHP_PORT:-?} next=${NEXT_PORT:-?} (informational)"
  fi
else
  echo "  skip Next compare (unreachable)"
fi

echo "=== done fail=${FAIL} ==="
exit "$FAIL"
