#!/usr/bin/env bash
# One-stream max-concurrency smoke against classic LB (or panel advertise host).
#
# Does NOT hit the provider once per viewer when classic-LB is warm (shared packager).
# Still pulls MPEG-TS bytes from the LB — use a dedicated test window.
#
# Usage on panel host:
#   STREAM_ID=cmu5anma60002kvxc66spnb2l \
#   LB_HOST=http://127.0.0.1:8080 \
#   CONCURRENCY=100 DURATION=60 \
#   bash scripts/smoke-one-stream-concurrency.sh
#
# Max LB media workers (default when CONCURRENCY unset):
#   bash scripts/smoke-one-stream-concurrency.sh
#
# Safer auth-only (no media body):
#   METHOD=head bash scripts/smoke-one-stream-concurrency.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

detect_media_max() {
  local f max=0 n
  for f in /etc/php/*/fpm/pool.d/nexlify-lb-media.conf; do
    [ -f "$f" ] || continue
    n="$(grep -E '^pm.max_children\s*=' "$f" | awk -F= '{gsub(/ /,"",$2); print $2}' | head -1)"
    if [ -n "$n" ] && [ "$n" -gt "$max" ] 2>/dev/null; then
      max="$n"
    fi
  done
  if [ "$max" -le 0 ]; then
    max=50
  fi
  echo "$max"
}

STREAM_ID="${STREAM_ID:-}"
LB_HOST="${LB_HOST:-}"
if [ -z "$LB_HOST" ]; then
  if curl -fsS -m 2 http://127.0.0.1:8090/lb/health >/dev/null 2>&1; then
    LB_HOST="http://127.0.0.1:8090"
  else
    LB_HOST="http://127.0.0.1:8080"
  fi
fi
CONCURRENCY="${CONCURRENCY:-$(detect_media_max)}"
DURATION="${DURATION:-45}"
METHOD="${METHOD:-media}"
MEDIA_MS="${MEDIA_MS:-8000}"
LINES="${LINES:-$CONCURRENCY}"

# Ensure load-test lines can access STREAM_ID (one-stream smoke needs bouquet grant).
ensure_loadtest_stream_access() {
  local sid="$1"
  [ -n "$sid" ] || return 0
  node -e '
const {PrismaClient}=require("@prisma/client");
const sid=process.argv[1];
const p=new PrismaClient();
(async()=>{
  const b=await p.bouquet.findFirst({where:{name:{contains:"Load Test"}}}) 
    || await p.bouquet.findFirst({where:{id:"cmu796onw000lkvbnyonn611j"}});
  if (!b) { console.warn("[smoke] no load-test bouquet"); await p.$disconnect(); return; }
  const ex=await p.bouquetStream.findFirst({where:{bouquetId:b.id, streamId:sid}});
  if (!ex) {
    await p.bouquetStream.create({data:{bouquetId:b.id, streamId:sid}});
    console.log("[smoke] linked stream to bouquet", b.id);
  }
  await p.line.updateMany({where:{username:{startsWith:"load0"}}, data:{maxConnections:5}});
  await p.$disconnect();
})().catch(async (e)=>{ console.warn("[smoke] bouquet grant:", e.message||e); try{await p.$disconnect()}catch{} });
' "$sid" 2>/dev/null || true
}

if [ -z "$STREAM_ID" ]; then
  # Prefer currently packaging channel on colocated classic-LB
  if [ -d /var/lib/nexlify-lb/hls ]; then
    STREAM_ID="$(ls -1t /var/lib/nexlify-lb/hls 2>/dev/null | head -1 || true)"
  fi
fi
if [ -z "$STREAM_ID" ] && [ -f /root/.nexlify-75-playback-fixture.json ]; then
  STREAM_ID="$(node -e 'const j=require("/root/.nexlify-75-playback-fixture.json"); process.stdout.write(String(j.streamId||j.playbackId||""))' 2>/dev/null || true)"
fi
if [ -z "$STREAM_ID" ]; then
  echo "Set STREAM_ID=... (Xtream numeric or cuid)" >&2
  exit 1
fi

echo "==> preflight"
curl -sS -m 3 http://127.0.0.1:8090/lb/health 2>/dev/null || echo "WARN: no :8090 health"
echo

ensure_loadtest_stream_access "$STREAM_ID"

echo "==> ensure load-test lines (pool=$LINES)"
node scripts/load-test-setup.cjs --lines="$LINES" || true

# Pre-warm shared packager so max-concurrency uses HLS segments (1 ffmpeg), not 42 direct remuxes.
echo "==> prewarm shared packager for $STREAM_ID"
PREWARM_USER="${PREWARM_USER:-load00001}"
PREWARM_PASS="${PREWARM_PASS:-lt1}"
curl -sS -o /tmp/nexlify-prewarm.bin --max-time 12 \
  "http://127.0.0.1:8090/live/${PREWARM_USER}/${PREWARM_PASS}/${STREAM_ID}.ts" >/dev/null 2>&1 || true
for i in 1 2 3 4 5 6 7 8 9 10; do
  if [ -f "/var/lib/nexlify-lb/hls/${STREAM_ID}/index.m3u8" ]; then
    fresh="$(find "/var/lib/nexlify-lb/hls/${STREAM_ID}" -name 'seg*.ts' -mmin -1 2>/dev/null | head -1 || true)"
    if [ -n "$fresh" ]; then
      echo "    hls ready after ${i}s"
      break
    fi
  fi
  sleep 1
done
ls -la "/var/lib/nexlify-lb/hls/${STREAM_ID}/" 2>/dev/null | head -8 || echo "WARN: hls dir not ready — smoke may use direct remux"

# Hold each viewer for the full window (true max-connection test, not reconnect stampede).
if [ -z "${MEDIA_MS_SET:-}" ] && [ "$METHOD" = "media" ]; then
  MEDIA_MS=$((DURATION * 1000))
fi
DELAY_MS="${DELAY_MS:-250}"

echo "==> one-stream concurrency smoke"
echo "    host=$LB_HOST stream=$STREAM_ID concurrency=$CONCURRENCY (media_fpm_max) duration=${DURATION}s method=$METHOD media_ms=$MEDIA_MS delay_ms=$DELAY_MS"
EXTRA=()
if [ "$METHOD" = "media" ]; then
  EXTRA=(--method=media --force-media --media-ms="$MEDIA_MS" --delay-ms="$DELAY_MS")
else
  EXTRA=(--method=head --delay-ms="$DELAY_MS")
fi

set +e
node scripts/load-test-run.cjs \
  --host="$LB_HOST" \
  --concurrency="$CONCURRENCY" \
  --duration="$DURATION" \
  --stream="$STREAM_ID" \
  --lines="$LINES" \
  "${EXTRA[@]}"
RC=$?
set -e

echo "==> post: classic-LB health"
curl -sS -m 3 http://127.0.0.1:8090/lb/health 2>/dev/null || true
echo
echo "==> post: packager watchdog (once)"
if [ -f /opt/nexlify-lb/php/packager_watchdog.php ]; then
  NEXLIFY_LB_ENV=/etc/nexlify-lb/lb.env php /opt/nexlify-lb/php/packager_watchdog.php 2>/dev/null || true
fi
echo "==> post: recent packager log tails"
ls -1t /var/lib/nexlify-lb/logs/*.log 2>/dev/null | head -3 | while read -r f; do
  echo "--- $f ---"
  tail -n 8 "$f" 2>/dev/null || true
done
echo "Done rc=$RC. Check Live Connections + Stream logs (playback_*) after this run."
exit "$RC"
