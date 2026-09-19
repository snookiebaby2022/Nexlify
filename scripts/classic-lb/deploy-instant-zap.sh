#!/usr/bin/env bash
set -euo pipefail
# Deploy buffer fix + restart packager + verify segment cadence
ROOT=/opt/nexlify-lb
SAFE=cmu5anma60002kvxc66spnb2l
cp -a /tmp/lb-lib.php "$ROOT/php/lib.php"
cp -a /tmp/lb-mpegts.php "$ROOT/php/mpegts.php"
chown www-data:www-data "$ROOT/php/lib.php" "$ROOT/php/mpegts.php"
# Kill old packager so new flags apply
if [ -f /var/lib/nexlify-lb/pids/$SAFE.pid ]; then
  kill "$(cat /var/lib/nexlify-lb/pids/$SAFE.pid)" 2>/dev/null || true
  rm -f /var/lib/nexlify-lb/pids/$SAFE.pid
fi
rm -f /var/lib/nexlify-lb/hls/$SAFE/seg*.ts /var/lib/nexlify-lb/hls/$SAFE/index.m3u8
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/load-playback-fixture.sh
. "$SCRIPTS/lib/load-playback-fixture.sh"
# Warm via auth path
if load_playback_fixture; then
  curl -sS -o /dev/null -w "warm_auth=%{http_code}\n" --max-time 8 \
    "$(playback_lb_live_url ts)" || true
else
  echo "skip warm (no playback fixture)"
fi
sleep 4
echo "=== ffmpeg cmdline ==="
ps aux | grep -F "$SAFE" | grep -v grep | head -2 || true
echo "=== index after warm ==="
head -25 /var/lib/nexlify-lb/hls/$SAFE/index.m3u8 2>/dev/null || echo "(no index yet)"
echo "=== packager log ==="
tail -15 /var/lib/nexlify-lb/logs/$SAFE.log 2>/dev/null || true
echo "=== 45s sustained pull ==="
rm -f /tmp/zap3.bin
if load_playback_fixture; then
  timeout 45 curl -sS -D /tmp/zap3-hdr.txt -o /tmp/zap3.bin -w "http=%{http_code} size=%{size_download} ttfb=%{time_starttransfer} speed=%{speed_download}\n" \
    "$(playback_lb_live_url ts)" || echo exit=$?
else
  echo "skip sustained pull (no playback fixture)"
fi
echo "--- headers ---"
grep -i nexlify /tmp/zap3-hdr.txt || cat /tmp/zap3-hdr.txt
python3 - <<'PY'
import os
sz=os.path.getsize('/tmp/zap3.bin')
print(f"bytes={sz} ~kbps={(sz*8/45)/1000:.1f}")
b=open('/tmp/zap3.bin','rb').read(188*50)
print(f"ts_sync={sum(1 for i in range(0,len(b),188) if b[i:i+1]==b'\\x47')}/50")
# gap heuristic: look for long zero runs (unlikely in TS) — instead check size over time via chunks
PY
echo "=== segment durations ==="
head -40 /var/lib/nexlify-lb/hls/$SAFE/index.m3u8 2>/dev/null || true
ls -lt /var/lib/nexlify-lb/hls/$SAFE/seg*.ts 2>/dev/null | head -10
echo "=== nginx errors last 2 min ==="
tail -5 /var/log/nginx/error.log || true
