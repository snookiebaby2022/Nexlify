#!/usr/bin/env bash
set -uo pipefail

echo "========== TIME =========="
date -u

echo
echo "========== FFMPEG PROCESSES =========="
pgrep -af ffmpeg || echo NONE

echo
echo "========== HLS DIR =========="
ls -la /var/www/nexlify-hls/

echo
echo "========== MANIFEST =========="
cat /var/www/nexlify-hls/nexlify.m3u8 2>/dev/null || echo NO_MANIFEST

echo
echo "========== FFMPEG LOG =========="
tail -40 /var/log/nexlify-hls-ffmpeg.log 2>/dev/null || echo NO_FFMPEG_LOG

echo
echo "========== NGINX ERROR rtmp/exec =========="
grep -iE "rtmp|exec|ffmpeg|publish|1935" /var/log/nginx/error.log 2>/dev/null | tail -30 || echo NO_NGINX_ERRORS

echo
echo "========== PUBLISH SCRIPT =========="
ls -la /opt/nexlify-rtmp/hls-publish.sh
file /opt/nexlify-rtmp/hls-publish.sh
head -5 /opt/nexlify-rtmp/hls-publish.sh

echo
echo "========== RTMP CONF exec lines =========="
grep -n exec /etc/nginx/nexlify.live-rtmp-hls.conf

echo
echo "========== PORT 1935 =========="
ss -tlnp | grep 1935 || echo NOT_LISTENING

echo
echo "========== FFMPEG =========="
command -v ffmpeg || echo MISSING
ffmpeg -version 2>/dev/null | head -1 || true

echo
echo "========== STATUS API =========="
curl -sS -m 5 http://127.0.0.1:3001/api/livestream/status || echo STATUS_FAILED

echo
echo "========== MANUAL TEST publish script syntax =========="
bash -n /opt/nexlify-rtmp/hls-publish.sh && echo script_syntax_ok || echo script_syntax_bad
